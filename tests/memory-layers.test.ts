import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { MIN_OUTCOME_SAMPLES, routeModel } from '../src/main/routing'
import type { ModelOption, ModelOutcomeStat, Task } from '../src/shared/types'

function setup() {
  const userData = mkdtempSync(join(tmpdir(), 'ventriee-w18-'))
  const store = new Store(join(userData, 'ventriee.db'))
  return { store, memory: new MemoryService(store, userData), userData }
}

describe('organization memory layer', () => {
  it('shows org docs only to projects in that org', () => {
    const { store, memory, userData } = setup()
    const inA = store.createProject({ name: 'A1', path: userData, description: '', orgId: 'org-a' })
    const inB = store.createProject({ name: 'B1', path: userData, description: '', orgId: 'org-b' })
    const personal = store.createProject({ name: 'Me', path: userData, description: '' })
    memory.save({ path: 'orgs/org-a/brand.md', title: 'A brand voice', body: 'Brand voice: terse and warm.', scope: 'org', orgId: 'org-a' })
    memory.save({ path: 'global/x.md', title: 'Global', body: 'Brand voice everywhere.', scope: 'global' })

    const paths = (projectId: string) => store.memories(projectId).map((m) => m.path)
    expect(paths(inA.id)).toContain('orgs/org-a/brand.md')
    expect(paths(inB.id)).not.toContain('orgs/org-a/brand.md')
    expect(paths(personal.id)).not.toContain('orgs/org-a/brand.md')
    expect(paths(personal.id)).toContain('global/x.md')
    expect(memory.retrieve(inA.id, 'brand voice').map((m) => m.path)).toContain('orgs/org-a/brand.md')
    expect(memory.retrieve(inB.id, 'brand voice').map((m) => m.path)).not.toContain('orgs/org-a/brand.md')
    expect(existsSync(join(userData, 'memory', 'orgs', 'org-a', 'brand.md'))).toBe(true)
  })

  it('bootstraps an org standards doc and re-imports org files with their org', () => {
    const { store, memory, userData } = setup()
    const project = store.createProject({ name: 'A1', path: userData, description: '', orgId: 'org-a' })
    memory.bootstrap(project)
    store.db.run('DELETE FROM memories')
    memory.reindex()
    const doc = store.memories(project.id).find((m) => m.path === 'orgs/org-a/standards.md')
    expect(doc?.scope).toBe('org')
    expect(doc?.orgId).toBe('org-a')
  })
})

describe('memory version history', () => {
  it('keeps every content change with source and task, and restores an old version', () => {
    const { store, memory } = setup()
    const v1 = memory.save({ path: 'global/n.md', title: 'Notes', body: 'first', scope: 'global', source: 'owner' })
    memory.save({ ...v1, body: 'second', source: 'agent:agt_1' }, 'tsk_9')
    memory.save({ ...v1, body: 'second', pinned: true }) // metadata only: no new version

    const versions = store.memoryVersions(v1.id)
    expect(versions.map((v) => v.body)).toEqual(['second', 'first'])
    expect(versions[0]).toMatchObject({ source: 'agent:agt_1', taskId: 'tsk_9' })
    expect(versions[1]).toMatchObject({ source: 'owner', taskId: null })

    const restored = memory.save({ ...store.memory(v1.id)!, body: versions[1]!.body, source: 'owner:restore' })
    expect(restored.body).toBe('first')
    expect(store.memoryVersions(v1.id).map((v) => v.body)).toEqual(['first', 'second', 'first'])
  })

  it('saves the pre-history state of an existing doc before its first change', () => {
    const { store, memory } = setup()
    const doc = memory.save({ path: 'global/old.md', title: 'Old', body: 'original', scope: 'global', source: 'bootstrap' })
    store.db.run('DELETE FROM memory_versions') // as if written before W18
    memory.appendProgress('prj_x', 'did a thing', 'tsk_1')
    memory.save({ ...doc, body: 'edited', source: 'owner' })
    expect(store.memoryVersions(doc.id).map((v) => `${v.source}:${v.body}`)).toEqual(['owner:edited', 'bootstrap:original'])
    expect(store.memoryVersions(store.memories('prj_x').find((m) => m.path === 'projects/prj_x/progress.md')!.id)[0]).toMatchObject({ source: 'orchestrator', taskId: 'tsk_1' })
  })
})

describe('measured routing', () => {
  const task = (id: string): Task => ({
    id, projectId: 'p', parentId: null, title: id, description: '', acceptance: '', role: 'frontend', agentId: 'w', status: 'done',
    dependsOn: [], output: '', review: '', attempts: 0, phase: 'build', engine: null, model: null, endpoint: null, routedBy: null,
    difficulty: 'medium', skills: [], createdAt: 0, updatedAt: 0
  })

  it('records the worker model, tokens and latency of a finished task', () => {
    const { store } = setup()
    store.insertTask(task('t1'))
    const base = { projectId: 'p', taskId: 't1', engine: 'api-openrouter' as const, cwd: '', status: 'done' as const, exitCode: 0, costUsd: 0, externalId: null, command: '' }
    store.insertSession({ ...base, id: 's1', agentId: 'w', model: 'model-a', inputTokens: 100, outputTokens: 50, startedAt: 1000, endedAt: 4000 })
    store.insertSession({ ...base, id: 's2', agentId: 'reviewer', model: 'model-r', inputTokens: 9, outputTokens: 9, startedAt: 5000, endedAt: 6000 })
    store.recordModelOutcome('t1', 'w', 'passed')
    store.recordModelOutcome('t1', 'w', 'rework')
    expect(store.modelOutcomeStats()).toEqual([
      { model: 'model-a', role: 'frontend', difficulty: 'medium', samples: 2, passed: 1, rework: 1, failed: 0, avgTokens: 150, avgLatencyMs: 3000 }
    ])
  })

  const opt = (model: string): ModelOption => ({ provider: 'api-openrouter', providerLabel: 'OpenRouter', model, free: null, configured: true })
  // Same capability profile, so only measurements can separate them; alphabetical tie-break picks a-model.
  const models = [opt('a-model-pro'), opt('b-model-pro')]
  const stat = (model: string, samples: number, passed: number): ModelOutcomeStat =>
    ({ model, role: 'frontend', difficulty: 'medium', samples, passed, rework: samples - passed, failed: 0, avgTokens: 0, avgLatencyMs: 0 })
  const route = (outcomes: ModelOutcomeStat[]) => routeModel({ role: 'frontend', models, costPreference: 'balanced', difficulty: 'medium', outcomes })!

  it('ignores measurements below the threshold', () => {
    const n = MIN_OUTCOME_SAMPLES - 1
    const choice = route([stat('a-model-pro', n, 0), stat('b-model-pro', n, n)])
    expect(choice.option.model).toBe('a-model-pro')
    expect(choice.reason).toContain(`(<${MIN_OUTCOME_SAMPLES}, ignored)`)
  })

  it('prefers the measured-better model once past the threshold, and says why', () => {
    const n = MIN_OUTCOME_SAMPLES
    const choice = route([stat('a-model-pro', n, 1), stat('b-model-pro', n, n)])
    expect(choice.option.model).toBe('b-model-pro')
    expect(choice.reason).toContain(`measured ${n}/${n} passed (+2.8)`)
  })

  it('caps the measured term so a few samples cannot outweigh capability', () => {
    // Perfect record on a weak, flash-class model vs. a strong one with no data, on a high-difficulty task.
    const outcomes = [{ ...stat('tiny-flash', MIN_OUTCOME_SAMPLES, MIN_OUTCOME_SAMPLES), difficulty: 'high' }]
    const choice = routeModel({ role: 'frontend', models: [opt('tiny-flash'), opt('claude-opus-4')], costPreference: 'balanced', difficulty: 'high', outcomes })!
    expect(choice.option.model).toBe('claude-opus-4')
  })
})
