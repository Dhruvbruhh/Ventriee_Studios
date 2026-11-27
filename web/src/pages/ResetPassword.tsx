import { useState } from 'react'
import { Button, Card, Field } from '../components/ui'
import { updatePassword } from '../lib/api'

/** Shown after following a recovery link: set a new password, then sign in with it. */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="brand">Ventriee<span>.</span></div>
        <div className="tagline">Choose a new password</div>
        {done ? (
          <p style={{ fontSize: 14 }}>
            Password updated.{' '}
            <button type="button" className="link" onClick={onDone}>Sign in</button>
          </p>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            <Field label="New password">
              <input type="password" autoComplete="new-password" value={password} required minLength={8}
                onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </Field>
            <Button type="submit" variant="primary" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
