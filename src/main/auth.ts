/** activeOrgId null = the user's personal workspace; a uuid = an org they belong to. */
export interface StudioSession { userId: string; sessionId: string; email: string; expiresAt: number; activeOrgId: string | null }
interface Tokens { access_token: string; refresh_token: string }
interface AuthReply { id?: string; email?: string; access_token?: string; refresh_token?: string; user_metadata?: Record<string, unknown> }
interface TokenStore { get(): string | null; set(value: string): void; clear(): void }
/** The email holds either a numeric code or a link whose `token` is the hashed token Supabase verifies. */
export function recoveryBody(code: string, email: string) {
  if (/^\d{6,10}$/.test(code)) return { type: 'recovery', email, token: code }
  let hash = code
  try { hash = new URL(code).searchParams.get('token') ?? '' } catch { /* pasted the bare token */ }
  if (!hash) throw new Error('That link has no reset token in it')
  return { type: 'recovery', token_hash: hash }
}
/** Supabase Auth REST runs in main: passwords and refresh tokens never enter logs or snapshots. */
export class StudioAuth {
  private sessions = new Map<number, StudioSession>()
  private tokens: Tokens | null = null
  private epoch = 0
  private loading: Promise<StudioSession | null> | null = null
  constructor(private url: string, private key: string, private storage: TokenStore, private request: typeof fetch = globalThis.fetch) {}
  session(id: number) {
    const current = this.sessions.get(id)
    if (!current || current.expiresAt <= Date.now()) { this.sessions.delete(id); return null }
    return current
  }
  hasSession() { return [...this.sessions.keys()].some((id) => this.session(id)) }
  requireSession(id: number) { const session = this.session(id); if (!session) throw new Error('Sign in to Ventriee Studios to continue'); return session }
  clear(id: number) { this.sessions.delete(id) }
  clearAll() { this.epoch++; this.tokens = null; this.loading = null; this.sessions.clear(); this.storage.clear() }
  private async api(path: string, body?: unknown, token?: string, method?: 'PUT'): Promise<AuthReply> {
    if (!this.url || !this.key) throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY')
    const response = await this.request(`${this.url}/auth/v1/${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'), redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { apikey: this.key, 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many requests. Wait a moment and try again.')
      throw new Error('Authentication failed. Check your details, email confirmation, and connection.')
    }
    return response.status === 204 ? {} : await response.json() as AuthReply
  }
  private async verify(tokens: Tokens): Promise<StudioSession> {
    const user = await this.api('user', undefined, tokens.access_token)
    // Decode expiry only after Supabase has authenticated the token and returned its user.
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString())
    if (typeof user.id !== 'string' || claims.sub !== user.id || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('Your session has expired')
    return { userId: user.id, sessionId: claims.session_id ?? user.id, email: user.email ?? '', expiresAt: claims.exp * 1000, activeOrgId: null }
  }
  /** The signed-in user's access token for the cloud data layer, or null when signed out. */
  accessToken() { return this.tokens?.access_token ?? null }
  /**
   * Switch the window's active workspace: null for personal, or an org id the
   * user belongs to. RLS is the real gate — this only scopes which rows the app
   * reads; it does not grant access.
   */
  setWorkspace(id: number, orgId: string | null) {
    const session = this.requireSession(id)
    session.activeOrgId = orgId
    return session
  }
  async signIn(id: number, input: { email: string; password: string }, signup = false) {
    if (!input || typeof input.email !== 'string' || !input.email.includes('@') || input.email.length > 320 || typeof input.password !== 'string' || !input.password || input.password.length > 4096) throw new Error('Enter a valid email and password')
    const epoch = ++this.epoch
    this.loading = null
    const result = await this.api(signup ? 'signup' : 'token?grant_type=password', { email: input.email.trim(), password: input.password })
    if (!result.access_token || !result.refresh_token) {
      if (!signup) throw new Error('Sign-in did not return a valid session. Try again.')
      return { session: null, message: 'Check your email to confirm your account, then sign in.' }
    }
    return { session: await this.adopt(id, { access_token: result.access_token, refresh_token: result.refresh_token }, epoch), message: '' }
  }
  private async adopt(id: number, tokens: Tokens, epoch: number) {
    const session = await this.verify(tokens)
    if (epoch !== this.epoch) throw new Error('Sign-in cancelled')
    this.tokens = tokens
    this.storage.set(JSON.stringify(tokens))
    this.sessions.set(id, session)
    return session
  }
  /** Sends Supabase's password-reset email. */
  async recover(email: string) {
    if (typeof email !== 'string' || !email.includes('@') || email.length > 320) throw new Error('Enter the email you signed up with')
    await this.api('recover', { email: email.trim() })
    return { message: 'Check your email. Copy the reset link (do not open it) or the code, and paste it below.' }
  }
  /** Signs in with the reset link or code from that email and sets a new password. */
  async resetPassword(id: number, input: { email: string; code: string; password: string }) {
    if (!input || typeof input.code !== 'string' || !input.code.trim() || input.code.length > 4096 || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 4096) throw new Error('Paste the link or code from the email, and pick a password of at least 8 characters')
    const epoch = ++this.epoch
    this.loading = null
    const result = await this.api('verify', recoveryBody(input.code.trim(), String(input.email ?? '').trim()))
    if (!result.access_token || !result.refresh_token) throw new Error('That reset link or code did not work. Request a new one.')
    await this.api('user', { password: input.password }, result.access_token, 'PUT')
    return { session: await this.adopt(id, { access_token: result.access_token, refresh_token: result.refresh_token }, epoch), message: '' }
  }
  async restore(id: number): Promise<StudioSession | null> {
    const epoch = this.epoch
    if (!this.loading) {
      const pending = (async () => {
        if (!this.tokens) {
          try { this.tokens = JSON.parse(this.storage.get() ?? 'null') } catch { this.tokens = null }
        }
        if (!this.tokens?.access_token || !this.tokens.refresh_token) return null
        const tokens = this.tokens
        let expiry = 0
        try { expiry = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString()).exp * 1000 } catch { /* invalid cache fails verification */ }
        if (expiry < Date.now() + 60_000) {
          const refreshed = await this.api('token?grant_type=refresh_token', { refresh_token: tokens.refresh_token })
          if (epoch !== this.epoch) return null
          if (!refreshed.access_token || !refreshed.refresh_token) throw new Error('Your session has expired. Sign in again.')
          this.tokens = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token }
          this.storage.set(JSON.stringify(this.tokens))
        }
        return this.verify(this.tokens!)
      })()
      this.loading = pending
      void pending.finally(() => { if (this.loading === pending) this.loading = null }).catch(() => {})
    }
    let session: StudioSession | null
    try { session = await this.loading } catch (error) { this.sessions.delete(id); throw error }
    if (epoch !== this.epoch) return null
    if (session) this.sessions.set(id, session)
    return session
  }
  /** The signed-in owner's synced preferences, kept by Supabase on their own user record (no table to set up). */
  async syncedData(): Promise<Record<string, unknown>> {
    if (!this.tokens) throw new Error('Sign in to sync settings')
    return (await this.api('user', undefined, this.tokens.access_token)).user_metadata ?? {}
  }
  async saveSyncedData(data: Record<string, unknown>) {
    if (!this.tokens) throw new Error('Sign in to sync settings')
    if (JSON.stringify(data).length > 60_000) throw new Error('Too much to sync')
    await this.api('user', { data }, this.tokens.access_token, 'PUT')
  }
  async signOut() {
    const token = this.tokens?.access_token
    this.clearAll()
    if (token) { try { await this.api('logout?scope=local', {}, token) } catch { /* Local access stays locked even offline. */ } }
  }
}
