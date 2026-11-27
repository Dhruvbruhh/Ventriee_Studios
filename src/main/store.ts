import { randomUUID } from 'node:crypto'
import { Db } from './db'
import { builtinTemplates } from './roles'
import { applyImport, checkDepartment, checkTemplate, mergeCatalogue, type AgentCatalogue, type AgentTemplate, type Department, type ParsedManifest, type StoredCatalogue } from '../shared/agents'
import type {
  Agent,
  AppSettings,
  Assignment,
  Automation,
  ChatMessage,
  ChatTemplate,
  Conversation,
  EngineKind,
  Job,
  MemoryDoc,
  MemoryVersion,
  ModelOutcomeStat,
  Message,
  ModelOption,
  ModelPrefs,
  PreviewState,
  Project,
  PromptDoc,
  ProviderConfig,
  RunEvent,
  SessionRecord,
  SkillRecord,
  Snapshot,
  Task,
  Client,
  AnalyticsOverview,
  AnalyticsDayBucket,
  Workflow,
  WorkflowVersion,
  McpToolCall
} from '../shared/types'
import type { ProviderStatus } from '../shared/types'

const bolt = (v: unknown) => (v ? 1 : 0)
const unb = (v: unknown) => Boolean(v)

export const DEFAULT_SETTINGS: AppSettings = {
  defaultProjectId: null,
  orchestratorEngine: 'cli-opencode',
  orchestratorModel: '',
  maxConcurrentSessions: 4,
  sessionTimeoutMinutes: 30,
  autoExtractLessons: true,
  isolateCodeTasks: true,
  requireDeployApproval: true,
  reducedMotion: true,
  plannerFallback: true,
  companyPack: '',
  clarifyBrief: true,
  researchUrls: true,
  routingMode: 'automatic',
  costPreference: 'balanced',
  modelProfiles: {},
  plannerEngine: 'cli-opencode',
  plannerModel: '',
  plannerEndpoint: '',
  runMode: 'hybrid',
  mcpServers: [],
  optimizerEngine: 'api-ollama',
  optimizerModel: '',
  optimizerEndpoint: '',
  completionEngine: 'api-ollama',
  completionModel: '',
  editorTheme: 'ventriee',
  vimMode: false,
  autoSave: false,
  formatOnSave: false,
  effects: true,
  keybindings: [],
  errorReports: false,
  iconTheme: '',
  terminalShell: 'default',
  dailyBudgetUsd: 0,
  projectBudgetUsd: 0,
  completionEndpoint: '',
  onboardingSeen: false,
  theme: 'dark',
  accent: '',
  voice: {
    source: 'cloud',
    localModel: '',
    localEndpoint: '',
    sttEndpoint: '',
    sttModel: 'whisper-1',
    tts: 'system',
    ttsModel: 'gpt-4o-mini-tts',
    voiceName: '',
    rate: 1.05,
    volume: 1,
    language: 'auto',
    bargeIn: true,
    endSilenceMs: 700
  },
  connectors: {
    resendKey: '',
    posthogKey: '',
    posthogHost: 'https://app.posthog.com',
    sentryDsn: '',
    firecrawlKey: '',
    stripeKey: '',
    e2bKey: ''
  },
  simpleMode: false
}

export class Store {
  readonly db: Db
  /** Called after a project or task row is written; cloud sync listens here. Must not throw. */
  onChange?: (kind: 'project' | 'task', id: string) => void
  constructor(file: string) {
    this.db = new Db(file)
    // Seed the graphify MCP server once, disabled by default (owner enables it
    // in settings). Queries graphify-out/graph.json relative to the session cwd.
    if (!this.db.kvGet('mcpSeeded')) {
      const s = this.settings()
      if (!s.mcpServers.some((m) => m.name === 'graphify')) {
        this.saveSettings({
          mcpServers: [
            ...s.mcpServers,
            { name: 'graphify', command: 'python', args: ['-m', 'graphify.serve', '--transport', 'stdio'], enabled: false },
            { name: 'headroom', command: 'headroom', args: ['mcp', 'serve'], enabled: false }
          ]
        })
      } else if (!s.mcpServers.some((m) => m.name === 'headroom')) {
        // Existing installs seeded graphify earlier; add headroom without duplicating it.
        this.saveSettings({
          mcpServers: [...s.mcpServers, { name: 'headroom', command: 'headroom', args: ['mcp', 'serve'], enabled: false }]
        })
      }
      this.db.kvSet('mcpSeeded', '1')
    }
    // Playwright's MCP server lets Claude Code workers click through the app they built; off until the owner enables it.
    // Screenshots land in the project's .ventriee/screens (the server runs in the worker's project folder).
    if (!this.db.kvGet('mcpSeededPlaywright')) {
      const s = this.settings()
      const args = ['-y', '@playwright/mcp@0.0.86', '--output-dir', '.ventriee/screens']
      if (!s.mcpServers.some((m) => m.name === 'playwright')) {
        this.saveSettings({ mcpServers: [...s.mcpServers, process.platform === 'win32' ? { name: 'playwright', command: 'cmd', args: ['/c', 'npx', ...args], enabled: false } : { name: 'playwright', command: 'npx', args, enabled: false }] })
      }
      this.db.kvSet('mcpSeededPlaywright', '1')
    }
  }

  // ---------- settings ----------
  settings(): AppSettings {
    const raw = this.db.kvGet('settings')
    if (!raw) return { ...DEFAULT_SETTINGS }
    try {
      const saved = JSON.parse(raw) as Partial<AppSettings>
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        voice: { ...DEFAULT_SETTINGS.voice, ...saved.voice },
        connectors: { ...DEFAULT_SETTINGS.connectors, ...saved.connectors }
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.settings(), ...patch }
    this.db.kvSet('settings', JSON.stringify(next))
    return next
  }

  activeProjectId(): string | null {
    return this.db.kvGet('activeProject')
  }

  setActiveProject(id: string | null) {
    if (id) this.db.kvSet('activeProject', id)
    else this.db.kvDelete('activeProject')
  }

  // ---------- projects ----------
  projects(): Project[] {
    return this.db.all<ProjectRow>('SELECT * FROM projects ORDER BY updatedAt DESC').map(mapProject)
  }

  project(id: string): Project | undefined {
    const r = this.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id)
    return r ? mapProject(r) : undefined
  }

  createProject(input: { name: string; path: string; description: string; clientId?: string | null; orgId?: string | null }): Project {
    const now = Date.now()
    const project: Project = {
      id: `prj_${randomUUID().slice(0, 8)}`,
      name: input.name,
      path: input.path,
      description: input.description,
      clientId: input.clientId ?? null,
      orgId: input.orgId ?? null,
      createdAt: now,
      updatedAt: now
    }
    this.db.run(
      'INSERT INTO projects(id,name,path,description,client_id,org_id,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)',
      project.id, project.name, project.path, project.description, project.clientId, project.orgId, now, now
    )
    this.onChange?.('project', project.id)
    return project
  }

  updateProject(id: string, patch: Partial<Project>) {
    const cur = this.project(id)
    if (!cur) return
    const clientId = 'clientId' in patch ? patch.clientId : cur.clientId
    const orgId = 'orgId' in patch ? patch.orgId : cur.orgId
    this.db.run(
      'UPDATE projects SET name=?, path=?, description=?, client_id=?, org_id=?, updatedAt=? WHERE id=?',
      patch.name ?? cur.name, patch.path ?? cur.path, patch.description ?? cur.description, clientId ?? null, orgId ?? null, Date.now(), id
    )
    this.onChange?.('project', id)
  }

  deleteProject(id: string) {
    for (const t of ['agents', 'tasks', 'messages', 'events', 'sessions', 'memories', 'automations', 'jobs']) {
      this.db.run(`DELETE FROM ${t} WHERE projectId = ?`, id)
    }
    this.db.run('DELETE FROM memory_versions WHERE memoryId NOT IN (SELECT id FROM memories)')
    this.db.run('DELETE FROM projects WHERE id = ?', id)
    if (this.activeProjectId() === id) this.setActiveProject(null)
  }

  // ---------- agents ----------
  agents(projectId?: string): Agent[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM agents WHERE projectId = ? ORDER BY desk ASC', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM agents ORDER BY desk ASC')
    return rows.map((r) => ({
      ...(r as unknown as Agent),
      enabled: unb(r.enabled),
      concurrency: Number(r.concurrency ?? 1),
      budgetUsd: Number(r.budgetUsd ?? 0),
      desk: Number(r.desk ?? 0),
      reasoning: (r.reasoning as Agent['reasoning']) ?? 'auto',
      skills: safeJson<string[]>(r.skills as string, []),
      mcpServers: safeJson<string[]>(r.mcpServers as string, [])
    }))
  }

  agent(id: string): Agent | undefined {
    return this.agents().find((a) => a.id === id)
  }

  insertAgent(a: Agent) {
    this.db.run(
      `INSERT INTO agents(id,projectId,role,name,title,engine,model,endpoint,instructions,autonomy,
        reasoning,skills,mcpServers,concurrency,budgetUsd,color,desk,enabled,status,currentTaskId,lastError,createdAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      a.id, a.projectId, a.role, a.name, a.title, a.engine, a.model, a.endpoint, a.instructions,
      a.autonomy, a.reasoning ?? 'auto', JSON.stringify(a.skills ?? []), JSON.stringify(a.mcpServers ?? []),
      a.concurrency, a.budgetUsd, a.color, a.desk, bolt(a.enabled), a.status, a.currentTaskId, a.lastError, a.createdAt
    )
  }

  updateAgent(id: string, patch: Partial<Agent>) {
    const cur = this.agent(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      `UPDATE agents SET role=?,name=?,title=?,engine=?,model=?,endpoint=?,instructions=?,autonomy=?,
        reasoning=?,skills=?,mcpServers=?,concurrency=?,budgetUsd=?,color=?,desk=?,enabled=?,status=?,currentTaskId=?,lastError=?
        WHERE id=?`,
      n.role, n.name, n.title, n.engine, n.model, n.endpoint, n.instructions, n.autonomy,
      n.reasoning ?? 'auto', JSON.stringify(n.skills ?? []), JSON.stringify(n.mcpServers ?? []),
      n.concurrency, n.budgetUsd, n.color, n.desk, bolt(n.enabled), n.status, n.currentTaskId, n.lastError, id
    )
  }

  deleteAgent(id: string) {
    this.db.run('DELETE FROM agents WHERE id = ?', id)
  }

  // ---------- tasks ----------
  tasks(projectId?: string): Task[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM tasks WHERE projectId = ? ORDER BY createdAt ASC', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM tasks ORDER BY createdAt ASC')
    return rows.map((r) => ({
      ...(r as unknown as Task),
      dependsOn: safeJson<string[]>(r.dependsOn as string, []),
      attempts: Number(r.attempts ?? 0),
      engine: (r.engine as Task['engine']) ?? null,
      model: (r.model as Task['model']) ?? null,
      endpoint: (r.endpoint as Task['endpoint']) ?? null,
      routedBy: (r.routedBy as Task['routedBy']) ?? null,
      changedFiles: safeJson<NonNullable<Task['changedFiles']>>(r.changedFiles as string, []),
      difficulty: (r.difficulty as Task['difficulty']) ?? null,
      skills: safeJson<string[]>(r.skills as string, [])
    }))
  }

  task(id: string): Task | undefined {
    return this.tasks().find((t) => t.id === id)
  }

  insertTask(t: Task) {
    this.db.run(
      `INSERT INTO tasks(id,projectId,parentId,title,description,acceptance,role,agentId,status,
        dependsOn,output,review,attempts,phase,engine,model,endpoint,routedBy,difficulty,skills,createdAt,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      t.id, t.projectId, t.parentId, t.title, t.description, t.acceptance, t.role, t.agentId, t.status,
      JSON.stringify(t.dependsOn), t.output, t.review, t.attempts, t.phase,
      t.engine ?? null, t.model ?? null, t.endpoint ?? null, t.routedBy ?? null, t.difficulty ?? null,
      JSON.stringify(t.skills ?? []),
      t.createdAt, t.updatedAt
    )
    this.onChange?.('task', t.id)
  }

  updateTask(id: string, patch: Partial<Task>) {
    const cur = this.task(id)
    if (!cur) return
    const n = { ...cur, ...patch, updatedAt: Date.now() }
    this.db.run(
      `UPDATE tasks SET parentId=?,title=?,description=?,acceptance=?,role=?,agentId=?,status=?,dependsOn=?,
        output=?,review=?,attempts=?,phase=?,engine=?,model=?,endpoint=?,routedBy=?,changedFiles=?,updatedAt=? WHERE id=?`,
      n.parentId, n.title, n.description, n.acceptance, n.role, n.agentId, n.status,
      JSON.stringify(n.dependsOn), n.output, n.review, n.attempts, n.phase,
      n.engine ?? null, n.model ?? null, n.endpoint ?? null, n.routedBy ?? null, JSON.stringify(n.changedFiles ?? []), n.updatedAt, id
    )
    this.onChange?.('task', id)
  }

  deleteTask(id: string) {
    this.db.run('DELETE FROM tasks WHERE id = ?', id)
  }

  // ---------- messages ----------
  messages(projectId?: string): Message[] {
    const rows = projectId
      ? this.db.all<Message>('SELECT * FROM messages WHERE projectId = ? ORDER BY createdAt ASC', projectId)
      : this.db.all<Message>('SELECT * FROM messages ORDER BY createdAt ASC')
    return rows
  }

  addMessage(input: Omit<Message, 'id' | 'createdAt'>): Message {
    const msg: Message = { ...input, id: `msg_${randomUUID().slice(0, 10)}`, createdAt: Date.now() }
    this.db.run(
      'INSERT INTO messages(id,projectId,taskId,sender,recipient,type,content,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
      msg.id, msg.projectId, msg.taskId, msg.sender, msg.recipient, msg.type, msg.content, msg.status, msg.createdAt
    )
    return msg
  }

  // ---------- events ----------
  events(projectId?: string, limit = 400): RunEvent[] {
    const rows = projectId
      ? this.db.all<RunEvent>('SELECT * FROM events WHERE projectId = ? ORDER BY createdAt DESC LIMIT ?', projectId, limit)
      : this.db.all<RunEvent>('SELECT * FROM events ORDER BY createdAt DESC LIMIT ?', limit)
    return rows.reverse()
  }

  addEvent(e: Omit<RunEvent, 'id' | 'createdAt'>): RunEvent {
    const ev: RunEvent = { ...e, id: `evt_${randomUUID().slice(0, 10)}`, createdAt: Date.now() }
    this.db.run(
      'INSERT INTO events(id,projectId,agentId,taskId,type,message,createdAt) VALUES(?,?,?,?,?,?,?)',
      ev.id, ev.projectId, ev.agentId, ev.taskId, ev.type, ev.message, ev.createdAt
    )
    return ev
  }

  // ---------- sessions ----------
  sessions(projectId?: string, limit = 120): SessionRecord[] {
    const rows = projectId
      ? this.db.all<SessionRecord>('SELECT * FROM sessions WHERE projectId = ? ORDER BY startedAt DESC LIMIT ?', projectId, limit)
      : this.db.all<SessionRecord>('SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?', limit)
    return rows.map((r) => ({
      ...r,
      inputTokens: Number(r.inputTokens ?? 0),
      outputTokens: Number(r.outputTokens ?? 0),
      costUsd: Number(r.costUsd ?? 0)
    }))
  }

  /** Reported spend since a time, for all projects or one. */
  spendSince(since: number, projectId?: string): number {
    const row = projectId
      ? this.db.get<{ total: number | null }>('SELECT SUM(costUsd) AS total FROM sessions WHERE startedAt >= ? AND projectId = ?', since, projectId)
      : this.db.get<{ total: number | null }>('SELECT SUM(costUsd) AS total FROM sessions WHERE startedAt >= ?', since)
    return Number(row?.total ?? 0)
  }

  /** Reported spend for one worker. Engines that do not report cost stay at 0. */
  agentSpend(agentId: string): number {
    const row = this.db.get<{ total: number | null }>(
      'SELECT SUM(costUsd) AS total FROM sessions WHERE agentId = ?',
      agentId
    )
    return Number(row?.total ?? 0)
  }

  insertSession(s: SessionRecord) {
    this.db.run(
      `INSERT INTO sessions(id,projectId,agentId,taskId,engine,model,cwd,reasoning,status,exitCode,inputTokens,
        outputTokens,costUsd,externalId,command,startedAt,endedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      s.id, s.projectId, s.agentId, s.taskId, s.engine, s.model, s.cwd, s.reasoning ?? 'auto', s.status, s.exitCode,
      s.inputTokens, s.outputTokens, s.costUsd, s.externalId, s.command, s.startedAt, s.endedAt
    )
  }

  updateSession(id: string, patch: Partial<SessionRecord>) {
    const cur = this.db.get<SessionRecord>('SELECT * FROM sessions WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      `UPDATE sessions SET status=?, exitCode=?, inputTokens=?, outputTokens=?, costUsd=?, externalId=?,
        endedAt=?, command=? WHERE id=?`,
      n.status, n.exitCode, n.inputTokens, n.outputTokens, n.costUsd, n.externalId, n.endedAt, n.command, id
    )
  }

  // ---------- jobs ----------
  jobs(projectId?: string): Job[] {
    const rows = projectId
      ? this.db.all<Job>('SELECT * FROM jobs WHERE projectId = ? ORDER BY createdAt DESC LIMIT 20', projectId)
      : this.db.all<Job>('SELECT * FROM jobs ORDER BY createdAt DESC LIMIT 20')
    return rows
  }

  insertJob(j: Job) {
    this.db.run(
      'INSERT INTO jobs(id,projectId,instruction,status,planSource,createdAt,updatedAt,error) VALUES(?,?,?,?,?,?,?,?)',
      j.id, j.projectId, j.instruction, j.status, j.planSource, j.createdAt, j.updatedAt, j.error
    )
  }

  updateJob(id: string, patch: Partial<Job>) {
    const cur = this.db.get<Job>('SELECT * FROM jobs WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch, updatedAt: Date.now() }
    this.db.run('UPDATE jobs SET status=?,planSource=?,updatedAt=?,error=? WHERE id=?', n.status, n.planSource, n.updatedAt, n.error, id)
  }

  runningJob(projectId: string): Job | undefined {
    return this.db.get<Job>("SELECT * FROM jobs WHERE projectId = ? AND status = 'running' LIMIT 1", projectId)
  }

  // ---------- memories ----------
  memories(projectId?: string | null): MemoryDoc[] {
    // Org docs are visible only to projects created in that org.
    const rows = projectId
      ? this.db.all<Record<string, unknown>>(
        `SELECT * FROM memories WHERE projectId = ?
           OR (projectId IS NULL AND (orgId IS NULL OR orgId = (SELECT org_id FROM projects WHERE id = ?)))
         ORDER BY pinned DESC, updatedAt DESC`,
        projectId, projectId
      )
      : this.db.all<Record<string, unknown>>('SELECT * FROM memories ORDER BY pinned DESC, updatedAt DESC')
    return rows.map(mapMemory)
  }

  memory(id: string): MemoryDoc | undefined {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE id = ?', id)
    return row ? mapMemory(row) : undefined
  }

  /** `taskId` traces which task's run made the change; it lands on the version row, not the doc. */
  saveMemory(input: Partial<MemoryDoc> & { path: string; title: string; body: string }, taskId: string | null = null): MemoryDoc {
    const existing = input.id
      ? this.memory(input.id)
      : this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE path = ?', input.path)
        ? mapMemory(this.db.get<Record<string, unknown>>('SELECT * FROM memories WHERE path = ?', input.path)!)
        : undefined
    const now = Date.now()
    const doc: MemoryDoc = {
      id: existing?.id ?? `mem_${randomUUID().slice(0, 10)}`,
      scope: input.scope ?? existing?.scope ?? 'project',
      projectId: input.projectId ?? existing?.projectId ?? null,
      orgId: input.orgId ?? existing?.orgId ?? null,
      agentId: input.agentId ?? existing?.agentId ?? null,
      path: input.path,
      title: input.title,
      body: input.body,
      tags: input.tags ?? existing?.tags ?? [],
      pinned: input.pinned ?? existing?.pinned ?? false,
      confidence: input.confidence ?? existing?.confidence ?? 0.7,
      source: input.source ?? existing?.source ?? 'owner',
      evidence: input.evidence ?? existing?.evidence ?? '',
      updatedAt: now
    }
    this.db.run(
      `INSERT INTO memories(id,scope,projectId,orgId,agentId,path,title,body,tags,pinned,confidence,source,evidence,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET scope=excluded.scope, projectId=excluded.projectId, orgId=excluded.orgId, agentId=excluded.agentId,
         path=excluded.path, title=excluded.title, body=excluded.body, tags=excluded.tags, pinned=excluded.pinned,
         confidence=excluded.confidence, source=excluded.source, evidence=excluded.evidence, updatedAt=excluded.updatedAt`,
      doc.id, doc.scope, doc.projectId, doc.orgId, doc.agentId, doc.path, doc.title, doc.body,
      JSON.stringify(doc.tags), bolt(doc.pinned), doc.confidence, doc.source, doc.evidence, doc.updatedAt
    )
    // Version only content changes (not pins or metadata). A doc that predates
    // history gets its prior state saved first, so the first edit is reversible.
    if (!existing || existing.body !== doc.body || existing.title !== doc.title) {
      const addVersion = (v: { title: string; body: string; source: string; taskId: string | null; createdAt: number }) =>
        this.db.run('INSERT INTO memory_versions(id,memoryId,title,body,source,taskId,createdAt) VALUES(?,?,?,?,?,?,?)',
          newId('mv'), doc.id, v.title, v.body, v.source, v.taskId, v.createdAt)
      if (existing && !this.db.get('SELECT 1 FROM memory_versions WHERE memoryId = ? LIMIT 1', doc.id)) {
        addVersion({ title: existing.title, body: existing.body, source: existing.source, taskId: null, createdAt: existing.updatedAt })
      }
      addVersion({ title: doc.title, body: doc.body, source: doc.source, taskId, createdAt: now })
    }
    return doc
  }

  /** Saved states of a doc, newest first. */
  memoryVersions(memoryId: string): MemoryVersion[] {
    return this.db.all<MemoryVersion>('SELECT * FROM memory_versions WHERE memoryId = ? ORDER BY createdAt DESC, rowid DESC', memoryId)
  }

  memoryVersion(id: string): MemoryVersion | undefined {
    return this.db.get<MemoryVersion>('SELECT * FROM memory_versions WHERE id = ?', id)
  }

  deleteMemory(id: string) {
    this.db.run('DELETE FROM memories WHERE id = ?', id)
    this.db.run('DELETE FROM memory_versions WHERE memoryId = ?', id)
  }

  // ---------- measured routing ----------
  /**
   * Record how a finished task went for the model that last ran it: the latest
   * session the worker (not the reviewer) ran for the task gives model, tokens and latency.
   */
  recordModelOutcome(taskId: string, agentId: string, outcome: 'passed' | 'rework' | 'failed') {
    const task = this.db.get<{ role: string | null; difficulty: string | null }>('SELECT role, difficulty FROM tasks WHERE id = ?', taskId)
    const s = this.db.get<{ model: string | null; inputTokens: number | null; outputTokens: number | null; startedAt: number; endedAt: number | null }>(
      'SELECT model, inputTokens, outputTokens, startedAt, endedAt FROM sessions WHERE taskId = ? AND agentId = ? ORDER BY startedAt DESC, rowid DESC LIMIT 1',
      taskId, agentId
    )
    if (!task || !s?.model) return
    this.db.run(
      'INSERT INTO model_outcomes(id,taskId,model,role,difficulty,outcome,tokens,latencyMs,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
      newId('mo'), taskId, s.model, task.role ?? '', task.difficulty ?? 'unrated', outcome,
      (s.inputTokens ?? 0) + (s.outputTokens ?? 0), Math.max(0, (s.endedAt ?? s.startedAt) - s.startedAt), Date.now()
    )
  }

  modelOutcomeStats(): ModelOutcomeStat[] {
    return this.db.all<Record<string, unknown>>(
      `SELECT model, role, difficulty, COUNT(*) AS samples,
         SUM(outcome = 'passed') AS passed, SUM(outcome = 'rework') AS rework, SUM(outcome = 'failed') AS failed,
         AVG(tokens) AS avgTokens, AVG(latencyMs) AS avgLatencyMs
       FROM model_outcomes GROUP BY model, role, difficulty ORDER BY model, role, difficulty`
    ).map((r) => ({
      model: String(r.model), role: String(r.role), difficulty: String(r.difficulty),
      samples: Number(r.samples), passed: Number(r.passed), rework: Number(r.rework), failed: Number(r.failed),
      avgTokens: Math.round(Number(r.avgTokens)), avgLatencyMs: Math.round(Number(r.avgLatencyMs))
    }))
  }

  /** Average real cost of finished tasks per role, for the pre-run cost estimate. */
  roleCostStats(): Array<{ role: string; avgCostUsd: number; samples: number }> {
    return this.db.all<Record<string, unknown>>(
      `SELECT t.role AS role, AVG(s.costUsd) AS avgCostUsd, COUNT(*) AS samples
       FROM sessions s JOIN tasks t ON t.id = s.taskId
       WHERE s.costUsd > 0 AND t.role IS NOT NULL AND t.role != ''
       GROUP BY t.role ORDER BY t.role`
    ).map((r) => ({ role: String(r.role), avgCostUsd: Number(r.avgCostUsd), samples: Number(r.samples) }))
  }

  searchMemory(query: string, projectId?: string | null): MemoryDoc[] {
    const q = `%${query.toLowerCase()}%`
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT * FROM memories WHERE (lower(title) LIKE ? OR lower(body) LIKE ? OR lower(tags) LIKE ?)
       ORDER BY pinned DESC, updatedAt DESC LIMIT 40`,
      q, q, q
    )
    const mapped = rows.map(mapMemory)
    return projectId ? mapped.filter((m) => !m.projectId || m.projectId === projectId) : mapped
  }

  // ---------- skills ----------
  skills(): SkillRecord[] {
    return this.db.all<Record<string, unknown>>('SELECT * FROM skills ORDER BY name ASC').map((r) => {
      const id = String(r.id)
      const scanRaw = this.db.kvGet(`skillsec:${id}`)
      let scan: SkillRecord['scan'] = null
      if (scanRaw) {
        try {
          scan = JSON.parse(scanRaw) as SkillRecord['scan']
        } catch {
          scan = null
        }
      }
      return {
        ...(r as unknown as SkillRecord),
        enabled: unb(r.enabled),
        uses: Number(r.uses ?? 0),
        successes: Number(r.successes ?? 0),
        scan
      }
    })
  }

  upsertSkill(s: SkillRecord) {
    this.db.run(
      `INSERT INTO skills(id,name,description,path,enabled,version,uses,successes,source,updatedAt)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, path=excluded.path,
         version=excluded.version, source=excluded.source, updatedAt=excluded.updatedAt`,
      s.id, s.name, s.description, s.path, bolt(s.enabled), s.version, s.uses, s.successes, s.source, s.updatedAt
    )
  }

  setSkillEnabled(id: string, enabled: boolean) {
    this.db.run('UPDATE skills SET enabled = ? WHERE id = ?', bolt(enabled), id)
  }

  recordSkillUse(id: string, success: boolean) {
    this.db.run('UPDATE skills SET uses = uses + 1, successes = successes + ? WHERE id = ?', success ? 1 : 0, id)
  }

  // ---------- agent catalogue ----------
  // Only the owner's own templates and edits to built-ins are stored; unedited built-ins come from roles.ts.
  private storedCatalogue(): StoredCatalogue {
    const raw = this.db.kvGet('agentCatalogue')
    return raw ? JSON.parse(raw) : { departments: null, templates: [] }
  }

  private saveStoredCatalogue(c: StoredCatalogue) {
    this.db.kvSet('agentCatalogue', JSON.stringify(c))
  }

  agentCatalogue(): AgentCatalogue {
    return mergeCatalogue(builtinTemplates(), this.storedCatalogue())
  }

  /** Create (create=true refuses an existing role key) or edit a template. Input is untrusted. */
  saveAgentTemplate(raw: unknown, create = false): AgentTemplate {
    const catalogue = this.agentCatalogue()
    const existing = catalogue.templates.find((t) => t.role === (raw as { role?: unknown })?.role)
    if (create && existing) throw new Error(`An agent with the role key "${existing.role}" already exists`)
    const t = checkTemplate(raw, existing?.builtin ?? false)
    if (!catalogue.departments.some((d) => d.id === t.department)) throw new Error(`No department "${t.department}"`)
    const stored = this.storedCatalogue()
    this.saveStoredCatalogue({ ...stored, templates: [...stored.templates.filter((x) => x.role !== t.role), t] })
    return t
  }

  /** Deletes an owner template; for a built-in this resets it to the shipped default. */
  deleteAgentTemplate(role: string) {
    const stored = this.storedCatalogue()
    this.saveStoredCatalogue({ ...stored, templates: stored.templates.filter((t) => t.role !== role) })
  }

  /** Replace the department list (create, rename, delete, reorder). A department that still has agents cannot be dropped. */
  saveDepartments(raw: unknown): Department[] {
    if (!Array.isArray(raw) || !raw.length || raw.length > 100) throw new Error('Keep between 1 and 100 departments')
    const departments = raw.map(checkDepartment)
    if (new Set(departments.map((d) => d.id)).size !== departments.length) throw new Error('Department ids must be unique')
    const orphan = this.agentCatalogue().templates.find((t) => !departments.some((d) => d.id === t.department))
    if (orphan) throw new Error(`Move ${orphan.name} (${orphan.role}) to another department first`)
    this.saveStoredCatalogue({ ...this.storedCatalogue(), departments })
    return departments
  }

  /** enable=true switches the imported agents on (a trusted pack); a manual import leaves new ones off. */
  importAgents(parsed: ParsedManifest, enable = false) {
    const stored = applyImport(this.storedCatalogue(), parsed, this.agentCatalogue())
    const roles = new Set(parsed.templates.map((t) => t.role))
    this.saveStoredCatalogue(enable ? { ...stored, templates: stored.templates.map((t) => (roles.has(t.role) ? { ...t, enabled: true } : t)) } : stored)
  }

  // ---------- automations ----------
  automations(projectId?: string): Automation[] {
    const rows = projectId
      ? this.db.all<Record<string, unknown>>('SELECT * FROM automations WHERE projectId = ?', projectId)
      : this.db.all<Record<string, unknown>>('SELECT * FROM automations')
    return rows.map((r) => ({ ...(r as unknown as Automation), enabled: unb(r.enabled) }))
  }

  addAutomation(a: Automation) {
    this.db.run(
      'INSERT INTO automations(id,projectId,name,instruction,intervalMinutes,enabled,lastRunAt,nextRunAt) VALUES(?,?,?,?,?,?,?,?)',
      a.id, a.projectId, a.name, a.instruction, a.intervalMinutes, bolt(a.enabled), a.lastRunAt, a.nextRunAt
    )
  }

  updateAutomation(id: string, patch: Partial<Automation>) {
    const cur = this.db.get<Automation>('SELECT * FROM automations WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE automations SET enabled=?, lastRunAt=?, nextRunAt=? WHERE id=?',
      bolt(n.enabled), n.lastRunAt, n.nextRunAt, id
    )
  }

  deleteAutomation(id: string) {
    this.db.run('DELETE FROM automations WHERE id = ?', id)
  }

  // ---------- planning: conversations ----------
  /** Sessions in creation order, so "Session N" stays stable. */
  conversations(projectId: string): Conversation[] {
    return this.db.all<Conversation>('SELECT * FROM conversations WHERE projectId = ? ORDER BY createdAt ASC, rowid ASC', projectId)
  }

  /** The project's active planning session, creating the first one on demand. */
  conversation(projectId: string): Conversation {
    const all = this.conversations(projectId)
    const activeId = this.db.kvGet(`activeConversation:${projectId}`)
    return all.find((c) => c.id === activeId) ?? all[0] ?? this.createConversation(projectId)
  }

  createConversation(projectId: string): Conversation {
    const now = Date.now()
    const row: Conversation = { id: newId('cnv'), projectId, title: '', createdAt: now, updatedAt: now }
    this.db.run(
      'INSERT INTO conversations(id,projectId,title,createdAt,updatedAt) VALUES(?,?,?,?,?)',
      row.id, row.projectId, row.title, row.createdAt, row.updatedAt
    )
    this.db.kvSet(`activeConversation:${projectId}`, row.id)
    return row
  }

  setActiveConversation(projectId: string, id: string) {
    if (!this.conversations(projectId).some((c) => c.id === id)) throw new Error('Session not found in this project')
    this.db.kvSet(`activeConversation:${projectId}`, id)
  }

  /**
   * Branch from a message: a new session holding the turns up to (and including)
   * that message; the original session keeps everything and stays active.
   */
  branchConversation(projectId: string, messageId: string): Conversation {
    const msg = this.db.get<ChatMessage>('SELECT * FROM chat_messages WHERE id = ? AND projectId = ?', messageId, projectId)
    if (!msg) throw new Error('Message not found in this project')
    const now = Date.now()
    const row: Conversation = {
      id: newId('cnv'), projectId, title: '', createdAt: now, updatedAt: now,
      branchedFrom: msg.conversationId, branchedFromMessageId: messageId
    }
    this.db.run(
      'INSERT INTO conversations(id,projectId,title,branchedFrom,branchedFromMessageId,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)',
      row.id, row.projectId, row.title, row.branchedFrom, row.branchedFromMessageId, row.createdAt, row.updatedAt
    )
    for (const m of this.db.all<ChatMessage>(
      'SELECT * FROM chat_messages WHERE conversationId = ? AND createdAt <= ? ORDER BY createdAt ASC',
      msg.conversationId, msg.createdAt
    )) {
      this.db.run(
        'INSERT INTO chat_messages(id,projectId,conversationId,role,content,model,status,createdAt) VALUES(?,?,?,?,?,?,?,?)',
        newId('cht'), m.projectId, row.id, m.role, m.content, m.model, m.status, m.createdAt
      )
    }
    return row
  }

  touchConversation(id: string) {
    this.db.run('UPDATE conversations SET updatedAt = ? WHERE id = ?', Date.now(), id)
  }

  /** Messages of one session (the active one when not given), oldest first, newest `limit` kept. */
  chatMessages(projectId: string, limit = 400, conversationId = this.conversation(projectId).id): ChatMessage[] {
    return this.db.all<ChatMessage>(
      'SELECT * FROM (SELECT * FROM chat_messages WHERE projectId = ? AND conversationId = ? ORDER BY createdAt DESC LIMIT ?) ORDER BY createdAt ASC',
      projectId, conversationId, limit
    )
  }

  addChatMessage(input: Omit<ChatMessage, 'id' | 'createdAt'> & { createdAt?: number }): ChatMessage {
    const msg: ChatMessage = {
      ...input,
      id: newId('cht'),
      createdAt: input.createdAt ?? Date.now()
    }
    this.db.run(
      'INSERT INTO chat_messages(id,projectId,conversationId,role,content,model,status,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      msg.id, msg.projectId, msg.conversationId, msg.role, msg.content, msg.model, msg.status, msg.createdAt
    )
    return msg
  }

  updateChatMessage(id: string, patch: Partial<ChatMessage>) {
    const cur = this.db.get<ChatMessage>('SELECT * FROM chat_messages WHERE id = ?', id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE chat_messages SET content=?, status=?, model=? WHERE id=?',
      n.content, n.status, n.model, id
    )
  }

  deleteChatMessage(id: string) {
    this.db.run('DELETE FROM chat_messages WHERE id = ?', id)
  }

  /**
   * Edit/regenerate: drops an owner message and everything after it in its conversation.
   * shortcut: the old turns are discarded, not kept as a branch; add branching if owners ask for it.
   */
  rewindChat(projectId: string, conversationId: string, messageId: string) {
    const msg = this.db.get<ChatMessage & { rowid: number }>('SELECT rowid, * FROM chat_messages WHERE id = ?', messageId)
    if (!msg || msg.projectId !== projectId || msg.conversationId !== conversationId || msg.role !== 'owner') {
      throw new Error('That message is not in this session')
    }
    const where = 'conversationId = ? AND (createdAt > ? OR (createdAt = ? AND rowid >= ?))'
    const args = [conversationId, msg.createdAt, msg.createdAt, msg.rowid]
    if (this.db.get(`SELECT 1 FROM chat_messages WHERE ${where} AND status = 'streaming'`, ...args)) {
      throw new Error('Wait for the current reply to finish')
    }
    this.db.run(`DELETE FROM chat_messages WHERE ${where}`, ...args)
  }

  // ---------- planning: prompts ----------
  prompts(projectId: string): PromptDoc[] {
    return this.db.all<PromptDoc>(
      'SELECT * FROM prompts WHERE projectId = ? ORDER BY version ASC',
      projectId
    )
  }

  prompt(id: string): PromptDoc | undefined {
    return this.db.get<PromptDoc>('SELECT * FROM prompts WHERE id = ?', id)
  }

  /** Always a new row: a prompt is never overwritten in place. */
  addPrompt(input: Omit<PromptDoc, 'id' | 'createdAt' | 'version'> ): PromptDoc {
    const last = this.db.get<{ v: number | null }>(
      'SELECT MAX(version) AS v FROM prompts WHERE projectId = ?',
      input.projectId
    )
    const doc: PromptDoc = {
      ...input,
      id: newId('prm'),
      version: Number(last?.v ?? 0) + 1,
      createdAt: Date.now()
    }
    this.db.run(
      `INSERT INTO prompts(id,projectId,conversationId,title,body,version,source,parentId,createdAt)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      doc.id, doc.projectId, doc.conversationId, doc.title, doc.body, doc.version,
      doc.source, doc.parentId, doc.createdAt
    )
    return doc
  }

  // ---------- chat templates ----------
  chatTemplates(): ChatTemplate[] {
    return this.db.all<ChatTemplate>('SELECT * FROM chat_templates ORDER BY createdAt ASC')
  }

  saveChatTemplate(input: { id?: string; name: string; content: string }): ChatTemplate {
    const name = input.name.trim()
    const content = input.content
    if (!name) throw new Error('A template needs a name')
    if (!content.trim()) throw new Error('A template cannot be empty')
    if (input.id) {
      const cur = this.db.get<ChatTemplate>('SELECT * FROM chat_templates WHERE id = ?', input.id)
      if (!cur) throw new Error('Template not found')
      this.db.run('UPDATE chat_templates SET name=?, content=? WHERE id=?', name, content, cur.id)
      return { ...cur, name, content }
    }
    const row: ChatTemplate = { id: newId('tpl'), name, content, createdAt: Date.now() }
    this.db.run('INSERT INTO chat_templates(id,name,content,createdAt) VALUES(?,?,?,?)', row.id, row.name, row.content, row.createdAt)
    return row
  }

  deleteChatTemplate(id: string) {
    this.db.run('DELETE FROM chat_templates WHERE id = ?', id)
  }

  /** One session's messages for export, oldest first. */
  exportConversation(projectId: string, conversationId?: string): { title: string; messages: ChatMessage[] } {
    const all = this.conversations(projectId)
    // No create-on-demand here: exporting a fresh project must not leave a stray empty session.
    const convo = conversationId ? all.find((c) => c.id === conversationId) : all.at(-1)
    if (!convo) throw new Error('Session not found in this project')
    const n = all.findIndex((c) => c.id === convo.id) + 1
    return { title: convo.title || `Session ${n}`, messages: this.chatMessages(projectId, 400, convo.id) }
  }

  // ---------- providers ----------
  providers(): ProviderConfig[] {
    return this.db.all<Record<string, unknown>>(
      'SELECT * FROM providers ORDER BY createdAt ASC'
    ).map((r) => ({
      ...(r as unknown as ProviderConfig),
      models: safeJson<string[]>(r.models as string, [])
    }))
  }

  addProvider(p: ProviderConfig) {
    this.db.run(
      'INSERT INTO providers(id,label,kind,engine,baseUrl,models,createdAt) VALUES(?,?,?,?,?,?,?)',
      p.id, p.label, p.kind, p.engine, p.baseUrl, JSON.stringify(p.models), p.createdAt
    )
  }

  updateProvider(id: string, patch: Partial<ProviderConfig>) {
    const cur = this.providers().find((p) => p.id === id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.run(
      'UPDATE providers SET label=?, kind=?, engine=?, baseUrl=?, models=? WHERE id=?',
      n.label, n.kind, n.engine, n.baseUrl, JSON.stringify(n.models), id
    )
  }

  deleteProvider(id: string) {
    this.db.run('DELETE FROM providers WHERE id = ?', id)
    this.db.kvDelete(`cred:provider:${id}`)
  }

  // ---------- assignments ----------
  assignments(projectId: string): Assignment[] {
    return this.db.all<Record<string, unknown>>(
      'SELECT * FROM assignments WHERE projectId = ? ORDER BY createdAt DESC',
      projectId
    ).map((r) => ({
      ...(r as unknown as Assignment),
      agents: safeJson<Assignment['agents']>(r.agents as string, [])
    }))
  }

  addAssignment(a: Assignment) {
    this.db.run(
      'INSERT INTO assignments(id,projectId,promptId,jobId,mode,agents,createdAt) VALUES(?,?,?,?,?,?,?)',
      a.id, a.projectId, a.promptId, a.jobId, a.mode, JSON.stringify(a.agents), a.createdAt
    )
  }

  // ---------- model preferences ----------
  modelPrefs(): ModelPrefs {
    const raw = this.db.kvGet('modelPrefs')
    if (!raw) return { favorites: [], recents: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<ModelPrefs>
      return { favorites: parsed.favorites ?? [], recents: parsed.recents ?? [] }
    } catch {
      return { favorites: [], recents: [] }
    }
  }

  saveModelPrefs(patch: Partial<ModelPrefs>): ModelPrefs {
    const next = { ...this.modelPrefs(), ...patch }
    this.db.kvSet('modelPrefs', JSON.stringify(next))
    return next
  }

  // ---------- clients ----------
  clients(): Client[] {
    return this.db.all<{ id: string; name: string; url: string; niche: string; status: string; notes: string; project_id: string | null; created_at: number; updated_at: number }>(
      'SELECT * FROM clients ORDER BY updated_at DESC'
    ).map((r) => ({
      id: r.id, name: r.name, url: r.url, niche: r.niche,
      status: r.status as Client['status'], notes: r.notes,
      projectId: r.project_id, createdAt: r.created_at, updatedAt: r.updated_at
    }))
  }

  createClient(input: { name: string; url: string; niche: string; notes: string }): Client {
    const id = randomUUID()
    const now = Date.now()
    this.db.run(
      'INSERT INTO clients(id,name,url,niche,status,notes,project_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      id, input.name, input.url, input.niche, 'prospect', input.notes, null, now, now
    )
    return { id, name: input.name, url: input.url, niche: input.niche, status: 'prospect', notes: input.notes, projectId: null, createdAt: now, updatedAt: now }
  }

  updateClient(id: string, patch: Partial<Client>): Client {
    const existing = this.clients().find((c) => c.id === id)
    if (!existing) throw new Error(`Client ${id} not found`)
    const next = { ...existing, ...patch, updatedAt: Date.now() }
    this.db.run(
      'UPDATE clients SET name=?,url=?,niche=?,status=?,notes=?,project_id=?,updated_at=? WHERE id=?',
      next.name, next.url, next.niche, next.status, next.notes, next.projectId, next.updatedAt, id
    )
    return next
  }

  deleteClient(id: string): void {
    this.db.run('DELETE FROM clients WHERE id=?', id)
  }

  // ---------- workflows ----------
  workflows(): Workflow[] {
    return this.db.all<{ id: string; project_id: string | null; name: string; graph: string; schedule_minutes: number; enabled: number; last_run_at: number | null; created_at: number; updated_at: number }>(
      'SELECT * FROM workflows ORDER BY updated_at DESC'
    ).map((r) => {
      let graph: Pick<Workflow, 'nodes' | 'edges'> = { nodes: [], edges: [] }
      try { graph = JSON.parse(r.graph) } catch { /* a damaged graph opens empty */ }
      return {
        id: r.id, projectId: r.project_id, name: r.name, nodes: graph.nodes ?? [], edges: graph.edges ?? [],
        scheduleMinutes: r.schedule_minutes, enabled: unb(r.enabled), lastRunAt: r.last_run_at, createdAt: r.created_at, updatedAt: r.updated_at
      }
    })
  }

  workflow(id: string): Workflow | null {
    return this.workflows().find((w) => w.id === id) ?? null
  }

  saveWorkflow(input: Partial<Workflow> & { name: string }): Workflow {
    const now = Date.now()
    const existing = input.id ? this.workflow(input.id) : null
    const next: Workflow = {
      id: existing?.id ?? newId('wfl'),
      projectId: null, nodes: [], edges: [], scheduleMinutes: 0, enabled: true, lastRunAt: null, createdAt: now,
      ...existing,
      ...input,
      updatedAt: now
    }
    next.scheduleMinutes = Math.max(0, Math.round(next.scheduleMinutes))
    if (next.scheduleMinutes > 0 && next.scheduleMinutes < 5) next.scheduleMinutes = 5
    this.db.run(
      `INSERT INTO workflows(id,project_id,name,graph,schedule_minutes,enabled,last_run_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, name=excluded.name, graph=excluded.graph, schedule_minutes=excluded.schedule_minutes,
       enabled=excluded.enabled, last_run_at=excluded.last_run_at, updated_at=excluded.updated_at`,
      next.id, next.projectId, next.name, JSON.stringify({ nodes: next.nodes, edges: next.edges }), next.scheduleMinutes, bolt(next.enabled), next.lastRunAt, next.createdAt, next.updatedAt
    )
    this.addWorkflowVersion(next)
    return next
  }

  markWorkflowRun(id: string, at: number) {
    this.db.run('UPDATE workflows SET last_run_at=? WHERE id=?', at, id)
  }

  deleteWorkflow(id: string): void {
    this.db.run('DELETE FROM workflows WHERE id=?', id)
    this.db.run('DELETE FROM workflow_versions WHERE workflow_id=?', id)
  }

  // ---------- workflow versions ----------
  workflowVersions(workflowId: string): WorkflowVersion[] {
    return this.db.all<{ id: string; workflow_id: string; name: string; graph: string; created_at: number }>(
      'SELECT * FROM workflow_versions WHERE workflow_id=? ORDER BY created_at DESC LIMIT 50', workflowId
    ).map((r) => ({ id: r.id, workflowId: r.workflow_id, name: r.name, graph: r.graph, createdAt: r.created_at }))
  }

  addWorkflowVersion(wf: Workflow) {
    this.db.run(
      'INSERT INTO workflow_versions(id,workflow_id,name,graph,created_at) VALUES(?,?,?,?,?)',
      newId('wfv'), wf.id, wf.name,
      JSON.stringify({ nodes: wf.nodes, edges: wf.edges }), Date.now()
    )
    // Keep last 50 versions per workflow
    this.db.run(
      `DELETE FROM workflow_versions WHERE workflow_id=? AND id NOT IN
       (SELECT id FROM workflow_versions WHERE workflow_id=? ORDER BY created_at DESC LIMIT 50)`,
      wf.id, wf.id
    )
  }

  restoreWorkflow(workflowId: string, versionId: string): Workflow | null {
    const ver = this.db.get<{ id: string; workflow_id: string; name: string; graph: string; created_at: number }>(
      'SELECT * FROM workflow_versions WHERE id=? AND workflow_id=?', versionId, workflowId
    )
    if (!ver) return null
    let graph: Pick<Workflow, 'nodes' | 'edges'> = { nodes: [], edges: [] }
    try { graph = JSON.parse(ver.graph) } catch { /* damaged graph */ }
    const wf = this.workflow(workflowId)
    if (!wf) return null
    return this.saveWorkflow({ ...wf, nodes: graph.nodes ?? [], edges: graph.edges ?? [] })
  }

  // ---------- MCP tool calls ----------
  mcpToolCalls(sessionId: string): McpToolCall[] {
    return this.db.all<{ id: string; session_id: string; tool_name: string; args_summary: string; duration_ms: number | null; created_at: number }>(
      'SELECT * FROM mcp_tool_calls WHERE session_id=? ORDER BY created_at ASC', sessionId
    ).map((r) => ({ id: r.id, sessionId: r.session_id, toolName: r.tool_name, argsSummary: r.args_summary, durationMs: r.duration_ms, createdAt: r.created_at }))
  }

  addMcpToolCall(call: Omit<McpToolCall, 'id' | 'createdAt'>) {
    this.db.run(
      'INSERT INTO mcp_tool_calls(id,session_id,tool_name,args_summary,duration_ms,created_at) VALUES(?,?,?,?,?,?)',
      newId('mtc'), call.sessionId, call.toolName, call.argsSummary, call.durationMs ?? null, Date.now()
    )
  }

  // ---------- analytics ----------
  analyticsOverview(sinceMs: number): AnalyticsOverview {
    type AggRow = { model: string; sessions: number; inputTokens: number; outputTokens: number; costUsd: number; seconds: number }
    type ProjRow = { projectId: string; sessions: number; costUsd: number }
    type DayRow = { day: string; costUsd: number; inputTokens: number; outputTokens: number; sessions: number }
    type TotRow = { sessions: number; inputTokens: number; outputTokens: number; costUsd: number; done: number; total: number }

    const totals = this.db.get<TotRow>(
      `SELECT COUNT(*) as sessions, SUM(inputTokens) as inputTokens, SUM(outputTokens) as outputTokens,
       SUM(costUsd) as costUsd, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done, COUNT(*) as total
       FROM sessions WHERE startedAt >= ?`, sinceMs
    ) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, done: 0, total: 0 }

    const byModelRaw = this.db.all<AggRow>(
      `SELECT model as model, COUNT(*) as sessions, SUM(inputTokens) as inputTokens, SUM(outputTokens) as outputTokens,
       SUM(costUsd) as costUsd, SUM(COALESCE((endedAt - startedAt)/1000, 0)) as seconds
       FROM sessions WHERE startedAt >= ? GROUP BY model ORDER BY costUsd DESC LIMIT 20`, sinceMs
    )

    const byProjRaw = this.db.all<ProjRow>(
      `SELECT projectId, COUNT(*) as sessions, SUM(costUsd) as costUsd FROM sessions WHERE startedAt >= ?
       GROUP BY projectId ORDER BY costUsd DESC LIMIT 20`, sinceMs
    )

    type AgentRow = { name: string; sessions: number; costUsd: number; seconds: number }
    const byAgentRaw = this.db.all<AgentRow>(
      `SELECT COALESCE(a.name, 'unknown') as name, COUNT(*) as sessions, SUM(s.costUsd) as costUsd,
        SUM(COALESCE((s.endedAt - s.startedAt)/1000, 0)) as seconds
       FROM sessions s LEFT JOIN agents a ON a.id = s.agentId WHERE s.startedAt >= ?
       GROUP BY s.agentId ORDER BY costUsd DESC LIMIT 20`, sinceMs
    )

    const dailyRaw = this.db.all<DayRow>(
      `SELECT date(startedAt/1000, 'unixepoch') as day, SUM(costUsd) as costUsd,
       SUM(inputTokens) as inputTokens, SUM(outputTokens) as outputTokens, COUNT(*) as sessions
       FROM sessions WHERE startedAt >= ? GROUP BY day ORDER BY day ASC`, sinceMs
    )

    const projects = this.projects()
    const byProject = byProjRaw.map((r) => ({
      id: r.projectId,
      name: projects.find((p) => p.id === r.projectId)?.name ?? r.projectId.slice(0, 8),
      sessions: r.sessions,
      costUsd: r.costUsd ?? 0
    }))

    return {
      totalCostUsd: totals.costUsd ?? 0,
      totalSessions: totals.sessions ?? 0,
      totalInputTokens: totals.inputTokens ?? 0,
      totalOutputTokens: totals.outputTokens ?? 0,
      successRate: totals.total > 0 ? (totals.done / totals.total) * 100 : 0,
      byModel: byModelRaw.map((r) => ({ name: r.model || 'unknown', sessions: r.sessions, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0, costUsd: r.costUsd ?? 0, seconds: r.seconds ?? 0 })),
      byAgent: byAgentRaw.map((r) => ({ name: r.name, sessions: r.sessions, costUsd: r.costUsd ?? 0, seconds: r.seconds ?? 0 })),
      byProject,
      daily: dailyRaw.map((r): AnalyticsDayBucket => ({ date: r.day, costUsd: r.costUsd ?? 0, inputTokens: r.inputTokens ?? 0, outputTokens: r.outputTokens ?? 0, sessions: r.sessions ?? 0 }))
    }
  }

  snapshot(
    providers: ProviderStatus[],
    preview?: PreviewState,
    models: ModelOption[] = [],
    requested?: string | null
  ): Snapshot {
    // Each window passes its own project. Without one, fall back to the last used.
    const active = requested !== undefined ? requested : this.activeProjectId()
    const projectId = active && this.project(active) ? active : this.projects()[0]?.id ?? null
    return {
      projects: this.projects(),
      activeProjectId: projectId,
      agents: projectId ? this.agents(projectId) : [],
      tasks: projectId ? this.tasks(projectId) : [],
      messages: projectId ? this.messages(projectId).slice(-120) : [],
      events: projectId ? this.events(projectId) : [],
      sessions: projectId ? this.sessions(projectId) : [],
      memories: this.memories(projectId),
      modelOutcomes: this.modelOutcomeStats(),
      skills: this.skills(),
      automations: projectId ? this.automations(projectId) : [],
      providers,
      settings: this.settings(),
      jobs: projectId ? this.jobs(projectId) : [],
      preview: preview ?? {
        projectId,
        kind: 'unknown',
        label: 'No artifact yet',
        status: 'off',
        url: null,
        command: '',
        detail: '',
        artifactPath: null,
        artifactUrl: null,
        needsInstall: false,
        installCommand: null,
        logs: [],
        revision: 0,
        startedAt: null
      },
      running: Boolean(projectId && this.runningJob(projectId)),
      conversation: projectId ? this.conversation(projectId) : null,
      conversations: projectId ? this.conversations(projectId) : [],
      // Every project's sessions, for the sidebar; titles only, no messages.
      sessionIndex: this.db.all<{ id: string; projectId: string; title: string; branchedFrom?: string }>('SELECT id, projectId, title, branchedFrom FROM conversations ORDER BY createdAt ASC, rowid ASC'),
      chat: projectId ? this.chatMessages(projectId) : [],
      chatTemplates: this.chatTemplates(),
      prompts: projectId ? this.prompts(projectId) : [],
      providerConfigs: this.providers(),
      assignments: projectId ? this.assignments(projectId) : [],
      modelPrefs: this.modelPrefs(),
      models,
      clients: this.clients()
    }
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

type ProjectRow = Omit<Project, 'clientId' | 'orgId'> & { client_id?: string | null; org_id?: string | null }

function mapProject({ client_id, org_id, ...rest }: ProjectRow): Project {
  return { ...rest, clientId: client_id ?? null, orgId: org_id ?? null }
}

function mapMemory(r: Record<string, unknown>): MemoryDoc {
  return {
    ...(r as unknown as MemoryDoc),
    tags: safeJson<string[]>(r.tags as string, []),
    pinned: unb(r.pinned),
    confidence: Number(r.confidence ?? 0.6)
  }
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}
