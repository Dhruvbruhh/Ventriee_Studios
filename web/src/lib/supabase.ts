import { createClient } from '@supabase/supabase-js'

// Public connection values, injected at build time. The publishable/anon key is
// safe in the browser: RLS, not this key, decides what each signed-in user sees.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

/** True when the app is configured; the UI shows a setup message otherwise. */
export const isConfigured = Boolean(url && key)

// A single client; it persists the session in localStorage and refreshes tokens.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
})
