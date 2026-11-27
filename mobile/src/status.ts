// Pure status mapping for tasks, approvals, and commands. No React Native imports,
// so it is unit-tested directly (see __tests__/status.test.ts).
//
// The schema (0001) has no dedicated approvals table: an "approval" is a task whose
// status marks it as awaiting a human decision. Approving/rejecting just updates
// tasks.status, which RLS already permits for managers, personal owners, and the
// task's assignee. Pending-approval statuses are matched case/format-insensitively
// so the desktop can emit 'pending_approval', 'awaiting-approval', etc.

export type Tone = 'neutral' | 'progress' | 'success' | 'danger' | 'pending'

export interface StatusMeta { label: string; tone: Tone }

/** Normalize a free-form status to lower snake_case for matching ('In Progress' -> 'in_progress'). */
export function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const PENDING_APPROVAL = new Set([
  'in_review', 'pending_approval', 'awaiting_approval', 'needs_approval', 'approval_pending', 'review',
])

/** True when a task is waiting on a human approve/reject decision. */
export function isPendingApproval(status: string): boolean {
  return PENDING_APPROVAL.has(normalizeStatus(status))
}

/** The status to write on approve/reject, in the web board's vocabulary (web/src/lib/tasks.ts):
 *  approved work is completed; rejected work goes back to in progress for rework. */
export function approvalDecisionStatus(decision: 'approve' | 'reject'): string {
  return decision === 'approve' ? 'completed' : 'in_progress'
}

/** Statuses the phone can set by hand; same names as the web board. */
export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'in_review', 'completed']

const TASK_TONES: Record<string, Tone> = {
  todo: 'neutral', backlog: 'neutral', waiting: 'neutral', cancelled: 'neutral',
  in_progress: 'progress', doing: 'progress', active: 'progress',
  blocked: 'danger', rejected: 'danger', failed: 'danger',
  done: 'success', completed: 'success', approved: 'success',
  pending_approval: 'pending', awaiting_approval: 'pending', needs_approval: 'pending',
  approval_pending: 'pending', review: 'pending', in_review: 'pending',
}

/** Display label + color tone for a task/approval status. */
export function taskStatusMeta(status: string): StatusMeta {
  const key = normalizeStatus(status)
  return { label: humanize(status), tone: TASK_TONES[key] ?? 'neutral' }
}

const COMMAND_TONES: Record<string, Tone> = {
  queued: 'pending', claimed: 'progress', running: 'progress', done: 'success', failed: 'danger', expired: 'neutral',
}

/** Display label + color tone for a remote-command status. */
export function commandStatusMeta(status: string): StatusMeta {
  const key = normalizeStatus(status)
  return { label: humanize(status), tone: COMMAND_TONES[key] ?? 'neutral' }
}

/** A device is online if it checked in within the window (default 5 min). */
export function isDeviceOnline(lastSeenAt: string, now: number = Date.now(), windowMs = 5 * 60_000): boolean {
  const seen = Date.parse(lastSeenAt)
  return Number.isFinite(seen) && now - seen <= windowMs
}

/** 'pending_approval' -> 'Pending approval'. */
export function humanize(status: string): string {
  const words = normalizeStatus(status).split('_').filter(Boolean)
  if (words.length === 0) return 'Unknown'
  return words.join(' ').replace(/^./, (c) => c.toUpperCase())
}
