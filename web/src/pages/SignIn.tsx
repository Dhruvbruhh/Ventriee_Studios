import { useState } from 'react'
import { Button, Card, Field } from '../components/ui'
import { resetPassword, signIn } from '../lib/api'

/** Email + password sign-in against the same Supabase users as the desktop app. */
export function SignIn() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await resetPassword(email)
        setSent(true)
      } else {
        await signIn(email.trim(), password)
        // onAuthStateChange in App picks up the new session.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="brand">Ventriee<span>.</span></div>
        <div className="tagline">Agency dashboard</div>
        <form onSubmit={submit}>
          {sent ? (
            <p style={{ fontSize: 14 }}>
              If that email has an account, a reset link is on its way. Check your inbox,
              then <button type="button" className="link" onClick={() => { setMode('signin'); setSent(false) }}>sign in</button>.
            </p>
          ) : (
            <>
              {error && <div className="form-error">{error}</div>}
              <Field label="Email">
                <input type="email" autoComplete="email" value={email} required
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
              </Field>
              {mode === 'signin' && (
                <Field label="Password">
                  <input type="password" autoComplete="current-password" value={password} required
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </Field>
              )}
              <Button type="submit" variant="primary" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
                {busy ? (mode === 'forgot' ? 'Sending…' : 'Signing in…') : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
              </Button>
            </>
          )}
        </form>
        {!sent && (
          <p className="faint" style={{ textAlign: 'center', marginTop: 18, fontSize: 12.5 }}>
            {mode === 'forgot' ? (
              <button type="button" className="link" onClick={() => { setMode('signin'); setError(null) }}>Back to sign in</button>
            ) : (
              <>
                <button type="button" className="link" onClick={() => { setMode('forgot'); setError(null) }}>Forgot password?</button>
                {' · '}Same account as the Ventriee desktop app.
              </>
            )}
          </p>
        )}
      </Card>
    </div>
  )
}
