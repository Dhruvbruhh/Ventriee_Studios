import { describe, expect, it } from 'vitest'
import { conditionPasses, fileMatches, runWorkflow, triggerOf, type WorkflowDeps } from '../src/main/workflows'
import type { Workflow, WorkflowNode, WorkflowRunEvent } from '../src/shared/types'

const node = (id: string, kind: WorkflowNode['kind'], config: Record<string, string> = {}): WorkflowNode => ({ id, kind, x: 0, y: 0, label: id, config })
const flow = (nodes: WorkflowNode[], edges: Workflow['edges']): Workflow => ({
  id: 'wf', projectId: null, name: 'test', nodes, edges, scheduleMinutes: 0, enabled: true, lastRunAt: null, createdAt: 0, updatedAt: 0
})

function deps(overrides: Partial<WorkflowDeps> = {}) {
  const calls: string[] = []
  const d: WorkflowDeps = {
    ai: async (prompt) => { calls.push(`ai:${prompt}`); return 'TESTS FAILED: 2' },
    agent: async (i) => { calls.push(`agent:${i}`); return 'ok' },
    shell: async (command, input) => { calls.push(`shell:${command}|${input}`); return 'ran' },
    fetch: (async () => new Response('pong')) as typeof fetch,
    notify: (title, body) => { calls.push(`notify:${title}:${body}`) },
    runWorkflow: async (name, input) => { calls.push(`workflow:${name}|${input}`); return 'child done' },
    browser: async (steps) => { calls.push(`browser:${steps}`); return 'page ok' },
    ...overrides
  }
  return { d, calls }
}

async function run(wf: Workflow, d: WorkflowDeps, input = '') {
  const events: WorkflowRunEvent[] = []
  const last = await runWorkflow(wf, d, (e) => events.push(e), 'run1', undefined, input)
  return { ok: last !== null, last, events }
}

describe('runWorkflow', () => {
  it('passes each output on and follows the matching branch', async () => {
    const wf = flow(
      [node('t', 'trigger', { input: 'repo' }), node('a', 'ai', { prompt: 'Check {{input}}' }), node('c', 'condition', { match: 'failed' }), node('yes', 'notify', { title: 'Alert', message: 'Got: {{input}}' }), node('no', 'shell', { command: 'echo fine' })],
      [{ id: '1', from: 't', to: 'a' }, { id: '2', from: 'a', to: 'c' }, { id: '3', from: 'c', to: 'yes', branch: 'true' }, { id: '4', from: 'c', to: 'no', branch: 'false' }]
    )
    const { d, calls } = deps()
    const { ok, events } = await run(wf, d)
    expect(ok).toBe(true)
    expect(calls).toEqual(['ai:Check repo', 'notify:Alert:Got: TESTS FAILED: 2'])
    expect(events.find((e) => e.nodeId === 'no')?.status).toBe('skipped')
    expect(events.at(-1)?.status).toBe('finished')
  })

  it('hands the previous output to a command as a variable, not inside the command', async () => {
    const wf = flow([node('t', 'trigger', { input: '"; rm -rf / #' }), node('s', 'shell', { command: 'node check.js' })], [{ id: '1', from: 't', to: 's' }])
    const { d, calls } = deps()
    await run(wf, d)
    expect(calls).toEqual(['shell:node check.js|"; rm -rf / #'])
  })

  it('stops at the first failing step', async () => {
    const wf = flow([node('t', 'trigger'), node('a', 'ai'), node('n', 'notify')], [{ id: '1', from: 't', to: 'a' }, { id: '2', from: 'a', to: 'n' }])
    const { d, calls } = deps({ ai: async () => { throw new Error('model down') } })
    const { ok, events } = await run(wf, d)
    expect(ok).toBe(false)
    expect(events.find((e) => e.nodeId === 'a' && e.status === 'failed')?.output).toBe('model down')
    expect(calls).toEqual([])
  })

  it('runs each step once even when the graph loops', async () => {
    const wf = flow([node('t', 'trigger'), node('a', 'shell', { command: 'x' }), node('b', 'shell', { command: 'y' })],
      [{ id: '1', from: 't', to: 'a' }, { id: '2', from: 'a', to: 'b' }, { id: '3', from: 'b', to: 'a' }])
    const { d, calls } = deps()
    expect((await run(wf, d)).ok).toBe(true)
    expect(calls).toEqual(['shell:x|', 'shell:y|ran'])
  })

  it('refuses non-web URLs and needs a start node', async () => {
    const { d } = deps()
    const bad = await run(flow([node('t', 'trigger'), node('h', 'http', { url: 'file:///etc/passwd' })], [{ id: '1', from: 't', to: 'h' }]), d)
    expect(bad.ok).toBe(false)
    expect((await run(flow([node('a', 'ai')], []), d)).ok).toBe(false)
  })
})

describe('workflow steps and triggers', () => {
  it('starts from the trigger input and returns the last output', async () => {
    const wf = flow([node('t', 'trigger', { input: 'default' }), node('w', 'workflow', { workflow: 'Deploy' })], [{ id: '1', from: 't', to: 'w' }])
    const { d, calls } = deps()
    const { last } = await run(wf, d, 'webhook body')
    expect(calls).toEqual(['workflow:Deploy|webhook body'])
    expect(last).toBe('child done')
  })

  it('retries a failing step before giving up', async () => {
    let tries = 0
    const wf = flow([node('t', 'trigger'), node('h', 'browser', { steps: 'goto https://x.test', retries: '1' })], [{ id: '1', from: 't', to: 'h' }])
    const { d } = deps({ browser: async () => { if (++tries < 2) throw new Error('flaky'); return 'ok' } })
    const { ok, events } = await run(wf, d)
    expect(ok).toBe(true)
    expect(tries).toBe(2)
    expect(events.some((e) => e.output === 'Retry 1 of 1')).toBe(true)
  }, 10_000)

  it('stops a wait when the run is stopped', async () => {
    const controller = new AbortController()
    const wf = flow([node('t', 'trigger'), node('w', 'wait', { seconds: '60' })], [{ id: '1', from: 't', to: 'w' }])
    const { d } = deps()
    setTimeout(() => controller.abort(), 50)
    const last = await runWorkflow(wf, d, () => {}, 'r', controller.signal)
    expect(last).toBeNull()
  })

  it('reads the trigger from the Start step', () => {
    expect(triggerOf(flow([node('t', 'trigger', { on: 'webhook', token: 'abc' })], [])).on).toBe('webhook')
    expect(triggerOf(flow([node('t', 'trigger', { on: 'nonsense' })], [])).on).toBe('manual')
  })

  it('ignores generated folders and applies the path filter', () => {
    expect(fileMatches('src\\app\\page.tsx', '')).toBe(true)
    expect(fileMatches('node_modules\\x\\index.js', '')).toBe(false)
    expect(fileMatches('.git/HEAD', '')).toBe(false)
    expect(fileMatches('src\\styles.css', '.tsx')).toBe(false)
    expect(fileMatches('src\\app\\page.tsx', 'src/app')).toBe(true)
  })
})

describe('conditionPasses', () => {
  it('matches text case-insensitively, a /regex/, or any output when empty', () => {
    expect(conditionPasses(node('c', 'condition', { match: 'FAIL' }), 'tests failed')).toBe(true)
    expect(conditionPasses(node('c', 'condition', { match: '/^ok$/i' }), 'OK')).toBe(true)
    expect(conditionPasses(node('c', 'condition', { match: '/^ok$/' }), 'not ok')).toBe(false)
    expect(conditionPasses(node('c', 'condition'), '')).toBe(false)
    expect(conditionPasses(node('c', 'condition', { match: '/[/' }), 'x')).toBe(false)
  })
})
