import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Db, NewerDataError } from '../src/main/db'

const profile = () => join(mkdtempSync(join(tmpdir(), 'ventriee-db-')), 'ventriee.db')

describe('schema migrations', () => {
  it('stamps a fresh database at the current version', () => {
    const db = new Db(profile())
    expect(db.schemaVersion).toBeGreaterThan(0)
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")).toHaveLength(1)
    db.close()
  })

  it('adopts a profile made before versioning without losing rows', () => {
    const file = profile()
    // A pre-migration profile has tables but user_version 0, the state on disk
    // for every owner who ran an earlier build.
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, projectId TEXT, title TEXT);
              CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
              INSERT INTO tasks(id, projectId, title) VALUES('t1', 'p1', 'kept');`)
    old.close()

    const db = new Db(file)
    expect(db.schemaVersion).toBeGreaterThan(0)
    expect(db.get<{ title: string }>('SELECT title FROM tasks WHERE id = ?', 't1')?.title).toBe('kept')
    expect(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'")).toHaveLength(1)
    db.close()
  })

  it('is idempotent: reopening runs no migration twice', () => {
    const file = profile()
    const first = new Db(file)
    const version = first.schemaVersion
    first.close()
    const second = new Db(file)
    expect(second.schemaVersion).toBe(version)
    second.close()
  })

  it('backs up the data before an update changes the schema, keeping the newest three', () => {
    const file = profile()
    const current = new Db(file)
    const latest = current.schemaVersion
    current.close()
    for (const from of [latest - 4, latest - 3, latest - 2, latest - 1]) {
      const raw = new DatabaseSync(file)
      raw.exec(`PRAGMA user_version = ${from}`)
      raw.exec(`INSERT OR REPLACE INTO kv(key, value) VALUES('marker', 'before v${from}')`)
      raw.close()
      try { new Db(file).close() } catch { /* re-running an ALTER on an already-upgraded table fails; the backup is what we check */ }
    }
    const dir = dirname(file)
    const backups = readdirSync(dir).filter((f) => f.endsWith('.bak')).sort()
    expect(backups).toEqual([`ventriee.db.v${latest - 3}.bak`, `ventriee.db.v${latest - 2}.bak`, `ventriee.db.v${latest - 1}.bak`])
    const copy = new DatabaseSync(join(dir, `ventriee.db.v${latest - 1}.bak`))
    expect(copy.prepare("SELECT value FROM kv WHERE key = 'marker'").get()).toEqual({ value: `before v${latest - 1}` })
    copy.close()
  })

  it('refuses data from a newer version instead of running on it', () => {
    const file = profile()
    new Db(file).close()
    const raw = new DatabaseSync(file)
    raw.exec('PRAGMA user_version = 999')
    raw.close()
    expect(() => new Db(file)).toThrow(NewerDataError)
    const after = new DatabaseSync(file)
    expect(after.prepare('PRAGMA user_version').get()).toEqual({ user_version: 999 })
    after.close()
  })
})
