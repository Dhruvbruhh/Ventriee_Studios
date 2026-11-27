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
    let alive = true
    // Memory-panel picker can change the workspace elsewhere; re-read so this
    // always shows the real sync target. Same polling pattern as auth.tsx.
    async function refresh() {
      try {
        const session = await window.ventriee.authStatus()
        if (!alive || !session) return
        const orgs = await window.ventriee.cloudOrgs()
        if (alive && orgs.length) setState({ active: session.activeOrgId, orgs })
      } catch { /* keep last known state */ }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 15_000)
    window.addEventListener('focus', refresh)
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
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
      {state.active && !current ? <option value={state.active}>Unknown workspace</option> : null}
    </select>
  )
}
