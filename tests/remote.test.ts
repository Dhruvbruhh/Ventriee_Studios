import { describe, expect, it, vi } from 'vitest'
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
