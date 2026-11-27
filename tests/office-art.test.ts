import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coveredGids } from '../src/renderer/src/office/animeTiles'
import { OFFICE_CAST, ROLE_CHARACTER } from '../src/renderer/src/office/cast'

describe('office art', () => {
  it('draws every tile the office map uses, including the monitor-on overlay', () => {
    const map = JSON.parse(readFileSync('src/renderer/src/office/assets/office.tmj', 'utf8'))
    const used = new Set<number>([367, 368, 383, 384])
    for (const layer of map.layers) if (layer.type === 'tilelayer' && layer.name !== 'collision') for (const raw of layer.data) if (raw) used.add(raw & 0x1fffffff)
    const covered = new Set(coveredGids())
    expect([...used].filter((gid) => !covered.has(gid))).toEqual([])
  })

  it('gives every worker role a character from the cast', () => {
    const names = new Set(OFFICE_CAST.map((c) => c.name))
    expect(Object.values(ROLE_CHARACTER).every((n) => names.has(n))).toBe(true)
  })
})
