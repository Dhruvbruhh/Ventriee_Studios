/** Accent presets offered in Settings → Appearance; '' is the theme's own accent. */
export const ACCENT_PRESETS: string[] = ['#f07a35', '#6a4bd6', '#2563c9', '#0f766e', '#11815a', '#b0600f', '#c0392b', '#db2777']

/** Keep only a well-formed hex colour; anything else resets to the theme default. */
export function normaliseAccent(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value.toLowerCase() : ''
}
