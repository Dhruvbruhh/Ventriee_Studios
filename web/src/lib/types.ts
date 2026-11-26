// Row shapes for the shared Supabase backend. Mirrors
// supabase/migrations/0001_multitenant_foundation.sql and 0002_web_dashboard.sql.
// RLS on the server is the authority on access; these are just the wire shapes.

export type MembershipRole = 'owner' | 'admin' | 'project_manager' | 'employee'

export interface Organization { id: string; name: string; owner_id: string; created_at: string }
export interface Membership { id: string; org_id: string; user_id: string; role: MembershipRole; created_at: string }
/** org_id null => the user's personal workspace. */
export interface Project { id: string; org_id: string | null; owner_id: string; name: string; status: string; created_at: string }
export interface Task {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  priority: string
  deadline: string | null
  created_by: string
  created_at: string
}
export interface TaskAssignment { id: string; task_id: string; user_id: string; assigned_at: string }
export interface TaskComment { id: string; task_id: string; author_id: string; body: string; created_at: string }
export interface Profile { user_id: string; email: string; display_name: string }

/** The workspace the dashboard is scoped to: personal (org null) or one org. */
export interface Workspace {
  orgId: string | null
  name: string
  /** The signed-in user's role in this workspace. Personal => 'owner'. */
  role: MembershipRole
}
