import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const run = promisify(execFile)
const BRANCH_PREFIX = 'ventriee/task-'
/** Never committed from a task worktree: studio mail and the linked dependencies folder. */
const EXCLUDE = [':(exclude).ventriee', ':(exclude)node_modules']
const same = (a: string, b: string) => { const n = (p: string) => realpathSync.native(p); return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b) }

/** Unlink the node_modules link first, so deleting a worktree can never reach into the project's real dependencies. */
function deleteTree(path: string) {
  const deps = join(path, 'node_modules')
  try { if (lstatSync(deps).isSymbolicLink()) unlinkSync(deps) } catch { /* not linked */ }
  rmSync(path, { recursive: true, force: true })
}

export interface TaskWorktree { path: string; branch: string; taskId: string; keepBranch?: boolean }
export type MergeResult =
  | { ok: true; merged: boolean; detail: string }
  | { ok: false; conflicts: string[]; detail: string }

/**
 * One git worktree per code-writing task, under the app's data folder, so parallel
 * workers never write the same files. Finished work is merged back into the project's
 * checked-out branch one task at a time; a conflict is aborted, never forced.
 */
export class WorktreeService {
  /** Merges into one project run one after another. */
  private merging = new Map<string, Promise<unknown>>()

  constructor(private dataDir: string) {}

  private async git(cwd: string, args: string[]) {
    const { stdout } = await run('git', ['-c', 'user.name=Ventriee Studios', '-c', 'user.email=worktrees@ventriee.local', '-c', 'commit.gpgsign=false', ...args],
      { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    return stdout
  }

  private dir(projectId: string, taskId = '') {
    if (!/^[A-Za-z0-9_-]+$/.test(projectId) || (taskId && !/^[A-Za-z0-9_-]+$/.test(taskId))) throw new Error('Invalid id')
    return join(this.dataDir, 'worktrees', projectId, taskId)
  }

  /** Owner changes the studio did not make; .ventriee is studio mail and never counts. */
  private async dirty(root: string) {
    return (await this.git(root, ['status', '--porcelain', '--', '.', ...EXCLUDE])).trim()
  }

  /** Why this project cannot use worktrees, or null when it can. */
  async unavailable(root: string): Promise<string | null> {
    try {
      const top = (await this.git(root, ['rev-parse', '--show-toplevel'])).trim()
      if (!same(top, root)) return 'the project is inside another repository'
    } catch { return 'the project is not a Git repository' }
    if (!(await this.git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(() => true, () => false))) return 'the repository has no commits yet'
    // shortcut: uncommitted owner work means fall back; stashing it with the owner's approval is not built yet.
    if (await this.dirty(root)) return 'the project has uncommitted changes'
    return null
  }

  async create(projectId: string, root: string, taskId: string): Promise<TaskWorktree> {
    const path = this.dir(projectId, taskId)
    const branch = `${BRANCH_PREFIX}${taskId}`
    // A leftover from an earlier attempt of the same task: start clean from the current HEAD.
    await this.remove(root, { path, branch, taskId })
    mkdirSync(this.dir(projectId), { recursive: true })
    await this.git(root, ['worktree', 'add', '--quiet', '-b', branch, path, 'HEAD'])
    // Workers run the project's typecheck and tests; reinstalling dependencies per task would take minutes.
    if (existsSync(join(root, 'node_modules')) && !existsSync(join(path, 'node_modules'))) {
      try { symlinkSync(join(root, 'node_modules'), join(path, 'node_modules'), 'junction') } catch { /* the worker can install */ }
    }
    return { path, branch, taskId }
  }

  /** Commit the task's changes on its branch and merge them into the project's current branch. */
  async integrate(root: string, wt: TaskWorktree, title: string): Promise<MergeResult> {
    const key = resolve(root).toLowerCase()
    const next = (this.merging.get(key) ?? Promise.resolve()).then(() => this.mergeNow(root, wt, title))
    this.merging.set(key, next.catch(() => undefined))
    return next
  }

  private async mergeNow(root: string, wt: TaskWorktree, title: string): Promise<MergeResult> {
    await this.git(wt.path, ['add', '-A'])
    await this.git(wt.path, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.ventriee', 'node_modules'])
    const staged = await this.git(wt.path, ['diff', '--cached', '--name-only'])
    if (staged.trim()) await this.git(wt.path, ['commit', '--quiet', '-m', `Ventriee task: ${title.slice(0, 160)}`])
    const ahead = Number((await this.git(root, ['rev-list', '--count', `HEAD..${wt.branch}`])).trim())
    if (!ahead) return { ok: true, merged: false, detail: 'nothing to merge' }
    // An aborted merge can lose uncommitted edits, so never merge over the owner's work: keep the branch instead.
    if (await this.dirty(root)) {
      wt.keepBranch = true
      return { ok: false, conflicts: [], detail: `the project has uncommitted changes; the task's work is kept on branch ${wt.branch}` }
    }
    try {
      await this.git(root, ['merge', '--no-ff', '--no-edit', '-m', `Merge ${title.slice(0, 160)} (${wt.branch})`, wt.branch])
      return { ok: true, merged: true, detail: `merged ${wt.branch}` }
    } catch (error) {
      const conflicts = (await this.git(root, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')).split('\n').filter(Boolean)
      await this.git(root, ['merge', '--abort']).catch(() => undefined)
      if (!conflicts.length) wt.keepBranch = true
      return { ok: false, conflicts, detail: conflicts.length ? `conflicts in ${conflicts.join(', ')}` : `merge failed (${(error as Error).message.slice(0, 300)}); kept on branch ${wt.branch}` }
    }
  }

  /** Remove the worktree and, unless its work is being kept for the owner, its branch. */
  async remove(root: string, wt: TaskWorktree) {
    if (existsSync(wt.path)) deleteTree(wt.path)
    await this.git(root, ['worktree', 'prune']).catch(() => undefined)
    if (!wt.keepBranch) await this.git(root, ['branch', '-D', wt.branch]).catch(() => undefined)
  }

  /**
   * After a crash or restart: drop every task worktree of this project and the task
   * branches that hold nothing unmerged. A branch with unmerged commits is kept and
   * returned, since only the owner may throw that work away.
   */
  async recover(projectId: string, root: string): Promise<string[]> {
    const base = this.dir(projectId)
    if (existsSync(base)) for (const name of readdirSync(base)) deleteTree(join(base, name))
    let listed: string
    try {
      await this.git(root, ['worktree', 'prune'])
      listed = await this.git(root, ['branch', '--list', `${BRANCH_PREFIX}*`, '--format=%(refname:short)'])
    } catch { return [] }
    const branches = listed.split('\n').map((b) => b.trim()).filter(Boolean)
    const kept: string[] = []
    for (const branch of branches) {
      const merged = await this.git(root, ['branch', '-d', branch]).then(() => true, () => false)
      if (!merged) kept.push(branch)
    }
    return kept
  }
}
