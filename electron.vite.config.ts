import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { cleanSupabaseUrl, isPublicSupabaseKey, studioCsp } from './src/shared/auth-config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_')
  const url = cleanSupabaseUrl(env.VITE_SUPABASE_URL ?? '')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim() || ''
  if (key && !isPublicSupabaseKey(key)) throw new Error('Use a Supabase publishable/anon key, never a privileged key, in the desktop app')
  const csp = studioCsp(url, mode === 'development')
  const define = { __SUPABASE_URL__: JSON.stringify(url), __SUPABASE_KEY__: JSON.stringify(key) }
  return {
    main: {
      define,
      plugins: [externalizeDepsPlugin()],
      build: { rollupOptions: { input: resolve('src/main/index.ts') } }
    },
    preload: {
      define,
      plugins: [externalizeDepsPlugin()],
      build: { rollupOptions: { input: resolve('src/preload/index.ts') } }
    },
    renderer: {
      define,
      envDir: resolve('.'),
      root: resolve('src/renderer'),
      plugins: [react(), {
        name: 'studio-auth-csp',
        transformIndexHtml: (html) => html.replace('__STUDIO_CSP__', csp)
      }],
      server: { host: 'localhost', port: 5173, strictPort: true },
      build: {
        rollupOptions: { input: resolve('src/renderer/index.html') }
      }
    }
  }
})
