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

describe('inline completion cleanup', () => {
  it('drops fences, the echoed current line and anything past 40 lines', async () => {
    const { cleanCompletion } = await import('../src/main/code-agent')
    expect(cleanCompletion('```ts\n  return a + b\n```', 'function add(a, b) {\n')).toBe('  return a + b')
    expect(cleanCompletion('const total = items.length', 'const total = ')).toBe('items.length')
    expect(cleanCompletion(Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n'), '').split('\n')).toHaveLength(40)
  })
})
