import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { McpServer, PluginAgentTemplate, PluginCommand, PluginTheme, WorkflowEdge, WorkflowNode, WorkflowNodeKind } from '../shared/types'
import { validMcpServers } from './mcp'

export const MANIFEST = 'ventriee-plugin.json'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  minAppVersion: string
  dependencies: Record<string, string>
  skills: string[]
  mcpServers: McpServer[]
  workflows: Array<{ name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; scheduleMinutes: number }>
  agents: PluginAgentTemplate[]
  themes: PluginTheme[]
  commands: PluginCommand[]
}

const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,6})$/
/** -1, 0 or 1; anything that is not x.y.z sorts lowest. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)?.slice(1).map(Number) ?? [-1, 0, 0]
  const pb = SEMVER.exec(b)?.slice(1).map(Number) ?? [-1, 0, 0]
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  return 0
}

// The variables a theme may set, and only plain colour values: a theme cannot load anything or break out of the declaration.
const THEME_VARS = new Set(['--bg', '--bg-deep', '--panel', '--panel-2', '--panel-3', '--line', '--line-soft', '--line-strong', '--accent-line', '--selection', '--text', '--text-dim', '--muted', '--faint', '--accent', '--accent-deep', '--accent-ink', '--bg-raised', '--status-bg', '--status-ink', '--ok', '--warn', '--err', '--info'])
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/]+\))$/i
const KINDS: WorkflowNodeKind[] = ['trigger', 'ai', 'agent', 'shell', 'http', 'condition', 'notify', 'wait', 'workflow', 'browser']

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown) => (Array.isArray(v) ? v : [])

/** A path inside the plugin folder, or null when it points anywhere else (.., absolute, a link out). */
export function insidePlugin(root: string, rel: unknown): string | null {
  if (typeof rel !== 'string' || !rel.trim() || isAbsolute(rel)) return null
  const full = resolve(root, rel)
  const r = relative(resolve(root), full)
  if (!r || r.startsWith('..') || isAbsolute(r)) return null
  if (!existsSync(full)) return full
  const real = relative(realpathSync(root), realpathSync(full))
  return real.startsWith('..') || isAbsolute(real) ? null : full
}

/** Read and check a plugin folder. Problems with single contributions are returned as errors; a bad manifest throws. */
export function readManifest(root: string, appVersion: string): { manifest: PluginManifest; errors: string[] } {
  const file = join(root, MANIFEST)
  if (!existsSync(file)) throw new Error(`No ${MANIFEST} in that folder`)
  let raw: any
  try { raw = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { throw new Error(`${MANIFEST} is not valid JSON: ${(e as Error).message}`) }
  const id = str(raw?.id, 41)
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new Error('The plugin id must be 2-41 lowercase letters, digits or dashes')
  const version = str(raw.version, 20)
  if (!SEMVER.test(version)) throw new Error('The plugin version must look like 1.2.3')
  const minAppVersion = str(raw.minAppVersion, 20)
  if (minAppVersion && compareVersions(appVersion, minAppVersion) < 0) throw new Error(`Needs Ventriee Studios ${minAppVersion} or newer (this is ${appVersion})`)
  const errors: string[] = []
  const c = raw.contributes ?? {}

  const dependencies: Record<string, string> = {}
  for (const [dep, v] of Object.entries(typeof raw.dependencies === 'object' && raw.dependencies ? raw.dependencies : {})) {
    if (/^[a-z0-9][a-z0-9-]{1,40}$/.test(dep) && typeof v === 'string' && SEMVER.test(v.replace(/^[\^~>=]+/, ''))) dependencies[dep] = v.replace(/^[\^~>=]+/, '')
    else errors.push(`Ignored dependency "${dep}"`)
  }

  const skills: string[] = []
  for (const s of list(c.skills)) {
    const dir = insidePlugin(root, s)
    if (dir && existsSync(join(dir, 'SKILL.md'))) skills.push(dir)
    else errors.push(`Skill "${String(s)}" is missing or outside the plugin folder`)
  }

  const mcpServers = validMcpServers(list(c.mcpServers).map((s) => ({ ...s, enabled: false, source: `plugin:${id}` })))
  if (mcpServers.length < list(c.mcpServers).length) errors.push(`${list(c.mcpServers).length - mcpServers.length} MCP server(s) were not valid and were skipped`)

  const workflows: PluginManifest['workflows'] = []
  for (const w of list(c.workflows)) {
    const path = insidePlugin(root, w)
    let wf: any
    try { wf = path ? JSON.parse(readFileSync(path, 'utf8')) : null } catch { wf = null }
    const nodes = list(wf?.nodes).filter((n: any) => n && typeof n.id === 'string' && KINDS.includes(n.kind)).map((n: any): WorkflowNode => ({
      id: str(n.id, 60), kind: n.kind, x: Number(n.x) || 0, y: Number(n.y) || 0, label: str(n.label, 80) || n.kind,
      config: Object.fromEntries(Object.entries(typeof n.config === 'object' && n.config ? n.config : {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 20_000)]))
    }))
    const ids = new Set(nodes.map((n) => n.id))
    if (!wf || !str(wf.name, 80) || !nodes.some((n) => n.kind === 'trigger')) { errors.push(`Workflow "${String(w)}" is not a valid workflow file`); continue }
    const edges = list(wf.edges).filter((e: any) => e && ids.has(e.from) && ids.has(e.to)).map((e: any): WorkflowEdge => ({ id: str(e.id, 60) || `${e.from}-${e.to}`, from: e.from, to: e.to, ...(e.branch === 'false' || e.branch === 'true' ? { branch: e.branch } : {}) }))
    workflows.push({ name: str(wf.name, 80), nodes, edges, scheduleMinutes: Math.max(0, Number(wf.scheduleMinutes) || 0) })
  }

  const agents: PluginAgentTemplate[] = list(c.agents).filter((a: any) => str(a?.name, 60) && str(a?.instructions, 20_000)).map((a: any) => ({
    role: str(a.role, 40) || 'custom', name: str(a.name, 60), title: str(a.title, 80) || str(a.name, 60), instructions: str(a.instructions, 20_000),
    skills: list(a.skills).filter((s: unknown) => typeof s === 'string').map((s: string) => s.slice(0, 80))
  }))

  const themes: PluginTheme[] = []
  for (const t of list(c.themes)) {
    const tid = str(t?.id, 40)
    if (!/^[a-z0-9-]{1,40}$/.test(tid) || !str(t?.name, 60)) { errors.push('A theme needs an id and a name'); continue }
    const colors: Record<string, string> = {}
    for (const [k, v] of Object.entries(typeof t.colors === 'object' && t.colors ? t.colors : {})) {
      if (THEME_VARS.has(k) && typeof v === 'string' && COLOR.test(v.trim())) colors[k] = v.trim()
      else errors.push(`Theme "${tid}": ignored ${k}`)
    }
    themes.push({ id: tid, name: str(t.name, 60), base: t.base === 'light' ? 'light' : 'dark', colors })
  }

  const commands: PluginCommand[] = list(c.commands).filter((x: any) => /^[a-z0-9-]{1,40}$/.test(str(x?.id, 40)) && str(x?.title, 80) && str(x?.prompt, 8000))
    .map((x: any) => ({ id: str(x.id, 40), title: str(x.title, 80), prompt: str(x.prompt, 8000) }))

  return {
    manifest: { id, name: str(raw.name, 80) || id, version, description: str(raw.description, 1000), author: str(raw.author, 120), minAppVersion, dependencies, skills, mcpServers, workflows, agents, themes, commands },
    errors
  }
}

/** Plain-language list of what installing this plugin allows. */
export function permissionsOf(m: PluginManifest): string[] {
  const out: string[] = []
  if (m.mcpServers.length) out.push(`Adds ${m.mcpServers.length} MCP server(s) that can run programs on this computer once you turn them on: ${m.mcpServers.map((s) => s.url ?? [s.command, ...s.args].join(' ')).join('; ')}`)
  if (m.skills.length) out.push(`Adds ${m.skills.length} skill(s): instructions agents follow (security-scanned on install)`)
  if (m.workflows.length) out.push(`Adds ${m.workflows.length} workflow(s), switched off until you enable them`)
  if (m.agents.length) out.push(`Offers ${m.agents.length} agent template(s)`)
  if (m.themes.length) out.push(`Offers ${m.themes.length} colour theme(s)`)
  if (m.commands.length) out.push(`Adds ${m.commands.length} prompt shortcut(s)`)
  if (!out.length) out.push('Nothing: this plugin contributes no features')
  return out
}
