import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_PER_FILE = 50
const MAX_BYTES = 1_000_000
const MAX_AGE = 30 * 86_400_000

/** Every saved version of a file, kept outside the project: what git and checkpoints miss between commits. */
export class HistoryService {
  constructor(private dir: string) {}

  private folder(projectId: string, path: string) {
    if (!/^[\w-]+$/.test(projectId)) throw new Error('Invalid project')
    return join(this.dir, projectId, createHash('sha1').update(path).digest('hex').slice(0, 20))
  }

  private ids(folder: string): string[] {
    try { return readdirSync(folder).filter((f) => /^\d+\.txt$/.test(f)).map((f) => f.slice(0, -4)).sort() } catch { return [] }
  }

  has(projectId: string, path: string) { return this.ids(this.folder(projectId, path)).length > 0 }

  /** Keeps `text` as a version unless it equals the latest one; prunes old and excess versions. */
  record(projectId: string, path: string, text: string, now = Date.now()) {
    if (Buffer.byteLength(text) > MAX_BYTES) return
    const folder = this.folder(projectId, path)
    const ids = this.ids(folder)
    const latest = ids.at(-1)
    if (latest && readFileSync(join(folder, `${latest}.txt`), 'utf8') === text) return
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'path'), path)
    const id = String(Math.max(now, latest ? Number(latest) + 1 : 0))
    writeFileSync(join(folder, `${id}.txt`), text)
    const all = [...ids, id]
    for (const old of all.filter((x, i) => i < all.length - MAX_PER_FILE || Number(x) < now - MAX_AGE).filter((x) => x !== id)) rmSync(join(folder, `${old}.txt`), { force: true })
  }

  list(projectId: string, path: string): Array<{ id: string; time: number; size: number }> {
    const folder = this.folder(projectId, path)
    return this.ids(folder).reverse().map((id) => ({ id, time: Number(id), size: statSync(join(folder, `${id}.txt`)).size }))
  }

  read(projectId: string, path: string, id: string): string {
    if (!/^\d+$/.test(id)) throw new Error('Invalid version')
    return readFileSync(join(this.folder(projectId, path), `${id}.txt`), 'utf8')
  }
}
