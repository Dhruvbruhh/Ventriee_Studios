import type { Workflow, WorkflowNode, WorkflowRunEvent } from '../shared/types'

export interface WorkflowDeps {
  ai(prompt: string, system: string): Promise<string>
  agent(instruction: string): Promise<string>
  /** The previous node's output reaches the command as the VENTRIEE_INPUT variable, never spliced into the command text. */
  shell(command: string, input: string, timeoutMs: number): Promise<string>
  fetch: typeof fetch
  notify(title: string, body: string): void
  /** Start another saved workflow by name and wait for it; resolves with its last output. */
  runWorkflow(name: string, input: string): Promise<string>
  /** Run browser steps (one per line) in the automation browser. */
  browser(steps: string, input: string): Promise<string>
  /** Pause for human approval; resolves true (approved) or false (rejected). */
  approve(runId: string, nodeId: string, title: string): Promise<boolean>
}

const MAX_WAIT_SECONDS = 3600
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Stopped')) }, { once: true })
})

const MAX_STEPS = 100
const MAX_OUTPUT = 20_000
const fill = (template: string, input: string) => template.replaceAll('{{input}}', input)

/** A condition passes when the input contains the text (case-insensitive) or matches the /regex/. */
export function conditionPasses(node: WorkflowNode, input: string): boolean {
  const test = (node.config.match ?? '').trim()
  if (!test) return input.trim().length > 0
  const regex = /^\/(.+)\/([a-z]*)$/.exec(test)
  if (regex) {
    try { return new RegExp(regex[1], regex[2]).test(input) } catch { return false }
  }
  return input.toLowerCase().includes(test.toLowerCase())
}

async function execute(node: WorkflowNode, input: string, deps: WorkflowDeps, signal?: AbortSignal, runId = ''): Promise<string> {
  const c = node.config
  switch (node.kind) {
    case 'trigger': return input || c.input || ''
    case 'wait': {
      const seconds = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(c.seconds) || 0))
      await sleep(seconds * 1000, signal)
      return input
    }
    case 'workflow': {
      if (!c.workflow?.trim()) throw new Error('Pick the workflow to run')
      return deps.runWorkflow(c.workflow.trim(), input)
    }
    case 'browser': {
      if (!c.steps?.trim()) throw new Error('Add at least one browser step')
      return deps.browser(c.steps, input)
    }
    case 'ai': return deps.ai(fill(c.prompt ?? '{{input}}', input), c.system ?? '')
    case 'agent': return deps.agent(fill(c.instruction ?? '{{input}}', input))
    case 'shell': {
      if (!c.command?.trim()) throw new Error('No command set')
      return deps.shell(c.command, input, Math.max(5, Number(c.timeoutSec) || 300) * 1000)
    }
    case 'http': {
      const url = new URL(c.url ?? '')
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed')
      const method = (c.method || 'GET').toUpperCase()
      const res = await deps.fetch(url, {
        method,
        headers: c.body ? { 'content-type': c.contentType || 'application/json' } : undefined,
        body: method === 'GET' || method === 'HEAD' || !c.body ? undefined : fill(c.body, input)
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
      return text
    }
    case 'condition': return input
    case 'switch': return input
    case 'notify': {
      const body = fill(c.message ?? '{{input}}', input)
      deps.notify(c.title || node.label || 'Workflow', body.slice(0, 300))
      return body
    }
    case 'approval': {
      const title = c.message || node.label || 'Approval required'
      const approved = await deps.approve(runId, node.id, title)
      if (!approved) throw new Error(`Rejected: ${title}`)
      return input
    }
    case 'loop': {
      const times = Math.min(10, Math.max(1, Number(c.times) || 3))
      let current = input
      for (let i = 0; i < times; i++) {
        if (signal?.aborted) throw new Error('Stopped')
        current = await deps.ai(fill(c.prompt || '{{input}}', current), c.system ?? '')
        if (c.until && conditionPasses({ config: { match: c.until } } as unknown as WorkflowNode, current)) break
      }
      return current
    }
    case 'parallel': {
      const prompts = (c.prompts || '').split('\n').filter((p: string) => p.trim())
      if (!prompts.length) return input
      const results = await Promise.all(
        prompts.map((p: string) => deps.ai(fill(p, input), c.system ?? '').catch(() => ''))
      )
      return results.join('\n')
    }
  }
}

/**
 * Walk the graph from its trigger. Each node runs once; a step retries up to its
 * `retries` setting, then a failure stops the run. Resolves with the last output, or null on failure.
 */
export async function runWorkflow(wf: Workflow, deps: WorkflowDeps, emit: (e: WorkflowRunEvent) => void, runId: string, signal?: AbortSignal, triggerInput = ''): Promise<string | null> {
  const event = (nodeId: string | null, status: WorkflowRunEvent['status'], output = '') =>
    emit({ workflowId: wf.id, runId, nodeId, status, output: output.slice(0, MAX_OUTPUT), at: Date.now() })
  const trigger = wf.nodes.find((n) => n.kind === 'trigger')
  if (!trigger) { event(null, 'failed', 'Add a Start node'); return null }

  const byId = new Map(wf.nodes.map((n) => [n.id, n]))
  const queue: Array<{ id: string; input: string }> = [{ id: trigger.id, input: triggerInput }]
  const seen = new Set<string>()
  let steps = 0
  let last = ''
  while (queue.length) {
    if (signal?.aborted) { event(null, 'failed', 'Stopped'); return null }
    const { id, input } = queue.shift()!
    const node = byId.get(id)
    if (!node || seen.has(id)) continue
    if (++steps > MAX_STEPS) { event(null, 'failed', `Stopped after ${MAX_STEPS} steps`); return null }
    seen.add(id)
    const retries = Math.min(3, Math.max(0, Math.floor(Number(node.config.retries) || 0)))
    let output = ''
    for (let attempt = 0; ; attempt++) {
      event(id, 'running', attempt ? `Retry ${attempt} of ${retries}` : '')
      try {
        output = (await execute(node, input, deps, signal, runId)).slice(0, MAX_OUTPUT)
        break
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (attempt >= retries || signal?.aborted) { event(id, 'failed', message); return null }
        await sleep(Math.min(30_000, 2000 * 2 ** attempt), signal).catch(() => {})
      }
    }
    event(id, 'done', output)
    last = output
    const out = wf.edges.filter((e) => e.from === id)
    const branch = node.kind === 'condition' ? (conditionPasses(node, input) ? 'true' : 'false') : null
    const isSwitch = node.kind === 'switch'
    for (const edge of out) {
      if (branch && (edge.branch ?? 'true') !== branch) { event(edge.to, 'skipped'); continue }
      if (isSwitch && edge.case && !output.toLowerCase().includes(edge.case.toLowerCase())) { event(edge.to, 'skipped'); continue }
      queue.push({ id: edge.to, input: output })
    }
  }
  event(null, 'finished')
  return last
}

/** What starts a workflow automatically, read from its Start step. */
export type TriggerKind = 'manual' | 'webhook' | 'files' | 'git' | 'run_done' | 'run_failed'
export function triggerOf(wf: Workflow): { on: TriggerKind; filter: string; token: string } {
  const c = wf.nodes.find((n) => n.kind === 'trigger')?.config ?? {}
  const on = (['webhook', 'files', 'git', 'run_done', 'run_failed'] as const).find((k) => k === c.on) ?? 'manual'
  return { on, filter: c.filter ?? '', token: c.token ?? '' }
}

const IGNORED_DIRS = /(^|[\\/])(node_modules|\.git|\.ventriee|dist|out|build|\.next|coverage)([\\/]|$)/
/** A changed path that should start a files-triggered workflow. */
export function fileMatches(path: string, filter: string): boolean {
  if (IGNORED_DIRS.test(path)) return false
  const f = filter.trim().toLowerCase()
  return !f || path.replaceAll('\\', '/').toLowerCase().includes(f)
}
