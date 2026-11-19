import { describe, expect, it } from 'vitest'
import { github } from '../src/main/github'

describe('GitHub actions', () => {
  it('refuses bad numbers and empty bodies before running gh', async () => {
    await expect(github('.', { kind: 'pr', number: -1 })).rejects.toThrow(/Invalid number|not installed/)
    await expect(github('.', { kind: 'comment', number: 1, body: '  ' })).rejects.toThrow(/Write up to|not installed/)
    await expect(github('.', { kind: 'nope' } as never)).rejects.toThrow('Unknown GitHub action')
  })
})
