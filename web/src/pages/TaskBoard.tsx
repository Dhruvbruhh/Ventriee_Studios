import { useMemo, useState } from 'react'
import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import {
  createTask, getProfiles, listAssignments, listMembers, listProjects, listTasksForProjects,
} from '../lib/api'
import type { Task } from '../lib/types'
import { Badge, Button, EmptyState, ErrorState, Field, Modal, Spinner } from '../components/ui'
import { TaskDetail } from '../components/TaskDetail'
import { canManageProjects } from '../lib/roles'
import {
  PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES, compareTasks, isOverdue, isTaskStatus,
} from '../lib/tasks'
import type { TaskPriority } from '../lib/tasks'
import { formatDate, localInputToIso, personLabel } from '../lib/format'

export function TaskBoard() {
  const { workspace, user } = useSession()
  const orgId = workspace.orgId
  const canManage = canManageProjects(workspace.role)
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const state = useAsync(async () => {
    const projects = await listProjects(orgId)
    const tasks = await listTasksForProjects(projects.map((p) => p.id))
    const assignments = await listAssignments(tasks.map((t) => t.id))
    const memberIds = orgId ? (await listMembers(orgId)).map((m) => m.user_id) : [user.id]
    const profiles = await getProfiles([...memberIds, ...assignments.map((a) => a.user_id), ...tasks.map((t) => t.created_by)])
    return { projects, tasks, assignments, memberIds, profiles }
  }, [orgId, user.id])

  const filtered = useMemo(() => {
    if (!state.data) return []
    return projectFilter === 'all' ? state.data.tasks : state.data.tasks.filter((t) => t.project_id === projectFilter)
  }, [state.data, projectFilter])

  const columns = useMemo(() => {
    const extra = [...new Set(filtered.map((t) => t.status))].filter((s) => !isTaskStatus(s))
    return [...TASK_STATUSES, ...extra]
  }, [filtered])

  if (state.loading) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const { projects, assignments, memberIds, profiles } = state.data!

  // Keep the live task object in the open modal fresh after a reload.
  const liveOpen = openTask ? state.data!.tasks.find((t) => t.id === openTask.id) ?? null : null

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="page-title">Task board</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{workspace.name} workspace</p>
        </div>
        <div className="row">
          <select style={{ width: 'auto', minWidth: 160 }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="all">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {canManage && projects.length > 0 && <Button variant="primary" onClick={() => setCreating(true)}>+ New task</Button>}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card"><EmptyState title="No projects yet" hint="Create a project before adding tasks." /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState title="No tasks" hint={canManage ? 'Add the first task to this board.' : 'No tasks here yet.'}
          action={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>+ New task</Button> : undefined} /></div>
      ) : (
        <div className="board">
          {columns.map((status) => {
            const items = filtered.filter((t) => t.status === status).sort(compareTasks)
            return (
              <div key={status} className="column">
                <div className="column-head">
                  <span>{isTaskStatus(status) ? STATUS_LABELS[status] : status}</span>
                  <span className="count">{items.length}</span>
                </div>
                <div className="column-body">
                  {items.map((t) => {
                    const who = assignments.filter((a) => a.task_id === t.id)
                    return (
                      <div key={t.id} className="task-card" onClick={() => setOpenTask(t)}>
                        <div className="t-title">{t.title}</div>
                        <div className="t-meta">
                          <Badge tone={t.priority === 'urgent' || t.priority === 'high' ? 'warn' : 'default'}>
                            {PRIORITY_LABELS[t.priority as TaskPriority] ?? t.priority}
                          </Badge>
                          {t.deadline && <Badge tone={isOverdue(t) ? 'danger' : 'default'}>{formatDate(t.deadline)}</Badge>}
                          {who.length > 0 && <span className="faint" style={{ fontSize: 12 }}>{personLabel(who[0].user_id, profiles, user.id)}{who.length > 1 ? ` +${who.length - 1}` : ''}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {liveOpen && (
        <TaskDetail task={liveOpen} assignments={assignments} profiles={profiles}
          assignable={memberIds.map((id) => ({ id }))} selfId={user.id} canManage={canManage}
          onClose={() => setOpenTask(null)} onChanged={state.reload} />
      )}
      {creating && (
        <CreateTaskModal projects={projects} defaultProject={projectFilter === 'all' ? projects[0]?.id : projectFilter}
          onClose={() => setCreating(false)} onCreated={() => { setCreating(false); state.reload() }} />
      )}
    </div>
  )
}

function CreateTaskModal({ projects, defaultProject, onClose, onCreated }: {
  projects: { id: string; name: string }[]; defaultProject?: string; onClose: () => void; onCreated: () => void
}) {
  const [projectId, setProjectId] = useState(defaultProject ?? projects[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('todo')
  const [priority, setPriority] = useState('medium')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim() || !projectId) return
    setBusy(true); setError(null)
    try {
      await createTask({ projectId, title: title.trim(), description: description.trim(), status, priority, deadline: localInputToIso(deadline) })
      onCreated()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  return (
    <Modal title="New task" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !title.trim() || !projectId} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create task'}</Button></>}>
      {error && <div className="form-error">{error}</div>}
      <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Title"><input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Design the landing hero" /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" /></Field>
      <div className="grid grid-3">
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></Field>
        <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value)}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
        <Field label="Deadline"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
