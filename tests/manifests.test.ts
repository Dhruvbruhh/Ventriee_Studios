import { describe, expect, it } from 'vitest'
import {
  parseProviderManifest,
  parseWorkflowManifest,
  providersToManifest,
  workflowsToManifest
} from '../src/shared/manifests'
import type { WorkflowEdge, WorkflowNode } from '../src/shared/types'

const node = (id: string, kind = 'trigger'): WorkflowNode => ({ id, kind: kind as WorkflowNode['kind'], x: 0, y: 0, label: id, config: {} })
const edge = (from: string, to: string): WorkflowEdge => ({ id: `${from}-${to}`, from, to })

describe('workflow manifests', () => {
  it('exports only data: name, graph, schedule', () => {
    const m = workflowsToManifest([{ name: 'Nightly QA', nodes: [node('t1'), node('a1', 'ai')], edges: [edge('t1', 'a1')], scheduleMinutes: 60 }])
    expect(m).toEqual({
      format: 'ventriee-workflows',
      version: 1,
      workflows: [{ name: 'Nightly QA', nodes: m.workflows[0].nodes, edges: m.workflows[0].edges, scheduleMinutes: 60 }]
    })
    const round = parseWorkflowManifest(JSON.parse(JSON.stringify(m)))
    expect(round[0].name).toBe('Nightly QA')
    expect(round[0].nodes).toHaveLength(2)
  })

  it('rejects malformed manifests', () => {
    expect(() => parseWorkflowManifest({ format: 'ventriee-agents', version: 1, workflows: [] })).toThrow(/Not a workflow manifest/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 2, workflows: [] })).toThrow(/version/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 1, workflows: [{ name: 'X', nodes: [node('a1', 'ai')], edges: [], scheduleMinutes: 0 }] })).toThrow(/trigger/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 1, workflows: [{ name: 'X', nodes: [node('t1'), node('t1', 'ai')], edges: [], scheduleMinutes: 0 }] })).toThrow(/duplicate/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 1, workflows: [{ name: 'X', nodes: [node('t1')], edges: [edge('t1', 'ghost')], scheduleMinutes: 0 }] })).toThrow(/unknown steps/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 1, workflows: [{ name: 'X', nodes: [node('t1')], edges: [], scheduleMinutes: 0, extra: 1 }] })).toThrow(/unknown field/)
    expect(() => parseWorkflowManifest({ format: 'ventriee-workflows', version: 1, workflows: [{ name: 'X', nodes: [{ id: 't1', kind: 'nope' }], edges: [], scheduleMinutes: 0 }] })).toThrow(/unknown kind/)
  })

  it('accepts branch and case edges and clamps the schedule', () => {
    const parsed = parseWorkflowManifest({
      format: 'ventriee-workflows',
      version: 1,
      workflows: [{ name: 'Gate', nodes: [node('t1'), node('c1', 'condition'), node('a1', 'shell')], edges: [{ from: 't1', to: 'c1' }, { from: 'c1', to: 'a1', branch: 'true' }, { from: 'c1', to: 'a1', branch: 'false', case: 'err' }], scheduleMinutes: 999999 }]
    })
    expect(parsed[0].edges[1]).toEqual({ id: 'c1-a1-true', from: 'c1', to: 'a1', branch: 'true' })
    expect(parsed[0].edges[2].case).toBe('err')
    // The two c1->a1 branches must not share an edge id.
    expect(parsed[0].edges[2].id).not.toBe(parsed[0].edges[1].id)
    expect(new Set(parsed[0].edges.map((e) => e.id)).size).toBe(parsed[0].edges.length)
    expect(parsed[0].scheduleMinutes).toBeLessThanOrEqual(60 * 24 * 30)
  })
})

describe('provider manifests', () => {
  it('exports and round-trips providers without any key field', () => {
    const m = providersToManifest([{ label: 'My Gateway', kind: 'openai', engine: 'api-custom', baseUrl: 'https://gw.example.com/v1', models: ['big-model', 'small-model'] }])
    expect(JSON.stringify(m).toLowerCase()).not.toContain('key')
    const round = parseProviderManifest(JSON.parse(JSON.stringify(m)))
    expect(round).toEqual(m.providers)
  })

  it('refuses keys, unknown engines, bad URLs and extra fields', () => {
    const base = { format: 'ventriee-providers', version: 1, providers: [{ label: 'X', kind: 'openai', engine: 'api-custom', baseUrl: 'https://x.io', models: ['m'] }] }
    expect(() => parseProviderManifest({ ...base, providers: [{ ...base.providers[0], apiKey: 'sk-123' }] })).toThrow(/never carry keys/)
    expect(() => parseProviderManifest({ ...base, providers: [{ ...base.providers[0], engine: 'api-nope' }] })).toThrow(/unknown engine/)
    expect(() => parseProviderManifest({ ...base, providers: [{ ...base.providers[0], baseUrl: 'ftp://x.io' }] })).toThrow(/http/)
    expect(() => parseProviderManifest({ ...base, providers: [{ ...base.providers[0], kind: 'grpc' }] })).toThrow(/kind/)
    expect(() => parseProviderManifest({ ...base, providers: [{ ...base.providers[0], extra: true }] })).toThrow(/unknown field/)
    expect(() => parseProviderManifest({ ...base, providers: [] })).toThrow(/1 to 50/)
  })
})
