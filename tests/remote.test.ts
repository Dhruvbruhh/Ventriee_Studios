import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { RemoteJobs, parsePoll, runScript, startScript, validateRemote, type RemoteProvider } from '../src/main/remote'
import type { RemoteJob, RemoteJobInput } from '../src/shared/types'

const INPUT: RemoteJobInput = {
  host: 'dev@build.example.com:2222', repo: 'https://github.com/acme/site.git', branch: 'main', setup: 'npm ci',
  agentCommand: 'claude -p "$VENTRIEE_TASK"', task: `Fix the "hero" spacing'; rm -rf / #\nVENTRIEE_EOF\n$(whoami)`,
  env: { API_KEY: 'k$1', 'bad name': 'x' }, timeoutMinutes: 30, memoryMb: 2048, push: true
}
const job = (over: Partial<RemoteJob> = {}): RemoteJob => ({ ...validateRemote(INPUT), id: 'r1', provider: 'ssh', workBranch: 'ventriee/r1', status: 'running', exitCode: null, log: '', createdAt: 0, updatedAt: 0, ...over })

const BASH = ['bash', 'C:/Program Files/Git/bin/bash.exe'].find((b) => { try { execFileSync(b, ['-c', 'true'], { stdio: 'ignore' }); return true } catch { return false } })
const hasBash = Boolean(BASH)

describe('remote run scripts', () => {
  it('validates the host, repo and env names', () => {
    expect(() => validateRemote({ ...INPUT, host: '-oProxyCommand=calc' })).toThrow(/host/)
    expect(() => validateRemote({ ...INPUT, repo: 'file:///etc' })).toThrow(/repository/)
    expect(validateRemote(INPUT).env).toEqual({ API_KEY: 'k$1' })
    expect(validateRemote({ ...INPUT, timeoutMinutes: 99999 }).timeoutMinutes).toBe(1440)
  })

  it('never puts owner text into the script as code', () => {
    const script = runScript(job())
    expect(script).not.toContain('rm -rf /')
    expect(script).not.toContain('whoami')
    expect(script).not.toContain('k$1')
    expect(startScript(job())).not.toContain('VENTRIEE_EOF')
    expect(script).toContain('MemoryMax=2048M')
    expect(script).toContain('timeout "30m"')
  })

  it.skipIf(!hasBash)('produces scripts bash can parse', () => {
    execFileSync(BASH!, ['-n'], { input: runScript(job()) })
    execFileSync(BASH!, ['-n'], { input: startScript(job()) })
  })

  it('reads the remote state', () => {
    expect(parsePoll('STATE running\nLOG\n== agent\n')).toEqual({ status: 'running', exitCode: null, log: '== agent\n' })
    expect(parsePoll('STATE exit 0\nLOG\nok')).toMatchObject({ status: 'done', exitCode: 0 })
    expect(parsePoll('STATE exit 3\nLOG\n')).toMatchObject({ status: 'failed', exitCode: 3 })
    expect(parsePoll('STATE exit cancelled\nLOG\n')).toMatchObject({ status: 'cancelled' })
    expect(parsePoll('STATE missing\n')).toMatchObject({ status: 'lost' })
  })
})

describe('RemoteJobs', () => {
  const kv = () => { const m = new Map<string, string>(); return { kvGet: (k: string) => m.get(k) ?? null, kvSet: (k: string, v: string) => { m.set(k, v) } } }
  const fake = (over: Partial<RemoteProvider> = {}): RemoteProvider => ({
    test: async () => 'connected', start: async () => {}, poll: async () => ({ status: 'done', exitCode: 0, log: 'finished' }),
    cancel: async () => {}, patch: async () => 'diff --git a/x b/x', cleanup: async () => {}, ...over
  })

  it('tracks a run from start to cleanup', async () => {
    const jobs = new RemoteJobs(kv(), fake())
    const started = await jobs.start(INPUT)
    expect(started).toMatchObject({ status: 'running', workBranch: `ventriee/${started.id}` })
    await expect(jobs.cleanup(started.id)).rejects.toThrow(/Cancel the run/)
    await jobs.refreshRunning()
    expect(jobs.list()[0]).toMatchObject({ status: 'done', exitCode: 0, log: 'finished' })
    expect(await jobs.patch(started.id)).toMatch(/^diff/)
    expect((await jobs.cleanup(started.id)).status).toBe('cleaned')
    jobs.forget(started.id)
    expect(jobs.list()).toEqual([])
  })

  it('records a start that fails', async () => {
    const jobs = new RemoteJobs(kv(), fake({ start: async () => { throw new Error('Could not connect') } }))
    expect(await jobs.start(INPUT)).toMatchObject({ status: 'failed', error: 'Could not connect' })
  })
})
