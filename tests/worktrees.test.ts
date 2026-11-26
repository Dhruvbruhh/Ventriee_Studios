import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WorktreeService } from '../src/main/worktrees'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-wtroot-'))
  git(root, 'init', '--quiet', '-b', 'main'); git(root, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(root, 'a.txt'), 'a1\n')
  writeFileSync(join(root, 'b.txt'), 'b1\n')
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'node_modules', 'dep.js'), 'dep')
  git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'init')
  return { root, service: new WorktreeService(mkdtempSync(join(tmpdir(), 'ventriee-wtdata-'))) }
}
const branches = (root: string) => git(root, 'branch', '--list', 'ventriee/*').trim()

describe('task worktrees', { timeout: 60_000 }, () => {
  it('runs two tasks side by side and lands both, then cleans up', async () => {
    const { root, service } = repo()
    expect(await service.unavailable(root)).toBeNull()
    const one = await service.create('prj_1', root, 'tsk_1')
    const two = await service.create('prj_1', root, 'tsk_2')
    expect(one.path.startsWith(root)).toBe(false)
    expect(existsSync(join(one.path, 'node_modules', 'dep.js'))).toBe(true)
    writeFileSync(join(one.path, 'a.txt'), 'a2\n')
    writeFileSync(join(two.path, 'b.txt'), 'b2\n')
    writeFileSync(join(two.path, 'c.txt'), 'new\n')
    const [r1, r2] = await Promise.all([service.integrate(root, one, 'one'), service.integrate(root, two, 'two')])
    expect(r1.ok && r2.ok).toBe(true)
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('a2\n')
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('b2\n')
    expect(readFileSync(join(root, 'c.txt'), 'utf8')).toBe('new\n')
    expect(git(root, 'ls-files')).not.toContain('node_modules')
    await service.remove(root, one); await service.remove(root, two)
    expect(existsSync(one.path)).toBe(false)
    expect(readFileSync(join(root, 'node_modules', 'dep.js'), 'utf8')).toBe('dep')
    expect(branches(root)).toBe('')
    expect(git(root, 'worktree', 'list').trim().split('\n')).toHaveLength(1)
  })

  it('aborts a conflicting merge, lists the files and leaves the project as it was', async () => {
    const { root, service } = repo()
    const one = await service.create('prj_1', root, 'tsk_1')
    const two = await service.create('prj_1', root, 'tsk_2')
    writeFileSync(join(one.path, 'a.txt'), 'from one\n')
    writeFileSync(join(two.path, 'a.txt'), 'from two\n')
    expect((await service.integrate(root, one, 'one')).ok).toBe(true)
    const second = await service.integrate(root, two, 'two')
    expect(second).toMatchObject({ ok: false, conflicts: ['a.txt'] })
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('from one\n')
    expect(git(root, 'status', '--porcelain')).toBe('')
    await service.remove(root, two)
    // The rework starts fresh from the merged project.
    const again = await service.create('prj_1', root, 'tsk_2')
    expect(readFileSync(join(again.path, 'a.txt'), 'utf8')).toBe('from one\n')
  })

  it('never merges over uncommitted owner work: keeps the branch instead', async () => {
    const { root, service } = repo()
    const one = await service.create('prj_1', root, 'tsk_1')
    writeFileSync(join(one.path, 'b.txt'), 'task\n')
    writeFileSync(join(root, 'a.txt'), 'owner edit\n')
    const result = await service.integrate(root, one, 'one')
    expect(result.ok).toBe(false)
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('owner edit\n')
    await service.remove(root, one)
    expect(branches(root)).toContain('ventriee/task-tsk_1')
    expect(await service.unavailable(root)).toBe('the project has uncommitted changes')
  })

  it('falls back for a folder that is not a repository', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'ventriee-plain-'))
    const service = new WorktreeService(mkdtempSync(join(tmpdir(), 'ventriee-wtdata-')))
    expect(await service.unavailable(plain)).toBe('the project is not a Git repository')
    expect(await service.recover('prj_1', plain)).toEqual([])
  })

  it('recovers orphans after a restart, keeping only branches with unmerged work', async () => {
    const { root, service } = repo()
    const idle = await service.create('prj_1', root, 'tsk_idle')
    const busy = await service.create('prj_1', root, 'tsk_busy')
    writeFileSync(join(busy.path, 'a.txt'), 'committed but never merged\n')
    git(busy.path, 'commit', '--quiet', '-am', 'work')
    const kept = await service.recover('prj_1', root)
    expect(kept).toEqual(['ventriee/task-tsk_busy'])
    expect(existsSync(idle.path) || existsSync(busy.path)).toBe(false)
    expect(readFileSync(join(root, 'node_modules', 'dep.js'), 'utf8')).toBe('dep')
    expect(git(root, 'worktree', 'list').trim().split('\n')).toHaveLength(1)
    expect(branches(root)).not.toContain('tsk_idle')
  })
})
