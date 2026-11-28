import type { Task } from '../shared/types'

/**
 * The approval gate's state machine. A task in `approval` waits for the owner:
 * approve finishes it (the run resumes past the gate), reject sends it back to
 * the worker as rework (this attempt stops). Anything not in `approval` is a
 * no-op, so a stale Inspector cannot double-apply a decision.
 */
export function approvalTransition(
  task: Pick<Task, 'status' | 'title' | 'review'>,
  approved: boolean,
  reason = ''
): Partial<Task> | null {
  if (task.status !== 'approval') return null
  if (approved) {
    return { status: 'done', review: `${task.review}\nApproved by owner.`.trim() }
  }
  const why = reason.trim() ? `Owner rejected: ${reason.trim()}` : 'Owner rejected without a reason'
  return { status: 'rework', review: why }
}
