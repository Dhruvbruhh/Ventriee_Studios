import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import { listMembers, listProjects, listTasksForProjects } from '../lib/api'
import { deriveOverview } from '../lib/metrics'
import { Spinner, Stat, ErrorState, EmptyState, Badge } from '../components/ui'
import { formatDate } from '../lib/format'
import { isOpen } from '../lib/tasks'

export function Overview() {
  const { workspace } = useSession()
  const orgId = workspace.orgId

  const state = useAsync(async () => {
    const projects = await listProjects(orgId)
    const tasks = await listTasksForProjects(projects.map((p) => p.id))
    const employees = orgId ? (await listMembers(orgId)).length : null
    return { projects, tasks, employees }
  }, [orgId])

  if (state.loading) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const { projects, tasks, employees } = state.data!
  const o = deriveOverview(projects, tasks)

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-sub">{workspace.name} workspace</p>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {employees !== null && <Stat label="Team members" value={employees} />}
        <Stat label="Active projects" value={o.activeProjects} />
        <Stat label="Completed projects" value={o.completedProjects} />
        <Stat label="Pending tasks" value={o.pendingTasks} />
        <Stat label="Overdue tasks" value={o.overdueTasks} danger />
      </div>

      <div className="section-head"><h2>Projects</h2></div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" hint="Create a project to start tracking work." />
        ) : (
          <table>
            <thead><tr><th>Project</th><th>Status</th><th>Open tasks</th><th>Created</th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const open = tasks.filter((t) => t.project_id === p.id && isOpen(t.status)).length
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td><Badge tone={p.status === 'completed' ? 'ok' : p.status === 'active' ? 'accent' : 'default'}>{p.status}</Badge></td>
                    <td>{open}</td>
                    <td className="muted">{formatDate(p.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
