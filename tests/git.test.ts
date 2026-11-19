import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from '../src/main/git'
let root: string
const git = new GitService()
const command = (...args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' }).toString()
beforeEach((context) => {
  root = mkdtempSync(join(tmpdir(), 'ventriee-git-'))
  try { command('init') } catch (error) {
    if (/Permission denied|operation not permitted/i.test(String(error))) { context.skip('This environment denies Git metadata writes'); return }
    throw error
  }
  command('config', 'user.name', 'Editor Test'); command('config', 'user.email', 'editor-test@example.invalid'); command('config', 'commit.gpgsign', 'false'); command('config', 'core.autocrlf', 'false')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
describe('real Git source control', { timeout: 30_000 }, () => {
  it('stages literal paths, commits, reads diffs and unstages changes', async () => {
    writeFileSync(join(root, 'file[1].ts'), 'export const value = 1\n')
    expect((await git.status(root)).changes[0].index).toBe('?')
    const added = await git.diff(root, 'file[1].ts', false)
    expect(added.original).toBe(''); expect(added.modified).toContain('value = 1')
    await git.action(root, 'stage', 'file[1].ts')
    expect((await git.status(root)).changes[0].index).toBe('A')
    await git.action(root, 'commit', undefined, 'Add sample')
    expect((await git.status(root)).changes).toHaveLength(0)
    writeFileSync(join(root, 'file[1].ts'), 'export const value = 2\n')
    const modified = await git.diff(root, 'file[1].ts', false)
    expect(modified.original).toContain('value = 1'); expect(modified.modified).toContain('value = 2')
    await git.action(root, 'stage', 'file[1].ts'); await git.action(root, 'unstage', 'file[1].ts')
    expect((await git.status(root)).changes[0]).toMatchObject({ index: ' ', working: 'M' })
  })
  it('unstages new files before the first commit', async () => {
    writeFileSync(join(root, 'new.txt'), 'new')
    await git.action(root, 'stage', 'new.txt'); await git.action(root, 'unstage', 'new.txt')
    expect((await git.status(root)).changes[0].index).toBe('?')
  })
  it('creates branches and refuses switching with working changes', async () => {
    writeFileSync(join(root, 'a.txt'), 'a'); command('add', '.'); command('commit', '-m', 'Initial')
    await git.action(root, 'branch', undefined, 'feature/editor')
    expect((await git.status(root)).branch).toBe('feature/editor')
    writeFileSync(join(root, 'a.txt'), 'changed')
    await expect(git.action(root, 'branch', undefined, 'other')).rejects.toThrow('working changes')
  })
  it('refuses repository operations from a project that is only a subfolder', async () => {
    mkdirSync(join(root, 'child'))
    await expect(git.status(join(root, 'child'))).rejects.toThrow('repository root')
    await expect(git.action(root, 'stage', '../outside')).rejects.toThrow()
  })
  it('restores a changed or removed file from the last commit, but never deletes a new file', async () => {
    writeFileSync(join(root, 'kept [1].txt'), 'original\n'); command('add', '.'); command('commit', '-m', 'Base')
    writeFileSync(join(root, 'kept [1].txt'), 'agent edit\n')
    await git.action(root, 'discard', 'kept [1].txt')
    expect(readFileSync(join(root, 'kept [1].txt'), 'utf8')).toBe('original\n')
    rmSync(join(root, 'kept [1].txt'))
    await git.action(root, 'discard', 'kept [1].txt')
    expect(readFileSync(join(root, 'kept [1].txt'), 'utf8')).toBe('original\n')
    writeFileSync(join(root, 'new.txt'), 'new')
    await expect(git.action(root, 'discard', 'new.txt')).rejects.toThrow('not in the last commit')
    expect(readFileSync(join(root, 'new.txt'), 'utf8')).toBe('new')
  })
  it('pushes, fetches and fast-forwards against a disposable remote, and never merges diverged history', async () => {
    const remote = mkdtempSync(join(tmpdir(), 'ventriee-remote-'))
    const other = mkdtempSync(join(tmpdir(), 'ventriee-clone-'))
    const at = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, windowsHide: true, stdio: 'pipe' }).toString()
    try {
      at(remote, 'init', '--bare')
      writeFileSync(join(root, 'a.txt'), 'one\n'); command('add', '.'); command('commit', '-m', 'One')
      command('remote', 'add', 'origin', remote)
      await git.action(root, 'push')
      const branch = (await git.status(root)).branch
      at(other, 'clone', remote, '.'); at(other, 'config', 'user.name', 'Other'); at(other, 'config', 'user.email', 'other@example.invalid'); at(other, 'config', 'commit.gpgsign', 'false')
      writeFileSync(join(other, 'a.txt'), 'two\n'); at(other, 'commit', '-am', 'Two'); at(other, 'push', 'origin', branch)
      await git.action(root, 'fetch')
      expect((await git.status(root)).behind).toBe(1)
      await git.action(root, 'pull')
      expect((await git.status(root)).log[0].message).toBe('Two')
      writeFileSync(join(other, 'a.txt'), 'three\n'); at(other, 'commit', '-am', 'Three'); at(other, 'push', 'origin', branch)
      writeFileSync(join(root, 'a.txt'), 'local\n'); command('commit', '-am', 'Local')
      await expect(git.action(root, 'pull')).rejects.toThrow()
      await expect(git.action(root, 'push')).rejects.toThrow()
      expect((await git.status(root)).log[0].message).toBe('Local')
      await expect(git.action(root, 'remote', undefined, 'https://user:secret@example.com/repo.git')).rejects.toThrow('embedded credentials')
    } finally { rmSync(remote, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }) }
  })
})
