import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
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


import { RemoteControl, defaultExpiry, type Capability, type CommandBus } from '../src/main/remote'
import type { CommandStatus, Device, RemoteCommand } from '../src/main/cloud/types'

const T0 = Date.parse('2026-06-01T00:00:00Z')
let clock = T0
const now = () => clock

function device(over: Partial<Device> = {}): Device {
  return { id: 'dev-1', user_id: 'owner', org_id: null, name: 'Mac', platform: 'darwin', remote_enabled: true, last_seen_at: 'now', created_at: 'now', ...over }
}

// In-memory bus that honours the atomic queued->claimed compare-and-set the SQL relies on.
class FakeBus implements CommandBus {
  device = device()
  commands: RemoteCommand[] = []
  private seq = 0
  touched = 0

  async registerDevice() { return this.device }
  async updateDevice(_id: string, patch: { remoteEnabled?: boolean; touch?: boolean }) {
    if (patch.touch) this.touched++
    if (patch.remoteEnabled !== undefined) this.device = { ...this.device, remote_enabled: patch.remoteEnabled }
    return this.device
  }
  async listCommands(opts: { status?: CommandStatus | CommandStatus[] }) {
    const want = opts.status === undefined ? null : Array.isArray(opts.status) ? opts.status : [opts.status]
    return this.commands.filter((c) => !want || want.includes(c.status))
  }
  async claimCommand(id: string) {
    const c = this.commands.find((x) => x.id === id)
    if (!c || c.status !== 'queued') return null // lost the race / already claimed
    c.status = 'claimed'; c.claimed_at = new Date(clock).toISOString()
    return { ...c }
  }
  async updateCommand(id: string, patch: { status: CommandStatus; result?: Record<string, unknown>; error?: string; finished?: boolean }) {
    const c = this.commands.find((x) => x.id === id)
    if (!c) return null
    c.status = patch.status
    if (patch.result !== undefined) c.result = patch.result
    if (patch.error !== undefined) c.error = patch.error
    if (patch.finished) c.finished_at = new Date(clock).toISOString()
    return { ...c }
  }

  enqueue(over: Partial<RemoteCommand> = {}): RemoteCommand {
    const cmd: RemoteCommand = {
      id: `c${this.seq++}`, device_id: this.device.id, org_id: null, type: 'noop', payload: {},
      status: 'queued', requires_confirmation: false, result: {}, error: '', requested_by: 'owner',
      created_at: new Date(clock).toISOString(), claimed_at: null, finished_at: null,
      expires_at: new Date(clock + 60_000).toISOString(), ...over
    }
    this.commands.push(cmd)
    return cmd
  }
  get(id: string) { return this.commands.find((c) => c.id === id)! }
}

function caps(over: Record<string, Capability> = {}): Map<string, Capability> {
  return new Map(Object.entries({ noop: { handler: async () => ({ ok: true }) }, ...over }))
}
async function registered(bus: FakeBus, capabilities = caps()) {
  const rc = new RemoteControl(bus, capabilities, { now })
  await rc.register({ name: 'Mac', platform: 'darwin' })
  return rc
}

describe('RemoteControl', () => {
  it('registers the device and adopts its persisted enabled state', async () => {
    const bus = new FakeBus(); bus.device = device({ remote_enabled: false })
    const rc = await registered(bus)
    expect(rc.deviceId).toBe('dev-1')
    expect(rc.isEnabled).toBe(false)
    await rc.poll() // disabled => does nothing even with a queued command
    bus.enqueue(); await rc.poll()
    expect(bus.commands[0].status).toBe('queued')
  })

  it('claims and runs a queued command, writing the result', async () => {
    const bus = new FakeBus()
    const rc = await registered(bus, caps({ 'project.status': { handler: async () => ({ running: true }) } }))
    const cmd = bus.enqueue({ type: 'project.status' })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('done')
    expect(bus.get(cmd.id).result).toEqual({ running: true })
    expect(bus.get(cmd.id).finished_at).not.toBeNull()
  })

  it('never double-runs: a command already claimed by another process is skipped', async () => {
    const bus = new FakeBus()
    const handler = vi.fn(async () => ({ ok: true }))
    const rc = await registered(bus, caps({ run: { handler } }))
    const cmd = bus.enqueue({ type: 'run' })
    await bus.claimCommand(cmd.id) // a competing desktop won the claim first
    await rc.poll()
    expect(handler).not.toHaveBeenCalled()
    expect(bus.get(cmd.id).status).toBe('claimed')
  })

  it('does not run an expired command; it marks it expired', async () => {
    const bus = new FakeBus()
    const handler = vi.fn(async () => ({}))
    const rc = await registered(bus, caps({ run: { handler } }))
    const cmd = bus.enqueue({ type: 'run', expires_at: new Date(clock - 1).toISOString() })
    await rc.poll()
    expect(handler).not.toHaveBeenCalled()
    expect(bus.get(cmd.id).status).toBe('expired')
  })

  it('refuses a high-risk command that arrived without confirmation', async () => {
    const bus = new FakeBus()
    const handler = vi.fn(async () => ({}))
    const rc = await registered(bus, caps({ 'run.start': { handler, highRisk: true } }))
    const cmd = bus.enqueue({ type: 'run.start', requires_confirmation: false })
    await rc.poll()
    expect(handler).not.toHaveBeenCalled()
    expect(bus.get(cmd.id).status).toBe('failed')
    expect(bus.get(cmd.id).error).toMatch(/confirm/i)
  })

  it('runs a high-risk command when it is explicitly confirmed', async () => {
    const bus = new FakeBus()
    const rc = await registered(bus, caps({ 'run.start': { handler: async () => ({ jobId: 'j1' }), highRisk: true } }))
    const cmd = bus.enqueue({ type: 'run.start', requires_confirmation: true })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('done')
    expect(bus.get(cmd.id).result).toEqual({ jobId: 'j1' })
  })

  it('fails an unsupported command type (no unrestricted shell)', async () => {
    const bus = new FakeBus()
    const rc = await registered(bus)
    const cmd = bus.enqueue({ type: 'shell.exec', payload: { cmd: 'rm -rf /' } })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('failed')
    expect(bus.get(cmd.id).error).toMatch(/unsupported/)
  })

  it('records a handler failure as failed with its message', async () => {
    const bus = new FakeBus()
    const rc = await registered(bus, caps({ boom: { handler: async () => { throw new Error('kaboom') } } }))
    const cmd = bus.enqueue({ type: 'boom' })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('failed')
    expect(bus.get(cmd.id).error).toBe('kaboom')
  })

  it('times out a hung handler instead of blocking the queue', async () => {
    const bus = new FakeBus()
    const rc = new RemoteControl(bus, caps({ hang: { handler: () => new Promise(() => {}) } }), { now, commandTimeoutMs: 10 })
    await rc.register({ name: 'Mac', platform: 'darwin' })
    const cmd = bus.enqueue({ type: 'hang' })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('failed')
    expect(bus.get(cmd.id).error).toMatch(/exceeded/)
  })

  it('reclaims a stale in-flight command left by a crashed run', async () => {
    const bus = new FakeBus()
    const rc = new RemoteControl(bus, caps(), { now, staleMs: 1000 })
    await rc.register({ name: 'Mac', platform: 'darwin' })
    const cmd = bus.enqueue({ type: 'noop', status: 'running', claimed_at: new Date(clock - 5000).toISOString() })
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('failed')
    expect(bus.get(cmd.id).error).toMatch(/timed out/)
  })

  it('heartbeat touches the device registration', async () => {
    const bus = new FakeBus()
    const rc = await registered(bus)
    await rc.heartbeat()
    expect(bus.touched).toBe(1)
  })

  it('setEnabled persists the toggle and gates polling', async () => {
    const bus = new FakeBus(); bus.device = device({ remote_enabled: false })
    const rc = await registered(bus)
    await rc.setEnabled(true)
    expect(rc.isEnabled).toBe(true)
    const cmd = bus.enqueue()
    await rc.poll()
    expect(bus.get(cmd.id).status).toBe('done')
  })
})

describe('defaultExpiry', () => {
  it('is 24h out from the given instant', () => {
    expect(defaultExpiry(T0)).toBe(new Date(T0 + 86_400_000).toISOString())
  })
})
