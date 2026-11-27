import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IntelligenceEngine } from '../src/main/intelligence'

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-intel-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('intelligence index', () => {
  it('indexes everything on first sync, then re-indexes only the file that changed', () => {
    const root = workspace({
      'src/auth.ts': 'export function signIn(user: string) { return user }',
      'src/billing.ts': 'export function charge(amount: number) { return amount }',
      'src/ui.tsx': 'export const Button = () => null'
    })
    const intel = new IntelligenceEngine()

    const first = intel.sync(root)
    expect(first.indexed.sort()).toEqual(['src/auth.ts', 'src/billing.ts', 'src/ui.tsx'])
    expect(first.unchanged).toBe(0)

    // Nothing changed -> nothing re-indexed.
    expect(intel.sync(root).indexed).toEqual([])

    writeFileSync(join(root, 'src/billing.ts'), 'export function charge(amount: number) { return amount * 2 }')
    const second = intel.sync(root)
    expect(second.indexed).toEqual(['src/billing.ts'])
    expect(second.unchanged).toBe(2)
  })

  it('detects renames by content hash and deletions', () => {
    const root = workspace({ 'src/a.ts': 'export const alpha = 1', 'src/b.ts': 'export const beta = 2' })
    const intel = new IntelligenceEngine()
    intel.sync(root)

    // Rename a.ts -> moved.ts (same bytes), delete b.ts.
    writeFileSync(join(root, 'src/moved.ts'), 'export const alpha = 1')
    rmSync(join(root, 'src/a.ts'))
    rmSync(join(root, 'src/b.ts'))
    const result = intel.sync(root)

    expect(result.renamed).toEqual([{ from: 'src/a.ts', to: 'src/moved.ts' }])
    expect(result.removed).toEqual(['src/b.ts'])
    expect(result.indexed).toEqual([]) // a rename is not a re-index
  })
})

describe('intelligence retrieval', () => {
  it('ranks the obviously relevant file first', () => {
    const root = workspace({
      'src/auth.ts': 'export function authenticateUser(token: string) { /* verify login token */ return token }',
      'src/billing.ts': 'export function invoice(amount: number) { return amount }',
      'src/theme.ts': 'export const palette = { bg: "graphite" }'
    })
    const intel = new IntelligenceEngine()
    intel.sync(root)

    const hits = intel.retrieve(root, 'fix the user authentication token login', 3)
    expect(hits[0].path).toBe('src/auth.ts')
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it('returns nothing before the index exists', () => {
    const root = workspace({ 'src/a.ts': 'const a = 1' })
    expect(new IntelligenceEngine().retrieve(root, 'anything')).toEqual([])
  })

  it('matches inflected forms through the stemmer', () => {
    const root = workspace({
      'src/git.ts': 'export function stageFiles(paths: string[]) { /* staging area for the commit */ }',
      'src/theme.ts': 'export const palette = { bg: "graphite" }'
    })
    const intel = new IntelligenceEngine()
    intel.sync(root)

    // The audit's miss: "staging"/"commits" in the query vs "stage"/"commit" in the code.
    const hits = intel.retrieve(root, 'git commit staging', 3)
    expect(hits[0]?.path).toBe('src/git.ts')
  })
})

describe('intelligence compiler', () => {
  it('keeps the package within the budget and preserves the memory block', () => {
    const root = workspace({
      'src/auth.ts': `export function authenticateUser(token: string) {\n${'  // token handling line\n'.repeat(200)}  return token\n}`,
      'src/other.ts': 'export const x = 1'
    })
    const intel = new IntelligenceEngine()
    intel.sync(root)

    const memory = '<memory>owner prefers graphite UI</memory>'
    const compiled = intel.compile(root, { query: 'authenticate user token', memoryBlock: memory, budget: 600 })

    expect(compiled.text.length).toBeLessThanOrEqual(600)
    expect(compiled.text).toContain('owner prefers graphite UI') // memory is never trimmed
    expect(compiled.files[0].path).toBe('src/auth.ts')
  })

  it('still returns the memory block when no code is relevant', () => {
    const root = workspace({ 'src/a.ts': 'export const a = 1' })
    const intel = new IntelligenceEngine()
    intel.sync(root)
    const compiled = intel.compile(root, { query: 'zzzznomatch', memoryBlock: 'remember this' })
    expect(compiled.text).toContain('remember this')
    expect(compiled.files).toEqual([])
  })
})
