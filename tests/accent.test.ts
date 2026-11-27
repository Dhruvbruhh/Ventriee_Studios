import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, normaliseAccent } from '../src/shared/accent'

describe('accent helpers', () => {
  it('keeps well-formed hex colours and lowercases them', () => {
    expect(normaliseAccent('#F07A35')).toBe('#f07a35')
    expect(normaliseAccent('#abc')).toBe('#abc')
    expect(normaliseAccent('#6A4BD6')).toBe('#6a4bd6')
  })
  it('resets anything that is not a hex colour', () => {
    expect(normaliseAccent('')).toBe('')
    expect(normaliseAccent('orange')).toBe('')
    expect(normaliseAccent('f07a35')).toBe('')
    expect(normaliseAccent('#ff')).toBe('')
    expect(normaliseAccent('#12345')).toBe('')
    expect(normaliseAccent('#1234567')).toBe('')
    expect(normaliseAccent('<script>#f07a35</script>')).toBe('')
    expect(normaliseAccent(undefined)).toBe('')
  })
  it('offers hex presets only', () => {
    expect(ACCENT_PRESETS.length).toBeGreaterThan(3)
    for (const hex of ACCENT_PRESETS) expect(normaliseAccent(hex)).toBe(hex)
  })
})
