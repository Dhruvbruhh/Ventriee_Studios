import { useState } from 'react'
import { useSession } from '../state/session'
import { useAsync } from '../lib/useAsync'
import { getProfiles, inviteMember, listMembers, removeMember, updateMemberRole } from '../lib/api'
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
        {canManage && <Button variant="primary" onClick={() => setAdding(true)}>+ Invite member</Button>}
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

      {adding && <InviteMemberModal orgId={orgId} orgName={workspace.name} onClose={() => setAdding(false)} onInvited={() => { setAdding(false); state.reload() }} />}
    </div>
  )
}

function InviteMemberModal({ orgId, orgName, onClose, onInvited }: { orgId: string; orgName: string; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MembershipRole>('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim()) return
    setBusy(true); setError(null)
    try {
      await inviteMember(orgId, email, role)
      onInvited()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to send invite'); setBusy(false) }
  }

  return (
    <Modal title="Invite member" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !email.trim()} onClick={() => void submit()}>{busy ? 'Sending…' : 'Send invite'}</Button></>}>
      {error && <div className="form-error">{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>
        They get an email with a link to set up their account and join {orgName}. If someone is already a member, their current role is kept.
      </p>
      <Field label="Email"><input type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" /></Field>
      <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value as MembershipRole)}>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
    </Modal>
  )
}
