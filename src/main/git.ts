import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { realpathSync } from 'node:fs'
import { workspacePath, FileService, MAX_TEXT_BYTES } from './files'
import type { GitAction, GitChange, GitState } from '../shared/workspace'
const execute = promisify(execFile)
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
export class GitService {
  private busy = new Set<string>()
  private async command(root: string, args: string[]) {
    try {
      const result = await execute('git', ['--no-pager', '--literal-pathspecs', ...args], { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: MAX_TEXT_BYTES,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: '0' } })
      return result.stdout
    } catch (error) {
      const failure = error as { stderr?: string; code?: string; killed?: boolean }
      if (failure.code === 'ENOENT') throw new Error('Git is not installed or is missing from PATH')
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
    const changes = parseGitChanges(raw)
    const log = await this.command(root, ['log', '-20', '--format=%h%x00%s']).catch(() => '')
    const counts = await this.command(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).catch(() => '0 0')
    const remote = (await this.command(root, ['remote', 'get-url', 'origin']).catch(() => '')).trim().replace(/https?:\/\/[^@\s]+@/g, 'https://[redacted]@')
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number)
    return { repository: true, remote, branch: branch.trim(), branches: branchList.split('\n').map((b) => b.trim()).filter(Boolean), changes,
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
