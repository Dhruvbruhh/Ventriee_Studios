import { useEffect, useState } from 'react'
import { guard } from '../store'

/**
 * §4: one account, many workspaces. The active workspace (personal or an org)
 * decides where cloud sync pushes this desktop and which org's memory a new
 * project gets. Switching already existed (Memory panel); this puts it in the
 * topbar so it is reachable everywhere. Hidden when signed out or org-less.
 */
export function OrgPicker() {
  const [state, setState] = useState<{ active: string | null; orgs: Array<{ id: string; name: string }> } | null>(null)

  useEffect(() => {
    void window.ventriee.authStatus().then(async (session) => {
      if (!session) return
      const orgs = await window.ventriee.cloudOrgs()
      if (orgs.length) setState({ active: session.activeOrgId, orgs })
    }).catch(() => {})
  }, [])

  if (!state) return null
  const current = state.orgs.find((o) => o.id === state.active)
  return (
    <select
      className="select w-sm"
      aria-label="Active workspace"
      title={`Workspace for cloud sync and new projects: ${current?.name ?? 'Personal'}`}
      value={state.active ?? ''}
      onChange={async (e) => {
        const next = e.target.value || null
        const session = await guard(() => window.ventriee.cloudSetWorkspace(next))
        if (session) setState({ ...state, active: session.activeOrgId })
      }}
    >
      <option value="">Personal</option>
      {state.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}
