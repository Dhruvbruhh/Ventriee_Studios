// "Jarvis" inbound remote control (ECOSYSTEM §17). Lets an authorized phone/web
// client drive THIS signed-in desktop runtime with no open inbound ports: Supabase
// is the command bus (see supabase/migrations/0002_remote_control.sql). This file is
// the desktop side — it registers the device, heartbeats, and polls for queued
// commands, claiming and executing each via an injected allowlist of app capabilities.
//
// NOT src/main/remote execution (there is none here) — this is INBOUND control.
// Deliberately no shell: a command can only do what a registered handler allows.
import type { CommandStatus, Device, RemoteCommand } from './cloud/types'

/** The slice of CloudClient the controller needs; a fake satisfies it in tests. */
export interface CommandBus {
  registerDevice(input: { name: string; platform: string; orgId?: string | null }): Promise<Device>
  updateDevice(deviceId: string, patch: { name?: string; platform?: string; remoteEnabled?: boolean; touch?: boolean }): Promise<Device>
  listCommands(opts: { deviceId: string; status?: CommandStatus | CommandStatus[]; limit?: number }): Promise<RemoteCommand[]>
  claimCommand(commandId: string): Promise<RemoteCommand | null>
  updateCommand(commandId: string, patch: { status: CommandStatus; result?: Record<string, unknown>; error?: string; finished?: boolean }): Promise<RemoteCommand | null>
}

/** One allowed capability. highRisk commands must arrive with requires_confirmation=true. */
export interface Capability {
  handler: (cmd: RemoteCommand) => Promise<unknown>
  highRisk?: boolean
}

export interface RemoteOptions {
  now?: () => number
  /** Hard cap on one command's execution; a hung handler fails instead of blocking the queue. */
  commandTimeoutMs?: number
  /** A claimed/running row older than this (process crashed mid-run) is failed on the next poll. */
  staleMs?: number
  onError?: (where: string, error: unknown) => void
}

const DAY = 86_400_000

export class RemoteControl {
  private device: Device | null = null
  private enabled = false
  private readonly now: () => number
  private readonly commandTimeoutMs: number
  private readonly staleMs: number
  private readonly onError: (where: string, error: unknown) => void

  constructor(
    private bus: CommandBus,
    private capabilities: Map<string, Capability>,
    opts: RemoteOptions = {}
  ) {
    this.now = opts.now ?? Date.now
    this.commandTimeoutMs = opts.commandTimeoutMs ?? 60_000
    this.staleMs = opts.staleMs ?? 5 * 60_000
    this.onError = opts.onError ?? (() => {})
  }

  get deviceId() { return this.device?.id ?? null }
  get isEnabled() { return this.enabled }
  snapshot(): { device: Device | null; enabled: boolean } { return { device: this.device, enabled: this.enabled } }

  /** Register (once per sign-in) this desktop as a device and adopt its enabled state. */
  async register(input: { name: string; platform: string; orgId?: string | null }): Promise<Device> {
    this.device = await this.bus.registerDevice(input)
    this.enabled = this.device.remote_enabled
    return this.device
  }

  /** Adopt an already-resolved device row (find-or-create happens in the caller) without a new insert. */
  attach(device: Device): void { this.device = device; this.enabled = device.remote_enabled }
  /** Forget the current device (sign-out); polling stops until the next attach/register. */
  detach(): void { this.device = null; this.enabled = false }

  /** Refresh last_seen_at so remote clients can tell this device is online. */
  async heartbeat(): Promise<void> {
    if (!this.device) return
    try { this.device = await this.bus.updateDevice(this.device.id, { touch: true }) } catch (e) { this.onError('heartbeat', e) }
  }

  /** Turn remote control on/off for this device (persisted; default off = least privilege). */
  async setEnabled(on: boolean): Promise<void> {
    if (!this.device) throw new Error('Register the device before enabling remote control')
    this.device = await this.bus.updateDevice(this.device.id, { remoteEnabled: on })
    this.enabled = this.device.remote_enabled
  }

  /**
   * One poll cycle: fail commands that outlived their claim, then claim & run every
   * queued command addressed to this device. Safe to call on a timer; it swallows
   * transport errors (offline/reconnect) so the loop survives a dropped network.
   */
  async poll(): Promise<void> {
    if (!this.device || !this.enabled) return
    const deviceId = this.device.id
    try {
      await this.reclaimStale(deviceId)
      const queued = await this.bus.listCommands({ deviceId, status: 'queued' })
      for (const cmd of queued) await this.process(cmd)
    } catch (e) {
      this.onError('poll', e) // transient (e.g. offline); the next tick retries.
    }
  }

  private async reclaimStale(deviceId: string): Promise<void> {
    const inFlight = await this.bus.listCommands({ deviceId, status: ['claimed', 'running'] })
    const cutoff = this.now() - this.staleMs
    for (const cmd of inFlight) {
      const since = Date.parse(cmd.claimed_at ?? cmd.created_at)
      if (Number.isFinite(since) && since < cutoff) await this.finish(cmd.id, 'failed', { error: 'timed out (runtime restarted mid-command)' })
    }
  }

  private async process(cmd: RemoteCommand): Promise<void> {
    // Expired before we even claimed it: don't run, just mark it.
    if (this.isExpired(cmd)) { await this.safeFinish(cmd.id, 'expired', { error: 'command expired before it was claimed' }); return }

    const claimed = await this.bus.claimCommand(cmd.id)
    if (!claimed) return // another process (or an earlier tick) already claimed it — no duplicate run.

    // Re-check authorization window after the claim: it may have lapsed in between.
    if (this.isExpired(claimed)) { await this.safeFinish(claimed.id, 'expired', { error: 'command expired before execution' }); return }

    const capability = this.capabilities.get(claimed.type)
    if (!capability) { await this.safeFinish(claimed.id, 'failed', { error: `unsupported command: ${claimed.type}` }); return }
    if (capability.highRisk && !claimed.requires_confirmation) {
      await this.safeFinish(claimed.id, 'failed', { error: 'this command is high-risk and needs explicit confirmation' }); return
    }

    try {
      await this.bus.updateCommand(claimed.id, { status: 'running' })
      const result = await this.withTimeout(capability.handler(claimed))
      await this.safeFinish(claimed.id, 'done', { result: asRecord(result) })
    } catch (e) {
      await this.safeFinish(claimed.id, 'failed', { error: message(e) })
    }
  }

  private isExpired(cmd: RemoteCommand): boolean {
    const at = Date.parse(cmd.expires_at)
    return Number.isFinite(at) && at <= this.now()
  }

  private withTimeout<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`command exceeded ${this.commandTimeoutMs}ms`)), this.commandTimeoutMs)
      work.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
    })
  }

  private finish(id: string, status: CommandStatus, extra: { result?: Record<string, unknown>; error?: string }) {
    return this.bus.updateCommand(id, { status, finished: true, ...extra })
  }
  // Writing the result must never throw out of the loop; log and move on.
  private async safeFinish(id: string, status: CommandStatus, extra: { result?: Record<string, unknown>; error?: string }) {
    try { await this.finish(id, status, extra) } catch (e) { this.onError('finish', e) }
  }
}

/** Default expiry for an enqueued command when the caller gives none. */
export function defaultExpiry(now = Date.now()): string { return new Date(now + DAY).toISOString() }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : { value }
}
function message(e: unknown): string { return e instanceof Error ? e.message : String(e) }
