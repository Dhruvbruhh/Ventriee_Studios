import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpathSync } from 'node:fs'
import { workspacePath, FileService, MAX_TEXT_BYTES } from './files'
import type { BlameLine, GitAction, GitChange, GitState, LineChange } from '../shared/workspace'
const execute = promisify(execFile)
/** Hunk headers of `git diff -U0` as line ranges of the new file, for gutter markers. */
export function parseLineChanges(raw: string): LineChange[] {
  const out: LineChange[] = []
  for (const m of raw.matchAll(/^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldCount = m[1] === undefined ? 1 : Number(m[1])
    const start = Number(m[2])
    const newCount = m[3] === undefined ? 1 : Number(m[3])
    if (newCount === 0) out.push({ kind: 'deleted', start: Math.max(start, 1), end: Math.max(start, 1) })
    else out.push({ kind: oldCount === 0 ? 'added' : 'modified', start, end: start + newCount - 1 })
  }
  return out
}
export function parseGitChanges(raw: string): GitChange[] {
  const changes: GitChange[] = []
  const entries = raw.split('\0').filter(Boolean)
  for (let i = 0; i < entries.length; i++) {
    const row = entries[i]
    const change: GitChange = { index: row[0], working: row[1], path: row.slice(3) }
    if (row[0] === 'R' || row[0] === 'C' || row[1] === 'R' || row[1] === 'C') change.originalPath = entries[++i]
    changes.push(change)
  }
  return changes
}
/** Git's own output can be far larger than one file (thousands of untracked paths); the 2 MB cap is for file contents. */
const GIT_OUTPUT_BYTES = 64 * 1024 * 1024
/** Changes shown in Source Control; the rest are counted, not listed. */
export const MAX_LISTED_CHANGES = 5000
export class GitService {
  private busy = new Set<string>()
  private async command(root: string, args: string[]) {
    try {
      const result = await execute('git', ['--no-pager', '--literal-pathspecs', ...args], { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: GIT_OUTPUT_BYTES,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: '0' } })
      return result.stdout
    } catch (error) {
      const failure = error as { stderr?: string; code?: string; killed?: boolean }
      if (failure.code === 'ENOENT') throw new Error('Git is not installed or is missing from PATH')
      if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new Error('Git returned more than 64 MB of output. Add large generated folders to .gitignore and refresh.')
      throw new Error(failure.killed ? 'Git timed out. Check credentials and network access.' : (failure.stderr?.trim().slice(0, 2000).replace(/https?:\/\/[^@\s]+@/g, 'https://[redacted]@') || 'Git operation failed'))
    }
  }
  private async requireRoot(root: string) {
    const top = (await this.command(root, ['rev-parse', '--show-toplevel'])).trim()
    const normalize = (value: string) => process.platform === 'win32' ? realpathSync(value).toLowerCase() : realpathSync(value)
    if (normalize(top) !== normalize(root)) throw new Error('Open the repository root as your project to use Source Control')
  }
  async status(root: string): Promise<GitState> {
    try { await this.command(root, ['rev-parse', '--git-dir']) } catch (error) {
      if ((error as Error).message.includes('not a git repository')) return { repository: false, branch: '', branches: [], changes: [], log: [], ahead: 0, behind: 0 }
      throw error
    }
    await this.requireRoot(root)
    const [raw, branch, branchList] = await Promise.all([
      this.command(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      this.command(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '(detached HEAD)'),
      this.command(root, ['branch', '--format=%(refname:short)'])
    ])
    const all = parseGitChanges(raw)
    const changes = all.slice(0, MAX_LISTED_CHANGES)
    const log = await this.command(root, ['log', '-20', '--format=%h%x00%s']).catch(() => '')
    const counts = await this.command(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).catch(() => '0 0')
    const remote = (await this.command(root, ['remote', 'get-url', 'origin']).catch(() => '')).trim().replace(/https?:\/\/[^@\s]+@/g, 'https://[redacted]@')
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number)
    return { repository: true, remote, ...(all.length > changes.length ? { totalChanges: all.length } : {}), branch: branch.trim(), branches: branchList.split('\n').map((b) => b.trim()).filter(Boolean), changes,
      log: log.trim().split('\n').filter(Boolean).map((row) => { const [hash, message] = row.split('\0'); return { hash, message } }), ahead, behind }
  }
  async diff(root: string, path: string, staged: boolean) {
    await this.requireRoot(root); workspacePath(root, path)
    const changed = parseGitChanges(await this.command(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no'])).find((entry) => entry.path === path)
    const readRevision = async (revision: string, filePath = path) => {
      const text = await this.command(root, ['show', `${revision}:${filePath}`]).catch((error) => {
        if (/does not exist|exists on disk, but not in|invalid object name|bad revision|unknown revision|does not have any commits yet/i.test(error.message)) return ''
        throw error
      })
      if (text.includes('\0')) throw new Error('Binary diffs are not supported')
      if (text.length > MAX_TEXT_BYTES) throw new Error('This file is over 2 MB, too large to compare here')
      return text
    }
    const beforePath = changed?.originalPath && (staged || changed.working === 'R') ? changed.originalPath : path
    workspacePath(root, beforePath)
    const original = await readRevision(staged ? 'HEAD' : '', beforePath)
    let modified: string
    if (staged) modified = await readRevision('')
    else {
      try { modified = new FileService().read(root, path).text } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') modified = ''
        else throw error
      }
    }
    return { original, modified, path }
  }
  /** How the saved file differs from the last commit, line by line. A file not in the last commit is all added. */
  async lineChanges(root: string, path: string): Promise<LineChange[]> {
    await this.requireRoot(root); workspacePath(root, path)
    const inHead = await this.command(root, ['cat-file', '-e', `HEAD:${path}`]).then(() => true, () => false)
    if (!inHead) {
      try { return [{ kind: 'added', start: 1, end: new FileService().read(root, path).text.replace(/\r?\n$/, '').split('\n').length }] } catch { return [] }
    }
    return parseLineChanges(await this.command(root, ['diff', '--no-color', '--no-ext-diff', '-U0', 'HEAD', '--', path]))
  }
  /** Who last changed one line of the saved file, and in which commit. */
  async blame(root: string, path: string, line: number): Promise<BlameLine | null> {
    await this.requireRoot(root); workspacePath(root, path)
    if (!Number.isInteger(line) || line < 1) return null
    const raw = await this.command(root, ['blame', '--porcelain', '-L', `${line},${line}`, '--', path]).catch(() => '')
    const hash = raw.slice(0, 40)
    if (!/^[0-9a-f]{40}$/.test(hash)) return null
    if (/^0+$/.test(hash)) return { hash: '', author: 'You', time: 0, summary: 'Not committed yet' }
    const field = (name: string) => new RegExp(`^${name} (.*)$`, 'm').exec(raw)?.[1] ?? ''
    return { hash: hash.slice(0, 8), author: field('author'), time: Number(field('author-time')) * 1000, summary: field('summary') }
  }
  async action(root: string, action: GitAction, path?: string, value?: string) {
    const key = realpathSync(root)
    if (this.busy.has(key)) throw new Error('Another Git operation is still running')
    this.busy.add(key)
    try {
      if (action === 'init') {
        const current = await this.status(root)
        if (current.repository) throw new Error('This project is already a Git repository')
        await this.command(root, ['init']); return
      }
      await this.requireRoot(root)
      if (action === 'stage' || action === 'unstage') {
        workspacePath(root, path)
        const changes = parseGitChanges(await this.command(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no']))
        const previous = changes.find((entry) => entry.path === path)?.originalPath
        if (previous) workspacePath(root, previous)
        const paths = previous ? [path!, previous] : [path!]
        if (action === 'stage') await this.command(root, ['add', '--', ...paths])
        else {
          const hasHead = await this.command(root, ['rev-parse', '--verify', 'HEAD']).then(() => true).catch(() => false)
          await this.command(root, hasHead ? ['reset', 'HEAD', '--', ...paths] : ['rm', '--cached', '--', ...paths])
        }
      } else if (action === 'discard') {
        workspacePath(root, path)
        // Only files the last commit has can be put back; a new file is never deleted from here.
        const inHead = await this.command(root, ['cat-file', '-e', `HEAD:${path}`]).then(() => true).catch(() => false)
        if (!inHead) throw new Error('This file is not in the last commit, so there is no earlier version to restore')
        await this.command(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', path!])
      } else if (action === 'commit') {
        if (!value?.trim() || value.length > 10_000) throw new Error('Enter a commit message')
        await this.command(root, ['commit', '-m', value.trim()])
      } else if (action === 'checkout' || action === 'branch') {
        if (!value || value.startsWith('-') || value.length > 200) throw new Error('Enter a valid branch name')
        await this.command(root, ['check-ref-format', '--branch', value])
        const state = await this.status(root)
        if (state.changes.length) throw new Error('Commit or resolve your working changes before switching branches')
        await this.command(root, action === 'branch' ? ['switch', '-c', value] : ['switch', value])
      } else if (action === 'remote') {
        if (!value || value.length > 2048) throw new Error('Enter a remote repository URL')
        const ssh = /^git@[a-z0-9.-]+:[a-z0-9._/-]+$/i.test(value)
        if (!ssh) {
          let url: URL
          try { url = new URL(value) } catch { throw new Error('Use an HTTPS or git@host:path remote URL') }
          if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use HTTPS without embedded credentials')
        }
        const existing = await this.command(root, ['remote', 'get-url', 'origin']).catch(() => '')
        await this.command(root, existing ? ['remote', 'set-url', 'origin', value] : ['remote', 'add', 'origin', value])
      } else if (action === 'fetch') await this.command(root, ['fetch', '--all', '--prune'])
      else if (action === 'pull') await this.command(root, ['pull', '--ff-only'])
      else if (action === 'push') {
        const upstream = await this.command(root, ['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '')
        await this.command(root, upstream ? ['push'] : ['push', '--set-upstream', 'origin', 'HEAD'])
      }
      else throw new Error('Unsupported Git action')
    } finally { this.busy.delete(key) }
  }
}
