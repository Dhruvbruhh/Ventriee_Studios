import { useState } from 'react'
import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import { addMember, getProfiles, listMembers, removeMember, updateMemberRole } from '../lib/api'
import type { MembershipRole } from '../lib/types'
import { Badge, Button, EmptyState, ErrorState, Field, Modal, Spinner } from '../components/ui'
import { ASSIGNABLE_ROLES, ROLE_LABELS, canManageMembers } from '../lib/roles'
import { formatDate, personLabel } from '../lib/format'

export function Team() {
  const { workspace, user } = useSession()
  const orgId = workspace.orgId
  const canManage = canManageMembers(workspace.role)
  const [adding, setAdding] = useState(false)

  const state = useAsync(async () => {
    if (!orgId) return null
    const members = await listMembers(orgId)
    const profiles = await getProfiles(members.map((m) => m.user_id))
    return { members, profiles }
  }, [orgId])

  if (!orgId) {
    return <EmptyState title="Personal workspace" hint="Team management applies to organizations. Switch to an org workspace to manage members." />
  }
  if (state.loading) return <Spinner />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  const { members, profiles } = state.data!

  return (
    <div>
      <div className="section-head">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{members.length} member{members.length === 1 ? '' : 's'} in {workspace.name}</p>
        </div>
        {canManage && <Button variant="primary" onClick={() => setAdding(true)}>+ Add member</Button>}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead><tr><th>Member</th><th>Role</th><th>Joined</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {members.map((m) => {
              const isOwner = m.role === 'owner'
              const isSelf = m.user_id === user.id
              return (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{personLabel(m.user_id, profiles, user.id)}{isSelf && <span className="faint" style={{ fontWeight: 400 }}> (you)</span>}</td>
                  <td>
                    {canManage && !isOwner ? (
                      <select style={{ width: 'auto' }} value={m.role}
                        onChange={async (e) => { await updateMemberRole(m.id, e.target.value as MembershipRole); state.reload() }}>
                        {[...new Set<MembershipRole>([m.role, ...ASSIGNABLE_ROLES])].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    ) : <Badge tone={isOwner ? 'accent' : 'default'}>{ROLE_LABELS[m.role]}</Badge>}
                  </td>
                  <td className="muted">{formatDate(m.created_at)}</td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      {!isOwner && <Button variant="danger" size="sm" onClick={async () => { await removeMember(m.id); state.reload() }}>Remove</Button>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {adding && <AddMemberModal onClose={() => setAdding(false)} onAdd={async (uid, role) => { await addMember(orgId, uid, role); setAdding(false); state.reload() }} />}
    </div>
  )
}

function AddMemberModal({ onClose, onAdd }: { onClose: () => void; onAdd: (userId: string, role: MembershipRole) => Promise<void> }) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<MembershipRole>('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!userId.trim()) return
    setBusy(true); setError(null)
    try { await onAdd(userId.trim(), role) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to add member'); setBusy(false) }
  }

  return (
    <Modal title="Add member" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !userId.trim()} onClick={() => void submit()}>{busy ? 'Adding…' : 'Add member'}</Button></>}>
      {error && <div className="form-error">{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>
        Add an existing Ventriee user by their user ID. Email-based invites need a server-side function (see README) and aren't available with the public key.
      </p>
      <Field label="User ID"><input value={userId} autoFocus onChange={(e) => setUserId(e.target.value)} placeholder="auth user UUID" /></Field>
      <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value as MembershipRole)}>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
    </Modal>
  )
}
