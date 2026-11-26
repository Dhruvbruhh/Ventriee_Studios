import { useState } from 'react'
import { Button, Card, Field } from '../components/ui'
import { signIn } from '../lib/api'

/** Email + password sign-in against the same Supabase users as the desktop app. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      // onAuthStateChange in App picks up the new session.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="brand">Ventriee<span>.</span></div>
        <div className="tagline">Agency dashboard</div>
        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <Field label="Email">
            <input type="email" autoComplete="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
          </Field>
          <Field label="Password">
            <input type="password" autoComplete="current-password" value={password} required
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <Button type="submit" variant="primary" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="faint" style={{ textAlign: 'center', marginTop: 18, fontSize: 12.5 }}>
          Same account as the Ventriee desktop app.
        </p>
      </Card>
    </div>
  )
}
