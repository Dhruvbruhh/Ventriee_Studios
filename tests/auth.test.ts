import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioAuth } from '../src/main/auth'
import { cleanSupabaseUrl, isPublicSupabaseKey, originOf, RENDERER_ORIGIN, studioCsp } from '../src/shared/auth-config'
const url = 'https://test-project.supabase.co'
const user = { id: 'user-uuid', email: 'test@example.com' }
const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) => `header.${Buffer.from(JSON.stringify({ sub: user.id, exp, session_id: 'session-uuid' })).toString('base64url')}.signature`
const request = vi.fn<typeof fetch>()
let stored: string | null = null
const storage = { get: () => stored, set: (value: string) => { stored = value }, clear: () => { stored = null } }
const auth = () => new StudioAuth(url, 'public-test-key', storage, request)
beforeEach(() => {
  stored = null
  request.mockReset().mockImplementation(async (input) => new Response(JSON.stringify(String(input).endsWith('/user') ? user : { access_token: jwt(), refresh_token: 'refresh' })))
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('Supabase main-process authentication', () => {
  it('verifies the access token against Supabase before unlocking studio IPC', async () => {
    const service = auth()
    expect(() => service.requireSession(1)).toThrow('Sign in')
    const result = await service.signIn(1, { email: user.email, password: 'example-password' })
    expect(result.session?.userId).toBe(user.id)
    expect(service.session(2)).toBeNull()
    expect(request).toHaveBeenCalledWith(`${url}/auth/v1/user`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${jwt()}` }) }))
    expect(stored).toContain('refresh_token')
  })
  it('requires email confirmation when signup returns no session', async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ id: user.id })))
    const service = auth()
    expect((await service.signIn(1, { email: user.email, password: 'example-password' }, true)).message).toContain('confirm')
    expect(service.hasSession()).toBe(false)
  })
  it('restores a persisted session only after server verification', async () => {
    stored = JSON.stringify({ access_token: jwt(), refresh_token: 'refresh' })
    const service = auth()
    expect((await service.restore(1))?.email).toBe(user.email)
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('refreshes expiring sessions and stores the rotated refresh token', async () => {
    stored = JSON.stringify({ access_token: jwt(1), refresh_token: 'old-refresh' })
    const service = auth()
    expect((await service.restore(1))?.userId).toBe(user.id)
    expect(request.mock.calls[0][0]).toContain('grant_type=refresh_token')
    expect(stored).toContain('refresh')
  })
  it('rejects forged identities even if local JWT claims look valid', async () => {
    request.mockImplementation(async (input) => String(input).endsWith('/user') ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ access_token: jwt(), refresh_token: 'refresh' })))
    const service = auth()
    await expect(service.signIn(1, { email: user.email, password: 'invalid' })).rejects.toThrow('Authentication failed')
    expect(service.hasSession()).toBe(false)
  })
  it('clears local secrets and access even if remote logout fails', async () => {
    const service = auth()
    await service.signIn(1, { email: user.email, password: 'example-password' })
    request.mockImplementation(async () => { throw new Error('offline') })
    await service.signOut()
    expect(service.hasSession()).toBe(false)
    expect(stored).toBeNull()
  })
  it('cannot unlock a session that was signed out during verification', async () => {
    const service = auth()
    stored = JSON.stringify({ access_token: jwt(), refresh_token: 'refresh' })
    let finish!: (value: Response) => void
    request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const pending = service.restore(1)
    service.clearAll()
    finish(new Response(JSON.stringify(user)))
    expect(await pending).toBeNull()
    expect(service.hasSession()).toBe(false)
  })
  it('checks expiry before each privileged operation', async () => {
    vi.useFakeTimers()
    const service = auth()
    await service.signIn(1, { email: user.email, password: 'example-password' })
    vi.advanceTimersByTime(3_601_000)
    expect(() => service.requireSession(1)).toThrow('Sign in')
  })
  it('does not share a pre-logout verification with a new restore request', async () => {
    const service = auth()
    stored = JSON.stringify({ access_token: jwt(), refresh_token: 'refresh' })
    let finish!: (value: Response) => void
    request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const oldRestore = service.restore(1)
    service.clearAll()
    const newRestore = service.restore(2)
    finish(new Response(JSON.stringify(user)))
    expect(await oldRestore).toBeNull()
    expect(await newRestore).toBeNull()
    expect(service.hasSession()).toBe(false)
  })
  it('rejects incomplete sign-in responses instead of pretending confirmation is pending', async () => {
    request.mockImplementation(async () => new Response('{}'))
    await expect(auth().signIn(1, { email: user.email, password: 'example-password' })).rejects.toThrow('valid session')
  })
  it('starts in the personal workspace and switches to an org without re-authenticating', async () => {
    const service = auth()
    const result = await service.signIn(1, { email: user.email, password: 'example-password' })
    expect(result.session?.activeOrgId).toBeNull()
    const calls = request.mock.calls.length
    expect(service.setWorkspace(1, 'org-uuid').activeOrgId).toBe('org-uuid')
    expect(service.session(1)?.activeOrgId).toBe('org-uuid')
    expect(service.setWorkspace(1, null).activeOrgId).toBeNull()
    expect(request.mock.calls.length).toBe(calls) // switching is local, no network
    expect(service.accessToken()).toBe(jwt())
  })
  it('cannot switch workspace or read a token without a session', () => {
    const service = auth()
    expect(() => service.setWorkspace(1, 'org-uuid')).toThrow('Sign in')
    expect(service.accessToken()).toBeNull()
  })
})
describe('public desktop configuration', () => {
  it('accepts public keys and rejects administrative keys', () => {
    expect(isPublicSupabaseKey('sb_publishable_example')).toBe(true)
    const key = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`
    expect(isPublicSupabaseKey(key('anon'))).toBe(true)
    expect(isPublicSupabaseKey(key('service_role'))).toBe(false)
    expect(isPublicSupabaseKey('sb_secret_example')).toBe(false)
  })
  it('validates the configured origin and production CSP', () => {
    expect(cleanSupabaseUrl(url)).toBe(url)
    expect(cleanSupabaseUrl('https://user:secret@example.com')).toBe('')
    expect(cleanSupabaseUrl('https://example.com/path')).toBe('')
    expect(originOf(`${RENDERER_ORIGIN}/index.html`)).toBe(RENDERER_ORIGIN)
    // JavaScript eval stays off in production; only WebAssembly compilation (syntax highlighting) is allowed.
    expect(studioCsp(url, false)).not.toContain("'unsafe-eval'")
    expect(studioCsp(url, false)).toContain("'wasm-unsafe-eval'")
  })
})
describe('password reset', () => {
  it('reads a code or the token from a pasted reset link', async () => {
    const { recoveryBody } = await import('../src/main/auth')
    expect(recoveryBody('123456', 'a@b.co')).toEqual({ type: 'recovery', email: 'a@b.co', token: '123456' })
    expect(recoveryBody(`${url}/auth/v1/verify?token=abc123&type=recovery&redirect_to=http://localhost:3000`, '')).toEqual({ type: 'recovery', token_hash: 'abc123' })
    expect(() => recoveryBody(`${url}/auth/v1/verify?type=recovery`, '')).toThrow('no reset token')
  })
  it('verifies the link, sets the new password, then signs in', async () => {
    const service = auth()
    const result = await service.resetPassword(1, { email: user.email, code: `${url}/auth/v1/verify?token=abc&type=recovery`, password: 'new-password-1' })
    expect(result.session?.userId).toBe(user.id)
    const calls = request.mock.calls.map(([u, init]) => `${init?.method} ${String(u).replace(url, '')}`)
    expect(calls.slice(0, 2)).toEqual(['POST /auth/v1/verify', 'PUT /auth/v1/user'])
    await expect(service.resetPassword(1, { email: '', code: 'x', password: 'short' })).rejects.toThrow('8 characters')
  })
})
