import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { homepage } from './package.json'
import { cleanSupabaseUrl, isPublicSupabaseKey, studioCsp } from './src/shared/auth-config'

// Monaco vendors DOMPurify 3.2.7 (vulnerable); swap in the patched package, which has the same default export.
const patchedDompurify = {
  name: 'patched-dompurify',
  enforce: 'pre' as const,
  resolveId: (source: string) => /^\.\/dompurify\/dompurify\.js$/.test(source) ? resolve('node_modules/dompurify/dist/purify.es.mjs') : null
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_SUPABASE_')
  const url = cleanSupabaseUrl(env.VITE_SUPABASE_URL ?? '')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim() || ''
  if (key && !isPublicSupabaseKey(key)) throw new Error('Use a Supabase publishable/anon key, never a privileged key, in the desktop app')
  const csp = studioCsp(url, mode === 'development')
  const define = { __SUPABASE_URL__: JSON.stringify(url), __SUPABASE_KEY__: JSON.stringify(key), __HOMEPAGE__: JSON.stringify(homepage) }
  return {
    main: {
      define,
      plugins: [externalizeDepsPlugin()],
      build: { rollupOptions: { input: resolve('src/main/index.ts') } }
    },
    preload: {
      define,
      plugins: [externalizeDepsPlugin()],
      // Sandboxed preloads must be CommonJS: with sandbox: true the ESM
      // loader is unavailable, so the preload ships as index.cjs.
      build: { rollupOptions: { input: resolve('src/preload/index.ts'), output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
    },
    renderer: {
      define,
      envDir: resolve('.'),
      root: resolve('src/renderer'),
      // The dev prebundler ignores resolve.alias inside dependencies, so the swap is a plugin used by both.
      optimizeDeps: { rolldownOptions: { plugins: [patchedDompurify] } },
      plugins: [react(), patchedDompurify, {
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
