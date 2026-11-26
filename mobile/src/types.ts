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

// ---------------------------------------------------------------------------
// Remote-control command queue (workstream W5).
//
// TODO(W5): confirm the final column names against W5's
// supabase/migrations/0002_remote_control.sql before this ships. This app codes
// against the contract described in the ecosystem audit §17: a `commands` table
// the mobile app inserts into (status 'pending') and the desktop drains, executes,
// and writes back `status` + `result`. The fields assumed below are:
//   id, device_id, org_id, type, payload (jsonb), status, result (jsonb|null),
//   error (text|null), created_at, updated_at.
// If W5 named any of these differently (e.g. `command`/`kind` for `type`,
// `output` for `result`), update COMMAND_TABLE_COLUMNS in commands.ts and this type.
// ---------------------------------------------------------------------------
export type CommandStatus = 'pending' | 'running' | 'done' | 'error'

export interface Command {
  id: string
  device_id: string
  org_id: string | null
  type: string
  payload: Record<string, unknown>
  status: CommandStatus
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  updated_at: string
}
