import { useState } from 'react'
import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import {
  getProfiles, listAssignments, listMyAssignedTaskIds, listProjects, listTasksByIds,
} from '../lib/api'
import type { Task } from '../lib/types'
import { Badge, EmptyState, ErrorState, Spinner, Stat } from '../components/ui'
import { TaskDetail } from '../components/TaskDetail'
import { STATUS_LABELS, compareTasks, isOpen, isOverdue, isTaskStatus } from '../lib/tasks'
import { formatDate, relativeDeadline } from '../lib/format'

export function MyWork() {
  const { workspace, user } = useSession()
  const orgId = workspace.orgId
  const [openTask, setOpenTask] = useState<Task | null>(null)

  const state = useAsync(async () => {
    const taskIds = await listMyAssignedTaskIds(user.id)
    const allTasks = await listTasksByIds(taskIds)
    // Scope to the active workspace via its projects.
    const projects = await listProjects(orgId)
    const projectName = new Map(projects.map((p) => [p.id, p.name]))
    const tasks = allTasks.filter((t) => projectName.has(t.project_id))
    const assignments = await listAssignments(tasks.map((t) => t.id))
    const profiles = await getProfiles([...assignments.map((a) => a.user_id), ...tasks.map((t) => t.created_by), user.id])
    return { tasks, assignments, profiles, projectName }
  }, [orgId, user.id])

  if (state.loading) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const { tasks, assignments, profiles, projectName } = state.data!

  const open = tasks.filter((t) => isOpen(t.status)).sort(compareTasks)
  const done = tasks.filter((t) => !isOpen(t.status))
  const overdue = tasks.filter((t) => isOverdue(t)).length
  const projectIds = [...new Set(open.map((t) => t.project_id))]
  const liveOpen = openTask ? tasks.find((t) => t.id === openTask.id) ?? null : null

  return (
    <div>
      <h1 className="page-title">My work</h1>
      <p className="page-sub">{workspace.name} workspace</p>

      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <Stat label="Open tasks" value={open.length} />
        <Stat label="Overdue" value={overdue} danger />
        <Stat label="Active projects" value={projectIds.length} />
      </div>

      {tasks.length === 0 ? (
        <div className="card"><EmptyState title="Nothing assigned to you" hint="Tasks assigned to you in this workspace will show up here." /></div>
      ) : (
        <>
          <div className="section-head"><h2>My tasks</h2></div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
            <table>
              <thead><tr><th>Task</th><th>Project</th><th>Status</th><th>Deadline</th></tr></thead>
              <tbody>
                {open.map((t) => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpenTask(t)}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td className="muted">{projectName.get(t.project_id) ?? '—'}</td>
                    <td><Badge tone="accent">{isTaskStatus(t.status) ? STATUS_LABELS[t.status] : t.status}</Badge></td>
                    <td>{t.deadline
                      ? <span className={isOverdue(t) ? '' : 'muted'}>{isOverdue(t) ? <Badge tone="danger">{formatDate(t.deadline)} · {relativeDeadline(t.deadline)}</Badge> : `${formatDate(t.deadline)} · ${relativeDeadline(t.deadline)}`}</span>
                      : <span className="faint">—</span>}</td>
                  </tr>
                ))}
                {open.length === 0 && <tr><td colSpan={4}><span className="faint">No open tasks — nicely done.</span></td></tr>}
              </tbody>
            </table>
          </div>

          {done.length > 0 && (
            <>
              <div className="section-head"><h2>Recently closed</h2></div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <tbody>
                    {done.slice(0, 10).map((t) => (
                      <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpenTask(t)}>
                        <td style={{ fontWeight: 600 }}>{t.title}</td>
                        <td className="muted">{projectName.get(t.project_id) ?? '—'}</td>
                        <td><Badge tone={t.status === 'completed' ? 'ok' : 'default'}>{isTaskStatus(t.status) ? STATUS_LABELS[t.status] : t.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {liveOpen && (
        <TaskDetail task={liveOpen} assignments={assignments} profiles={profiles}
          assignable={[]} selfId={user.id} canManage={false}
          onClose={() => setOpenTask(null)} onChanged={state.reload} />
      )}
    </div>
  )
}
