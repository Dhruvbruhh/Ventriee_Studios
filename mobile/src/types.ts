// Row shapes for the shared multi-tenant cloud layer. Mirrors
// supabase/migrations/0001_multitenant_foundation.sql and src/main/cloud/types.ts
// so the mobile app reads the same schema the desktop writes. Access is enforced
// by Row-Level Security on the server, never by this client.

export type MembershipRole = 'owner' | 'admin' | 'project_manager' | 'employee'

export interface Organization { id: string; name: string; owner_id: string; created_at: string }
export interface Membership { id: string; org_id: string; user_id: string; role: MembershipRole; created_at: string }
/** org_id null => the user's personal workspace. */
export interface Project { id: string; org_id: string | null; owner_id: string; name: string; status: string; created_at: string }
export interface Task { id: string; project_id: string; title: string; status: string; created_by: string; created_at: string }
export interface Device { id: string; user_id: string; org_id: string | null; name: string; platform: string; last_seen_at: string; created_at: string }

// Remote-control command queue: see supabase/migrations/0002_remote_control.sql.
export type CommandStatus = 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'expired'

export interface Command {
  id: string
  device_id: string
  org_id: string | null
  type: string
  payload: Record<string, unknown>
  status: CommandStatus
  requires_confirmation: boolean
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  finished_at: string | null
  expires_at: string
}
