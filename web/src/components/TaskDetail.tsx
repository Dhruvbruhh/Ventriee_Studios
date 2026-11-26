import { useEffect, useState } from 'react'
import type { Profile, Task, TaskAssignment } from '../lib/types'
import { Badge, Button, Field, Modal } from './ui'
import {
  PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, isTaskStatus, isOverdue, nextStatuses,
} from '../lib/tasks'
import type { TaskPriority } from '../lib/tasks'
import { addComment, assignTask, listComments, unassignTask, updateTask } from '../lib/api'
import type { TaskComment } from '../lib/types'
import { formatDate, formatDateTime, localInputToIso, personLabel, relativeDeadline } from '../lib/format'

interface Props {
  task: Task
  assignments: TaskAssignment[]
  profiles: Map<string, Profile>
  /** Users who can be assigned (members of the workspace). */
  assignable: { id: string }[]
  selfId: string
  /** Managers edit everything; an assigned employee may change status only. */
  canManage: boolean
  onClose: () => void
  onChanged: () => void
}

/** Task detail: change status (valid transitions only), manage assignees,
 *  edit priority/deadline (managers), and read/add progress notes. */
export function TaskDetail(props: Props) {
  const { task, assignments, profiles, assignable, selfId, canManage, onClose, onChanged } = props
  const mine = assignments.some((a) => a.task_id === task.id && a.user_id === selfId)
  const canEditStatus = canManage || mine
  const taskAssignees = assignments.filter((a) => a.task_id === task.id)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true); setError(null)
    try { await fn(); onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }

  const transitions = nextStatuses(task.status)
  const unassignedMembers = assignable.filter((m) => !taskAssignees.some((a) => a.user_id === m.id))

  return (
    <Modal title={task.title} onClose={onClose} wide>
      {error && <div className="form-error">{error}</div>}

      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Badge tone="accent">{isTaskStatus(task.status) ? STATUS_LABELS[task.status] : task.status}</Badge>
        <Badge tone={task.priority === 'urgent' || task.priority === 'high' ? 'warn' : 'default'}>
          {PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
        </Badge>
        {task.deadline && (
          <Badge tone={isOverdue(task) ? 'danger' : 'default'}>Due {formatDate(task.deadline)} · {relativeDeadline(task.deadline)}</Badge>
        )}
      </div>

      {task.description && <p className="muted" style={{ marginBottom: 18 }}>{task.description}</p>}

      {/* Status transitions */}
      <div style={{ marginBottom: 18 }}>
        <div className="field"><label>Move to</label></div>
        {!canEditStatus ? <p className="faint">You can only change status on tasks assigned to you.</p>
          : transitions.length === 0 ? <p className="faint">No status changes available.</p>
          : (
            <div className="row wrap">
              {transitions.map((s) => (
                <Button key={s} size="sm" disabled={busy} onClick={() => void act(() => updateTask(task.id, { status: s }))}>
                  {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          )}
      </div>

      {/* Priority & deadline — managers only */}
      {canManage && (
        <div className="grid grid-2" style={{ marginBottom: 6 }}>
          <Field label="Priority">
            <select value={task.priority} disabled={busy}
              onChange={(e) => void act(() => updateTask(task.id, { priority: e.target.value }))}>
              {[...new Set([task.priority, ...TASK_PRIORITIES])].map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p as TaskPriority] ?? p}</option>
              ))}
            </select>
          </Field>
          <Field label="Deadline">
            <input type="date" disabled={busy}
              value={task.deadline ? task.deadline.slice(0, 10) : ''}
              onChange={(e) => void act(() => updateTask(task.id, { deadline: localInputToIso(e.target.value) }))} />
          </Field>
        </div>
      )}

      {/* Assignees */}
      <div className="field"><label>Assignees</label></div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {taskAssignees.length === 0 && <span className="faint">Nobody assigned</span>}
        {taskAssignees.map((a) => (
          <Badge key={a.id}>
            {personLabel(a.user_id, profiles, selfId)}
            {canManage && <button className="btn-ghost" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px' }}
              aria-label="Remove" disabled={busy} onClick={() => void act(() => unassignTask(a.id))}>✕</button>}
          </Badge>
        ))}
      </div>
      {canManage && unassignedMembers.length > 0 && (
        <select style={{ maxWidth: 260 }} value="" disabled={busy}
          onChange={(e) => { const uid = e.target.value; if (uid) void act(() => assignTask(task.id, uid)) }}>
          <option value="">Assign someone…</option>
          {unassignedMembers.map((m) => <option key={m.id} value={m.id}>{personLabel(m.id, profiles, selfId)}</option>)}
        </select>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
      <Comments taskId={task.id} profiles={profiles} selfId={selfId} />
    </Modal>
  )
}

function Comments({ taskId, profiles, selfId }: { taskId: string; profiles: Map<string, Profile>; selfId: string }) {
  const [comments, setComments] = useState<TaskComment[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setComments(await listComments(taskId)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load notes') }
  }
  useEffect(() => { void load() }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function post() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try { await addComment(taskId, body.trim()); setBody(''); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to post') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="field"><label>Progress notes</label></div>
      {error && <div className="form-error">{error}</div>}
      <div className="stack" style={{ marginBottom: 14 }}>
        {comments === null ? <span className="faint">Loading…</span>
          : comments.length === 0 ? <span className="faint">No notes yet.</span>
          : comments.map((c) => (
            <div key={c.id} className="card card-pad" style={{ boxShadow: 'none' }}>
              <div className="row between" style={{ marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{personLabel(c.author_id, profiles, selfId)}</strong>
                <span className="faint" style={{ fontSize: 12 }}>{formatDateTime(c.created_at)}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a progress note…" />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <Button variant="primary" size="sm" disabled={busy || !body.trim()} onClick={() => void post()}>Add note</Button>
      </div>
    </div>
  )
}
