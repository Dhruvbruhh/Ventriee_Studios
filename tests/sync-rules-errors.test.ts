import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { StudioAuth } from '../src/main/auth'
import { ErrorLog, issueUrl } from '../src/main/errorlog'
import { projectRules, withRules } from '../src/main/rules'

describe('project rules for agents', () => {
  it('reads AGENTS.md, CLAUDE.md, .cursorrules and Copilot instructions into the system prompt', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-rules-'))
    expect(withRules('base', root)).toBe('base')
    writeFileSync(join(root, 'AGENTS.md'), 'Use tabs.')
    writeFileSync(join(root, '.cursorrules'), 'x'.repeat(7000))
    mkdirSync(join(root, '.github'))
    writeFileSync(join(root, '.github', 'copilot-instructions.md'), 'Prefer pnpm.')
    const rules = projectRules(root)
    expect(rules).toContain('--- AGENTS.md ---\nUse tabs.')
    expect(rules).toContain('… (cut)')
    expect(rules).toContain('Prefer pnpm.')
    expect(withRules('base', root)).toMatch(/^base\n\nThe project's own rules/)
  })
})

describe('local error log', () => {
  it('records only when the owner turned it on, without secrets', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ventriee-err-')), 'errors.log')
    let on = false
    const log = new ErrorLog(file, () => on, () => ['sk-secret-123'])
    log.record('main', 'first')
    expect(log.recent()).toBe('')
    on = true
    log.record('renderer', 'failed with key sk-secret-123', 'at x')
    expect(log.recent()).toContain('[renderer] failed with key')
    expect(log.recent()).not.toContain('sk-secret-123')
    log.clear()
    expect(log.recent()).toBe('')
  })

  it('prefills a GitHub issue the owner reviews before posting', () => {
    const url = new URL(issueUrl('o/r', '1.2.3', 'win32 x64', 'boom'))
    expect(url.pathname).toBe('/o/r/issues/new')
    expect(url.searchParams.get('body')).toContain('Ventriee Studios 1.2.3 on win32 x64')
    expect(url.searchParams.get('body')).toContain('boom')
  })
})

describe('settings sync', () => {
  it('reads and writes the signed-in user\'s metadata', async () => {
    const jwt = `h.${Buffer.from(JSON.stringify({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's' })).toString('base64url')}.s`
    const calls: Array<{ url: string; method: string; body?: string }> = []
    const request = vi.fn<typeof fetch>(async (input, init) => {
      calls.push({ url: String(input), method: String(init?.method), body: init?.body as string | undefined })
      if (String(input).endsWith('/token?grant_type=password')) return new Response(JSON.stringify({ access_token: jwt, refresh_token: 'r' }))
      return new Response(JSON.stringify({ id: 'u', email: 'a@b.c', user_metadata: { ventrieeSync: { vimMode: true } } }))
    })
    const auth = new StudioAuth('https://x.supabase.co', 'public-key', { get: () => null, set: () => {}, clear: () => {} }, request)
    await expect(auth.syncedData()).rejects.toThrow('Sign in')
    await auth.signIn(1, { email: 'a@b.c', password: 'pw-example' })
    expect(await auth.syncedData()).toEqual({ ventrieeSync: { vimMode: true } })
    await auth.saveSyncedData({ ventrieeSync: { vimMode: false } })
    expect(calls.at(-1)).toMatchObject({ url: 'https://x.supabase.co/auth/v1/user', method: 'PUT', body: JSON.stringify({ data: { ventrieeSync: { vimMode: false } } }) })
  })
})
