import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GraphifyService } from '../src/main/graphify'

describe('graphify', () => {
  it('reports an existing graph and its node count', async () => {
    const root = mkdtempSync(join(tmpdir(), 'graphify-'))
    try {
      expect((await new GraphifyService().status(root)).indexed).toBe(false)
      mkdirSync(join(root, 'graphify-out'))
      writeFileSync(join(root, 'graphify-out', 'graph.json'), JSON.stringify({ nodes: [{ id: 'a' }, { id: 'b' }] }))
      const s = await new GraphifyService().status(root)
      expect(s).toMatchObject({ indexed: true, nodes: 2 })
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 20_000)

  it('refuses an empty question', async () => {
    expect(await new GraphifyService().query(tmpdir(), '   ')).toEqual({ ok: false, out: 'Empty question' })
  })
})
