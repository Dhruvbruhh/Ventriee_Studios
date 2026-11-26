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
export interface Device { id: string; user_id: string; org_id: string | null; name: string; platform: string; remote_enabled: boolean; last_seen_at: string; created_at: string }
export interface AuditEntry { id: string; org_id: string | null; actor_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown>; created_at: string }

// Inbound remote control (migration 0002). A command addressed to one device.
export type CommandStatus = 'queued' | 'claimed' | 'running' | 'done' | 'failed' | 'expired'
export interface RemoteCommand {
  id: string; device_id: string; org_id: string | null; type: string; payload: Record<string, unknown>
  status: CommandStatus; requires_confirmation: boolean; result: Record<string, unknown>; error: string
  requested_by: string; created_at: string; claimed_at: string | null; finished_at: string | null; expires_at: string
}
/** Explicit per-device control grant; org membership alone never grants control. */
export interface DeviceGrant { id: string; device_id: string; user_id: string; granted_by: string; expires_at: string | null; created_at: string }

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
  updateDevice(deviceId: string, patch: { name?: string; platform?: string; remoteEnabled?: boolean; touch?: boolean }): Promise<Device>
  // Command bus (inbound remote control).
  enqueueCommand(input: { deviceId: string; orgId?: string | null; type: string; payload?: Record<string, unknown>; requiresConfirmation?: boolean; expiresAt: string }): Promise<RemoteCommand>
  listCommands(opts: { deviceId: string; status?: CommandStatus | CommandStatus[]; limit?: number }): Promise<RemoteCommand[]>
  /** Atomic queued->claimed compare-and-set; null if another process already claimed it. */
  claimCommand(commandId: string): Promise<RemoteCommand | null>
  updateCommand(commandId: string, patch: { status: CommandStatus; result?: Record<string, unknown>; error?: string; finished?: boolean }): Promise<RemoteCommand | null>
  // Per-device control grants.
  listGrants(deviceId: string): Promise<DeviceGrant[]>
  grantDevice(input: { deviceId: string; userId: string; expiresAt?: string | null }): Promise<DeviceGrant>
  revokeGrant(grantId: string): Promise<void>
  recordAudit(entry: { action: string; orgId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }): Promise<AuditEntry>
  listAudit(opts?: { orgId?: string | null; limit?: number }): Promise<AuditEntry[]>
}
