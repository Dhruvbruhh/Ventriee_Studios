/**
 * W48: after a worker attempt that did not deliver, the planner reviews the
 * evidence and writes a specific follow-up prompt for the next attempt, so the
 * retry fixes what was actually wrong instead of repeating the same brief.
 */

export const REVIEW_SYSTEM = `You are the planning lead reviewing a worker's failed attempt at a task.
Write a short, specific follow-up instruction for the SAME worker so the next attempt succeeds.
Base it only on the evidence given. Name the files to change and what to do in each.
Do not restate the whole task. Do not approve. Reply with the instruction only, at most 6 lines.`

/** The review request: task, acceptance, evidence, what the worker actually said. */
export function buildReviewAsk(input: {
  title: string
  acceptance: string
  evidence: string
  outputTail: string
  changedFiles: string[]
}): string {
  return [
    `Task: ${input.title}`,
    `Acceptance criteria: ${input.acceptance}`,
    `Attempt evidence: ${input.evidence}`,
    input.changedFiles.length ? `Files touched: ${input.changedFiles.slice(0, 20).join(', ')}` : 'Files touched: none',
    `Worker's reply tail:\n${input.outputTail.slice(-2000) || '(nothing usable)'}`,
    '',
    'Write the follow-up instruction for the next attempt.'
  ].join('\n\n')
}

/** The model's reply is the follow-up, trimmed and capped; null when it said nothing usable. */
export function parseFollowUp(reply: string): string | null {
  const text = reply.trim().replace(/^```[a-z]*\n?|```$/g, '').trim()
  if (text.length < 20) return null
  return text.slice(0, 1200)
}

/** The retry prompt's fixer-notes section; empty on first attempts. */
export function reviewNotes(status: string, review: string | null | undefined): string {
  const text = status === 'rework' ? (review ?? '').trim() : ''
  if (!text) return ''
  return `\n## Fixer notes from your last attempt\n${text}\nAddress these points before anything else.\n`
}
