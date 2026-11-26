// Shapes of the multi-tenant cloud rows and the CloudClient interface the rest
// of the app depends on. Mirrors supabase/migrations/0001_multitenant_foundation.sql.
// The app depends on CloudClient, never on Supabase directly, so the backend can
// be swapped or faked without touching callers.

export type MembershipRole = 'owner' | 'admin' | 'project_manager' | 'employee'

export interface Organization { id: string; name: string; owner_id: string; created_at: string }
export interface Membership { id: string; org_id: string; user_id: string; role: MembershipRole; created_at: string }
/** org_id null => the user's personal workspace. */
export interface CloudProject { id: string; org_id: string | null; owner_id: string; name: string; status: string; created_at: string }
export interface CloudTask { id: string; project_id: string; title: string; status: string; created_by: string; created_at: string }
export interface TaskAssignment { id: string; task_id: string; user_id: string; assigned_at: string }
export interface Device { id: string; user_id: string; org_id: string | null; name: string; platform: string; last_seen_at: string; created_at: string }
export interface AuditEntry { id: string; org_id: string | null; actor_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown>; created_at: string }

/**
 * Typed data-access to the cloud layer, built on the signed-in user's Supabase
 * auth token. Row-Level Security (not this client) enforces who may read or
 * write what: every call runs with the caller's token, so a forbidden row is
 * simply absent or the write is rejected by Postgres.
 */
export interface CloudClient {
  listOrganizations(): Promise<Organization[]>
  createOrganization(name: string): Promise<Organization>
  listMemberships(orgId: string): Promise<Membership[]>
  /** opts.orgId null lists the personal workspace; undefined lists everything visible. */
  listProjects(opts?: { orgId?: string | null }): Promise<CloudProject[]>
  createProject(input: { name: string; orgId?: string | null; status?: string }): Promise<CloudProject>
  listTasks(projectId: string): Promise<CloudTask[]>
  createTask(input: { projectId: string; title: string; status?: string }): Promise<CloudTask>
  assignTask(taskId: string, userId: string): Promise<TaskAssignment>
  registerDevice(input: { name: string; platform: string; orgId?: string | null }): Promise<Device>
  listDevices(opts?: { orgId?: string | null }): Promise<Device[]>
  recordAudit(entry: { action: string; orgId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }): Promise<AuditEntry>
  listAudit(opts?: { orgId?: string | null; limit?: number }): Promise<AuditEntry[]>
}
