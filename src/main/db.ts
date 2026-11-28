import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export type Row = Record<string, unknown>

/** Thrown when the data on disk is newer than this app; startup shows it instead of touching the data. */
export class NewerDataError extends Error {}

/**
 * Ordered schema migrations. `user_version` records how many have run, so a new
 * column is added to the end of this list instead of being silently skipped by
 * `CREATE TABLE IF NOT EXISTS`.
 *
 * Never edit or reorder an entry that has shipped: existing profiles have
 * already stamped it. Append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL,
    description TEXT DEFAULT '', createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, role TEXT, name TEXT, title TEXT,
    engine TEXT, model TEXT, endpoint TEXT DEFAULT '', instructions TEXT DEFAULT '',
    autonomy TEXT DEFAULT 'scoped', concurrency INTEGER DEFAULT 1, budgetUsd REAL DEFAULT 5,
    color TEXT, desk INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, status TEXT DEFAULT 'idle',
    currentTaskId TEXT, lastError TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, parentId TEXT, title TEXT, description TEXT,
    acceptance TEXT DEFAULT '', role TEXT, agentId TEXT, status TEXT DEFAULT 'todo',
    dependsOn TEXT DEFAULT '[]', output TEXT DEFAULT '', review TEXT DEFAULT '',
    attempts INTEGER DEFAULT 0, phase TEXT DEFAULT 'build', createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, projectId TEXT, taskId TEXT, sender TEXT, recipient TEXT, type TEXT,
    content TEXT, status TEXT DEFAULT 'unread', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, projectId TEXT, agentId TEXT, taskId TEXT, type TEXT, message TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, projectId TEXT, agentId TEXT, taskId TEXT, engine TEXT, model TEXT,
    cwd TEXT, status TEXT, exitCode INTEGER, inputTokens INTEGER DEFAULT 0, outputTokens INTEGER DEFAULT 0,
    costUsd REAL DEFAULT 0, externalId TEXT, command TEXT DEFAULT '', startedAt INTEGER, endedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, scope TEXT, projectId TEXT, agentId TEXT, path TEXT, title TEXT,
    body TEXT, tags TEXT DEFAULT '[]', pinned INTEGER DEFAULT 0, confidence REAL DEFAULT 0.6,
    source TEXT DEFAULT '', evidence TEXT DEFAULT '', updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, name TEXT, description TEXT, path TEXT, enabled INTEGER DEFAULT 1,
    version TEXT DEFAULT '1.0.0', uses INTEGER DEFAULT 0, successes INTEGER DEFAULT 0,
    source TEXT DEFAULT '', updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY, projectId TEXT, name TEXT, instruction TEXT,
    intervalMinutes INTEGER DEFAULT 60, enabled INTEGER DEFAULT 1,
    lastRunAt INTEGER, nextRunAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, projectId TEXT, instruction TEXT, status TEXT,
    planSource TEXT, createdAt INTEGER, updatedAt INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(projectId);
  CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(projectId);
  CREATE INDEX IF NOT EXISTS idx_events_project ON events(projectId);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(projectId);
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(projectId);
  `,
  // Planning is a first-class record: conversations, their messages, every prompt
  // revision, configured providers and what was assigned to whom.
  `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, createdAt INTEGER, updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, conversationId TEXT NOT NULL,
    role TEXT, content TEXT, model TEXT DEFAULT '', status TEXT DEFAULT 'done', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, conversationId TEXT NOT NULL,
    title TEXT DEFAULT '', body TEXT NOT NULL, version INTEGER DEFAULT 1,
    source TEXT DEFAULT 'generated', parentId TEXT, createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY, label TEXT, kind TEXT, engine TEXT, baseUrl TEXT DEFAULT '',
    models TEXT DEFAULT '[]', createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, projectId TEXT NOT NULL, promptId TEXT, jobId TEXT,
    mode TEXT, agents TEXT DEFAULT '[]', createdAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_chat_project ON chat_messages(projectId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(projectId, version);
  `,
  // Per-task routing override, so a task can run on a different model than its
  // worker's default without changing that default.
  `
  ALTER TABLE tasks ADD COLUMN engine TEXT;
  ALTER TABLE tasks ADD COLUMN model TEXT;
  ALTER TABLE tasks ADD COLUMN endpoint TEXT;
  ALTER TABLE tasks ADD COLUMN routedBy TEXT;
  `,
  // Reasoning effort and the exact config a session actually ran with.
  `
  ALTER TABLE agents ADD COLUMN reasoning TEXT NOT NULL DEFAULT 'auto';
  ALTER TABLE sessions ADD COLUMN reasoning TEXT;
  `,
  // Which skills a worker is offered. Empty falls back to its role template.
  `
  ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
  `,
  // Files a task changed or removed, recorded from its evidence check for review.
  `
  ALTER TABLE tasks ADD COLUMN changedFiles TEXT NOT NULL DEFAULT '[]';
  `,
  // Several planning sessions per project; an empty title shows as "Session N".
  `
  ALTER TABLE conversations ADD COLUMN title TEXT NOT NULL DEFAULT '';
  `,
  // Planner's difficulty estimate, used to route easy tasks to cheaper models.
  `
  ALTER TABLE tasks ADD COLUMN difficulty TEXT;
  `,
  // Specialist skills the planner attached to one task, on top of the worker's own.
  `
  ALTER TABLE tasks ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
  `,
  // Link a project to a CRM client.
  `
  ALTER TABLE projects ADD COLUMN client_id TEXT;
  `,
  // Client CRM — prospects tracked through the agency pipeline.
  `
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    niche TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'prospect',
    notes TEXT NOT NULL DEFAULT '',
    project_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    graph TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    schedule_minutes INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    name TEXT NOT NULL,
    graph TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wv_workflow ON workflow_versions(workflow_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS mcp_tool_calls (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args_summary TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mtc_session ON mcp_tool_calls(session_id, created_at);
  `,
  `ALTER TABLE agents ADD COLUMN mcpServers TEXT NOT NULL DEFAULT '[]';`,
  // W18: org memory layer, memory version history, measured routing outcomes.
  `
  ALTER TABLE projects ADD COLUMN org_id TEXT;
  ALTER TABLE memories ADD COLUMN orgId TEXT;
  CREATE TABLE IF NOT EXISTS memory_versions (
    id TEXT PRIMARY KEY, memoryId TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '', taskId TEXT, createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mv_memory ON memory_versions(memoryId, createdAt DESC);
  CREATE TABLE IF NOT EXISTS model_outcomes (
    id TEXT PRIMARY KEY, taskId TEXT NOT NULL, model TEXT NOT NULL, role TEXT NOT NULL,
    difficulty TEXT NOT NULL, outcome TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
    latencyMs INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mo_bucket ON model_outcomes(role, difficulty, model);
  `,
  // Desktop <-> cloud sync (cloud/sync.ts): one row per synced item, linking the
  // local id to its cloud row, plus the outbox (dirty), retry backoff and conflicts.
  `
  CREATE TABLE IF NOT EXISTS cloud_sync (
    kind TEXT NOT NULL, localId TEXT NOT NULL, cloudId TEXT, userId TEXT NOT NULL DEFAULT '',
    cloudUpdatedAt TEXT, dirty INTEGER NOT NULL DEFAULT 1, attempts INTEGER NOT NULL DEFAULT 0,
    nextAt INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', conflict TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (kind, localId)
  );
  CREATE INDEX IF NOT EXISTS idx_cloud_sync_cloud ON cloud_sync(cloudId);
  `,
  // Reusable chat templates: named snippets the owner drops into the planning
  // composer. Global (not per project), so a good brief opener follows you around.
  `
  CREATE TABLE IF NOT EXISTS chat_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, createdAt INTEGER
  );
  `,
  // Chat branching: a session can record the session+message it was branched from.
  `
  ALTER TABLE conversations ADD COLUMN branchedFrom TEXT;
  ALTER TABLE conversations ADD COLUMN branchedFromMessageId TEXT;
  `,
  // Per-project environment variables for new terminal sessions.
  `
  ALTER TABLE projects ADD COLUMN envVars TEXT NOT NULL DEFAULT '{}';
  `
]

export class Db {
  private db: DatabaseSync

  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  /** Exposed for the migration test; the app never needs to read it. */
  get schemaVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version')
    return Number(row?.user_version ?? 0)
  }

  /**
   * Each migration runs in its own transaction together with the version bump,
   * so an interrupted upgrade retries the same step instead of skipping it.
   * A profile created before versioning has the tables but version 0; every
   * statement above is IF NOT EXISTS, so re-running step 1 is safe.
   */
  private migrate() {
    const from = this.schemaVersion
    // Data written by a newer app has columns this version does not know; running on it could lose them.
    if (from > MIGRATIONS.length) {
      this.db.close()
      throw new NewerDataError(`Your studio data was saved by a newer version of Ventriee Studios (data version ${from}, this app understands ${MIGRATIONS.length}). Install the latest version to open it; your data has not been changed.`)
    }
    // An update that changes the schema first keeps a copy of the data as it was.
    if (from > 0 && from < MIGRATIONS.length) this.backup(from)
    for (let version = from; version < MIGRATIONS.length; version += 1) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(MIGRATIONS[version]!)
        this.db.exec(`PRAGMA user_version = ${version + 1}`)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw new Error(`Database migration ${version + 1} failed: ${(error as Error).message}`)
      }
    }
  }

  /** A consistent copy (VACUUM INTO works with WAL), named by schema version; the newest three are kept. */
  private backup(version: number) {
    const target = `${this.file}.v${version}.bak`
    if (existsSync(target)) rmSync(target)
    this.db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    const dir = dirname(this.file)
    const prefix = `${basename(this.file)}.v`
    const old = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.bak'))
      .sort((a, b) => Number(b.slice(prefix.length, -4)) - Number(a.slice(prefix.length, -4))).slice(3)
    for (const name of old) rmSync(join(dir, name), { force: true })
  }

  get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined
  }

  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[]
  }

  run(sql: string, ...params: unknown[]) {
    this.db.prepare(sql).run(...(params as never[]))
  }

  exec(sql: string) {
    this.db.exec(sql)
  }

  kvGet(key: string): string | null {
    const row = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key)
    return row?.value ?? null
  }

  kvSet(key: string, value: string) {
    this.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  kvDelete(key: string) {
    this.run('DELETE FROM kv WHERE key = ?', key)
  }

  close() {
    this.db.close()
  }
}
