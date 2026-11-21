import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { App } from './App'
import { guard, resetStudio, useStore, cleanError } from './store'
import { supabaseUrl, supabaseKey } from '../../shared/auth-config'
import { IconSignOut } from './icons'

function Screen({ children }: { children: ReactNode }) {
  return <main className="auth-screen"><section className="auth-intro">
    <div className="auth-brand"><div className="brand-mark" aria-hidden="true" />Ventriee Studios</div>
    <h1>Ideas become<br /><span>real work.</span></h1>
    <p>Plan your next project, bring your agents together, and build in a workspace on your computer.</p>
    <div className="auth-footnote">Your project files stay on this device. Supabase manages sign-in.</div>
  </section><section className="auth-card" aria-label="Account access">{children}</section></main>
}
export function AuthRoot() {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [hadSession, setHadSession] = useState(false)
  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function restore() {
    try {
      const session = await window.ventriee.authStatus()
      setSignedIn(Boolean(session)); if (session) setHadSession(true); setError('')
    } catch { setSignedIn(false); setError('Unable to verify sign-in. Check your connection and try again.') }
    finally { setReady(true) }
  }
  useEffect(() => {
    let alive = true
    void window.ventriee.authStatus().then((session) => {
      if (alive) { setSignedIn(Boolean(session)); setHadSession(Boolean(session)); setReady(true) }
    }).catch(() => { if (alive) { setError('Unable to restore sign-in. Check your connection.'); setReady(true) } })
    const off = window.ventriee.onAuthLocked(() => { setSignedIn(false); setHadSession(false); resetStudio() })
    return () => { alive = false; off() }
  }, [])
  useEffect(() => {
    if (!signedIn) return
    const timer = setInterval(() => void restore(), 30_000)
    return () => clearInterval(timer)
  }, [signedIn])
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const result = await window.ventriee.authSignIn({ email, password }, signup)
      setPassword(''); setSignedIn(Boolean(result.session)); if (result.session) setHadSession(true); setMessage(result.message)
    } catch (reason) { setError(cleanError(reason)) }
    finally { setBusy(false) }
  }
  if (!supabaseUrl || !supabaseKey) return <Screen><h2>Connect Supabase</h2>
    <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code>, then restart.</p>
    <p>See <code>docs/supabase-authentication.md</code>. Use a public publishable or legacy anon key.</p></Screen>
  if (!ready) return <Screen><h2>Opening your studio</h2><p role="status">Restoring your account…</p></Screen>
  return <>{hadSession ? <div className="authenticated-studio" style={{ display: signedIn ? undefined : 'none' }}><App /></div> : null}
  {!signedIn ? <Screen><h2>{signup ? 'Create your account' : 'Sign in to your studio'}</h2>
    <form onSubmit={(event) => void submit(event)} className="auth-form">
      <label className="field">Email<input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} /></label>
      <label className="field">Password<input className="input" type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={signup ? 8 : 1} required disabled={busy} /></label>
      {error ? <p className="editor-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
      <button className="btn primary" disabled={busy} type="submit">{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
      <button className="btn" type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); setMessage('') }}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</button>
      <button className="btn" type="button" disabled={busy} onClick={() => void restore()}>Retry saved session</button>
    </form></Screen> : null}</>
}
export function AccountButton() {
  const [busy, setBusy] = useState(false)
  return <button className="btn ghost tiny side-signout" disabled={busy} title="Sign out of Ventriee" onClick={() => {
    if (useStore.getState().editorDirty && !window.confirm('You have unsaved edits. Sign out and discard them?')) return
    setBusy(true)
    void guard(() => window.ventriee.authClear()).finally(() => setBusy(false))
  }}><IconSignOut />{busy ? 'Signing out…' : 'Sign out'}</button>
}
