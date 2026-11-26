// The one Supabase client for the app. Uses AsyncStorage to persist the session and
// auto-refresh tokens, so the user stays signed in across launches (like the desktop's
// token cache). RLS on the server scopes every query to what the user may see.
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabaseKey } from './config'

// Fall back to harmless placeholders when unconfigured so import never throws; the UI
// gates on isConfigured and shows a setup notice instead of making real calls.
export const supabase = createClient(supabaseUrl || 'http://localhost', supabaseKey || 'public-anon-key', {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
