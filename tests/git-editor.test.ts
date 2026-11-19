import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService, parseLineChanges } from '../src/main/git'
import { findConflicts, resolveConflict } from '../src/renderer/src/editor/conflicts'

describe('git in the editor', { timeout: 30_000 }, () => {
  it('reads added, modified and deleted ranges from -U0 hunks', () => {
    const raw = 'diff --git a/x b/x\n@@ -0,0 +1,2 @@\n+a\n+b\n@@ -5 +7 @@\n-x\n+y\n@@ -10,3 +11,0 @@\n-p\n-q\n-r\n'
    expect(parseLineChanges(raw)).toEqual([
      { kind: 'added', start: 1, end: 2 }, { kind: 'modified', start: 7, end: 7 }, { kind: 'deleted', start: 11, end: 11 }])
  })

  it('reports changes against the last commit and who wrote a line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-gitline-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString()
    try {
      git('init'); git('config', 'user.name', 'Ada Tester'); git('config', 'user.email', 'ada@example.invalid'); git('config', 'commit.gpgsign', 'false'); git('config', 'core.autocrlf', 'false')
      writeFileSync(join(root, 'a.txt'), 'one\ntwo\nthree\n'); git('add', '.'); git('commit', '-m', 'Add a')
      writeFileSync(join(root, 'a.txt'), 'one\nTWO\nthree\nfour\n')
      writeFileSync(join(root, 'new.txt'), 'x\ny\n')
      const service = new GitService()
      expect(await service.lineChanges(root, 'a.txt')).toEqual([{ kind: 'modified', start: 2, end: 2 }, { kind: 'added', start: 4, end: 4 }])
      expect(await service.lineChanges(root, 'new.txt')).toEqual([{ kind: 'added', start: 1, end: 2 }])
      expect(await service.blame(root, 'a.txt', 1)).toMatchObject({ author: 'Ada Tester', summary: 'Add a' })
      expect(await service.blame(root, 'a.txt', 2)).toMatchObject({ author: 'You', summary: 'Not committed yet' })
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('finds conflict blocks and resolves each choice', () => {
    const text = 'top\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feature\nend\n<<<<<<< HEAD\nunfinished'
    const [conflict] = findConflicts(text)
    expect(findConflicts(text)).toHaveLength(1)
    expect(conflict).toEqual({ start: 2, middle: 4, end: 6 })
    expect(resolveConflict(text, conflict, 'current')).toBe('mine')
    expect(resolveConflict(text, conflict, 'incoming')).toBe('theirs')
    expect(resolveConflict(text, conflict, 'both')).toBe('mine\ntheirs')
    const diff3 = '<<<<<<< ours\na\n||||||| base\nb\n=======\nc\n>>>>>>> theirs'
    expect(resolveConflict(diff3, findConflicts(diff3)[0], 'current')).toBe('a')
  })
})
