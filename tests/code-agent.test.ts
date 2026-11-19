import { describe, expect, it } from 'vitest'
import { replacementFrom } from '../src/main/code-agent'

describe('code agent reply parsing', () => {
  it('takes the last fenced block as the replacement, keeping inner indentation', () => {
    const reply = 'Renamed it.\n```ts\nold()\n```\nThen:\n```typescript\r\n  const total = sum(a)\r\n  return total\r\n```'
    expect(replacementFrom(reply)).toBe('  const total = sum(a)\r\n  return total')
  })
  it('returns null when there is no code block', () => {
    expect(replacementFrom('Looks fine to me.')).toBeNull()
  })
  it('keeps an intentionally empty replacement', () => {
    expect(replacementFrom('Delete it.\n```\n```')).toBe('')
  })
})
