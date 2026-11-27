import { describe, expect, it } from 'vitest'
import { MOODS } from '../src/renderer/src/office/portraitArt'

describe('agent moods', () => {
  it('has the eight expressions of an anime expression sheet', () => {
    expect(MOODS).toEqual(['smile', 'angry', 'cry', 'blush', 'surprised', 'laugh', 'tired', 'wink'])
  })

  it('maps each agent state to a face, with errors and pauses winning over selection', async () => {
    const { moodFor } = await import('../src/renderer/src/components/OfficeFloor')
    expect(moodFor('working', false)).toBe('smile')
    expect(moodFor('waiting', false)).toBe('tired')
    expect(moodFor('error', true)).toBe('cry')
    expect(moodFor('paused', true)).toBe('angry')
    expect(moodFor('idle', true)).toBe('blush')
    expect(moodFor('idle', false)).toBeUndefined()
  })
})
