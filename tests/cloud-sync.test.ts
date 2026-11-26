import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { CLOUD_STATUS, CloudSync, assertMetadataOnly } from '../src/main/cloud/sync'
import type { CloudClient, CloudProject, CloudTask, CloudTaskPatch } from '../src/main/cloud/types'
import type { Task, TaskStatus } from '../src/shared/types'

/** In-memory cloud with the same compare-and-set semantics as PostgREST + the 0005 trigger. */
class FakeCloud {
  projects: CloudProject[] = []
  tasks: CloudTask[] = []
  offline = false
  writes: Array<Record<string, unknown>> = []
  private clock = 0
  private stamp() { return `2026-11-26T00:00:${String(++this.clock).padStart(2, '0')}Z` }
  private net() { if (this.offline) throw new TypeError('fetch failed') }
  async createProject(input: { name: string; orgId?: string | null }) {
    this.net(); this.writes.push(input)
    const p = { id: `cp${this.projects.length}`, org_id: input.orgId ?? null, owner_id: 'u1', name: input.name, status: 'active', created_at: '', updated_at: this.stamp() }
    this.projects.push(p); return p
  }
  async updateProject(id: string, patch: { name?: string }, expected?: string | null) {
    this.net(); this.writes.push(patch)
    const p = this.projects.find((x) => x.id === id && (!expected || x.updated_at === expected))
    if (!p) return null
    Object.assign(p, patch, { updated_at: this.stamp() }); return p
  }
  async createTask(input: { projectId: string; title: string } & CloudTaskPatch) {
    this.net()
    const { projectId, ...rest } = input
    this.writes.push(rest)
    const t: CloudTask = { id: `ct${this.tasks.length}`, project_id: projectId, title: input.title, status: input.status ?? 'todo', created_by: 'u1', created_at: '', updated_at: this.stamp(), ...rest }
    this.tasks.push(t); return t
  }
  async updateTask(id: string, patch: CloudTaskPatch, expected?: string | null) {
    this.net(); this.writes.push(patch)
    const t = this.tasks.find((x) => x.id === id && (!expected || x.updated_at === expected))
    if (!t) return null
    Object.assign(t, patch, { updated_at: this.stamp() }); return t
  }
  async listTasks(projectId: string) { this.net(); return this.tasks.filter((t) => t.project_id === projectId) }
  /** Someone edits the row on the web. */
  touchTask(id: string, patch: Partial<CloudTask>) { Object.assign(this.tasks.find((t) => t.id === id)!, patch, { updated_at: this.stamp() }) }
}

function setup(secrets: string[] = []) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'ventriee-sync-')), 'ventriee.db'))
  const cloud = new FakeCloud()
  let now = 1_000_000
  const sync = new CloudSync(store, cloud as unknown as CloudClient, { secrets: () => secrets, now: () => now, timers: false })
  store.onChange = (kind, id) => sync.markDirty(kind, id)
  const project = store.createProject({ name: 'Client site', path: 'C:/secret/path', description: 'private notes' })
  const addTask = (id: string, patch: Partial<Task> = {}) => store.insertTask({
    id, projectId: project.id, parentId: null, title: 'Build hero', description: 'const apiKey = 1', acceptance: '', role: 'frontend',
    agentId: null, status: 'todo', dependsOn: [], output: 'source code here', review: '', attempts: 0, phase: 'build',
    engine: null, model: 'claude-sonnet', endpoint: null, routedBy: null, createdAt: 1, updatedAt: 1, ...patch
  })
  return { store, cloud, sync, project, addTask, advance: (ms: number) => { now += ms } }
}

describe('cloud sync', () => {
  it('maps every desktop status onto the cloud board set', () => {
    const board = ['backlog', 'todo', 'in_progress', 'waiting', 'blocked', 'in_review', 'completed', 'cancelled']
    const all: TaskStatus[] = ['todo', 'ready', 'running', 'review', 'rework', 'blocked', 'approval', 'done', 'failed']
    for (const s of all) expect(board).toContain(CLOUD_STATUS[s])
    expect(CLOUD_STATUS.running).toBe('in_progress')
    expect(CLOUD_STATUS.done).toBe('completed')
  })

  it('queues while signed out, then pushes project then task and records the id mapping', async () => {
    const { store, cloud, sync, project, addTask } = setup()
    addTask('t1', { status: 'running' })
    await sync.flush()
    expect(cloud.projects).toHaveLength(0)
    expect(sync.status()).toMatchObject({ state: 'signed-out', pending: 2 })

    sync.setSession({ userId: 'u1', activeOrgId: 'org1' })
    await sync.flush()
    expect(cloud.projects).toEqual([expect.objectContaining({ name: 'Client site', org_id: 'org1' })])
    expect(cloud.tasks).toEqual([expect.objectContaining({ project_id: 'cp0', status: 'in_progress', run_status: 'running', run_model: 'claude-sonnet' })])
    const link = store.db.get<{ cloudId: string }>(`SELECT cloudId FROM cloud_sync WHERE kind='project' AND localId=?`, project.id)
    expect(link?.cloudId).toBe('cp0')
    expect(sync.status()).toMatchObject({ state: 'synced', pending: 0 })

    store.updateTask('t1', { status: 'done' })
    await sync.flush()
    expect(cloud.tasks[0]).toMatchObject({ status: 'completed', run_status: 'done' })
    expect(cloud.tasks).toHaveLength(1)
  })

  it('retries with backoff after going offline', async () => {
    const { cloud, sync, addTask, advance } = setup()
    sync.setSession({ userId: 'u1', activeOrgId: null })
    cloud.offline = true
    addTask('t1')
    await sync.flush()
    expect(sync.status()).toMatchObject({ state: 'error', pending: 2, error: 'fetch failed' })

    cloud.offline = false
    await sync.flush() // still inside the backoff window: nothing is sent
    expect(cloud.projects).toHaveLength(0)
    advance(60_000)
    await sync.flush()
    expect(cloud.projects).toHaveLength(1)
    expect(cloud.tasks).toHaveLength(1)
    expect(sync.status().state).toBe('synced')
  })

  it('never overwrites a row changed in the cloud; records a conflict until the owner keeps the desktop version', async () => {
    const { store, cloud, sync, addTask } = setup()
    sync.setSession({ userId: 'u1', activeOrgId: null })
    addTask('t1')
    await sync.flush()
    cloud.touchTask('ct0', { title: 'Renamed on the web', status: 'blocked' })

    store.updateTask('t1', { status: 'running' })
    await sync.flush()
    expect(cloud.tasks[0]).toMatchObject({ title: 'Renamed on the web', status: 'blocked' })
    const status = sync.status()
    expect(status.state).toBe('conflict')
    expect(status.conflicts).toEqual([expect.objectContaining({ kind: 'task', localId: 't1', title: 'Build hero' })])

    sync.keepDesktop('task', 't1')
    await sync.flush()
    expect(cloud.tasks[0]).toMatchObject({ title: 'Build hero', status: 'in_progress' })
    expect(sync.status().conflicts).toEqual([])
  })

  it('pulls new cloud tasks into an owner inbox once, without creating runnable tasks', async () => {
    const { store, cloud, sync, project, addTask } = setup()
    sync.setSession({ userId: 'u1', activeOrgId: null })
    addTask('t1')
    await sync.flush()
    await cloud.createTask({ projectId: 'cp0', title: 'Fix footer from mobile' })
    await sync.flush()
    await sync.flush()
    const inbox = store.messages(project.id).filter((m) => m.sender === 'cloud')
    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toMatchObject({ recipient: 'owner', status: 'unread' })
    expect(inbox[0]!.content).toContain('Fix footer from mobile')
    expect(store.tasks(project.id).map((t) => t.id)).toEqual(['t1'])
  })

  it('sends only allowlisted metadata, with secrets redacted', async () => {
    const key = 'sk-live-abcdefghijklmnopqrstuvwxyz'
    const { cloud, sync, addTask } = setup([key])
    sync.setSession({ userId: 'u1', activeOrgId: null })
    addTask('t1', { title: `Rotate ${key} today` })
    await sync.flush()
    const sent = JSON.stringify(cloud.writes)
    for (const leak of [key, 'C:/secret/path', 'private notes', 'const apiKey', 'source code here']) expect(sent).not.toContain(leak)
    for (const w of cloud.writes) for (const k of Object.keys(w)) expect(['name', 'orgId', 'title', 'status', 'run_status', 'run_model', 'run_agent']).toContain(k)
    expect(() => assertMetadataOnly('tasks', { title: 'x', description: 'code' })).toThrow(/refused/)
  })

  it('does nothing while the setting is off', async () => {
    const { store, cloud, sync, addTask } = setup()
    store.saveSettings({ cloudSync: false })
    sync.setSession({ userId: 'u1', activeOrgId: null })
    addTask('t1')
    await sync.flush()
    expect(cloud.projects).toHaveLength(0)
    expect(sync.status().state).toBe('off')
  })
})
