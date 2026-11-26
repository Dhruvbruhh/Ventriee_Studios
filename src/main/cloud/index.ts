// Supabase-backed CloudClient. Talks to PostgREST (/rest/v1) with the user's
// auth token, mirroring auth.ts's raw-fetch style so no SDK is added. RLS on the
// server is the authority on access; this layer only shapes requests.
import type {
  AuditEntry, CloudClient, CloudProject, CloudTask, CommandStatus, Device, DeviceGrant,
  Membership, Organization, RemoteCommand, TaskAssignment
} from './types'

export type { CloudClient } from './types'

/** Returns the current access token, or null when signed out. */
export type TokenProvider = () => string | null

export class SupabaseCloudClient implements CloudClient {
  constructor(
    private url: string,
    private key: string,
    private token: TokenProvider,
    private request: typeof fetch = globalThis.fetch
  ) {}

  private async rest<T>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
    if (!this.url || !this.key) throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY')
    const token = this.token()
    if (!token) throw new Error('Sign in to Ventriee Studios to use the cloud workspace')
    const response = await this.request(`${this.url}/rest/v1/${path}`, {
      method: init.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: this.key, Authorization: `Bearer ${token}`, 'content-type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {})
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
    })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('You do not have access to that workspace')
      throw new Error(`Cloud request failed (${response.status})`)
    }
    return response.status === 204 ? (undefined as T) : await response.json() as T
  }

  /** PostgREST returns an array even for a single inserted row. */
  private async insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
    const rows = await this.rest<T[]>(table, { method: 'POST', body: row, prefer: 'return=representation' })
    const created = rows[0]
    if (!created) throw new Error('The cloud did not return the created row')
    return created
  }

  listOrganizations() { return this.rest<Organization[]>('organizations?select=*&order=created_at.asc') }
  createOrganization(name: string) { return this.insert<Organization>('organizations', { name }) }
  listMemberships(orgId: string) { return this.rest<Membership[]>(`memberships?select=*&org_id=eq.${enc(orgId)}`) }

  listProjects(opts?: { orgId?: string | null }) {
    const filter = opts && 'orgId' in opts ? `&org_id=${opts.orgId === null ? 'is.null' : `eq.${enc(opts.orgId!)}`}` : ''
    return this.rest<CloudProject[]>(`projects?select=*${filter}&order=created_at.asc`)
  }
  createProject(input: { name: string; orgId?: string | null; status?: string }) {
    return this.insert<CloudProject>('projects', { name: input.name, org_id: input.orgId ?? null, ...(input.status ? { status: input.status } : {}) })
  }

  listTasks(projectId: string) { return this.rest<CloudTask[]>(`tasks?select=*&project_id=eq.${enc(projectId)}&order=created_at.asc`) }
  createTask(input: { projectId: string; title: string; status?: string }) {
    return this.insert<CloudTask>('tasks', { project_id: input.projectId, title: input.title, ...(input.status ? { status: input.status } : {}) })
  }
  assignTask(taskId: string, userId: string) { return this.insert<TaskAssignment>('task_assignments', { task_id: taskId, user_id: userId }) }

  registerDevice(input: { name: string; platform: string; orgId?: string | null }) {
    return this.insert<Device>('devices', { name: input.name, platform: input.platform, org_id: input.orgId ?? null })
  }
  listDevices(opts?: { orgId?: string | null }) {
    const filter = opts && 'orgId' in opts ? `&org_id=${opts.orgId === null ? 'is.null' : `eq.${enc(opts.orgId!)}`}` : ''
    return this.rest<Device[]>(`devices?select=*${filter}&order=last_seen_at.desc`)
  }
  async updateDevice(deviceId: string, patch: { name?: string; platform?: string; remoteEnabled?: boolean; touch?: boolean }) {
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name
    if (patch.platform !== undefined) body.platform = patch.platform
    if (patch.remoteEnabled !== undefined) body.remote_enabled = patch.remoteEnabled
    if (patch.touch) body.last_seen_at = new Date().toISOString()
    return this.one<Device>(await this.rest<Device[]>(`devices?id=eq.${enc(deviceId)}`, { method: 'PATCH', body, prefer: 'return=representation' }))
  }

  enqueueCommand(input: { deviceId: string; orgId?: string | null; type: string; payload?: Record<string, unknown>; requiresConfirmation?: boolean; expiresAt: string }) {
    return this.insert<RemoteCommand>('commands', {
      device_id: input.deviceId, org_id: input.orgId ?? null, type: input.type,
      payload: input.payload ?? {}, requires_confirmation: input.requiresConfirmation ?? false, expires_at: input.expiresAt
    })
  }
  listCommands(opts: { deviceId: string; status?: CommandStatus | CommandStatus[]; limit?: number }) {
    const status = opts.status ? `&status=${Array.isArray(opts.status) ? `in.(${opts.status.map(enc).join(',')})` : `eq.${enc(opts.status)}`}` : ''
    return this.rest<RemoteCommand[]>(`commands?select=*&device_id=eq.${enc(opts.deviceId)}${status}&order=created_at.desc&limit=${Math.min(Math.max(opts.limit ?? 50, 1), 500)}`)
  }
  // Atomic claim: PATCH only rows still 'queued'; an empty echo means someone else won the race.
  async claimCommand(commandId: string) {
    return this.one<RemoteCommand>(await this.rest<RemoteCommand[]>(
      `commands?id=eq.${enc(commandId)}&status=eq.queued`,
      { method: 'PATCH', body: { status: 'claimed', claimed_at: new Date().toISOString() }, prefer: 'return=representation' }
    ), null)
  }
  async updateCommand(commandId: string, patch: { status: CommandStatus; result?: Record<string, unknown>; error?: string; finished?: boolean }) {
    const body: Record<string, unknown> = { status: patch.status }
    if (patch.result !== undefined) body.result = patch.result
    if (patch.error !== undefined) body.error = patch.error
    if (patch.finished) body.finished_at = new Date().toISOString()
    return this.one<RemoteCommand>(await this.rest<RemoteCommand[]>(`commands?id=eq.${enc(commandId)}`, { method: 'PATCH', body, prefer: 'return=representation' }), null)
  }

  listGrants(deviceId: string) { return this.rest<DeviceGrant[]>(`device_grants?select=*&device_id=eq.${enc(deviceId)}&order=created_at.asc`) }
  grantDevice(input: { deviceId: string; userId: string; expiresAt?: string | null }) {
    return this.insert<DeviceGrant>('device_grants', { device_id: input.deviceId, user_id: input.userId, expires_at: input.expiresAt ?? null })
  }
  async revokeGrant(grantId: string) { await this.rest<void>(`device_grants?id=eq.${enc(grantId)}`, { method: 'DELETE' }) }

  /** PostgREST returns an array; take the single row or (for a guarded update) a fallback. */
  private one<T>(rows: T[], fallback?: T | null): T {
    const row = rows[0]
    if (row === undefined) { if (fallback !== undefined) return fallback as T; throw new Error('The cloud did not return the expected row') }
    return row
  }

  recordAudit(entry: { action: string; orgId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }) {
    return this.insert<AuditEntry>('audit_log', {
      action: entry.action, org_id: entry.orgId ?? null,
      ...(entry.targetType ? { target_type: entry.targetType } : {}),
      ...(entry.targetId ? { target_id: entry.targetId } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {})
    })
  }
  listAudit(opts?: { orgId?: string | null; limit?: number }) {
    const filter = opts && 'orgId' in opts ? `&org_id=${opts.orgId === null ? 'is.null' : `eq.${enc(opts.orgId!)}`}` : ''
    return this.rest<AuditEntry[]>(`audit_log?select=*${filter}&order=created_at.desc&limit=${Math.min(Math.max(opts?.limit ?? 100, 1), 1000)}`)
  }
}

/** Percent-encode a value used in a PostgREST filter so ids can't inject operators. */
function enc(value: string): string { return encodeURIComponent(value) }
