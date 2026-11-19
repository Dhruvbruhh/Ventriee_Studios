import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseJsonc } from './typeindex'
import { findExecutable } from './lsp'
import type { Catalog, DebuggerSpec } from '../shared/catalog'

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
const TYPES: Record<string, string> = { python: 'debugpy', debugpy: 'debugpy', go: 'delve', lldb: 'lldb', 'lldb-dap': 'lldb', codelldb: 'lldb', cppdbg: 'lldb', java: 'java' }

/** Which debugger runs a configuration (or the current file of a language): 'node' for the built-in Node.js one. */
export function debuggerFor(catalog: Catalog, config: LaunchConfig | null, language: string): string | null {
  if (config) {
    if (['node', 'pwa-node', 'node-terminal'].includes(config.type)) return 'node'
    return catalog.debuggers.find((d) => d.id === config.type)?.id ?? TYPES[config.type] ?? null
  }
  if (['javascript', 'typescript'].includes(language)) return 'node'
  return catalog.debuggers.find((d) => d.languages.includes(language))?.id ?? null
}

/** Java: the language server (with java-debug loaded) finds the file's main class and classpath, and runs the adapter. */
export async function javaLaunch(spec: DebuggerSpec, ask: (command: string, args?: unknown[]) => Promise<unknown>, root: string, file: string, config: Record<string, unknown> | null) {
  const abs = join(root, file)
  const mains = ((await ask('vscode.java.resolveMainClass', [pathToFileURL(abs).href])) ?? []) as Array<{ mainClass: string; projectName: string; filePath?: string }>
  const main = config?.mainClass ? mains.find((m) => m.mainClass === config.mainClass) ?? { mainClass: String(config.mainClass), projectName: String(config.projectName ?? '') }
    : mains.find((m) => m.filePath && resolve(m.filePath).toLowerCase() === resolve(abs).toLowerCase())
  if (!main) throw new Error('This file has no main method to run. Open the file with `public static void main`, or pick a launch configuration.')
  const [modulePaths, classPaths] = ((await ask('vscode.java.resolveClasspath', [main.mainClass, main.projectName])) ?? [[], []]) as [string[], string[]]
  const port = Number(await ask(spec.languageServerCommand!))
  if (!port) throw new Error('The Java language server did not start the debugger')
  return { port, args: { ...(config ?? substitute(spec.launch, root, file)), mainClass: main.mainClass, projectName: main.projectName, modulePaths, classPaths } }
}

/** Launch arguments for "debug the current file": builds it first when the debugger needs a compiled program. */
export async function currentFileLaunch(spec: DebuggerSpec, language: string, root: string, file: string): Promise<Record<string, unknown>> {
  const args = substitute(spec.launch, root, file)
  const candidates = spec.build?.[language]
  if (!candidates) return args
  const found = candidates.map((c) => ({ c, exe: findExecutable(c[0]) })).find((x) => x.exe)
  if (!found) throw new Error(`Install a compiler to debug this file: ${candidates.map((c) => c[0]).join(' or ')}`)
  const [, ...rest] = substitute(found.c, root, file)
  const output = await new Promise<string>((resolve, reject) => execFile(found.exe!, rest, { cwd: root, windowsHide: true, timeout: 5 * 60_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (!error) { resolve(stdout); return }
    // cargo's JSON carries the compiler messages; show their rendered text, not raw JSON.
    const rendered = jsonLines(stdout).map((m) => m?.message?.rendered).filter(Boolean).join('')
    reject(new Error(`The build failed:\n${String(rendered || stderr || error.message).trim().split('\n').slice(-30).join('\n')}`))
  }))
  const built = jsonLines(output).map((m) => m?.executable).filter(Boolean).at(-1)
  return built ? { ...args, program: built } : args
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonLines = (text: string): any[] => text.split('\n').flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
