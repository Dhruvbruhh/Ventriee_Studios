import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HistoryService } from '../src/main/history'

describe('local history', () => {
  it('keeps each distinct saved version, newest first, and prunes old ones', () => {
    const history = new HistoryService(mkdtempSync(join(tmpdir(), 'ventriee-history-')))
    const day = 86_400_000
    const now = Date.now()
    history.record('prj_1', 'src/a.ts', 'v1', now - 40 * day)
    history.record('prj_1', 'src/a.ts', 'v2', now - day)
    history.record('prj_1', 'src/a.ts', 'v2', now - day + 5)
    history.record('prj_1', 'src/a.ts', 'v3', now)
    const list = history.list('prj_1', 'src/a.ts')
    expect(list.map((v) => history.read('prj_1', 'src/a.ts', v.id))).toEqual(['v3', 'v2'])
    expect(history.has('prj_1', 'src/b.ts')).toBe(false)
    for (let i = 0; i < 60; i++) history.record('prj_1', 'src/a.ts', `n${i}`, now + i + 1)
    expect(history.list('prj_1', 'src/a.ts')).toHaveLength(50)
    expect(() => history.read('prj_1', 'src/a.ts', '../x')).toThrow('Invalid version')
    expect(() => history.list('../evil', 'a')).toThrow('Invalid project')
  })
})
