import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FileService } from '../files'
import type { CompiledContext, IndexSyncResult, RetrievedFile } from '../../shared/types'

/**
 * Project Intelligence Engine v1 — gives a worker the minimum relevant code
 * context for its task instead of relying on memory docs alone.
 *
 * Dependency-free on purpose (ponytail): an incremental content-hashed file
 * index plus BM25 lexical retrieval, no tree-sitter / vector DB / embeddings.
 * The seams to upgrade later are `tokenize` (swap for a parser) and `retrieve`
 * (swap BM25 for semantic search); the index format carries a `version` so a
 * richer index can supersede it.
 */

const INDEX_VERSION = 1
/** Keep the walk and the index bounded so a large repository stays responsive. */
const LIMITS = { files: 1500, fileChars: 400_000 }
/** Noise that is text but never worth retrieving over. */
const SKIP = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.min\.(?:js|css)$|\.map$|\.lock$/i
/** Content tokens shorter than this, and these common words, carry no signal. */
const STOP = new Set(
  ('the and for that with this from have not are was will can has you your they them then than into out over under return const let var function class interface type enum export import default extends implements public private static async await new void null undefined true false string number boolean object array value props state'.split(
    ' '
  ))
)

interface Entry {
  /** sha256 of the file bytes, from FileService.read — lets us skip unchanged files. */
  h: string
  /** document length (sum of token counts) for BM25 length normalisation. */
  len: number
  /** token -> frequency (path and symbol tokens are boosted into these counts). */
  t: Record<string, number>
}
interface Index {
  version: number
  files: Record<string, Entry>
}

function splitIdentifier(raw: string): string[] {
  // "runTaskV2_id" -> ["runtaskv2", "run", "task", "v2", "id"] ; keep the whole and the camel parts.
  const out: string[] = []
  for (const chunk of raw.split(/[^A-Za-z0-9]+/)) {
    if (!chunk) continue
    out.push(chunk.toLowerCase())
    for (const part of chunk.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      if (part && part.toLowerCase() !== chunk.toLowerCase()) out.push(part.toLowerCase())
    }
  }
  return out
}

function keep(token: string): boolean {
  return token.length >= 2 && token.length <= 40 && !STOP.has(token) && !/^\d+$/.test(token)
}

function tokenize(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const word of text.split(/[^A-Za-z0-9]+/)) {
    for (const token of splitIdentifier(word)) {
      if (keep(token)) counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  return counts
}

function pathTokens(path: string): string[] {
  return splitIdentifier(path).filter(keep)
}

/** Declared names (function/class/interface/type/enum/const foo). A boost, not a full parse. */
function extractSymbols(text: string): string[] {
  const names: string[] = []
  const re = /\b(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  for (let m = re.exec(text); m; m = re.exec(text)) names.push(...splitIdentifier(m[1]).filter(keep))
  return names
}

function buildEntry(path: string, hash: string, text: string): Entry {
  const counts = tokenize(text)
  const bump = (token: string, by: number) => counts.set(token, (counts.get(token) ?? 0) + by)
  for (const token of pathTokens(path)) bump(token, 3)
  for (const token of extractSymbols(text)) bump(token, 2)
  let len = 0
  const t: Record<string, number> = {}
  for (const [token, n] of counts) {
    t[token] = n
    len += n
  }
  return { h: hash, len, t }
}

function indexable(path: string): boolean {
  return !SKIP.test(path)
}

export class IntelligenceEngine {
  constructor(private files = new FileService()) {}

  private indexPath(root: string): string {
    return join(root, '.ventriee', 'intel-index.json')
  }

  private load(root: string): Index {
    try {
      const raw = JSON.parse(readFileSync(this.indexPath(root), 'utf8')) as Index
      if (raw?.version === INDEX_VERSION && raw.files) return raw
    } catch {
      /* missing or stale index: rebuild from scratch */
    }
    return { version: INDEX_VERSION, files: {} }
  }

  private save(root: string, index: Index) {
    const dir = join(root, '.ventriee')
    mkdirSync(dir, { recursive: true })
    // Never let the index (or anything else under .ventriee) be committed.
    const ignore = join(dir, '.gitignore')
    if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
    writeFileSync(this.indexPath(root), JSON.stringify(index), 'utf8')
  }

  /** Re-hash the workspace and re-tokenise only what changed. Detects add/change/rename/delete. */
  sync(root: string): IndexSyncResult {
    const old = this.load(root).files
    const current = new Map<string, { hash: string; text: string }>()
    for (const entry of this.files.find(root, '', LIMITS.files)) {
      if (!indexable(entry.path)) continue
      try {
        const file = this.files.read(root, entry.path)
        if (file.text.length > LIMITS.fileChars) continue
        current.set(entry.path, { hash: file.version, text: file.text })
      } catch {
        /* binary, too large, or unreadable: not indexable */
      }
    }

    const next: Record<string, Entry> = {}
    const changed: string[] = []
    const result: IndexSyncResult = { indexed: [], removed: [], renamed: [], unchanged: 0, total: current.size }

    for (const [path, { hash, text }] of current) {
      if (old[path]?.h === hash) {
        next[path] = old[path]
        result.unchanged++
      } else {
        next[path] = buildEntry(path, hash, text)
        changed.push(path)
      }
    }

    const removed = Object.keys(old).filter((p) => !current.has(p))
    // A deleted path whose content reappears under a new path is a rename, not a re-index.
    const removedByHash = new Map<string, string>()
    for (const p of removed) removedByHash.set(old[p].h, p)
    const renamedFrom = new Set<string>()
    for (const path of changed) {
      const from = removedByHash.get(next[path].h)
      if (from && !renamedFrom.has(from)) {
        renamedFrom.add(from)
        result.renamed.push({ from, to: path })
      } else {
        result.indexed.push(path)
      }
    }
    result.removed = removed.filter((p) => !renamedFrom.has(p))

    this.save(root, { version: INDEX_VERSION, files: next })
    return result
  }

  /** BM25 over the current index. Returns the most relevant files, highest score first. */
  retrieve(root: string, query: string, topN = 6): RetrievedFile[] {
    const index = this.load(root)
    const paths = Object.keys(index.files)
    if (!paths.length) return []
    const queryTokens = [...tokenize(query).keys()]
    if (!queryTokens.length) return []

    const N = paths.length
    const avgdl = paths.reduce((sum, p) => sum + index.files[p].len, 0) / N || 1
    const k1 = 1.5
    const b = 0.75

    const df = new Map<string, number>()
    for (const token of queryTokens) {
      let n = 0
      for (const p of paths) if (index.files[p].t[token]) n++
      df.set(token, n)
    }

    const scored = paths.map((path) => {
      const entry = index.files[path]
      let score = 0
      for (const token of queryTokens) {
        const tf = entry.t[token]
        if (!tf) continue
        const idf = Math.log(1 + (N - (df.get(token) ?? 0) + 0.5) / ((df.get(token) ?? 0) + 0.5))
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * entry.len) / avgdl)))
      }
      return { path, score }
    })

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, topN)
      .map((s) => ({ path: s.path, score: Number(s.score.toFixed(3)) }))
  }

  /**
   * Assemble a bounded context package: the memory docs (preserved whole, they
   * carry the task's own guidance) plus the most relevant code snippets, trimmed
   * to a character budget. Code is what gets trimmed first, never memory.
   */
  compile(root: string, input: { query: string; memoryBlock?: string; budget?: number; topN?: number; snippetChars?: number }): CompiledContext {
    const budget = input.budget ?? 14_000
    const memory = input.memoryBlock?.trim() ? input.memoryBlock.trim() : ''
    const files = this.retrieve(root, input.query, input.topN ?? 6)
    const queryTokens = new Set([...tokenize(input.query).keys()])

    const header = '### Relevant code in the workspace\n'
    let codeBudget = Math.max(0, budget - memory.length - header.length - 2)
    const blocks: string[] = []
    for (const file of files) {
      if (codeBudget <= 0) break
      let text = ''
      try {
        text = this.files.read(root, file.path).text
      } catch {
        continue
      }
      const snip = snippet(text, queryTokens, input.snippetChars ?? 1400)
      let block = `// ${file.path}  (relevance ${file.score})\n${snip}\n`
      if (block.length > codeBudget) block = block.slice(0, codeBudget) // keep the package within budget
      blocks.push(block)
      codeBudget -= block.length
    }

    const text = [memory, blocks.length ? header + blocks.join('\n') : '']
      .filter(Boolean)
      .join('\n\n')
    return { files, text }
  }
}

/** A window of up to `maxChars`, starting a few lines before the first query-token hit. */
function snippet(text: string, queryTokens: Set<string>, maxChars: number): string {
  const lines = text.split('\n')
  let start = 0
  for (let i = 0; i < lines.length; i++) {
    const hit = tokenize(lines[i])
    if ([...hit.keys()].some((t) => queryTokens.has(t))) {
      start = Math.max(0, i - 3)
      break
    }
  }
  return lines.slice(start).join('\n').slice(0, maxChars)
}
