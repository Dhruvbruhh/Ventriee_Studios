import type { CSSProperties } from 'react'
import { guard, useStore } from '../store'
import { IconCoins, IconExternal, IconPlus, IconPulse, IconSettings, IconSpark, IconTasks, IconUsers } from '../icons'
import type { Agent, Snapshot, Task, TaskStatus } from '../../../shared/types'

/** Pipeline lanes, in the order work moves through them. */
const LANES: Array<{ id: string; label: string; tone: string; statuses: TaskStatus[] }> = [
  { id: 'queued', label: 'Queued', tone: 'idle', statuses: ['todo', 'ready', 'blocked'] },
  { id: 'active', label: 'In progress', tone: 'accent', statuses: ['running', 'review', 'rework'] },
  { id: 'needs', label: 'Needs you', tone: 'warn', statuses: ['approval', 'failed'] },
  { id: 'done', label: 'Done', tone: 'ok', statuses: ['done'] }
]

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const who = (agent: Agent | undefined) => ({ ['--who' as string]: agent?.color ?? 'var(--faint)' }) as CSSProperties

function openWorker(agentId: string | null) {
  useStore.getState().setWorkspace('office')
  if (agentId) useStore.getState().select(agentId)
}

/** The landing view: where the active project stands, who is on it, and what just happened. */
export function Dashboard({ onNewProject }: { onNewProject: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null

  if (!project) {
    return <div className="dash"><div className="dash-empty">
      <span className="empty-glyph"><IconSpark /></span>
      <h1>Start your first project</h1>
      <p>A project is a folder on this computer plus a team of workers. Describe what you want built and the team plans, writes and reviews it.</p>
      <button className="btn primary" onClick={onNewProject}><IconPlus /> New project</button>
    </div></div>
  }

  const tasks = snapshot.tasks
  const done = tasks.filter((t) => t.status === 'done').length
  const working = snapshot.agents.filter((a) => a.status === 'working').length
  const tokens = snapshot.sessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0)
  const spend = snapshot.sessions.reduce((sum, s) => sum + s.costUsd, 0)
  const engines = snapshot.providers.filter((p) => p.available).length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const lanes = LANES.map((lane) => ({ ...lane, tasks: tasks.filter((t) => lane.statuses.includes(t.status)) }))
  const needs = lanes.find((l) => l.id === 'needs')!.tasks.length
  const headline = !tasks.length ? 'No tasks yet' : done === tasks.length ? 'Everything is done' : needs ? `${needs} ${needs === 1 ? 'task needs' : 'tasks need'} you` : working ? `${working} ${working === 1 ? 'worker is' : 'workers are'} on it` : 'Waiting for the next step'

  const newSession = async () => {
    await guard(() => window.ventriee.chatSessionNew(project.id))
    useStore.getState().setWorkspace('plan')
  }

  return <div className="dash">
    <div className="dash-inner">
      <header className="dash-head">
        <div className="dash-title">
          <h1>{project.name}</h1>
          <button className="dash-path" onClick={() => void guard(() => window.ventriee.openPath(project.path))} title="Open the project folder">
            {project.path} <IconExternal width={12} height={12} />
          </button>
          {project.description ? <p className="dash-brief">{project.description}</p> : null}
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={() => useStore.getState().setPanel('project')}><IconSettings /> Project</button>
          <button className="btn" onClick={() => useStore.getState().setWorkspace('office')}><IconUsers /> Office</button>
          <button className="btn primary" onClick={() => void newSession()}><IconPlus /> New session</button>
        </div>
      </header>

      <section className="dash-progress" aria-label="Task progress">
        <div className="dash-progress-top">
          <div>
            <div className="dash-progress-headline">{headline}</div>
            <div className="dash-progress-sub">{tasks.length ? `${done} of ${tasks.length} tasks accepted` : 'Plan a session and assign the prompt to queue work.'}</div>
          </div>
          <div className="dash-progress-pct" aria-label={`${pct}% complete`}>{pct}<small>%</small></div>
        </div>
        <div className="dash-bar" role="img" aria-label={lanes.map((l) => `${l.label} ${l.tasks.length}`).join(', ')}>
          {lanes.slice().reverse().map((l) => l.tasks.length ? <span key={l.id} className={`tone-${l.tone}`} style={{ flexGrow: l.tasks.length }} /> : null)}
        </div>
        <ul className="dash-legend">
          {lanes.map((l) => <li key={l.id}><span className={`dot tone-${l.tone}`} />{l.label}<b>{l.tasks.length}</b></li>)}
        </ul>
      </section>

      <div className="metrics dash-metrics">
        <Metric icon={<IconUsers />} value={<>{working}<small> / {snapshot.agents.length}</small></>} label="Workers active" />
        <Metric icon={<IconTasks />} value={<>{done}<small> / {tasks.length}</small></>} label="Tasks done" />
        <Metric icon={<IconPulse />} value={tokens ? compact.format(tokens) : '0'} label="Tokens used" />
        <Metric icon={<IconCoins />} value={spend ? `$${spend.toFixed(2)}` : '$0'} label={`API spend, ${engines} ${engines === 1 ? 'engine' : 'engines'} ready`} />
      </div>

      <section className="dash-board" aria-label="Pipeline">
        {lanes.map((lane) => <div key={lane.id} className="dash-lane">
          <div className="dash-lane-head"><span className={`dot tone-${lane.tone}`} />{lane.label}<b>{lane.tasks.length}</b></div>
          <div className="dash-lane-body">
            {lane.tasks.slice(0, 5).map((t) => <TaskCard key={t.id} task={t} snapshot={snapshot} />)}
            {lane.tasks.length > 5 ? <button className="dash-more" onClick={() => openWorker(null)}>+{lane.tasks.length - 5} more in the office</button> : null}
            {!lane.tasks.length ? <p className="dash-lane-empty">Nothing here</p> : null}
          </div>
        </div>)}
      </section>

      <div className="dash-cols">
        <section className="dash-panel" aria-label="Team">
          <h2>Team <span>{snapshot.agents.length}</span></h2>
          <div className="dash-list">
            {[...snapshot.agents].sort((a, b) => Number(b.status === 'working') - Number(a.status === 'working')).slice(0, 8).map((a) => {
              const task = tasks.find((t) => t.id === a.currentTaskId)
              return <button key={a.id} className="dash-row" onClick={() => openWorker(a.id)}>
                <span className="avatar" style={who(a)}>{a.name.slice(0, 2).toUpperCase()}<span className={`status-pip ${a.status}`} /></span>
                <span className="dash-row-main"><b>{a.name}</b><small>{task ? task.title : a.title}</small></span>
                <span className="dash-row-meta mono">{a.model || a.engine}</span>
              </button>
            })}
          </div>
        </section>

        <section className="dash-panel" aria-label="Recent activity">
          <h2>Activity</h2>
          <ol className="dash-feed">
            {[...snapshot.events].reverse().slice(0, 9).map((e) => {
              const agent = snapshot.agents.find((a) => a.id === e.agentId)
              return <li key={e.id} className={`feed-${e.type}`}>
                <span className="dash-feed-dot" style={who(agent)} />
                <span className="dash-feed-msg">{agent && !e.message.startsWith(agent.name) ? <b>{agent.name} </b> : null}{e.message}</span>
                <time>{ago(e.createdAt)}</time>
              </li>
            })}
            {!snapshot.events.length ? <li className="dash-lane-empty">No activity yet.</li> : null}
          </ol>
        </section>

        <section className="dash-panel" aria-label="Recent runs">
          <h2>Recent runs <button className="ghost-link" onClick={() => useStore.getState().setPanel('runs')}>All runs</button></h2>
          <div className="dash-list">
            {snapshot.sessions.slice(0, 7).map((s) => {
              const agent = snapshot.agents.find((a) => a.id === s.agentId)
              return <div key={s.id} className="dash-row static">
                <span className="avatar tiny" style={who(agent)}>{(agent?.name ?? '?').slice(0, 2).toUpperCase()}</span>
                <span className="dash-row-main"><b>{agent?.name ?? s.agentId.slice(0, 6)}</b><small className="mono">{s.model || s.engine}</small></span>
                <span className="dash-row-end">
                  <span className={`badge ${s.status === 'done' ? 'ok' : s.status === 'failed' ? 'err' : s.status === 'running' ? 'accent' : ''}`}>{s.status}</span>
                  <small>{s.outputTokens ? `${compact.format(s.outputTokens)} out` : ago(s.startedAt)}</small>
                </span>
              </div>
            })}
            {!snapshot.sessions.length ? <p className="dash-lane-empty">No runs yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  </div>
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return <div className="metric">
    <div className="metric-icon">{icon}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-label">{label}</div>
  </div>
}

function TaskCard({ task, snapshot }: { task: Task; snapshot: Snapshot }) {
  const agent = snapshot.agents.find((a) => a.id === task.agentId)
  return <button className="dash-task" onClick={() => openWorker(task.agentId)} title={task.description || task.title}>
    <span className="dash-task-title">{task.title}</span>
    <span className="dash-task-meta">
      {agent ? <span className="avatar tiny" style={who(agent)}>{agent.name.slice(0, 2).toUpperCase()}</span> : null}
      <span className="truncate">{agent?.name ?? task.role}</span>
      <span className={`task-status ${task.status}`}>{task.status}</span>
    </span>
  </button>
}
