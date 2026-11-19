import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { workspacePath } from './files'

const DIR = '.ventriee/attachments'
const TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** Saves a pasted or dropped image in the project, so agents can open it too; returns its project-relative path. */
export function saveAttachment(root: string, name: unknown, data: unknown): string {
  const ext = extname(String(name ?? '')).toLowerCase() || '.png'
  if (!TYPES.has(ext)) throw new Error('Attach a PNG, JPEG, WebP or GIF image')
  if (!(data instanceof Uint8Array) || !data.length || data.length > 5 * 1024 * 1024) throw new Error('Images can be up to 5 MB')
  const rel = `${DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  mkdirSync(join(root, DIR), { recursive: true })
  writeFileSync(workspacePath(root, rel), data)
  return rel
}

/** Absolute paths for the attachments the renderer names; anything outside the attachments folder, or missing, is dropped. */
export function attachmentPaths(root: string, paths: unknown): string[] {
  if (!Array.isArray(paths)) return []
  return paths.slice(0, 4).flatMap((p) => {
    try {
      if (typeof p !== 'string' || !p.startsWith(`${DIR}/`)) return []
      const abs = workspacePath(root, p)
      return existsSync(abs) ? [abs] : []
    } catch { return [] }
  })
}
