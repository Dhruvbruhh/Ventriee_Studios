import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { diffRows } from '../src/shared/diffrows'
import { github } from '../src/main/github'
import { findExecutable } from '../src/main/lsp'

describe('PR diff rows', () => {
  it('know the file, line and side a comment attaches to', () => {
    const rows = diffRows('diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -10,3 +10,4 @@ fn\n keep\n-old\n+new\n+added\n\\ No newline at end of file')
    expect(rows.filter((r) => r.line).map((r) => [r.kind, r.path, r.line, r.side])).toEqual([
      ['context', 'src/a.ts', 10, 'RIGHT'], ['del', 'src/a.ts', 11, 'LEFT'], ['add', 'src/a.ts', 11, 'RIGHT'], ['add', 'src/a.ts', 12, 'RIGHT']
    ])
    expect(rows.slice(0, 5).every((r) => !r.line)).toBe(true)
  })

  it('refuses a line comment without a line before calling gh', async () => {
    await expect(github('.', { kind: 'lineComment', number: 1, path: 'a.ts', line: 0, side: 'RIGHT', body: 'x' })).rejects.toThrow(/Pick a line|not installed/)
  })
})

// Read-only, against this repository's own merged PR, where gh is signed in.
const signedIn = (() => { try { return Boolean(findExecutable('gh')) && /Logged in/.test(execFileSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe' })) } catch { return false } })()
describe.skipIf(!signedIn || process.env.CI)('PR line comments on GitHub', { timeout: 60_000 }, () => {
  it('lists review comments and maps a real diff', async () => {
    expect(Array.isArray(await github('.', { kind: 'lineComments', number: 14 }))).toBe(true)
    const rows = diffRows(String(await github('.', { kind: 'diff', number: 14 })))
    expect(rows.some((r) => r.path === 'src/main/spend.ts' && r.kind === 'add' && r.line === 1)).toBe(true)
  })
})
