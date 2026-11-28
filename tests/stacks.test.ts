import { describe, expect, it } from 'vitest'
import { STACK_PRESETS, normalizeStack, stackToAnswer } from '../src/shared/stacks'

describe('stack picker (W47)', () => {
  it('offers exactly three presets with distinct shapes', () => {
    expect(STACK_PRESETS.length).toBe(3)
    expect(new Set(STACK_PRESETS.map((p) => p.pick.frontend)).size).toBe(3)
    // Every preset is complete: all five fields filled.
    for (const p of STACK_PRESETS) {
      for (const v of Object.values(p.pick)) expect(v.trim().length).toBeGreaterThan(0)
    }
  })

  it('fills missing fields with preset defaults and clamps length', () => {
    expect(normalizeStack(null).frontend).toBe(STACK_PRESETS[0].pick.frontend)
    expect(normalizeStack({ backend: '' }).backend).toBe(STACK_PRESETS[0].pick.backend)
    expect(normalizeStack({ frontend: 'x'.repeat(500) }).frontend.length).toBe(120)
    expect(normalizeStack({ frontend: '  SolidJS  ' }).frontend).toBe('SolidJS')
  })

  it('serializes the pick into one clarification answer', () => {
    const answer = stackToAnswer({ ...STACK_PRESETS[0].pick, database: 'Postgres' })
    expect(answer).toContain('Frontend: Next.js')
    expect(answer).toContain('Database: Postgres')
    expect(answer).toContain('Tests: Vitest')
  })
})
