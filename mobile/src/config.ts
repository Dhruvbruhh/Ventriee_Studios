// Supabase connection config. Supply the SAME project the desktop app uses so the
// mobile app signs in the same users and reads the same rows.
//
// Set these before running: either EXPO_PUBLIC_SUPABASE_URL /
// EXPO_PUBLIC_SUPABASE_ANON_KEY env vars (see .env.example), or app.json > extra.
// The anon/publishable key is a public client key — never put a service_role key here.
import Constants from 'expo-constants'

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string }

export const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '').trim()
export const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseKey ?? '').trim()

/** True once a Supabase project is configured. The UI shows a setup notice otherwise. */
export const isConfigured = Boolean(supabaseUrl && supabaseKey)
