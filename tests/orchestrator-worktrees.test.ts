import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

/** A fake CLI worker: writes its file into its cwd, after waiting for a second worker to start. */
const live = { now: 0, max: 0, files: {} as Record<string, string> }
vi.mock('../src/main/engines', () => ({
  isCliEngine: () => true,
  modelFor: () => 'test-model',
  connectorEnv: () => ({}),
  detectProviders: async () => [],
  runEngine: async (opts: { cwd: string; prompt: string }) => {
    const title = /# Task: (.+)/.exec(opts.prompt)![1]
    live.max = Math.max(live.max, ++live.now)
    // Wait (up to 2s) for the other worker, so overlap does not depend on machine speed.
    for (let i = 0; i < 40 && live.now < 2; i++) await new Promise((r) => setTimeout(r, 50))
    await new Promise((r) => setTimeout(r, 100))
    writeFileSync(join(opts.cwd, live.files[title]), `${title}\n`)
    live.now--
    return { ok: true, text: `Wrote ${live.files[title]} for ${title}, verified it by reading it back.`, inputTokens: 0, outputTokens: 0, costUsd: 0, externalId: null, command: 'fake' }
  }
}))
import { Store } from '../src/main/store'
import { MemoryService } from '../src/main/memory'
import { Credentials } from '../src/main/credentials'
import { Orchestrator } from '../src/main/orchestrator'
import { WorktreeService } from '../src/main/worktrees'
import type { Agent, Job, Task } from '../src/shared/types'
import { withSquad } from './fixtures/squad'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })

async function runTwo(files: [string, string], gitRepo = true) {
  const data = mkdtempSync(join(tmpdir(), 'ventriee-orchwt-'))
  const root = mkdtempSync(join(tmpdir(), 'ventriee-orchroot-'))
  writeFileSync(join(root, 'readme.txt'), 'hi\n')
  if (gitRepo) { git(root, 'init', '--quiet'); git(root, 'config', 'core.autocrlf', 'false'); git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'init') }
  const store = withSquad(new Store(join(data, 'ventriee.db')))
  const orchestrator = new Orchestrator({
    store, memory: new MemoryService(store, data), creds: new Credentials(store.db), emit: new EventEmitter(), notify: () => {},
    isProjectOpen: () => true, models: () => [], providerConfigs: () => [], worktrees: new WorktreeService(data)
  })
  const project = store.createProject({ name: 'P', path: root, description: '' })
  const o = orchestrator as unknown as { hire: (p: unknown, role: string, roster: Agent[]) => Agent; runQueue: (job: Job, p: unknown) => Promise<string> }
  const roster: Agent[] = []
  live.files = {}
  for (const [i, file] of files.entries()) {
    const agent = o.hire(project, 'backend', roster); roster.push(agent)
    live.files[`task ${i}`] = file
    store.insertTask({ id: `tsk_${i}`, projectId: project.id, parentId: null, title: `task ${i}`, description: 'd', acceptance: 'a', role: 'backend', agentId: agent.id,
      status: 'ready', dependsOn: [], output: '', review: '', attempts: 0, phase: 'build', engine: null, model: null, endpoint: null, routedBy: null, createdAt: Date.now(), updatedAt: Date.now() } as Task)
  }
  const job: Job = { id: 'job_1', projectId: project.id, instruction: 'x', status: 'running', planSource: 'heuristic', createdAt: Date.now(), updatedAt: Date.now(), error: null }
  store.insertJob(job)
  live.max = 0
  await o.runQueue(job, project)
  return { root, data, tasks: store.tasks(project.id) }
}

describe('orchestrator with task worktrees', { timeout: 60_000 }, () => {
  it('runs two code tasks on different files at once and lands both', async () => {
    const { root, data, tasks } = await runTwo(['a.txt', 'b.txt'])
    expect(live.max).toBe(2)
    expect(tasks.map((t) => [t.status, t.attempts])).toEqual([['done', 1], ['done', 1]])
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('task 0\n')
    expect(readFileSync(join(root, 'b.txt'), 'utf8')).toBe('task 1\n')
    expect(git(root, 'status', '--porcelain')).toBe('')
    expect(git(root, 'branch', '--list', 'ventriee/*')).toBe('')
    expect(existsSync(join(data, 'worktrees', tasks[0].projectId, 'tsk_0'))).toBe(false)
  })

  it('sends one of a conflicting pair to rework, which then lands on top of the other', async () => {
    const { root, tasks } = await runTwo(['same.txt', 'same.txt'])
    expect(tasks.every((t) => t.status === 'done')).toBe(true)
    expect(tasks.map((t) => t.attempts).sort()).toEqual([1, 2])
    const second = tasks.find((t) => t.attempts === 2)!
    expect(readFileSync(join(root, 'same.txt'), 'utf8')).toBe(`${second.title}\n`)
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('falls back to the project folder for a non-git project', async () => {
    const { root, tasks } = await runTwo(['a.txt', 'b.txt'], false)
    expect(live.max).toBe(1) // same role scope, same folder: one at a time, as before
    expect(tasks.every((t) => t.status === 'done')).toBe(true)
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('task 0\n')
    expect(existsSync(join(root, '.git'))).toBe(false)
  })
})
