import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import type { Agent, Project } from '../src/shared/types'
import type { Plan } from '../src/main/planner'
import { withSquad } from './fixtures/squad'

function setup() {
  const userData = mkdtempSync(join(tmpdir(), 'ventriee-roster-'))
  const store = withSquad(new Store(join(userData, 'ventriee.db')))
  store.saveSettings({ ...store.settings(), orchestratorEngine: 'api-anthropic', orchestratorModel: 'owner-chosen-model' })
  const project = store.createProject({ name: 'Roster', path: userData, description: '' })
  const orchestrator = new Orchestrator({
    store, memory: new MemoryService(store, userData), creds: new Credentials(store.db), emit: new EventEmitter(),
    notify: () => {}, isProjectOpen: () => false, models: () => [], providerConfigs: () => []
  })
  return { store, project, orchestrator }
}

const persist = (o: Orchestrator, project: Project, plan: Plan, roster: Agent[]) =>
  (o as unknown as { persistPlan: (p: Project, plan: Plan, r: Agent[]) => number }).persistPlan(project, plan, roster)

const plan = (roles: string[]): Plan => ({
  summary: 's', source: 'model', skipped: [],
  tasks: roles.map((role, i) => ({ key: `t${i}`, title: role, description: '', acceptance: '', role, phase: 'build', dependsOnKeys: [] }))
})

describe('on-demand roster', () => {
  it('starts a project with the orchestrator only, on the configured engine', () => {
    const { store, project, orchestrator } = setup()
    const roster = orchestrator.ensureRoster(project)
    expect(roster.map((a) => a.role)).toEqual(['orchestrator'])
    expect(store.agents(project.id)[0]).toMatchObject({ engine: 'api-anthropic', model: 'owner-chosen-model' })
  })

  it('hires each planned role once and leaves roles the owner disabled alone', () => {
    const { store, project, orchestrator } = setup()
    const roster = orchestrator.ensureRoster(project)
    persist(orchestrator, project, plan(['frontend', 'backend', 'frontend']), roster)
    const hired = store.agents(project.id)
    expect(hired.map((a) => a.role).sort()).toEqual(['backend', 'frontend', 'orchestrator'])
    expect(new Set(hired.map((a) => a.desk)).size).toBe(3)
    expect(store.tasks(project.id).every((t) => t.agentId)).toBe(true)

    const backend = hired.find((a) => a.role === 'backend')!
    store.updateAgent(backend.id, { enabled: false })
    persist(orchestrator, project, plan(['backend']), store.agents(project.id))
    expect(store.agents(project.id).filter((a) => a.role === 'backend')).toHaveLength(1)
  })
})
