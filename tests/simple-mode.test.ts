import { describe, expect, it } from 'vitest'
import { simplePhase } from '../src/renderer/src/components/SimpleMode'
import type { PromptDoc, Task } from '../src/shared/types'

const prompt = { id: 'p1' } as PromptDoc
const task = (status: Task['status']): Task => ({ id: `t-${status}-${Math.random()}`, status } as Task)

describe('simplePhase: chat → plan → build → done gate', () => {
  it('starts in chat when nothing exists', () => {
    expect(simplePhase({ tasks: [], prompts: [], running: false })).toBe('chat')
  })

  it('moves to plan once a plan is generated but no work has started', () => {
    expect(simplePhase({ tasks: [], prompts: [prompt], running: false })).toBe('plan')
  })

  it('is building while a run is active, even if some tasks are already done', () => {
    expect(simplePhase({ tasks: [task('done'), task('running')], prompts: [prompt], running: true })).toBe('building')
  })

  it('stays building when the run stopped with unfinished (failed) tasks', () => {
    expect(simplePhase({ tasks: [task('done'), task('failed')], prompts: [prompt], running: false })).toBe('building')
  })

  it('reports done only when the run stopped and every task is done', () => {
    expect(simplePhase({ tasks: [task('done'), task('done')], prompts: [prompt], running: false })).toBe('done')
  })

  it('is not done while a task still waits for approval', () => {
    expect(simplePhase({ tasks: [task('done'), task('approval')], prompts: [prompt], running: false })).toBe('building')
  })
})
