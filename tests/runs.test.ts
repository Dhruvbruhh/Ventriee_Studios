import { describe, expect, it } from 'vitest'
import { summarizeRuns } from '../src/main/runs'
import type { Agent, Job, SessionRecord } from '../src/shared/types'

const job = (id: string, createdAt: number, status = 'done'): Job => ({ id, projectId: 'p', instruction: id, status, planSource: 'model', createdAt, updatedAt: createdAt + 50, error: null } as Job)
const session = (agentId: string, startedAt: number, model: string, costUsd = 0, tokens = 100): SessionRecord => ({
  id: `s${startedAt}`, projectId: 'p', agentId, taskId: null, engine: 'api-openrouter', model, cwd: '', reasoning: 'auto', status: 'done', exitCode: 0,
  inputTokens: tokens, outputTokens: tokens, costUsd, externalId: null, command: '', startedAt, endedAt: startedAt + 10_000 } as SessionRecord)

describe('run usage summary', () => {
  it('assigns sessions to the run they started in and totals them by model and worker', () => {
    const agents = [{ id: 'a1', name: 'Kai' }, { id: 'a2', name: 'Iris' }] as Agent[]
    const runs = summarizeRuns([job('first', 1000), job('second', 5000, 'running')],
      [session('a1', 1100, 'cheap', 0.01), session('a2', 1200, 'strong', 0.2), session('a1', 5100, 'cheap')], agents)
    expect(runs.map((r) => r.jobId)).toEqual(['second', 'first'])
    const first = runs[1]
    expect(first).toMatchObject({ sessions: 2, inputTokens: 200, costReported: true, endedAt: 1050 })
    expect(first.costUsd).toBeCloseTo(0.21)
    expect(first.byModel.map((m) => m.name)).toEqual(['api-openrouter · strong', 'api-openrouter · cheap'])
    expect(first.byAgent.map((a) => [a.name, a.seconds])).toEqual([['Iris', 10], ['Kai', 10]])
    expect(runs[0]).toMatchObject({ sessions: 1, costReported: false, endedAt: null })
  })
})
