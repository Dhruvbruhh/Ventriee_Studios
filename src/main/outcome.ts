/** Owner-facing outcome report when a run finishes (W49). Pure text, easy to test. */

export interface OutcomeTask {
  title: string
  status: string
}

export interface OutcomeInput {
  ended: 'done' | 'paused' | 'stopped'
  failed: OutcomeTask[]
  done: OutcomeTask[]
  skipped: string[]
  /** Where the owner can see the result: a preview URL or the project folder. */
  where: string
}

const CAP = 6

/** One dense message: what was built, how to see it, what needs attention. */
export function outcomeReport(input: OutcomeInput): string {
  const lines: string[] = []
  if (input.failed.length) {
    lines.push(`Run finished with ${input.failed.length} unfinished task${input.failed.length === 1 ? '' : 's'}: ${input.failed.map((t) => t.title).join('; ')}`)
  } else if (input.ended === 'paused') {
    lines.push('Run paused: every remaining task belongs to a paused worker.')
  } else {
    lines.push('Run complete. Every task passed its evidence check.')
  }

  if (input.done.length) {
    const titles = input.done.slice(0, CAP).map((t) => t.title).join('; ')
    lines.push(`\nWhat was built (${input.done.length}): ${titles}${input.done.length > CAP ? `; +${input.done.length - CAP} more` : ''}`)
  }
  if (input.where) lines.push(`\nSee it: ${input.where}`)
  if (input.skipped.length) lines.push(`\nSkipped: ${input.skipped.join('; ')}`)
  return lines.join('\n')
}
