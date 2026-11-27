import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Store } from './store'
import type { SkillService } from './skills'
import type { PluginInfo } from '../shared/types'
import { compareVersions, permissionsOf, readManifest, type PluginManifest } from './pluginManifest'
import { serverName } from './mcpRegistry'
import { parseManifest } from '../shared/agents'

type Source = PluginInfo['source']
const KV = 'plugins'
const SKIP = /(^|[\\/])(node_modules|\.git)([\\/]|$)/

/** Declarative plugins: files are read and checked, nothing in a plugin is ever executed by the studio. */
export class PluginService {
  private staged = new Map<string, { dir: string; source: Source }>()
  constructor(private store: Store, private skills: SkillService, private userData: string, private appVersion: string) {}

  private get root() { return join(this.userData, 'plugins') }
  private get skillsRoot() { return join(this.userData, 'skills') }

  list(): PluginInfo[] {
    try { return JSON.parse(this.store.db.kvGet(KV) ?? '[]') as PluginInfo[] } catch { return [] }
  }
  private saveList(list: PluginInfo[]) { this.store.db.kvSet(KV, JSON.stringify(list)) }

  /** Fetch a plugin into a staging folder and report what it would do, without installing anything. */
  async preview(source: Source): Promise<{ token: string; id: string; name: string; version: string; description: string; installed: string | null; permissions: string[]; errors: string[] }> {
    const dir = join(this.root, '.staging', randomUUID())
    mkdirSync(dir, { recursive: true })
    try {
      if (source.type === 'git') {
        if (!/^https:\/\/[\w.-]+\/[\w./-]+$/.test(source.value)) throw new Error('Use an https:// Git address')
        await new Promise<void>((resolve, reject) => execFile('git', ['clone', '--depth', '1', '--', source.value, dir], { windowsHide: true, timeout: 120_000 },
          (err, _out, stderr) => (err ? reject(new Error(`git clone failed: ${String(stderr || err.message).trim().split('\n').at(-1)}`)) : resolve())))
      } else {
        if (!existsSync(source.value)) throw new Error('That folder does not exist')
        cpSync(source.value, dir, { recursive: true, filter: (p) => !SKIP.test(p.slice(source.value.length)) })
      }
      const { manifest, errors } = readManifest(dir, this.appVersion)
      const token = randomUUID()
      this.staged.set(token, { dir, source })
      return { token, id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description, installed: this.list().find((p) => p.id === manifest.id)?.version ?? null, permissions: permissionsOf(manifest), errors: [...errors, ...this.missingDeps(manifest)] }
    } catch (e) {
      rmSync(dir, { recursive: true, force: true })
      throw e
    }
  }

  private missingDeps(m: PluginManifest): string[] {
    const installed = this.list()
    return Object.entries(m.dependencies).flatMap(([dep, min]) => {
      const have = installed.find((p) => p.id === dep)
      return !have ? [`Needs the plugin "${dep}" ${min} or newer: install it first`] : compareVersions(have.version, min) < 0 ? [`Needs "${dep}" ${min} or newer (installed: ${have.version})`] : []
    })
  }

  /** Install (or update) a previewed plugin. */
  install(token: string, adoptSkills = false): PluginInfo {
    const staged = this.staged.get(token)
    if (!staged) throw new Error('Preview the plugin again before installing')
    this.staged.delete(token)
    try {
      const { manifest, errors } = readManifest(staged.dir, this.appVersion)
      const missing = this.missingDeps(manifest)
      if (missing.length) throw new Error(missing.join('; '))
      const previous = this.list().find((p) => p.id === manifest.id)
      const keepMcp = previous ? this.removeContributions(previous) : new Map()

      const added: PluginInfo['added'] = { skills: [], mcpServers: [], workflows: [], agents: [] }
      const owned = new Set(this.list().filter((p) => p.id !== manifest.id).flatMap((p) => p.added.skills))
      for (const dir of manifest.skills) {
        const name = basename(dir)
        // adoptSkills: a trusted pack takes over same-named copies it shipped before (older builds bundled them), never another plugin's.
        if (existsSync(join(this.skillsRoot, name)) && adoptSkills && !owned.has(name)) rmSync(join(this.skillsRoot, name), { recursive: true, force: true })
        if (existsSync(join(this.skillsRoot, name))) { errors.push(`Skill "${name}" already exists, so the plugin's copy was skipped`); continue }
        const r = this.skills.installFrom(dir)
        if (r.removed) errors.push(`Skill "${name}" was rejected by the security scan (${r.report.findings[0]?.title ?? 'serious findings'})`)
        else if (r.skill) added.skills.push(name)
      }
      const servers = this.store.settings().mcpServers
      for (const s of manifest.mcpServers) {
        const name = serverName(s.name, [...servers.map((x) => x.name), ...added.mcpServers])
        const kept = keepMcp.get(s.name)
        servers.push({ ...s, name, enabled: kept?.enabled ?? false, env: { ...s.env, ...kept?.env } })
        added.mcpServers.push(name)
      }
      this.store.saveSettings({ mcpServers: servers })
      for (const w of manifest.workflows) added.workflows.push(this.store.saveWorkflow({ ...w, projectId: null, enabled: false }).id)
      if (manifest.catalogue) {
        try {
          const parsed = parseManifest(JSON.parse(readFileSync(manifest.catalogue, 'utf8')), { skills: this.skills.scan().map((s) => s.id), mcpServers: servers.map((s) => s.name) })
          this.store.importAgents(parsed, true)
          added.agents = parsed.templates.map((t) => t.role)
        } catch (e) { errors.push(`Agent catalogue skipped: ${(e as Error).message}`) }
      }

      const target = join(this.root, manifest.id)
      rmSync(target, { recursive: true, force: true })
      renameSync(staged.dir, target)
      const info: PluginInfo = {
        id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author,
        source: staged.source, installedAt: Date.now(), dependencies: manifest.dependencies, permissions: permissionsOf(manifest),
        agents: manifest.agents, themes: manifest.themes, commands: manifest.commands, added, errors
      }
      this.saveList([...this.list().filter((p) => p.id !== info.id), info])
      return info
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  }

  /** Take back what a plugin added; returns MCP servers' on/off state and env so an update keeps the owner's choices. */
  private removeContributions(p: PluginInfo): Map<string, { enabled: boolean; env?: Record<string, string> }> {
    const settings = this.store.settings()
    const kept = new Map(settings.mcpServers.filter((s) => p.added.mcpServers.includes(s.name)).map((s) => [s.name, { enabled: s.enabled, env: s.env }]))
    this.store.saveSettings({ mcpServers: settings.mcpServers.filter((s) => !p.added.mcpServers.includes(s.name)) })
    for (const name of p.added.skills) rmSync(join(this.skillsRoot, name), { recursive: true, force: true })
    for (const id of p.added.workflows) this.store.deleteWorkflow(id)
    for (const role of p.added.agents ?? []) this.store.deleteAgentTemplate(role)
    this.skills.scan()
    return kept
  }

  remove(id: string) {
    const list = this.list()
    const p = list.find((x) => x.id === id)
    if (!p) throw new Error('That plugin is not installed')
    const dependents = list.filter((x) => x.dependencies[id]).map((x) => x.name)
    if (dependents.length) throw new Error(`Remove ${dependents.join(', ')} first: ${dependents.length === 1 ? 'it needs' : 'they need'} this plugin`)
    this.removeContributions(p)
    rmSync(join(this.root, id), { recursive: true, force: true })
    this.saveList(list.filter((x) => x.id !== id))
  }

  /** Keep a trusted team pack installed and current from its Git address. Only people who can clone the repo get it. */
  async syncPack(url: string): Promise<string> {
    const p = await this.preview({ type: 'git', value: url.trim() })
    if (p.installed && compareVersions(p.installed, p.version) >= 0) { this.discard(p.token); return `${p.name} ${p.installed} is up to date` }
    const info = this.install(p.token, true)
    return `${info.name} ${info.version} installed`
  }

  discard(token: string) {
    const staged = this.staged.get(token)
    if (staged) rmSync(staged.dir, { recursive: true, force: true })
    this.staged.delete(token)
  }
}
