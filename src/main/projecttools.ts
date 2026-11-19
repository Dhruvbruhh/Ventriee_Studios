import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { isInside } from './paths'
import { workspacePath } from './files'
import type { LintMessage } from '../shared/workspace'

/** The command-line script of a package installed in the project, or null. Never a global install. */
export function projectBin(root: string, pkg: string, name = pkg): string | null {
  const dir = join(root, 'node_modules', pkg)
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { bin?: string | Record<string, string> }
    const rel = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[name]
    if (!rel) return null
    const script = join(dir, rel)
    return existsSync(script) && isInside(realpathSync(root), realpathSync(script)) ? script : null
  } catch { return null }
}

/** Run a project's own tool with text on stdin; the tool runs with the owner's permissions, like a terminal. */
function runTool(root: string, script: string, args: string[], input: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FORCE_COLOR: '0' } })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('The tool did not finish within 20 seconds')) }, 20_000)
    child.stdout.on('data', (d: Buffer) => { if (stdout.length < 8_000_000) stdout += d })
    child.stderr.on('data', (d: Buffer) => { if (stderr.length < 100_000) stderr += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }) })
    child.stdin.end(input)
  })
}

/** Format with the project's Prettier and its config; null when the project has no Prettier. */
export async function prettierFormat(root: string, path: string, text: string): Promise<string | null> {
  workspacePath(root, path)
  const script = projectBin(root, 'prettier')
  if (!script) return null
  const result = await runTool(root, script, ['--stdin-filepath', path], text)
  if (result.code !== 0) throw new Error(`Prettier could not format ${path}: ${result.stderr.trim().split('\n')[0]?.slice(0, 300) || `exit ${result.code}`}`)
  return result.stdout
}

/** ESLint findings for the buffer, using the project's ESLint and config; [] when either is missing. */
export async function eslintFile(root: string, path: string, text: string): Promise<LintMessage[]> {
  workspacePath(root, path)
  const script = projectBin(root, 'eslint')
  if (!script) return []
  const result = await runTool(root, script, ['--stdin', '--stdin-filename', path, '--format', 'json'], text)
  // 0: clean, 1: findings, 2: configuration or crash (no config, unsupported file): not the owner's code's fault.
  if (result.code === 2) return []
  try {
    const report = JSON.parse(result.stdout) as Array<{ messages: Array<{ line?: number; column?: number; endLine?: number; endColumn?: number; severity: number; message: string; ruleId?: string | null }> }>
    return (report[0]?.messages ?? []).slice(0, 500).map((m) => ({ line: m.line ?? 1, column: m.column ?? 1, endLine: m.endLine ?? m.line ?? 1, endColumn: m.endColumn ?? (m.column ?? 1) + 1,
      severity: m.severity === 2 ? 'error' : 'warning', message: m.ruleId ? `${m.message} (${m.ruleId})` : m.message }))
  } catch { return [] }
}
