// Small formatting helpers. No date library — Intl covers what we need.
import type { Profile } from './types'

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const DATETIME = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d)
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : DATETIME.format(d)
}

/** "in 3 days" / "2 days ago" for deadlines; empty for no date. */
export function relativeDeadline(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

/** Convert a <input type="datetime-local"> value to an ISO string, or null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Short human handle for a user when we have no profile row. */
export function shortId(id: string): string {
  return id.slice(0, 8)
}

/** Best display name for a user: "You", their name/email, else a short id. */
export function personLabel(userId: string, profiles: Map<string, Profile>, selfId?: string): string {
  if (userId === selfId) return 'You'
  const p = profiles.get(userId)
  return p?.display_name || p?.email || `User ${shortId(userId)}`
}
