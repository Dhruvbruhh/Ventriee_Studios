import { describe, expect, it } from 'vitest'
import { join, resolve, sep } from 'node:path'
import { isInside } from '../src/main/paths'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'

const root = resolve('D:/work/client-site')

describe('isInside', () => {
  it('rejects existing and future files reached through an escaping directory link', (context) => {
    const temp = mkdtempSync(join(tmpdir(), 'ventriee-path-'))
    try {
      const workspace = join(temp, 'workspace')
      const outside = join(temp, 'outside')
      mkdirSync(workspace)
      mkdirSync(outside)
      try {
        symlinkSync(outside, join(workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          context.skip('This environment does not permit directory links')
          return
        }
        throw error
      }
      expect(isInside(workspace, join(workspace, 'escape'))).toBe(false)
      expect(isInside(workspace, join(workspace, 'escape', 'future.txt'))).toBe(false)
    } finally { rmSync(temp, { recursive: true, force: true }) }
  })
  it('accepts the root itself and files under it', () => {
    expect(isInside(root, root)).toBe(true)
    expect(isInside(root, join(root, 'src', 'app.tsx'))).toBe(true)
  })

  it('rejects a sibling directory that shares the name prefix', () => {
    // The bug this guards: D:\work\client-site-evil starts with D:\work\client-site.
    expect(isInside(root, resolve('D:/work/client-site-evil'))).toBe(false)
    expect(isInside(root, resolve('D:/work/client-site-evil/steal.txt'))).toBe(false)
  })

  it('rejects traversal out of the root', () => {
    expect(isInside(root, join(root, '..', 'other'))).toBe(false)
    expect(isInside(root, join(root, 'src', '..', '..', 'other'))).toBe(false)
  })

  it('rejects empty input instead of claiming containment', () => {
    expect(isInside('', root)).toBe(false)
    expect(isInside(root, '')).toBe(false)
  })

  it('is not fooled by the separator suffix of the root', () => {
    expect(isInside(`${root}${sep}`, join(root, 'a'))).toBe(true)
  })
})
