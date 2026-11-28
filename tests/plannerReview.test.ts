import { describe, expect, it } from 'vitest'
import { REVIEW_SYSTEM, buildReviewAsk, parseFollowUp, reviewNotes } from '../src/main/plannerReview'

describe('planner review (W48)', () => {
  it('builds a review ask with evidence and files touched', () => {
    const ask = buildReviewAsk({ title: 'Add login', acceptance: 'User can log in', evidence: 'no files changed', outputTail: 'I thought about it', changedFiles: ['src/a.ts'] })
    expect(ask).toContain('Task: Add login')
    expect(ask).toContain('Acceptance criteria: User can log in')
    expect(ask).toContain('Files touched: src/a.ts')
    expect(ask).toContain('I thought about it')
    expect(buildReviewAsk({ title: 'T', acceptance: 'A', evidence: 'E', outputTail: '', changedFiles: [] })).toContain('Files touched: none')
  })

  it('keeps only usable follow-ups', () => {
    expect(parseFollowUp('short')).toBeNull()
    expect(parseFollowUp('   ')).toBeNull()
    const good = 'Change src/auth.ts: the token check runs before the redirect; move it after validateSession() and re-run the tests.'
    expect(parseFollowUp(good)).toBe(good)
    // Fences are stripped.
    expect(parseFollowUp('```\n' + good + '\n```')).toBe(good)
    // Long replies are capped.
    expect(parseFollowUp('x'.repeat(2000))!.length).toBe(1200)
  })

  it('gives fixer notes only to rework attempts', () => {
    expect(reviewNotes('running', 'do X')).toBe('')
    expect(reviewNotes('rework', null)).toBe('')
    expect(reviewNotes('rework', 'Check src/db.ts: the migration never ran.')).toContain('## Fixer notes from your last attempt')
    expect(reviewNotes('rework', 'Check src/db.ts.')).toContain('Check src/db.ts.')
  })

  it('the review system prompt forbids approving and demands specificity', () => {
    expect(REVIEW_SYSTEM).toMatch(/follow-up/i)
    expect(REVIEW_SYSTEM).toMatch(/Do not approve/i)
  })

  it('simulates the fail-then-succeed loop: the retry prompt carries the follow-up', () => {
    // First attempt: no deliverable, planner writes a follow-up.
    const attempt1 = { evidence: { passed: false, summary: 'no deliverable found', changed: [] as string[] }, reply: 'I analysed the codebase' }
    const followUp = parseFollowUp('In src/app.ts the export is missing; add `export default app` after the routes are registered.')
    expect(followUp).toBeTruthy()
    const retryNotes = reviewNotes('rework', `Planner follow-up: ${followUp}`)
    expect(retryNotes).toContain('export default app')
    // Second attempt: the notes appear in a prompt whose task is in rework; success clears them.
    const succeeded = { evidence: { passed: true, summary: 'deliverable written', changed: ['src/app.ts'] }, status: 'review' }
    expect(reviewNotes(succeeded.status, null)).toBe('')
    expect(attempt1.evidence.passed).toBe(false)
  })
})
