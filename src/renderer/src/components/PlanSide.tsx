import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { IconFolder } from '../icons'

/** Where this session's work happens: folder, Git branch and engines. */
export function EnvironmentSection() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setBranch(null)
    if (project) void window.ventriee.gitStatus(project.id).then((s) => { if (alive) setBranch(s.repository ? s.branch || '(no branch)' : '') }).catch(() => { if (alive) setBranch('') })
    return () => { alive = false }
  }, [project?.id])
  if (!project) return null
  const ready = snapshot.providers.filter((p) => p.available).length
  return <section className="side-section" aria-label="Environment">
    <h3>Environment</h3>
    <button className="env-row" onClick={() => void window.ventriee.revealFile(project.path)} title={`Show ${project.path} in File Explorer`}>
      <IconFolder width={14} height={14} aria-hidden /><span className="truncate">{project.path}</span>
    </button>
    <div className="env-row"><span className="env-key">Git</span><span className="truncate">{branch === null ? 'Reading…' : branch || 'Not a Git repository'}</span></div>
    <div className="env-row"><span className="env-key">Engines</span><span>{ready ? `${ready} ready` : 'None ready: see Settings'}</span></div>
  </section>
}

/** Workers busy right now, so you can see work continuing while you plan. */
export function BackgroundSection() {
  const snapshot = useStore((s) => s.snapshot)!
  const busy = snapshot.agents.filter((a) => a.status === 'working')
  return <section className="side-section" aria-label="Background tasks">
    <h3>Background tasks</h3>
    {busy.length ? busy.map((agent) => {
      const task = snapshot.tasks.find((t) => t.id === agent.currentTaskId)
      return <button key={agent.id} className="env-row" onClick={() => { useStore.getState().setWorkspace('office'); useStore.getState().select(agent.id) }} title="Open in the Office">
        <span className="side-live" aria-hidden /><span className="truncate"><b>{agent.name}</b> {task ? `· ${task.title}` : ''}</span>
      </button>
    }) : <p className="env-empty">Nothing running. Assign a prompt to start the team.</p>}
  </section>
}
