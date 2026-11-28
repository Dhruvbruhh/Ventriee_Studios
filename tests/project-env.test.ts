import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fresh = () => join(mkdtempSync(join(tmpdir(), 'ventriee-termenv-')), 'ventriee.db')
let lastFile = ''
const store = () => { lastFile = fresh(); return new Store(lastFile) }

describe('project env vars', () => {
  it('saves, persists and applies env vars to the project', () => {
    const s = store()
    const p = s.createProject({ name: 'E', path: 'C:/tmp/e', description: '' })
    s.updateProject(p.id, { envVars: { API_KEY: 'sk-123', DEBUG: '1' } })
    const after = s.project(p.id)
    expect(after?.envVars).toEqual({ API_KEY: 'sk-123', DEBUG: '1' })
    // Reopening the store reads the JSON column back.
    s.db.close()
    const s2 = new Store(lastFile)
    expect(s2.project(p.id)?.envVars).toEqual({ API_KEY: 'sk-123', DEBUG: '1' })
    s2.db.close()
  })

  it('drops invalid names and non-string values', () => {
    const s = store()
    const p = s.createProject({ name: 'E2', path: 'C:/tmp/e2', description: '' })
    s.updateProject(p.id, { envVars: { 'BAD-NAME': 'x', '1START': 'y', GOOD: 'z', EVIL: 42 as unknown as string } })
    expect(s.project(p.id)?.envVars).toEqual({ GOOD: 'z' })
    s.db.close()
  })
})
