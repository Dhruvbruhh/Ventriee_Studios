import { describe, expect, it } from 'vitest'
import { parseIntent, guessIntent, protocolFor, classifyIntent } from '../src/main/intent'

describe('chat intent (W46)', () => {
  it('parses the one-word model reply', () => {
    expect(parseIntent('prototype')).toBe('prototype')
    expect(parseIntent('Fix')).toBe('fix')
    expect(parseIntent('  question  ')).toBe('question')
    expect(parseIntent('feature')).toBe('feature')
    // Anything unparseable is treated as a feature ask, the safest default.
    expect(parseIntent('sorry, I did not understand')).toBe('feature')
  })

  it('guesses locally when the model is unreachable', () => {
    expect(guessIntent('How does auth work?')).toBe('question')
    expect(guessIntent('The save button crashes when the file is empty')).toBe('fix')
    expect(guessIntent('Build me an MVP for a hotel management tool')).toBe('prototype')
    expect(guessIntent('Add a dark mode toggle to settings')).toBe('feature')
  })

  it('asks the model first and uses its word', async () => {
    const seen: Array<{ system: string; prompt: string }> = []
    const intent = await classifyIntent(async (input) => {
      seen.push(input)
      return 'fix'
    }, 'it crashed')
    expect(intent).toBe('fix')
    expect(seen[0].prompt).toBe('it crashed')
    expect(seen[0].system).toMatch(/Classify/)
  })

  it('falls back to the heuristic when the model call fails', async () => {
    expect(await classifyIntent(async () => { throw new Error('engine down') }, 'Why is the build slow?')).toBe('question')
  })

  it('gives each intent a usable protocol', () => {
    expect(protocolFor('prototype')).toMatch(/Here's what I'll do/)
    expect(protocolFor('prototype')).toMatch(/3-5 focused questions/)
    expect(protocolFor('feature')).toMatch(/Out of scope/)
    expect(protocolFor('fix')).toMatch(/reproduce/i)
    // Questions get answers, not interrogation.
    expect(protocolFor('question')).toMatch(/answer/i)
    expect(protocolFor('question')).not.toMatch(/3-5/)
  })
})
