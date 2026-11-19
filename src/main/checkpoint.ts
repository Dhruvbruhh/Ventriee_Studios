import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workspacePath } from './files'

const run = promisify(execFile)
/** Never snapshotted: dependencies, build output and studio mail. Project .gitignore rules also apply. */
const EXCLUDE = ['node_modules/', '.git', '.ventriee/', 'dist/', 'out/', 'build/', '.next/', '__pycache__/', '.venv/', '*.log']

export interface CheckpointChange { path: string; status: 'added' | 'modified' | 'deleted' }

/**
 * Snapshots of a project folder taken before each run, kept in a private Git store
 * under the app's data folder. It works for projects without Git and never touches
 * the project's own repository, branches or index.
 */
export class CheckpointService {
  constructor(private dataDir: string) {}

  private gitDir(projectId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error('Invalid project id')
    return join(this.dataDir, 'checkpoints', `${projectId}.git`)
  }

  private async git(projectId: string, root: string, args: string[]) {
    const { stdout } = await run('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Ventriee Studios', '-c', 'user.email=checkpoints@ventriee.local',
      `--git-dir=${this.gitDir(projectId)}`, `--work-tree=${root}`, ...args], { cwd: root, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    return stdout
  }

  private async ensure(projectId: string, root: string) {
    const dir = this.gitDir(projectId)
    if (existsSync(join(dir, 'HEAD'))) return
    mkdirSync(dir, { recursive: true })
    await run('git', ['init', '--bare', '--quiet', dir], { windowsHide: true, timeout: 30_000 })
    await this.git(projectId, root, ['config', 'core.bare', 'false'])
    mkdirSync(join(dir, 'info'), { recursive: true })
    writeFileSync(join(dir, 'info', 'exclude'), EXCLUDE.join('\n') + '\n')
  }

  private tag(jobId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('Invalid run id')
    return `refs/tags/run-${jobId}`
  }

  /** Snapshot the folder as it is now, named after the run about to start. */
  async create(projectId: string, root: string, jobId: string, label: string): Promise<string> {
    await this.ensure(projectId, root)
    await this.git(projectId, root, ['add', '-A', '--', '.'])
    await this.git(projectId, root, ['commit', '--quiet', '--allow-empty', '-m', label.slice(0, 200) || 'Checkpoint'])
    const hash = (await this.git(projectId, root, ['rev-parse', 'HEAD'])).trim()
    await this.git(projectId, root, ['update-ref', this.tag(jobId), hash])
    return hash
  }

  async has(projectId: string, root: string, jobId: string): Promise<boolean> {
    if (!existsSync(join(this.gitDir(projectId), 'HEAD'))) return false
    return this.git(projectId, root, ['rev-parse', '--verify', '--quiet', this.tag(jobId)]).then(() => true, () => false)
  }

  /** What differs between the run's checkpoint and the folder now. */
  async changes(projectId: string, root: string, jobId: string): Promise<CheckpointChange[]> {
    await this.git(projectId, root, ['add', '-A', '--', '.'])
    const raw = await this.git(projectId, root, ['diff', '--cached', '--name-status', '--no-renames', '-z', this.tag(jobId)])
    const parts = raw.split('\0').filter(Boolean)
    const out: CheckpointChange[] = []
    for (let i = 0; i + 1 < parts.length; i += 2) out.push({ path: parts[i + 1], status: parts[i] === 'A' ? 'added' : parts[i] === 'D' ? 'deleted' : 'modified' })
    return out
  }

  /** Put the folder back as it was before the run: restore changed and deleted files, remove files the run added. */
  async restore(projectId: string, root: string, jobId: string): Promise<CheckpointChange[]> {
    const changes = await this.changes(projectId, root, jobId)
    for (const change of changes.filter((c) => c.status === 'added')) rmSync(workspacePath(root, change.path), { force: true })
    const back = changes.filter((c) => c.status !== 'added').map((c) => c.path)
    for (let i = 0; i < back.length; i += 200) await this.git(projectId, root, ['checkout', this.tag(jobId), '--', ...back.slice(i, i + 200)])
    await this.git(projectId, root, ['reset', '--quiet', this.tag(jobId), '--', '.'])
    return changes
  }
}
