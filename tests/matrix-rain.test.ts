import { describe, expect, it } from 'vitest'
import { glyph, hash } from '../src/renderer/src/components/MatrixRain'

describe('matrix rain', () => {
  it('hash is deterministic and in [0, 1)', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3))
    for (let i = 0; i < 50; i++) { const h = hash(i, i * 7, 3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1) }
  })
  it('near streams have a heavy head and a solid first half', () => {
    expect('@#%&$').toContain(glyph(true, 4, 10, 0, 20, 1.3))
    for (let d = 2; d <= 10; d++) expect(glyph(true, 4, 10 + d, d, 20, 1.3)).toMatch(/[0-9A-Z]/)
  })
  it('far tails thin out', () => {
    const shown = Array.from({ length: 200 }, (_, c) => glyph(false, c, 5, 15, 16, 2)).filter(Boolean).length
    expect(shown).toBeLessThan(200)
  })
})
