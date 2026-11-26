// Which workspace the app is currently scoped to: personal (null) or an org the user
// belongs to. Loads the user's organizations and remembers the choice. Switching only
// changes which rows we read — RLS still decides what the user may actually see.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { listOrganizations } from './cloud'
import { isConfigured } from './config'
import { useAuth } from './auth'
import type { Organization } from './types'
import type { Workspace } from './cloud'

interface WorkspaceState {
  workspace: Workspace
  orgs: Organization[]
  loading: boolean
  error: string | null
  setWorkspace(ws: Workspace): void
  reload(): Promise<void>
  /** Display name for the active workspace. */
  label: string
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const [workspace, setWorkspace] = useState<Workspace>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!isConfigured || !userId) { setOrgs([]); return }
    setLoading(true)
    setError(null)
    try {
      setOrgs(await listOrganizations())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workspaces')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void reload() }, [reload])

  // Reset to personal when the active org is no longer available (sign-out, lost access).
  useEffect(() => {
    if (workspace !== null && !orgs.some((o) => o.id === workspace)) setWorkspace(null)
  }, [orgs, workspace])

  const value = useMemo<WorkspaceState>(() => ({
    workspace, orgs, loading, error, setWorkspace, reload,
    label: workspace === null ? 'Personal' : (orgs.find((o) => o.id === workspace)?.name ?? 'Workspace'),
  }), [workspace, orgs, loading, error, reload])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return ctx
}
