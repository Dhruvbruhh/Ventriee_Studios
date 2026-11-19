import { readFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { parseJsonc } from './typeindex'
import type { Catalog } from '../shared/catalog'

export interface LaunchConfig { name: string; type: string; request: string; [key: string]: unknown }

/** Debug configurations from `.vscode/launch.json` and `.ventriee/launch.json`, VS Code's format. */
export function launchConfigs(root: string): LaunchConfig[] {
  const out: LaunchConfig[] = []
  for (const file of [join(root, '.ventriee', 'launch.json'), join(root, '.vscode', 'launch.json')]) {
    try {
      const parsed = parseJsonc(readFileSync(file, 'utf8')) as { configurations?: unknown }
      for (const c of Array.isArray(parsed?.configurations) ? parsed.configurations : []) {
        const config = c as LaunchConfig
        if (config && typeof config.name === 'string' && typeof config.type === 'string' && !out.some((o) => o.name === config.name)) out.push({ ...config, request: typeof config.request === 'string' ? config.request : 'launch' })
      }
    } catch { /* no file, or not valid JSON: skipped */ }
  }
  return out.slice(0, 100)
}

/** VS Code's `${…}` variables in a configuration, for the given open file. */
export function substitute<T>(value: T, root: string, file: string | null): T {
  const abs = file ? join(root, file) : ''
  const vars: Record<string, string> = {
    workspaceFolder: root, workspaceRoot: root, workspaceFolderBasename: basename(root), cwd: root,
    file: abs, relativeFile: file ?? '', fileDirname: abs ? dirname(abs) : root, fileBasename: abs ? basename(abs) : '',
    fileExtname: abs ? extname(abs) : '', fileBasenameNoExtension: abs ? basename(abs, extname(abs)) : '', exe: process.platform === 'win32' ? '.exe' : '', pathSeparator: process.platform === 'win32' ? '\\' : '/'
  }
  const walk = (v: unknown): unknown => typeof v === 'string'
    ? v.replace(/\$\{(env:)?([\w.]+)\}/g, (whole, env: string | undefined, name: string) => (env ? process.env[name] ?? '' : vars[name] ?? whole))
    : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v
  return walk(value) as T
}

/** VS Code `type` names for the debuggers in the catalog. */
const TYPES: Record<string, string> = { python: 'debugpy', debugpy: 'debugpy', go: 'delve', lldb: 'lldb', 'lldb-dap': 'lldb', codelldb: 'lldb', cppdbg: 'lldb' }

/** Which debugger runs a configuration (or the current file of a language): 'node' for the built-in Node.js one. */
export function debuggerFor(catalog: Catalog, config: LaunchConfig | null, language: string): string | null {
  if (config) {
    if (['node', 'pwa-node', 'node-terminal'].includes(config.type)) return 'node'
    return catalog.debuggers.find((d) => d.id === config.type)?.id ?? TYPES[config.type] ?? null
  }
  if (['javascript', 'typescript'].includes(language)) return 'node'
  return catalog.debuggers.find((d) => d.languages.includes(language))?.id ?? null
}
