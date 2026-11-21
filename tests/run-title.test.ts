import { describe, expect, it } from 'vitest'
import { runTitle } from '../src/renderer/src/panels/RunsPanel'

describe('runTitle', () => {
  it('skips a bare markdown heading and uses the first real line', () => {
    expect(runTitle('## Objective\n\nDeliver a modern rebuild of the **Bubbling Fish** website')).toBe('Deliver a modern rebuild of the Bubbling Fish website')
  })
  it('keeps a plain instruction and strips heading marks', () => {
    expect(runTitle('Retry: Design system specs')).toBe('Retry: Design system specs')
    expect(runTitle('# Build the game\nmore')).toBe('Build the game')
  })
  it('falls back to Run for empty text', () => {
    expect(runTitle('  \n ')).toBe('Run')
  })
})
