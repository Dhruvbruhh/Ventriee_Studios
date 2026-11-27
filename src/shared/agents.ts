import { ENGINE_LABELS, type EngineKind } from './types'

/** A group of agent templates in the catalogue (§9 departments). */
export interface Department { id: string; name: string }

/** An agent type the planner can schedule and the studio can hire. Data only: nothing in it is executed. */
export interface AgentTemplate {
  role: string
  name: string
  title: string
  description: string
  department: string
  color: string
  instructions: string
  /** Preferred engine; '' means the orchestrator engine from Settings. */
  engine: EngineKind | ''
  model: string
  skills: string[]
  mcpServers: string[]
  writesCode: boolean
  /** Per-worker spend cap in USD; 0 means no cap. */
  budgetUsd: number
  /** Finished tasks wait for the owner's approval before review. */
  requiresApproval: boolean
  enabled: boolean
  /** Ships with the app: can be edited, disabled or reset, never deleted. */
  builtin: boolean
}

export interface AgentCatalogue { departments: Department[]; templates: AgentTemplate[] }

/** What the app stores: department list and only the templates the owner created or edited. */
export interface StoredCatalogue { departments: Department[] | null; templates: AgentTemplate[] }

export const MANIFEST_FORMAT = 'ventriee-agents'

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'project-management', name: 'Project Management' },
  { id: 'frontend', name: 'Frontend' },
  { id: 'backend', name: 'Backend' },
  { id: 'quality', name: 'Quality' },
  { id: 'security', name: 'Security' },
  { id: 'research', name: 'Research' },
  { id: 'devops', name: 'DevOps' }
]

/** Default department of each built-in role. */
export const DEPARTMENT_OF: Record<string, string> = {
  orchestrator: 'project-management', assistant: 'project-management', architect: 'project-management',
  designer: 'frontend', frontend: 'frontend', seo: 'frontend', aeo: 'frontend',
  backend: 'backend', integration: 'backend', database: 'backend',
  reviewer: 'quality', fixer: 'quality', qa: 'quality',
  security: 'security',
  researcher: 'research',
  deployment: 'devops', monitoring: 'devops'
}

const TEMPLATE_KEYS = ['role', 'name', 'title', 'description', 'department', 'color', 'instructions', 'engine', 'model', 'skills', 'mcpServers', 'writesCode', 'budgetUsd', 'requiresApproval', 'enabled'] as const
const SLUG = /^[a-z][a-z0-9-]{1,39}$/
const REF = /^[A-Za-z0-9@._:/-]{1,120}$/

function fail(msg: string): never { throw new Error(msg) }
function text(v: unknown, field: string, max: number, required = false): string {
  if (v === undefined || v === null) return required ? fail(`${field} is required`) : ''
  if (typeof v !== 'string') fail(`${field} must be text`)
  const s = v.trim()
  if (required && !s) fail(`${field} is required`)
  if (s.length > max) fail(`${field} is longer than ${max} characters`)
  return s
}
function flag(v: unknown, field: string, fallback: boolean): boolean {
  if (v === undefined) return fallback
  return typeof v === 'boolean' ? v : fail(`${field} must be true or false`)
}
function refs(v: unknown, field: string, max: number): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max) fail(`${field} must be a list of at most ${max} names`)
  return [...new Set(v.map((x) => (typeof x === 'string' && REF.test(x) ? x : fail(`${field} has an invalid entry: ${JSON.stringify(x)?.slice(0, 60)}`))))]
}
function noExtra(raw: object, allowed: readonly string[], where: string) {
  const extra = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (extra.length) fail(`${where}: unknown field${extra.length > 1 ? 's' : ''} ${extra.map((k) => `"${k}"`).join(', ')}`)
}

export function checkDepartment(raw: unknown): Department {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A department must be an object')
  const r = raw as Record<string, unknown>
  noExtra(r, ['id', 'name'], 'Department')
  const id = text(r.id, 'Department id', 40, true)
  if (!SLUG.test(id)) fail(`Department id "${id}" must be 2-40 lowercase letters, digits or dashes`)
  return { id, name: text(r.name, 'Department name', 60, true) }
}

/** Validate one template from an untrusted source (renderer or a manifest file). Throws on anything unknown or malformed. */
export function checkTemplate(raw: unknown, builtin = false): AgentTemplate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('An agent must be an object')
  const r = raw as Record<string, unknown>
  const role = text(r.role, 'Role key', 40, true)
  if (!SLUG.test(role)) fail(`Role key "${role}" must be 2-40 lowercase letters, digits or dashes, starting with a letter`)
  noExtra(r, TEMPLATE_KEYS, `Agent "${role}"`)
  const engine = text(r.engine, 'Engine', 40)
  if (engine && !(engine in ENGINE_LABELS)) fail(`Agent "${role}": unknown engine "${engine}"`)
  const color = text(r.color, 'Colour', 9)
  const budget = r.budgetUsd === undefined ? 5 : r.budgetUsd
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || budget > 10_000) fail(`Agent "${role}": budgetUsd must be a number from 0 to 10000`)
  const department = text(r.department, 'Department', 40, true)
  if (!SLUG.test(department)) fail(`Agent "${role}": department "${department}" is not a valid department id`)
  const name = text(r.name, 'Name', 60, true)
  return {
    role, name,
    title: text(r.title, 'Title', 80) || name,
    description: text(r.description, 'Description', 1000),
    department,
    color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#94a3b8',
    instructions: text(r.instructions, 'Instructions', 20_000, true),
    engine: engine as EngineKind | '',
    model: text(r.model, 'Model', 120),
    skills: refs(r.skills, 'skills', 300),
    mcpServers: refs(r.mcpServers, 'mcpServers', 50),
    writesCode: flag(r.writesCode, 'writesCode', false),
    budgetUsd: budget,
    requiresApproval: flag(r.requiresApproval, 'requiresApproval', false),
    enabled: flag(r.enabled, 'enabled', true),
    builtin
  }
}

/** Built-ins (with any stored edits applied) followed by the owner's own templates. */
export function mergeCatalogue(builtins: AgentTemplate[], stored: StoredCatalogue): AgentCatalogue {
  const edits = new Map(stored.templates.map((t) => [t.role, t]))
  const builtinRoles = new Set(builtins.map((b) => b.role))
  return {
    departments: stored.departments ?? DEFAULT_DEPARTMENTS,
    templates: [
      ...builtins.map((b) => (edits.has(b.role) ? { ...edits.get(b.role)!, builtin: true } : b)),
      ...stored.templates.filter((t) => !builtinRoles.has(t.role)).map((t) => ({ ...t, builtin: false }))
    ]
  }
}

export interface AgentManifest { format: typeof MANIFEST_FORMAT; version: 1; departments: Department[]; agents: Omit<AgentTemplate, 'builtin'>[] }

/** A manifest of one template (by role) or a whole department (by department id). */
export function toManifest(catalogue: AgentCatalogue, pick: { role?: string; department?: string }): AgentManifest {
  const agents = catalogue.templates.filter((t) => (pick.role ? t.role === pick.role : t.department === pick.department))
  if (!agents.length && pick.role) fail(`No agent "${pick.role}"`)
  const used = new Set([...agents.map((a) => a.department), ...(pick.department ? [pick.department] : [])])
  return {
    format: MANIFEST_FORMAT,
    version: 1,
    departments: catalogue.departments.filter((d) => used.has(d.id)),
    agents: agents.map(({ builtin: _b, ...rest }) => rest)
  }
}

export interface ParsedManifest { departments: Department[]; templates: AgentTemplate[]; missing: string[] }

/** Validate a manifest file's content. Throws on a malformed or unsafe manifest; missing skills/MCP servers are reported, not fatal. */
export function parseManifest(raw: unknown, known: { skills: string[]; mcpServers: string[] }): ParsedManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Not an agent manifest')
  const r = raw as Record<string, unknown>
  noExtra(r, ['format', 'version', 'departments', 'agents'], 'Manifest')
  if (r.format !== MANIFEST_FORMAT) fail(`Not an agent manifest (format must be "${MANIFEST_FORMAT}")`)
  if (r.version !== 1) fail('Unsupported manifest version (expected 1)')
  if (!Array.isArray(r.agents) || !r.agents.length || r.agents.length > 200) fail('A manifest needs 1 to 200 agents')
  const departments = Array.isArray(r.departments) ? r.departments.map(checkDepartment) : fail('departments must be a list')
  const deptIds = new Set(departments.map((d) => d.id))
  const templates = r.agents.map((a) => checkTemplate(a))
  const roles = new Set<string>()
  for (const t of templates) {
    if (roles.has(t.role)) fail(`Agent "${t.role}" appears twice`)
    roles.add(t.role)
    if (!deptIds.has(t.department)) fail(`Agent "${t.role}" is in department "${t.department}", which the manifest does not list`)
  }
  const skills = new Set(known.skills)
  const mcp = new Set(known.mcpServers)
  const missing = templates.flatMap((t) => [
    ...t.skills.filter((s) => !skills.has(s)).map((s) => `skill "${s}" (${t.role})`),
    ...t.mcpServers.filter((s) => !mcp.has(s)).map((s) => `MCP server "${s}" (${t.role})`)
  ])
  return { departments, templates, missing }
}

/**
 * Merge an import into the stored catalogue. New agents arrive switched off so the owner
 * reviews them first; one that replaces an existing role keeps that role's on/off state.
 */
export function applyImport(stored: StoredCatalogue, parsed: ParsedManifest, current: AgentCatalogue): StoredCatalogue {
  const departments = [...(stored.departments ?? DEFAULT_DEPARTMENTS)]
  for (const d of parsed.departments) if (!departments.some((x) => x.id === d.id)) departments.push(d)
  const incoming = new Map(parsed.templates.map((t) => [t.role, { ...t, enabled: current.templates.find((c) => c.role === t.role)?.enabled ?? false }]))
  return { departments, templates: [...stored.templates.filter((t) => !incoming.has(t.role)), ...incoming.values()] }
}
