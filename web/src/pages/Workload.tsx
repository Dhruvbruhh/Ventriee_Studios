import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import { getProfiles, listAssignments, listMembers, listProjects, listTasksForProjects } from '../lib/api'
import { deriveWorkload } from '../lib/metrics'
import { isOpen } from '../lib/tasks'
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui'
import { personLabel } from '../lib/format'

export function Workload() {
  const { workspace, user } = useSession()
  const orgId = workspace.orgId

  const state = useAsync(async () => {
    const projects = await listProjects(orgId)
    const tasks = await listTasksForProjects(projects.map((p) => p.id))
    const assignments = await listAssignments(tasks.map((t) => t.id))
    const memberIds = orgId ? (await listMembers(orgId)).map((m) => m.user_id) : [user.id]
    const profiles = await getProfiles([...memberIds, ...assignments.map((a) => a.user_id)])
    return { tasks, assignments, memberIds, profiles }
  }, [orgId, user.id])

  if (state.loading) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const { tasks, assignments, memberIds, profiles } = state.data!
  const workload = deriveWorkload(tasks, assignments)

  // Members with no assigned tasks still appear, with zeros.
  const byUser = new Map(workload.map((w) => [w.userId, w]))
  const rows = [...new Set([...memberIds, ...workload.map((w) => w.userId)])].map(
    (id) => byUser.get(id) ?? { userId: id, open: 0, overdue: 0, completed: 0 },
  ).sort((a, b) => b.open - a.open || b.overdue - a.overdue)

  const assignedTaskIds = new Set(assignments.map((a) => a.task_id))
  const unassignedOpen = tasks.filter((t) => isOpen(t.status) && !assignedTaskIds.has(t.id)).length

  return (
    <div>
      <h1 className="page-title">Workload</h1>
      <p className="page-sub">Open tasks per person · {workspace.name}</p>

      {rows.length === 0 ? (
        <div className="card"><EmptyState title="No one to show" hint="Assign tasks to see workload." /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Member</th><th>Open</th><th>Overdue</th><th>Completed</th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.userId}>
                  <td style={{ fontWeight: 600 }}>{personLabel(w.userId, profiles, user.id)}</td>
                  <td>{w.open}</td>
                  <td>{w.overdue > 0 ? <Badge tone="danger">{w.overdue}</Badge> : 0}</td>
                  <td className="muted">{w.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unassignedOpen > 0 && (
        <p className="muted" style={{ marginTop: 14 }}>{unassignedOpen} open task{unassignedOpen === 1 ? '' : 's'} not assigned to anyone.</p>
      )}
    </div>
  )
}
