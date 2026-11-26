// A small dark palette so the app reads as one calm assistant surface, not a website.
// Tones map 1:1 to the status tones in status.ts.
import type { Tone } from './status'

export const colors = {
  bg: '#0b0f14',
  surface: '#141b24',
  surfaceAlt: '#1b242f',
  border: '#243041',
  text: '#eef3f8',
  textDim: '#8ea0b5',
  accent: '#5b9dff',
  accentDim: '#27374e',
  danger: '#ff6b6b',
  success: '#49d49d',
  warning: '#f2c14e',
}

/** Foreground color for a status chip of the given tone. */
export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'success': return colors.success
    case 'danger': return colors.danger
    case 'progress': return colors.accent
    case 'pending': return colors.warning
    default: return colors.textDim
  }
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
export const radius = { sm: 8, md: 12, lg: 16 }
