import { useState } from 'react'
import { useSession } from './state/session'
import { canManageMembers, dashboardMode, ROLE_LABELS } from './lib/roles'
import { Button } from './components/ui'
import { Overview } from './pages/Overview'
import { Projects } from './pages/Projects'
import { TaskBoard } from './pages/TaskBoard'
import { Team } from './pages/Team'
import { Workload } from './pages/Workload'
import { MyWork } from './pages/MyWork'
import { surface, DESKTOP_DOWNLOAD_URL } from './lib/surface'

type View = 'overview' | 'projects' | 'board' | 'team' | 'workload' | 'mywork' | 'download' | 'denied'

interface NavDef { view: View; label: string; icon: string }

export function Shell() {
  const { user, workspace, workspaces, setWorkspaceByOrg, signOut } = useSession()
  const manager = dashboardMode(workspace.role) === 'manager'

  const workspaceNav: NavDef[] = manager
    ? [
        { view: 'overview', label: 'Overview', icon: '◇' },
        { view: 'projects', label: 'Projects', icon: '▤' },
        { view: 'board', label: 'Task board', icon: '▦' },
        ...(canManageMembers(workspace.role) ? [{ view: 'team' as View, label: 'Team', icon: '◎' }] : []),
        { view: 'workload', label: 'Workload', icon: '▥' },
      ]
    : [{ view: 'mywork', label: 'My work', icon: '✓' }]

  const nav: NavDef[] =
    surface === 'app'
      ? [{ view: 'mywork', label: 'My work', icon: '✓' }, { view: 'download', label: 'Desktop app', icon: '↓' }]
      : surface === 'dashboard'
        ? manager
          ? [
              { view: 'overview', label: 'Overview', icon: '◇' },
              { view: 'projects', label: 'Projects', icon: '▤' },
              { view: 'workload', label: 'Workload', icon: '▥' },
            ]
          : [{ view: 'denied', label: 'Dashboard', icon: '◇' }]
        : workspaceNav

  const [view, setView] = useState<View>(nav[0].view)
  // Keep the active view valid when the workspace (and so the nav) changes.
  const active = nav.some((n) => n.view === view) ? view : nav[0].view

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Ventriee<span>.</span></div>
        {nav.map((n) => (
          <button key={n.view} className={`nav-item ${active === n.view ? 'active' : ''}`} onClick={() => setView(n.view)}>
            <span aria-hidden style={{ width: 16, textAlign: 'center' }}>{n.icon}</span>{n.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="nav-item" style={{ cursor: 'default', fontSize: 12 }}>
          <span className="faint">{ROLE_LABELS[workspace.role]}</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <label className="faint" htmlFor="ws" style={{ fontSize: 12.5 }}>Workspace</label>
            <select id="ws" style={{ width: 'auto', minWidth: 180 }}
              value={workspace.orgId ?? ''}
              onChange={(e) => setWorkspaceByOrg(e.target.value || null)}>
              {workspaces.map((w) => (
                <option key={w.orgId ?? 'personal'} value={w.orgId ?? ''}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
            <Button size="sm" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </header>

        <main className="content">
          <Page view={active} />
        </main>
      </div>
    </div>
  )
}

function Page({ view }: { view: View }) {
  switch (view) {
    case 'overview': return <Overview />
    case 'projects': return <Projects />
    case 'board': return <TaskBoard />
    case 'team': return <Team />
    case 'workload': return <Workload />
    case 'mywork': return <MyWork />
    case 'download': return (
      <div className="state">
        <h3>Ventriee desktop app</h3>
        <p>Download the latest Windows installer from the releases page, then sign in with this same account.</p>
        <p><a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer">Open downloads →</a></p>
      </div>
    )
    case 'denied': return (
      <div className="state">
        <h3>Managers only</h3>
        <p>The ops dashboard is for owners, admins and project managers. Your work is at <a href="https://app.ventriee.in">app.ventriee.in</a>.</p>
      </div>
    )
  }
}
