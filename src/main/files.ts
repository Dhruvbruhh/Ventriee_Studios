import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { TextDecoder } from 'node:util'
import { isInside } from './paths'
import type { FileEntry, SearchResult, TextFile } from '../shared/workspace'
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
const HIDDEN = new Set(['.git', '.ventriee', 'node_modules', '.next', 'dist', 'out', '__pycache__', '.venv'])
export function workspacePath(root: string, path: unknown, allowRoot = false): string {
  if (typeof path !== 'string' || path.length > 2048 || /[\x00-\x1f]/.test(path) || isAbsolute(path) || /^[\\/]/.test(path) || /[:*?"<>|]/.test(path)) throw new Error('Invalid workspace path')
  const segments = path.replace(/\\/g, '/').split('/')
  if (segments.some((part) => part === '..' || part.toLowerCase() === '.git' || /[. ]$/.test(part) && part !== '.' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw new Error('Invalid workspace path')
  const target = resolve(root, path || '.')
  const rel = relative(resolve(root), target)
  if ((!allowRoot && !rel) || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !isInside(root, target)) throw new Error('Path is outside the workspace')
  // Editing through links is intentionally refused, even if the link stays inside the project.
  let cursor = resolve(root)
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Linked paths cannot be edited')
  }
  return target
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
export class FileService {
  find(root: string, query: string): FileEntry[] {
    if (typeof query !== 'string' || query.length > 200) throw new Error('Invalid file search')
    return this.walk(root, 100, (entry) => entry.path.toLowerCase().includes(query.toLowerCase()))
  }
  /** Text search across project files, bounded by file count and hit count so large repositories stay responsive. */
  async search(root: string, query: string, caseSensitive = false): Promise<SearchResult> {
    if (typeof query !== 'string' || !query || query.length > 200) throw new Error('Enter up to 200 characters to search')
    const needle = caseSensitive ? query : query.toLowerCase()
    const files = this.walk(root, 5000, () => true)
    const hits: SearchResult['hits'] = []
    let filesSearched = 0
    for (const file of files) {
      if (hits.length >= 500) break
      let bytes: Buffer
      try { bytes = await readFile(workspacePath(root, file.path)) } catch { continue }
      if (bytes.length > MAX_TEXT_BYTES || bytes.includes(0)) continue
      filesSearched++
      const lines = bytes.toString('utf8').split(/\r?\n/)
      for (let i = 0; i < lines.length && hits.length < 500; i++) {
        const column = (caseSensitive ? lines[i] : lines[i].toLowerCase()).indexOf(needle)
        if (column >= 0) hits.push({ path: file.path, line: i + 1, column: column + 1, preview: lines[i].slice(Math.max(0, column - 60), column + 140) })
      }
    }
    return { hits, filesSearched, truncated: hits.length >= 500 || files.length >= 5000 }
  }
  private walk(root: string, limit: number, match: (entry: FileEntry) => boolean): FileEntry[] {
    const found: FileEntry[] = []
    const queue = ['']
    let visited = 0
    while (queue.length && visited < 5000 && found.length < limit) {
      const path = queue.shift()!
      let entries: FileEntry[]
      try { entries = this.list(root, path) } catch { continue }
      for (const entry of entries) {
        visited++
        if (entry.directory) queue.push(entry.path)
        else if (match(entry)) found.push(entry)
        if (visited >= 5000 || found.length >= limit) break
      }
    }
    return found
  }
  list(root: string, path = ''): FileEntry[] {
    const target = workspacePath(root, path, true)
    return readdirSync(target, { withFileTypes: true }).filter((entry) => !HIDDEN.has(entry.name) && !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile()))
      .slice(0, 2000).map((entry) => ({ name: entry.name, path: relative(root, join(target, entry.name)).replace(/\\/g, '/'), directory: entry.isDirectory() }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  }
  read(root: string, path: string): TextFile {
    const target = workspacePath(root, path)
    if (!statSync(target).isFile()) throw new Error('Select a regular text file')
    if (statSync(target).size > MAX_TEXT_BYTES) throw new Error('This file exceeds the 2 MB editor limit')
    const bytes = readFileSync(target)
    if (bytes.includes(0)) throw new Error('Binary files cannot be edited as text')
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error('Only UTF-8 text files are supported') }
    return { path, text, version: digest(bytes), bom: bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) }
  }
  save(root: string, file: TextFile): TextFile {
    if (!file || typeof file.text !== 'string' || typeof file.version !== 'string' || typeof file.bom !== 'boolean') throw new Error('Invalid file contents')
    const target = workspacePath(root, file.path)
    const bytes = Buffer.from((file.bom ? '\ufeff' : '') + file.text, 'utf8')
    if (bytes.length > MAX_TEXT_BYTES || bytes.includes(0)) throw new Error('Only text files up to 2 MB can be saved')
    if (!existsSync(target) || this.read(root, file.path).version !== file.version) throw new Error('File changed on disk. Reload it or save your edits under a new name.')
    const temp = join(dirname(target), `.ventriee-${randomUUID()}.tmp`)
    let fd: number | undefined
    try {
      fd = openSync(temp, 'wx', statSync(target).mode)
      writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined
      // Recheck immediately before replacement so agent edits cannot be silently lost.
      if (this.read(root, file.path).version !== file.version) throw new Error('File changed on disk while saving')
      renameSync(temp, target)
    } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp) }
    return this.read(root, file.path)
  }
  create(root: string, path: string, directory: boolean) {
    const target = workspacePath(root, path)
    if (directory) mkdirSync(target)
    else writeFileSync(target, '', { flag: 'wx' })
  }
}
