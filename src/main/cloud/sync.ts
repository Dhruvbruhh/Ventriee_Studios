// Desktop <-> cloud sync (W14). Mirrors local projects and tasks into the
// Supabase projects/tasks tables so the web dashboard and mobile app see real
// desktop work, and pulls tasks created in the cloud into a desktop inbox.
//
// - Local-first: the store is the source of truth; sync never blocks a write or
//   a run. Store writes only mark a row dirty (cloud_sync table, the outbox);
//   a debounced flush pushes them while signed in, with per-row backoff.
// - Conflicts: updates are compare-and-set on updated_at. A row changed in the
//   cloud since we last saw it is never overwritten: it is recorded as a
//   conflict and shown until the owner chooses to keep the desktop version.
// - Metadata only: names, titles, statuses and the model/worker name. Never
//   paths, descriptions, output, code, memory docs or secrets (see payloads).
import type { Store } from '../store'
import type { Task, TaskStatus } from '../../shared/types'
import type { CloudClient, CloudTaskPatch } from './types'
import type { SyncStatus } from '../../shared/ipc'
import { redact } from '../redact'

export type SyncKind = 'project' | 'task'

interface Row {
  kind: string; localId: string; cloudId: string | null; userId: string; cloudUpdatedAt: string | null
  dirty: number; attempts: number; nextAt: number; error: string; conflict: string
}

/** Desktop task status -> the cloud board's status set (web/src/lib/tasks.ts). */
export const CLOUD_STATUS: Record<TaskStatus, string> = {
  todo: 'todo', ready: 'todo', running: 'in_progress', rework: 'in_progress',
  review: 'in_review', approval: 'in_review', blocked: 'blocked', failed: 'blocked', done: 'completed'
}

/** The only columns sync may ever write; anything else is a bug that could leak data. */
const ALLOWED: Record<'projects' | 'tasks', string[]> = {
  projects: ['name'],
  tasks: ['title', 'status', 'run_status', 'run_model', 'run_agent']
}
export function assertMetadataOnly(table: 'projects' | 'tasks', body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) if (!ALLOWED[table].includes(key)) throw new Error(`cloud sync refused to send ${table}.${key}`)
}

const clip = (text: string, max: number) => text.length > max ? text.slice(0, max - 1) + '…' : text
const DEBOUNCE_MS = 2_000
const PULL_EVERY_MS = 60_000
const MAX_BACKOFF_MS = 5 * 60_000

export class CloudSync {
  private session: { userId: string; orgId: string | null } | null = null
  private running = false
  private again = false
  private debounce: ReturnType<typeof setTimeout> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private lastSyncAt: number | null = null
  private lastError = ''

  constructor(
    private store: Store,
    private cloud: CloudClient,
    private opts: { secrets?: () => string[]; now?: () => number; onStatus?: () => void; timers?: boolean } = {}
  ) {}

  private now() { return this.opts.now?.() ?? Date.now() }
  enabled(): boolean { return this.store.settings().cloudSync !== false }

  /** Sign-in/out and workspace switches land here. New projects go to the active workspace. */
  setSession(session: { userId: string; activeOrgId: string | null } | null): void {
    const next = session ? { userId: session.userId, orgId: session.activeOrgId } : null
    // Every window re-reports its session; only a real change restarts the loop.
    if (next?.userId === this.session?.userId && next?.orgId === this.session?.orgId && (this.ticker || !next)) return
    this.session = next
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null }
    if (this.session && this.opts.timers !== false) {
      this.ticker = setInterval(() => void this.flush(), PULL_EVERY_MS)
      this.ticker.unref?.()
      void this.flush()
    }
    this.opts.onStatus?.()
  }

  /** Store hook: cheap and synchronous; the push happens later. Works while offline or signed out. */
  markDirty(kind: SyncKind, localId: string): void {
    this.store.db.run(
      `INSERT INTO cloud_sync(kind, localId) VALUES(?, ?)
       ON CONFLICT(kind, localId) DO UPDATE SET dirty = dirty + 1, nextAt = 0`, kind, localId)
    if (this.session && this.opts.timers !== false && !this.debounce) {
      this.debounce = setTimeout(() => { this.debounce = null; void this.flush() }, DEBOUNCE_MS)
      this.debounce.unref?.()
    }
  }

  /** Push the outbox, then pull new cloud tasks. Never throws; errors land in status(). */
  async flush(): Promise<void> {
    if (!this.session || !this.enabled()) return
    if (this.running) { this.again = true; return }
    this.running = true
    this.opts.onStatus?.()
    try {
      const { db } = this.store
      // Items that existed before sync was on (or before this table existed) join the outbox once.
      db.run(`INSERT OR IGNORE INTO cloud_sync(kind, localId) SELECT 'project', id FROM projects`)
      db.run(`INSERT OR IGNORE INTO cloud_sync(kind, localId) SELECT 'task', id FROM tasks`)
      const rows = db.all<Row>(
        `SELECT * FROM cloud_sync WHERE dirty > 0 AND conflict = '' AND nextAt <= ? AND kind IN ('project','task')
           AND (userId = '' OR userId = ?) ORDER BY CASE kind WHEN 'project' THEN 0 ELSE 1 END`,
        this.now(), this.session.userId)
      let failed = ''
      for (const row of rows) {
        try { await (row.kind === 'project' ? this.pushProject(row) : this.pushTask(row)) } catch (e) {
          failed = e instanceof Error ? e.message : String(e)
          const attempts = row.attempts + 1
          db.run('UPDATE cloud_sync SET attempts = ?, nextAt = ?, error = ? WHERE kind = ? AND localId = ?',
            attempts, this.now() + Math.min(DEBOUNCE_MS * 2 ** attempts, MAX_BACKOFF_MS), failed, row.kind, row.localId)
        }
      }
      try { await this.pull() } catch (e) { failed ||= e instanceof Error ? e.message : String(e) }
      this.lastError = failed
      if (!failed) this.lastSyncAt = this.now()
    } finally {
      this.running = false
      this.opts.onStatus?.()
    }
    if (this.again) { this.again = false; await this.flush() }
  }

  private safe(text: string, max: number) { return clip(redact(text, this.opts.secrets?.() ?? []).trim(), max) }

  /** Mark pushed; keep the row dirty if the store changed it again while we were awaiting. */
  private done(row: Row, cloudId: string, updatedAt: string) {
    this.store.db.run(
      `UPDATE cloud_sync SET cloudId = ?, cloudUpdatedAt = ?, userId = ?, dirty = MAX(dirty - ?, 0), attempts = 0, nextAt = 0, error = ''
       WHERE kind = ? AND localId = ?`, cloudId, updatedAt, this.session!.userId, row.dirty, row.kind, row.localId)
  }
  private conflict(row: Row, reason: string) {
    this.store.db.run('UPDATE cloud_sync SET conflict = ? WHERE kind = ? AND localId = ?', reason, row.kind, row.localId)
  }
  private forget(row: Row) { this.store.db.run('DELETE FROM cloud_sync WHERE kind = ? AND localId = ?', row.kind, row.localId) }

  private async pushProject(row: Row) {
    const project = this.store.project(row.localId)
    // shortcut: deleting a desktop project leaves its cloud copy; deletion is a web/admin action.
    if (!project) return this.forget(row)
    const body = { name: this.safe(project.name, 200) || 'Untitled project' }
    assertMetadataOnly('projects', body)
    if (!row.cloudId) {
      const created = await this.cloud.createProject({ ...body, orgId: this.session!.orgId })
      return this.done(row, created.id, created.updated_at)
    }
    const updated = await this.cloud.updateProject(row.cloudId, body, row.cloudUpdatedAt)
    if (!updated) return this.conflict(row, row.cloudUpdatedAt ? 'Changed in the cloud since the last sync' : 'Missing in the cloud, or you no longer have access')
    this.done(row, updated.id, updated.updated_at)
  }

  taskPayload(task: Task): Required<CloudTaskPatch> {
    const agent = task.agentId ? this.store.agent(task.agentId) : undefined
    const body = {
      title: this.safe(task.title, 500) || 'Untitled task',
      status: CLOUD_STATUS[task.status] ?? 'todo',
      run_status: task.status,
      run_model: this.safe(task.model || agent?.model || '', 200),
      run_agent: this.safe(agent?.name ?? '', 200)
    }
    assertMetadataOnly('tasks', body)
    return body
  }

  private async pushTask(row: Row) {
    const task = this.store.task(row.localId)
    if (!task) return this.forget(row)
    const project = this.store.db.get<{ cloudId: string | null }>(`SELECT cloudId FROM cloud_sync WHERE kind = 'project' AND localId = ?`, task.projectId)
    if (!project?.cloudId) return // its project is not in the cloud yet; stays queued
    const body = this.taskPayload(task)
    if (!row.cloudId) {
      const created = await this.cloud.createTask({ projectId: project.cloudId, ...body })
      return this.done(row, created.id, created.updated_at)
    }
    const updated = await this.cloud.updateTask(row.cloudId, body, row.cloudUpdatedAt)
    if (!updated) return this.conflict(row, row.cloudUpdatedAt ? 'Changed in the cloud since the last sync' : 'Missing in the cloud, or you no longer have access')
    this.done(row, updated.id, updated.updated_at)
  }

  /** New cloud tasks on a linked project become an unread owner message; nothing runs by itself. */
  private async pull() {
    const { db } = this.store
    const projects = db.all<{ localId: string; cloudId: string }>(
      `SELECT localId, cloudId FROM cloud_sync WHERE kind = 'project' AND cloudId IS NOT NULL AND userId = ?`, this.session!.userId)
    for (const link of projects) {
      if (!this.store.project(link.localId)) continue
      const known = new Set(db.all<{ cloudId: string }>(`SELECT cloudId FROM cloud_sync WHERE cloudId IS NOT NULL AND kind IN ('task','inbox')`).map((r) => r.cloudId))
      for (const task of await this.cloud.listTasks(link.cloudId)) {
        if (known.has(task.id)) continue
        const message = this.store.addMessage({
          projectId: link.localId, taskId: null, sender: 'cloud', recipient: 'owner', type: 'request', status: 'unread',
          content: `New task from the cloud: ${clip(task.title, 500)} (${task.status})`
        })
        db.run(`INSERT INTO cloud_sync(kind, localId, cloudId, userId, cloudUpdatedAt, dirty) VALUES('inbox', ?, ?, ?, ?, 0)`,
          message.id, task.id, this.session!.userId, task.updated_at)
      }
    }
  }

  /** Resolve a conflict by pushing the desktop version over the cloud row once. */
  keepDesktop(kind: SyncKind, localId: string): void {
    this.store.db.run(`UPDATE cloud_sync SET conflict = '', cloudUpdatedAt = NULL, dirty = dirty + 1, nextAt = 0 WHERE kind = ? AND localId = ?`, kind, localId)
    void this.flush()
  }

  status(): SyncStatus {
    const { db } = this.store
    const conflicts = db.all<Row>(`SELECT * FROM cloud_sync WHERE conflict != ''`).map((r) => ({
      kind: r.kind as SyncKind, localId: r.localId, reason: r.conflict,
      title: (r.kind === 'project' ? this.store.project(r.localId)?.name : this.store.task(r.localId)?.title) ?? r.localId
    }))
    const pending = Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM cloud_sync WHERE dirty > 0 AND conflict = '' AND kind IN ('project','task')`)?.n ?? 0)
    const state: SyncStatus['state'] = !this.enabled() ? 'off' : !this.session ? 'signed-out' : this.running ? 'syncing'
      : conflicts.length ? 'conflict' : this.lastError ? 'error' : pending ? 'pending' : 'synced'
    return { state, pending, conflicts, lastSyncAt: this.lastSyncAt, error: this.lastError }
  }
}
