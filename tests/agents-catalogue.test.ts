import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import { ROLE_TEMPLATES } from '../src/main/roles'
import { DEFAULT_DEPARTMENTS, parseManifest, toManifest } from '../src/shared/agents'
import type { Agent, Project } from '../src/shared/types'
import type { Plan } from '../src/main/planner'
import { withSquad } from './fixtures/squad'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ventriee-agents-'))
  const store = withSquad(new Store(join(dir, 'ventriee.db')))
  store.saveSettings({ ...store.settings(), orchestratorEngine: 'api-anthropic', orchestratorModel: 'studio-model' })
  const project = store.createProject({ name: 'Catalogue', path: dir, description: '' })
  const orchestrator = new Orchestrator({
    store, memory: new MemoryService(store, dir), creds: new Credentials(store.db), emit: new EventEmitter(),
    notify: () => {}, isProjectOpen: () => false, models: () => [], providerConfigs: () => []
  })
  return { store, project, orchestrator }
}

const plannable = (o: Orchestrator, roster: Agent[]) => (o as unknown as { plannableRoles: (r: Agent[]) => string[] }).plannableRoles(roster)
const persist = (o: Orchestrator, project: Project, roles: string[], roster: Agent[]) =>
  (o as unknown as { persistPlan: (p: Project, plan: Plan, r: Agent[]) => number }).persistPlan(project, {
    summary: 's', source: 'model', skipped: [],
    tasks: roles.map((role, i) => ({ key: `t${i}`, title: role, description: '', acceptance: '', role, phase: 'build', dependsOnKeys: [] }))
  }, roster)

const a11y = {
  role: 'a11y', name: 'Ava', title: 'Accessibility Specialist', description: 'Audits WCAG.', department: 'quality', color: '#123456',
  instructions: 'Audit accessibility.', engine: 'api-openai', model: 'gpt-x', skills: ['ponytail'], mcpServers: [],
  writesCode: true, budgetUsd: 2, requiresApproval: true, enabled: true
}

describe('agent catalogue', () => {
  it('seeds every built-in role into a default department and keeps them plannable', () => {
    const { store, orchestrator } = setup()
    const cat = store.agentCatalogue()
    expect(cat.departments).toEqual(DEFAULT_DEPARTMENTS)
    expect(cat.templates.filter((t) => t.builtin).map((t) => t.role)).toEqual(ROLE_TEMPLATES.map((t) => t.role))
    const ids = new Set(cat.departments.map((d) => d.id))
    expect(cat.templates.every((t) => t.enabled && ids.has(t.department))).toBe(true)
    expect(plannable(orchestrator, [])).toEqual(expect.arrayContaining(['frontend', 'backend', 'qa', 'reviewer']))
  })

  it('a custom template is plannable and hired with its own engine, budget and approval', () => {
    const { store, project, orchestrator } = setup()
    store.saveAgentTemplate(a11y, true)
    expect(plannable(orchestrator, [])).toContain('a11y')
    persist(orchestrator, project, ['a11y'], orchestrator.ensureRoster(project))
    expect(store.agents(project.id).find((a) => a.role === 'a11y')).toMatchObject({
      name: 'Ava', engine: 'api-openai', model: 'gpt-x', budgetUsd: 2, autonomy: 'ask', instructions: 'Audit accessibility.'
    })
    expect(() => store.saveAgentTemplate(a11y, true)).toThrow(/already exists/)
  })

  it('disabling a template removes it from planning and hiring', () => {
    const { store, project, orchestrator } = setup()
    store.saveAgentTemplate({ ...a11y, enabled: false }, true)
    const { builtin: _b, ...fe } = store.agentCatalogue().templates.find((t) => t.role === 'assistant')!
    store.saveAgentTemplate({ ...fe, enabled: false })
    expect(plannable(orchestrator, [])).not.toContain('a11y')
    expect(plannable(orchestrator, [])).not.toContain('assistant')
    persist(orchestrator, project, ['a11y', 'assistant'], orchestrator.ensureRoster(project))
    expect(store.agents(project.id).map((a) => a.role)).toEqual(['orchestrator'])
    // Reset restores the shipped built-in.
    store.deleteAgentTemplate('assistant')
    expect(store.agentCatalogue().templates.find((t) => t.role === 'assistant')).toMatchObject({ enabled: true, builtin: true })
  })

  it('departments can be added, renamed and deleted only when empty', () => {
    const { store } = setup()
    store.saveDepartments([...DEFAULT_DEPARTMENTS, { id: 'growth', name: 'Growth' }])
    store.saveAgentTemplate({ ...a11y, department: 'growth' }, true)
    expect(() => store.saveDepartments(DEFAULT_DEPARTMENTS)).toThrow(/Move Ava/)
    store.saveDepartments([...DEFAULT_DEPARTMENTS, { id: 'growth', name: 'Growth & Marketing' }])
    expect(store.agentCatalogue().departments.at(-1)).toEqual({ id: 'growth', name: 'Growth & Marketing' })
    expect(() => store.saveAgentTemplate({ ...a11y, department: 'nowhere' })).toThrow(/No department/)
  })

  it('round-trips a department through a manifest; imports arrive switched off', () => {
    const { store } = setup()
    store.saveDepartments([...DEFAULT_DEPARTMENTS, { id: 'growth', name: 'Growth' }])
    store.saveAgentTemplate({ ...a11y, department: 'growth' }, true)
    const manifest = JSON.parse(JSON.stringify(toManifest(store.agentCatalogue(), { department: 'growth' })))

    const other = setup().store
    const parsed = parseManifest(manifest, { skills: [], mcpServers: [] })
    expect(parsed.missing).toEqual(['skill "ponytail" (a11y)'])
    other.importAgents(parsed)
    const imported = other.agentCatalogue()
    expect(imported.departments.some((d) => d.id === 'growth')).toBe(true)
    expect(imported.templates.find((t) => t.role === 'a11y')).toMatchObject({ ...a11y, department: 'growth', enabled: false, builtin: false })
  })

  it('importing an edited built-in keeps it enabled', () => {
    const { store } = setup()
    const manifest = toManifest(store.agentCatalogue(), { role: 'assistant' })
    manifest.agents[0].instructions = 'Stricter review.'
    store.importAgents(parseManifest(manifest, { skills: [], mcpServers: [] }))
    expect(store.agentCatalogue().templates.find((t) => t.role === 'assistant')).toMatchObject({ instructions: 'Stricter review.', enabled: true, builtin: true })
  })
})

describe('manifest validation', () => {
  const ok = { format: 'ventriee-agents', version: 1, departments: [{ id: 'quality', name: 'Quality' }], agents: [a11y] }
  const known = { skills: ['ponytail'], mcpServers: [] }

  it('accepts a valid manifest', () => {
    expect(parseManifest(ok, known)).toMatchObject({ missing: [], templates: [{ role: 'a11y' }] })
  })

  it.each([
    ['an unknown top-level field', { ...ok, script: 'rm -rf /' }, /unknown field "script"/],
    ['an unknown agent field', { ...ok, agents: [{ ...a11y, onInstall: 'node x.js' }] }, /unknown field "onInstall"/],
    ['a wrong format', { ...ok, format: 'other' }, /format/],
    ['an unsafe role key', { ...ok, agents: [{ ...a11y, role: '../etc' }] }, /Role key/],
    ['an unknown engine', { ...ok, agents: [{ ...a11y, engine: 'cli-evil' }] }, /unknown engine/],
    ['a department the manifest does not list', { ...ok, departments: [] }, /does not list/],
    ['duplicate roles', { ...ok, agents: [a11y, a11y] }, /twice/],
    ['a non-boolean flag', { ...ok, agents: [{ ...a11y, writesCode: 'yes' }] }, /writesCode/],
    ['a negative budget', { ...ok, agents: [{ ...a11y, budgetUsd: -1 }] }, /budgetUsd/],
    ['missing instructions', { ...ok, agents: [{ ...a11y, instructions: '' }] }, /Instructions is required/]
  ])('rejects %s', (_name, raw, error) => {
    expect(() => parseManifest(raw, known)).toThrow(error)
  })

  it('names missing skills and MCP servers', () => {
    const raw = { ...ok, agents: [{ ...a11y, skills: ['ponytail', 'nope'], mcpServers: ['github'] }] }
    expect(parseManifest(raw, known).missing).toEqual(['skill "nope" (a11y)', 'MCP server "github" (a11y)'])
  })
})
