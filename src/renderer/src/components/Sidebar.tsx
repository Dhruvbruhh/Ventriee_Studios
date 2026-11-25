import { useState, type ReactNode } from 'react'
import { guard, useStore, type Panel } from '../store'
import { AccountButton } from '../auth'
import { IconChat, IconCode, IconChevron, IconClock, IconFolder, IconGrid, IconMemory, IconPlus, IconPulse, IconSettings, IconSkill, IconWindow } from '../icons'

function NavItem({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return <button className={`side-nav-item${active ? ' on' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>{icon}<span>{label}</span></button>
}

const switchProject = async (projectId: string) => {
  const state = useStore.getState()
  if (projectId === state.snapshot?.activeProjectId) return true
  if (state.editorDirty && !window.confirm('Discard unsaved code edits and switch projects?')) return false
  return (await guard(() => window.ventriee.selectProject(projectId))) !== null
}

/** Left column: what to do, every project with its planning sessions, and the account. */
export function Sidebar({ onNewProject }: { onNewProject: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const panel = useStore((s) => s.panel)
  const workspace = useStore((s) => s.workspace)
  const setPanel = useStore((s) => s.setPanel)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const open = (p: Panel) => setPanel(panel === p ? 'none' : p)
  const toggle = (id: string) => setCollapsed((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const openSession = async (projectId: string, conversationId: string) => {
    if (!(await switchProject(projectId))) return
    await guard(() => window.ventriee.chatSessionSelect(projectId, conversationId))
    useStore.getState().setWorkspace('plan')
  }
  const newSession = async (projectId: string) => {
    if (!(await switchProject(projectId))) return
    await guard(() => window.ventriee.chatSessionNew(projectId))
    useStore.getState().setWorkspace('plan')
  }

  return <nav className="sidebar" aria-label="Studio">
    <div className="side-brand"><div className="brand-mark" role="img" aria-label="" /><span>Ventriee Studios</span></div>

    <div className="side-actions">
      <button className="btn primary side-new" onClick={() => snapshot.activeProjectId ? void newSession(snapshot.activeProjectId) : onNewProject()}><IconPlus /> New session</button>
      <button className="btn side-new-project" onClick={onNewProject} aria-label="New project" title="New project"><IconFolder /></button>
    </div>
    <div className="side-nav">
      <NavItem icon={<IconChat width={15} height={15} />} label="Chat" active={workspace === 'plan' && panel === 'none'} onClick={() => { setPanel('none'); useStore.getState().setWorkspace('plan') }} />
      <NavItem icon={<IconCode width={15} height={15} />} label="Code" active={workspace === 'code' && panel === 'none'} onClick={() => { setPanel('none'); useStore.getState().setWorkspace('code') }} />
      <NavItem icon={<IconGrid width={15} height={15} />} label="Dashboard" active={workspace === 'home' && panel === 'none'} onClick={() => { setPanel('none'); useStore.getState().setWorkspace('home') }} />
      <NavItem icon={<IconPulse width={15} height={15} />} label="Runs" active={panel === 'runs'} onClick={() => open('runs')} />
      <NavItem icon={<IconSkill width={15} height={15} />} label="Skills" active={panel === 'skills'} onClick={() => open('skills')} />
      <NavItem icon={<IconMemory width={15} height={15} />} label="Memory" active={panel === 'memory'} onClick={() => open('memory')} />
      <NavItem icon={<IconClock width={15} height={15} />} label="Automations" active={panel === 'automations'} onClick={() => open('automations')} />
    </div>

    <div className="side-projects" aria-label="Projects">
      <div className="side-label">Projects <span>{snapshot.projects.length}</span></div>
      {snapshot.projects.length ? snapshot.projects.map((project) => {
        const active = project.id === snapshot.activeProjectId
        const sessions = snapshot.sessionIndex.filter((s) => s.projectId === project.id)
        const isOpen = !collapsed.has(project.id)
        return <section key={project.id} className="side-project">
          <div className="side-project-head">
            <button className="side-project-name" aria-expanded={isOpen} onClick={() => toggle(project.id)} title={project.path}>
              <IconChevron width={12} height={12} aria-hidden style={{ transform: isOpen ? undefined : 'rotate(-90deg)' }} />
              <span className="truncate">{project.name}</span>
            </button>
            <button className="side-icon" aria-label={`New session in ${project.name}`} title="New session" onClick={() => void newSession(project.id)}><IconPlus width={13} height={13} /></button>
            <button className="side-icon" aria-label={`Open ${project.name} in a new window`} title="Open in a new window" onClick={() => void guard(() => window.ventriee.openProjectWindow(project.id))}><IconWindow width={13} height={13} /></button>
          </div>
          {isOpen ? <div className="side-sessions">
            {sessions.length ? sessions.map((s, i) => {
              const current = active && s.id === snapshot.conversation?.id
              return <button key={s.id} className={`side-session${current ? ' on' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => void openSession(project.id, s.id)}>
                <span className="truncate">{s.title || `Session ${i + 1}`}</span>
                {active && snapshot.running && current ? <span className="side-live" aria-label="Run in progress" /> : null}
              </button>
            }) : <button className="side-session faint" onClick={() => void newSession(project.id)}>Start a session</button>}
          </div> : null}
        </section>
      }) : <p className="side-empty">No projects yet. <button className="ghost-link" onClick={onNewProject}>Create one</button></p>}
    </div>

    <div className="side-foot">
      <div className="side-foot-row">
        <button className={`side-foot-link${panel === 'project' ? ' on' : ''}`} onClick={() => open('project')} aria-label="Project settings" title="Project settings"><IconFolder width={15} height={15} /><span>Project</span></button>
        <button className={`side-foot-link${panel === 'settings' ? ' on' : ''}`} onClick={() => open('settings')} aria-label="Studio settings" title="Studio settings"><IconSettings width={15} height={15} /><span>Settings</span></button>
      </div>
      <div className="side-account">
        <span className="side-account-mark" aria-hidden>V</span>
        <span className="side-account-text"><b>Your studio</b><small>{snapshot.running ? 'Team is working' : 'Signed in'}</small></span>
        <AccountButton />
      </div>
    </div>
  </nav>
}
