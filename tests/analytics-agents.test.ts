import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import type { Agent } from '../src/shared/types'

const store = () => new Store(join(mkdtempSync(join(tmpdir(), 'ventriee-analytics-')), 'ventriee.db'))

const agent = (id: string, name: string, role: string): Agent => ({
  id, projectId: 'prj_1', role, name, title: name, engine: 'api-anthropic', model: '', endpoint: '',
  instructions: '', autonomy: 'scoped', reasoning: 'auto', skills: [], mcpServers: [], concurrency: 1,
  budgetUsd: 5, color: '#888888', desk: 1, enabled: true, status: 'idle', currentTaskId: null,
  lastError: null, createdAt: Date.now()
})

const session = (id: string, over: Partial<Parameters<Store['insertSession']>[0]> = {}) => ({
  id,
  projectId: 'prj_1',
  agentId: null as string | null,
  taskId: null as string | null,
  engine: 'api-anthropic',
  model: 'claude-sonnet-4',
  cwd: process.cwd(),
  reasoning: 'auto',
  status: 'done',
  exitCode: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  externalId: null,
  command: '',
  startedAt: Date.now(),
  endedAt: Date.now() + 1000,
  ...over
})

describe('analyticsOverview', () => {
  it('aggregates sessions per worker with names, cost and time', () => {
    const s = store()
    s.insertAgent(agent('agt_1', 'Frontend Fran', 'frontend'))
    s.insertSession(session('s1', { agentId: 'agt_1', costUsd: 0.5, startedAt: 1_000, endedAt: 61_000 }))
    s.insertSession(session('s2', { agentId: 'agt_1', costUsd: 0.25, startedAt: 2_000, endedAt: 32_000 }))
    s.insertSession(session('s3', { agentId: 'gone', costUsd: 0.75, startedAt: 3_000, endedAt: 63_000 }))

    const overview = s.analyticsOverview(0)
    const fran = overview.byAgent.find((r) => r.name === 'Frontend Fran')
    expect(fran).toMatchObject({ sessions: 2, costUsd: 0.75, seconds: 90 })
    const gone = overview.byAgent.find((r) => r.name === 'unknown')
    expect(gone).toMatchObject({ sessions: 1, costUsd: 0.75, seconds: 60 })
    s.db.close()
  })

  it('keeps worker rows out of a window that predates them', () => {
    const s = store()
    s.insertAgent(agent('agt_1', 'Old Worker', 'qa'))
    s.insertSession(session('s1', { agentId: 'agt_1', startedAt: 1, endedAt: 2 }))
    const overview = s.analyticsOverview(Date.now() + 10_000)
    expect(overview.byAgent).toEqual([])
    s.db.close()
  })
})
