import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseJsonc } from './typeindex'
import type { ProjectTask } from '../shared/workspace'

const quote = (s: string) => (/^[\w./:=@-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`)

/** Tasks a project already defines: .vscode/tasks.json, package.json scripts, Makefile targets, and the usual Go and Cargo commands. */
export function listTasks(root: string): ProjectTask[] {
  const out: ProjectTask[] = []
  try {
    const parsed = parseJsonc(readFileSync(join(root, '.vscode', 'tasks.json'), 'utf8')) as { tasks?: Array<{ label?: string; type?: string; command?: string; args?: Array<string | { value: string }>; script?: string; options?: { cwd?: string } }> }
    for (const t of parsed?.tasks ?? []) {
      const args = (t.args ?? []).map((a) => (typeof a === 'string' ? a : a?.value ?? '')).map(quote)
      const command = t.type === 'npm' && t.script ? `npm run ${t.script}` : t.command ? [t.command, ...args].join(' ') : ''
      if (command) out.push({ label: t.label ?? command, command: command.replace(/\$\{workspaceFolder\}/g, root), source: 'tasks.json' })
    }
  } catch { /* none, or not valid JSON */ }
  try {
    const scripts = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
    const runner = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : existsSync(join(root, 'bun.lockb')) ? 'bun run' : 'npm run'
    for (const name of Object.keys(scripts)) out.push({ label: `${name}`, command: `${runner} ${name}`, source: 'package.json', detail: scripts[name] })
  } catch { /* not a Node project */ }
  try {
    const make = readFileSync(join(root, 'Makefile'), 'utf8')
    for (const m of make.matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)) if (!out.some((t) => t.label === `make ${m[1]}`)) out.push({ label: `make ${m[1]}`, command: `make ${m[1]}`, source: 'Makefile' })
  } catch { /* no Makefile */ }
  if (existsSync(join(root, 'go.mod'))) for (const c of ['go build ./...', 'go run .', 'go vet ./...']) out.push({ label: c, command: c, source: 'go.mod' })
  if (existsSync(join(root, 'Cargo.toml'))) for (const c of ['cargo build', 'cargo run', 'cargo check', 'cargo clippy']) out.push({ label: c, command: c, source: 'Cargo.toml' })
  return out.slice(0, 300)
}
