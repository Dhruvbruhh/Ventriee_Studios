import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './lib/supabase'
import { SessionProvider } from './state/session'
import { SignIn } from './pages/SignIn'
import { ResetPassword } from './pages/ResetPassword'
import { Shell } from './Shell'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  // A recovery link must land on "set a new password", not a silent sign-in.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!isConfigured) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <div className="auth-wrap">
        <div className="state error" style={{ maxWidth: 440 }}>
          <h3>Not configured</h3>
          <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>web/.env</code>, then restart. See <code>web/README.md</code>.</p>
        </div>
      </div>
    )
  }
  if (!ready) return <div className="auth-wrap"><div className="spinner" /></div>
  if (session && recovering) return <ResetPassword onDone={() => setRecovering(false)} />
  if (!session) return <SignIn />

  return (
    <SessionProvider user={session.user} onSignedOut={() => setSession(null)}>
      <Shell />
    </SessionProvider>
  )
}
