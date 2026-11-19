import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { isInside } from './paths'
import type { FileService } from './files'
import type { ProjectTypes } from '../shared/workspace'

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i
const LIMITS = { sourceFiles: 1000, sourceBytes: 8_000_000, packages: 150, declarationsPerPackage: 400, libBytes: 25_000_000, fileBytes: 1_500_000 }

/** tsconfig.json allows comments and trailing commas; strip them outside strings before parsing. */
export function parseJsonc(text: string): unknown {
  let out = ''
  for (let i = 0, inString = false; i < text.length; i++) {
    const c = text[i]
    if (inString) { out += c; if (c === '\\') out += text[++i] ?? ''; else if (c === '"') inString = false; continue }
    if (c === '"') { inString = true; out += c; continue }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) break; i++; continue }
    out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/**
 * What the editor's TypeScript service needs to understand the project: its source
 * files, the type declarations of its declared dependencies, and its compiler options.
 * Bounded so a large repository stays responsive; reads only, and only inside the project.
 * shortcut: declared dependencies (and their @types) only, not their transitive types.
 */
export function projectTypes(root: string, files: FileService): ProjectTypes {
  const sources: ProjectTypes['sources'] = []
  let bytes = 0
  for (const entry of files.find(root, '', LIMITS.sourceFiles)) {
    if (!SOURCE.test(entry.path)) continue
    let text: string
    try { text = files.read(root, entry.path).text } catch { continue }
    if (bytes + text.length > LIMITS.sourceBytes) break
    bytes += text.length
    sources.push({ path: entry.path, text })
  }

  const libs: ProjectTypes['libs'] = []
  let libBytes = 0
  const real = realpathSync(root)
  const add = (abs: string) => {
    try {
      const size = statSync(abs).size
      if (size > LIMITS.fileBytes || libBytes + size > LIMITS.libBytes || !isInside(real, realpathSync(abs))) return false
      libBytes += size
      libs.push({ path: relative(root, abs).replace(/\\/g, '/'), text: readFileSync(abs, 'utf8') })
      return true
    } catch { return false }
  }
  const walkDeclarations = (dir: string, budget: { left: number }) => {
    let entries: import('node:fs').Dirent[]
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (budget.left <= 0) return
      if (e.isDirectory() && e.name !== 'node_modules') walkDeclarations(join(dir, e.name), budget)
      else if (e.isFile() && /\.d\.(ts|mts|cts)$/.test(e.name) && add(join(dir, e.name))) budget.left--
    }
  }

  let manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try { manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch { /* not a Node project */ }
  const names = [...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})])].slice(0, LIMITS.packages)
  for (const name of names) {
    const typesName = name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`
    for (const pkg of new Set([name, typesName])) {
      const dir = join(root, 'node_modules', pkg)
      if (!existsSync(join(dir, 'package.json'))) continue
      add(join(dir, 'package.json'))
      walkDeclarations(dir, { left: LIMITS.declarationsPerPackage })
    }
  }

  let compilerOptions: Record<string, unknown> = {}
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    try { compilerOptions = ((parseJsonc(readFileSync(join(root, name), 'utf8')) as { compilerOptions?: Record<string, unknown> }).compilerOptions) ?? {}; break } catch { /* try the next one */ }
  }
  return { sources, libs, compilerOptions, truncated: bytes >= LIMITS.sourceBytes || libBytes >= LIMITS.libBytes }
}
