// Auth + active-workspace context. Holds the signed-in user, the list of
// workspaces (personal + orgs) with the user's role in each, and which one is
// active. The rest of the app reads role from here to gate the UI.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { listWorkspaces, signOut as apiSignOut } from '../lib/api'
import type { Workspace } from '../lib/types'

interface SessionValue {
  user: User
  workspaces: Workspace[]
  workspace: Workspace
  setWorkspaceByOrg: (orgId: string | null) => void
  reloadWorkspaces: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

/** Renders children only when signed in; otherwise calls `onSignedOut`. */
export function SessionProvider({ user, onSignedOut, children }: {
  user: User; onSignedOut: () => void; children: ReactNode
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const list = await listWorkspaces(user.id)
      setWorkspaces(list)
      // Keep the current selection if it still exists, else fall back to personal.
      setOrgId((prev) => (list.some((w) => w.orgId === prev) ? prev : null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces')
    }
  }, [user.id])

  useEffect(() => { void load() }, [load])

  if (error) {
    return <div className="auth-wrap"><div className="state error"><h3>Could not load your workspaces</h3><p>{error}</p></div></div>
  }
  if (!workspaces) {
    return <div className="auth-wrap"><div className="spinner" /></div>
  }

  const workspace = workspaces.find((w) => w.orgId === orgId) ?? workspaces[0]

  const value: SessionValue = {
    user,
    workspaces,
    workspace,
    setWorkspaceByOrg: setOrgId,
    reloadWorkspaces: load,
    signOut: async () => { await apiSignOut(); onSignedOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used within SessionProvider')
  return v
}

/** Re-export so components can subscribe to raw auth changes if needed. */
export { supabase }
