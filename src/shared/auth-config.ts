declare const __SUPABASE_URL__: string
declare const __SUPABASE_KEY__: string
export const supabaseUrl = typeof __SUPABASE_URL__ === 'string' ? cleanSupabaseUrl(__SUPABASE_URL__) : ''
export const supabaseKey = typeof __SUPABASE_KEY__ === 'string' && isPublicSupabaseKey(__SUPABASE_KEY__) ? __SUPABASE_KEY__.trim() : ''
export function isPublicSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { return false }
}
export const RENDERER_SCHEME = 'ventriee-studios'
export const RENDERER_HOST = 'renderer'
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`
export function cleanSupabaseUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return ''
    return url.origin
  } catch { return '' }
}
export function originOf(value: string): string | null {
  try { const url = new URL(value); return `${url.protocol}//${url.host}` } catch { return null }
}
export function studioCsp(url: string | null, development: boolean): string {
  return ["default-src 'self'", `script-src 'self' 'wasm-unsafe-eval' ${development ? "'unsafe-eval' 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https://open-vsx.org",
    "font-src 'self' data:", `connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* ${url ? cleanSupabaseUrl(url) : ''}`,
    "frame-src 'self' http://localhost:* http://127.0.0.1:* data: blob:", "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ')
}
