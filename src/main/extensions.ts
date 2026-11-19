import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { unzipSync } from 'fflate'
import { parseJsonc } from './typeindex'
import type { ExtensionContributions, ExtensionInfo, ExtensionSearchHit } from '../shared/workspace'

const REGISTRY = 'https://open-vsx.org/api'
const MAX_DOWNLOAD = 60 * 1024 * 1024
const MAX_UNPACKED = 200 * 1024 * 1024
const MAX_ENTRIES = 20_000
const ID = /^[\w-]+(\.[\w-]+)?$/

/** What we can use without running the extension's code: everything here is data. */
const SUPPORTED = ['themes', 'snippets', 'languages', 'grammars'] as const
type Manifest = { name: string; publisher: string; displayName?: string; description?: string; version: string; main?: string; browser?: string; contributes?: Record<string, unknown> }

export function supportOf(manifest: Manifest): { supported: string[]; needsRuntime: boolean } {
  const contributes = manifest.contributes ?? {}
  const supported = SUPPORTED.filter((k) => Array.isArray(contributes[k]) && (contributes[k] as unknown[]).length)
  return { supported: [...supported], needsRuntime: Boolean(manifest.main || manifest.browser) }
}

/** Unpacks a .vsix (a zip) into `dest`, refusing paths that escape it and archives too large to be honest. */
export function unpackVsix(zip: Uint8Array, dest: string) {
  let total = 0
  let count = 0
  const files = unzipSync(zip, { filter: (f) => {
    if (++count > MAX_ENTRIES) throw new Error('The extension has too many files')
    if ((total += f.originalSize) > MAX_UNPACKED) throw new Error('The extension is too large')
    return f.name.startsWith('extension/') && !f.name.endsWith('/')
  } })
  const root = normalize(dest + sep)
  for (const [name, data] of Object.entries(files)) {
    const target = normalize(join(dest, name.slice('extension/'.length)))
    if (!target.startsWith(root)) throw new Error(`Unsafe path in the extension: ${name}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
  if (!existsSync(join(dest, 'package.json'))) throw new Error('Not a VS Code extension: package.json is missing')
}

const getJson = async <T>(url: string): Promise<T> => {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`Open VSX answered ${r.status}`)
  return r.json() as Promise<T>
}

export class ExtensionService {
  private stateFile: string
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true })
    this.stateFile = join(dir, 'state.json')
  }

  private state(): { disabled: string[] } { try { return JSON.parse(readFileSync(this.stateFile, 'utf8')) } catch { return { disabled: [] } } }

  async search(query: string): Promise<ExtensionSearchHit[]> {
    const r = await getJson<{ extensions?: Array<{ namespace: string; name: string; version: string; displayName?: string; description?: string; downloadCount?: number; files?: { icon?: string } }> }>(
      `${REGISTRY}/-/search?${new URLSearchParams({ query: query.slice(0, 200), size: '30', sortBy: 'relevance' })}`)
    return (r.extensions ?? []).map((e) => ({ id: `${e.namespace}.${e.name}`, name: e.displayName || e.name, publisher: e.namespace, version: e.version, description: e.description ?? '', downloads: e.downloadCount ?? 0, icon: e.files?.icon ?? null }))
  }

  /** Registry details plus what the extension would do here, read from its package.json before installing. */
  async details(id: string): Promise<ExtensionSearchHit & { supported: string[]; needsRuntime: boolean; readme: string }> {
    if (!ID.test(id) || !id.includes('.')) throw new Error('Invalid extension id')
    const [ns, name] = id.split('.')
    const e = await getJson<{ namespace: string; name: string; version: string; displayName?: string; description?: string; downloadCount?: number; files: { manifest?: string; readme?: string; icon?: string } }>(`${REGISTRY}/${ns}/${name}`)
    const manifest = e.files.manifest ? await getJson<Manifest>(e.files.manifest) : null
    const readme = e.files.readme ? await fetch(e.files.readme).then((r) => (r.ok ? r.text() : ''), () => '') : ''
    return { id, name: e.displayName || e.name, publisher: e.namespace, version: e.version, description: e.description ?? '', downloads: e.downloadCount ?? 0, icon: e.files.icon ?? null,
      ...(manifest ? supportOf(manifest) : { supported: [], needsRuntime: true }), readme: readme.slice(0, 200_000) }
  }

  async install(id: string): Promise<ExtensionInfo> {
    if (!ID.test(id) || !id.includes('.')) throw new Error('Invalid extension id')
    const [ns, name] = id.split('.')
    const e = await getJson<{ version: string; files: { download: string; sha256?: string } }>(`${REGISTRY}/${ns}/${name}`)
    const response = await fetch(e.files.download)
    if (!response.ok) throw new Error(`Download failed (${response.status})`)
    if (Number(response.headers.get('content-length') ?? 0) > MAX_DOWNLOAD) throw new Error('The extension is too large')
    const zip = new Uint8Array(await response.arrayBuffer())
    if (zip.length > MAX_DOWNLOAD) throw new Error('The extension is too large')
    if (e.files.sha256) {
      const expected = (await fetch(e.files.sha256).then((r) => r.text())).trim().split(/\s+/)[0].toLowerCase()
      if (expected && createHash('sha256').update(zip).digest('hex') !== expected) throw new Error('The download does not match the registry checksum')
    }
    const staging = join(this.dir, `.staging-${id}-${Date.now()}`)
    try {
      unpackVsix(zip, staging)
      const manifest = JSON.parse(readFileSync(join(staging, 'package.json'), 'utf8')) as Manifest
      const support = supportOf(manifest)
      if (!support.supported.length) throw new Error(support.needsRuntime ? 'This extension needs the VS Code runtime to run its code, which Ventriee does not run. Only themes, snippets, languages and grammars are supported.' : 'This extension contributes nothing Ventriee can use')
      const target = join(this.dir, id)
      rmSync(target, { recursive: true, force: true })
      renameSync(staging, target)
      return this.info(id)!
    } finally { rmSync(staging, { recursive: true, force: true }) }
  }

  uninstall(id: string) {
    if (!ID.test(id)) throw new Error('Invalid extension id')
    rmSync(join(this.dir, id), { recursive: true, force: true })
  }

  setEnabled(id: string, enabled: boolean) {
    const disabled = new Set(this.state().disabled)
    if (enabled) disabled.delete(id); else disabled.add(id)
    writeFileSync(this.stateFile, JSON.stringify({ disabled: [...disabled] }))
  }

  private manifest(id: string): Manifest | null { try { return JSON.parse(readFileSync(join(this.dir, id, 'package.json'), 'utf8')) as Manifest } catch { return null } }

  info(id: string): ExtensionInfo | null {
    const m = this.manifest(id)
    if (!m) return null
    return { id, name: m.displayName || m.name, publisher: m.publisher, version: m.version, description: m.description ?? '', enabled: !this.state().disabled.includes(id), ...supportOf(m) }
  }

  list(): ExtensionInfo[] {
    return readdirSync(this.dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => this.info(d.name)).filter((x): x is ExtensionInfo => Boolean(x))
  }

  /** Newer versions in the registry for installed extensions. */
  async updates(): Promise<Array<{ id: string; version: string }>> {
    const out: Array<{ id: string; version: string }> = []
    for (const ext of this.list()) {
      const [ns, name] = ext.id.split('.')
      const latest = await getJson<{ version: string }>(`${REGISTRY}/${ns}/${name}`).catch(() => null)
      if (latest && latest.version !== ext.version) out.push({ id: ext.id, version: latest.version })
    }
    return out
  }

  /** Every enabled extension's data contributions, files read and resolved, ready for the editor. */
  contributions(): ExtensionContributions {
    const out: ExtensionContributions = { themes: [], snippets: [], languages: [], grammars: [] }
    for (const ext of this.list().filter((e) => e.enabled)) {
      const base = join(this.dir, ext.id)
      const m = this.manifest(ext.id)!
      const c = m.contributes ?? {}
      const read = (rel: unknown) => {
        if (typeof rel !== 'string') return null
        const file = normalize(join(base, rel))
        if (!file.startsWith(normalize(base + sep))) return null
        try { return readFileSync(file, 'utf8') } catch { return null }
      }
      const readTheme = (rel: string, depth = 0): { colors: Record<string, string>; tokenColors: unknown[]; type?: string } | null => {
        const text = read(rel)
        if (!text || depth > 5) return null
        const t = parseJsonc(text) as { include?: string; colors?: Record<string, string>; tokenColors?: unknown[] | string; type?: string }
        const parent = t.include ? readTheme(join(dirname(rel), t.include), depth + 1) : null
        // tokenColors may point to a TextMate .tmTheme file; only the JSON form is supported.
        const own = Array.isArray(t.tokenColors) ? t.tokenColors : []
        return { colors: { ...parent?.colors, ...t.colors }, tokenColors: [...(parent?.tokenColors ?? []), ...own], type: t.type ?? parent?.type }
      }
      for (const t of (c.themes as Array<{ label?: string; uiTheme?: string; path: string; id?: string }> | undefined) ?? []) {
        const theme = readTheme(t.path)
        if (theme) out.themes.push({ id: `${ext.id}/${t.id ?? t.label ?? t.path}`, label: t.label ?? t.id ?? ext.name, dark: t.uiTheme !== 'vs' && t.uiTheme !== 'hc-light', ...theme })
      }
      for (const s of (c.snippets as Array<{ language: string; path: string }> | undefined) ?? []) {
        const text = read(s.path)
        if (text) out.snippets.push({ language: s.language, snippets: parseJsonc(text) as Record<string, { prefix: string | string[]; body: string | string[]; description?: string }> })
      }
      for (const l of (c.languages as Array<{ id: string; extensions?: string[]; filenames?: string[]; aliases?: string[]; configuration?: string }> | undefined) ?? []) {
        const config = read(l.configuration)
        out.languages.push({ id: l.id, extensions: l.extensions, filenames: l.filenames, aliases: l.aliases, configuration: config ? parseJsonc(config) as Record<string, unknown> : undefined })
      }
      for (const g of (c.grammars as Array<{ language?: string; scopeName: string; path: string; embeddedLanguages?: Record<string, string> }> | undefined) ?? []) {
        const content = read(g.path)
        if (content) out.grammars.push({ language: g.language, scopeName: g.scopeName, path: g.path, content })
      }
    }
    return out
  }
}
