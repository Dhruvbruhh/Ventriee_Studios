import { describe, expect, it } from 'vitest'
import { approvalTransition } from '../src/main/approval'

const task = (status: string, review = 'Awaiting owner approval. 2 files changed.') =>
  ({ status, title: 'T', review }) as Parameters<typeof approvalTransition>[0]

describe('approval gate state machine', () => {
  it('approve finishes a task in approval', () => {
    const patch = approvalTransition(task('approval'), true)
    expect(patch?.status).toBe('done')
    expect(patch?.review).toContain('Approved by owner.')
  })

  it('reject sends the task back to rework with the reason', () => {
    const patch = approvalTransition(task('approval'), false, 'wrong folder')
    expect(patch?.status).toBe('rework')
    expect(patch?.review).toContain('Owner rejected: wrong folder')
  })

  it('reject without a reason still moves the task', () => {
    const patch = approvalTransition(task('approval'), false, '   ')
    expect(patch?.status).toBe('rework')
    expect(patch?.review).toContain('without a reason')
  })

  it('ignores decisions on tasks not waiting for approval', () => {
    for (const status of ['todo', 'ready', 'running', 'review', 'rework', 'done', 'failed']) {
      expect(approvalTransition(task(status), true)).toBeNull()
      expect(approvalTransition(task(status), false, 'late')).toBeNull()
    }
  })
})
