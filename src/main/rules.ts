import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Instruction files other AI tools use, so a project keeps its rules when it moves here. */
const FILES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md']
const PER_FILE = 6000
const TOTAL = 12_000

export function projectRules(root: string): string {
  let out = ''
  for (const name of FILES) {
    let text: string
    try { text = readFileSync(join(root, name), 'utf8').trim() } catch { continue }
    if (!text) continue
    const part = `--- ${name} ---\n${text.length > PER_FILE ? `${text.slice(0, PER_FILE)}\n… (cut)` : text}\n`
    if (out.length + part.length > TOTAL) break
    out += part
  }
  return out
}

export const withRules = (system: string, root: string) => {
  const rules = projectRules(root)
  return rules ? `${system}\n\nThe project's own rules for AI assistants (follow them unless they conflict with the owner's request):\n${rules}` : system
}
