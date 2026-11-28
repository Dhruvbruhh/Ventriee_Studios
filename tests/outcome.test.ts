import { describe, expect, it } from 'vitest'
import { outcomeReport } from '../src/main/outcome'

const t = (title: string, status = 'done') => ({ title, status })

describe('outcome report (W49)', () => {
  it('reports a clean run with what was built and where to see it', () => {
    const text = outcomeReport({
      ended: 'done',
      failed: [],
      done: [t('Login page'), t('Dashboard')],
      skipped: [],
      where: 'open http://localhost:4173'
    })
    expect(text).toContain('Run complete. Every task passed its evidence check.')
    expect(text).toContain('What was built (2): Login page; Dashboard')
    expect(text).toContain('See it: open http://localhost:4173')
    expect(text).not.toContain('Skipped')
  })

  it('lists failures first with their titles', () => {
    const text = outcomeReport({
      ended: 'done',
      failed: [t('Payments', 'failed'), t('Refunds', 'rework')],
      done: [t('Login page')],
      skipped: [],
      where: 'the result is in the project folder'
    })
    expect(text).toContain('Run finished with 2 unfinished tasks: Payments; Refunds')
    expect(text).toContain('What was built (1): Login page')
    expect(text).toContain('See it: the result is in the project folder')
  })

  it('caps the built list and counts the rest', () => {
    const done = Array.from({ length: 9 }, (_, i) => t(`Task ${i + 1}`))
    const text = outcomeReport({ ended: 'done', failed: [], done, skipped: [], where: '' })
    expect(text).toContain('What was built (9): Task 1; Task 2; Task 3; Task 4; Task 5; Task 6; +3 more')
    // No preview: no "See it" line at all.
    expect(text).not.toContain('See it')
  })

  it('keeps the paused wording and surfaces skipped items', () => {
    const text = outcomeReport({ ended: 'paused', failed: [], done: [t('Setup')], skipped: ['OAuth (no credentials)'], where: '' })
    expect(text).toContain('Run paused: every remaining task belongs to a paused worker.')
    expect(text).toContain('Skipped: OAuth (no credentials)')
  })
})
