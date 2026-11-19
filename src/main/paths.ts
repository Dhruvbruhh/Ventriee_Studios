import { resolve, sep, dirname, basename, join } from 'node:path'
import { realpathSync } from 'node:fs'

function physicalPath(path: string): string {
  const absolute = resolve(path)
  try { return realpathSync(absolute) } catch {
    const parent = dirname(absolute)
    return parent === absolute ? absolute : join(physicalPath(parent), basename(absolute))
  }
}

/**
 * True when `target` really sits inside `root`.
 * A bare `startsWith` is not enough: `D:\work\site-evil` starts with
 * `D:\work\site` but is a sibling directory. Compare whole path segments.
 * Windows paths are compared case-insensitively.
 */
export function isInside(root: string, target: string): boolean {
  if (!root || !target) return false
  const normalize = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const base = normalize(physicalPath(root))
  const full = normalize(physicalPath(target))
  if (full === base) return true
  return full.startsWith(base.endsWith(sep) ? base : base + sep)
}
