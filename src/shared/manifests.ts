import { ENGINE_LABELS, type EngineKind, type WorkflowEdge, type WorkflowNode, type WorkflowNodeKind } from './types'

/**
 * §26: workflows and model providers are data too, so they move as manifests like
 * agents do (W17). Both formats are JSON, data only: importing never runs code,
 * never enables anything by itself, and never carries credentials (provider
 * manifests have no key field at all; the owner types the key after import).
 */

const WORKFLOW_FORMAT = 'ventriee-workflows'
const PROVIDER_FORMAT = 'ventriee-providers'

const NODE_KINDS: WorkflowNodeKind[] = ['trigger', 'ai', 'agent', 'shell', 'http', 'condition', 'notify', 'wait', 'workflow', 'browser', 'approval', 'switch', 'loop', 'parallel']

function fail(msg: string): never { throw new Error(msg) }
function noExtra(raw: object, allowed: readonly string[], where: string) {
  const extra = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (extra.length) fail(`${where}: unknown field${extra.length > 1 ? 's' : ''} ${extra.map((k) => `"${k}"`).join(', ')}`)
}
function text(v: unknown, field: string, max: number, required = false): string {
  if (typeof v !== 'string') return required ? fail(`${field} is required`) : ''
  const s = v.trim()
  if (required && !s) fail(`${field} is required`)
  return s.slice(0, max)
}

// ---------------------------------------------------------------- workflows

export interface WorkflowManifestEntry { name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; scheduleMinutes: number }
export interface WorkflowManifest { format: typeof WORKFLOW_FORMAT; version: 1; workflows: WorkflowManifestEntry[] }

/** The data-only export of saved workflows: name, graph, schedule. Runtime state (enabled, run times, ids) never leaves. */
export function workflowsToManifest(workflows: Array<{ name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; scheduleMinutes: number }>): WorkflowManifest {
  return {
    format: WORKFLOW_FORMAT,
    version: 1,
    workflows: workflows.map((w) => ({ name: w.name, nodes: w.nodes, edges: w.edges, scheduleMinutes: w.scheduleMinutes }))
  }
}

const NODE_KEYS = ['id', 'kind', 'x', 'y', 'label', 'config'] as const
const EDGE_KEYS = ['id', 'from', 'to', 'branch', 'case'] as const

function checkNode(raw: unknown): WorkflowNode {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A workflow step must be an object')
  const r = raw as Record<string, unknown>
  noExtra(r, NODE_KEYS, 'Step')
  const id = text(r.id, 'Step id', 60, true)
  if (!NODE_KINDS.includes(r.kind as WorkflowNodeKind)) fail(`Step "${id}" has an unknown kind`)
  const config: Record<string, string> = {}
  if (r.config !== undefined) {
    if (!r.config || typeof r.config !== 'object' || Array.isArray(r.config)) fail(`Step "${id}": config must be an object`)
    for (const [k, v] of Object.entries(r.config as Record<string, unknown>)) {
      if (typeof v !== 'string') fail(`Step "${id}": config values must be text`)
      config[k.slice(0, 40)] = v.slice(0, 20_000)
    }
  }
  return { id, kind: r.kind as WorkflowNodeKind, x: Number(r.x) || 0, y: Number(r.y) || 0, label: text(r.label, 'Label', 80) || String(r.kind), config }
}

/** Validate a workflow manifest. Throws on malformed content; returns the clean entries. */
export function parseWorkflowManifest(raw: unknown): WorkflowManifestEntry[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Not a workflow manifest')
  const r = raw as Record<string, unknown>
  noExtra(r, ['format', 'version', 'workflows'], 'Manifest')
  if (r.format !== WORKFLOW_FORMAT) fail(`Not a workflow manifest (format must be "${WORKFLOW_FORMAT}")`)
  if (r.version !== 1) fail('Unsupported manifest version (expected 1)')
  if (!Array.isArray(r.workflows) || !r.workflows.length || r.workflows.length > 100) fail('A manifest needs 1 to 100 workflows')
  return r.workflows.map((w) => {
    if (!w || typeof w !== 'object' || Array.isArray(w)) fail('A workflow must be an object')
    const entry = w as Record<string, unknown>
    noExtra(entry, ['name', 'nodes', 'edges', 'scheduleMinutes'], 'Workflow')
    const name = text(entry.name, 'Workflow name', 80, true)
    if (!Array.isArray(entry.nodes)) fail(`Workflow "${name}": nodes must be a list`)
    const nodes = (entry.nodes as unknown[]).slice(0, 200).map(checkNode)
    const ids = new Set(nodes.map((n) => n.id))
    if (ids.size !== nodes.length) fail(`Workflow "${name}" has duplicate step ids`)
    if (!nodes.some((n) => n.kind === 'trigger')) fail(`Workflow "${name}" needs a trigger step`)
    if (!Array.isArray(entry.edges)) fail(`Workflow "${name}": edges must be a list`)
    const edges = (entry.edges as unknown[]).slice(0, 400).map((e) => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`Workflow "${name}": an edge must be an object`)
      const er = e as Record<string, unknown>
      noExtra(er, EDGE_KEYS, 'Edge')
      const from = text(er.from, 'Edge from', 60, true)
      const to = text(er.to, 'Edge to', 60, true)
      if (!ids.has(from) || !ids.has(to)) fail(`Workflow "${name}" has an edge between unknown steps`)
      const edge: WorkflowEdge = { id: text(er.id, 'Edge id', 60) || `${from}-${to}`, from, to }
      if (er.branch === 'true' || er.branch === 'false') edge.branch = er.branch
      if (er.case !== undefined) edge.case = text(er.case, 'Edge case', 120)
      return edge
    })
    const schedule = entry.scheduleMinutes === undefined ? 0 : Number(entry.scheduleMinutes)
    if (!Number.isFinite(schedule) || schedule < 0) fail(`Workflow "${name}": scheduleMinutes must be a number from 0 up`)
    return { name, nodes, edges, scheduleMinutes: Math.min(Math.floor(schedule), 60 * 24 * 30) }
  })
}

// ---------------------------------------------------------------- providers

export interface ProviderManifestEntry { label: string; kind: 'openai' | 'anthropic' | 'gemini'; engine: EngineKind; baseUrl: string; models: string[] }
export interface ProviderManifest { format: typeof PROVIDER_FORMAT; version: 1; providers: ProviderManifestEntry[] }

/** The data-only export of custom providers. There is no key field anywhere in this shape. */
export function providersToManifest(providers: ProviderManifestEntry[]): ProviderManifest {
  return { format: PROVIDER_FORMAT, version: 1, providers }
}

const PROVIDER_KEYS = ['label', 'kind', 'engine', 'baseUrl', 'models'] as const

/** Validate a provider manifest. Throws on malformed content or a key field. */
export function parseProviderManifest(raw: unknown): ProviderManifestEntry[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Not a provider manifest')
  const r = raw as Record<string, unknown>
  noExtra(r, ['format', 'version', 'providers'], 'Manifest')
  if (r.format !== PROVIDER_FORMAT) fail(`Not a provider manifest (format must be "${PROVIDER_FORMAT}")`)
  if (r.version !== 1) fail('Unsupported manifest version (expected 1)')
  if (!Array.isArray(r.providers) || !r.providers.length || r.providers.length > 50) fail('A manifest needs 1 to 50 providers')
  return r.providers.map((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) fail('A provider must be an object')
    const pr = p as Record<string, unknown>
    if ('apiKey' in pr || 'key' in pr) fail('Provider manifests never carry keys: enter the key in Settings after import')
    noExtra(pr, PROVIDER_KEYS, 'Provider')
    const label = text(pr.label, 'Provider name', 60, true)
    const kind = pr.kind
    if (kind !== 'openai' && kind !== 'anthropic' && kind !== 'gemini') fail(`Provider "${label}": kind must be openai, anthropic or gemini`)
    const engine = text(pr.engine, 'Engine', 40, true)
    if (!(engine in ENGINE_LABELS)) fail(`Provider "${label}": unknown engine "${engine}"`)
    const baseUrl = text(pr.baseUrl, 'Base URL', 300)
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) fail(`Provider "${label}": the base URL must be an http(s) address`)
    if (!Array.isArray(pr.models)) fail(`Provider "${label}": models must be a list`)
    const models = [...new Set((pr.models as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim().length > 0).map((m) => m.trim().slice(0, 120)))]
    return { label, kind, engine: engine as EngineKind, baseUrl, models }
  })
}
