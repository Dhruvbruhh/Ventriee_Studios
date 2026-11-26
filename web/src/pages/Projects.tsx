import { useState } from 'react'
import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import { createProject, listProjects, listTasksForProjects, updateProjectStatus } from '../lib/api'
import { Badge, Button, ErrorState, Field, Modal, Spinner } from '../components/ui'
import { EmptyState } from '../components/ui'
import { canManageProjects } from '../lib/roles'
import { formatDate } from '../lib/format'
import { isOpen } from '../lib/tasks'

const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived']

export function Projects() {
  const { workspace } = useSession()
  const orgId = workspace.orgId
  const canManage = canManageProjects(workspace.role)
  const [creating, setCreating] = useState(false)

  const state = useAsync(async () => {
    const projects = await listProjects(orgId)
    const tasks = await listTasksForProjects(projects.map((p) => p.id))
    return { projects, tasks }
  }, [orgId])

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{workspace.name} workspace</p>
        </div>
        {canManage && <Button variant="primary" onClick={() => setCreating(true)}>+ New project</Button>}
      </div>

      {state.loading ? <Spinner />
        : state.error ? <ErrorState message={state.error} onRetry={state.reload} />
        : state.data!.projects.length === 0 ? (
          <div className="card">
            <EmptyState title="No projects yet"
              hint={canManage ? 'Create your first project to start tracking work.' : 'No projects have been created in this workspace.'}
              action={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>+ New project</Button> : undefined} />
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead><tr><th>Project</th><th>Status</th><th>Open tasks</th><th>Created</th></tr></thead>
              <tbody>
                {state.data!.projects.map((p) => {
                  const open = state.data!.tasks.filter((t) => t.project_id === p.id && isOpen(t.status)).length
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>
                        {canManage ? (
                          <select style={{ width: 'auto' }} value={p.status}
                            onChange={async (e) => { await updateProjectStatus(p.id, e.target.value); state.reload() }}>
                            {[...new Set([p.status, ...PROJECT_STATUSES])].map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : <Badge tone={p.status === 'completed' ? 'ok' : p.status === 'active' ? 'accent' : 'default'}>{p.status}</Badge>}
                      </td>
                      <td>{open}</td>
                      <td className="muted">{formatDate(p.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {creating && <CreateProjectModal orgId={orgId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); state.reload() }} />}
    </div>
  )
}

function CreateProjectModal({ orgId, onClose, onCreated }: { orgId: string | null; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState('active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setBusy(true); setError(null)
    try { await createProject(orgId, name.trim(), status); onCreated() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); setBusy(false) }
  }

  return (
    <Modal title="New project" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? 'Creating…' : 'Create project'}</Button></>}>
      {error && <div className="form-error">{error}</div>}
      <Field label="Name"><input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Client website redesign" /></Field>
      <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
    </Modal>
  )
}
