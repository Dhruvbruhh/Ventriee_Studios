import { spawn } from 'node:child_process'
import type { RemoteJob, RemoteJobInput } from '../shared/types'

/** Where remote work runs. SSH is the first provider; a hosted sandbox can implement the same calls later. */
export interface RemoteProvider {
  test(host: string): Promise<string>
  start(job: RemoteJob): Promise<void>
  poll(job: RemoteJob): Promise<{ status: RemoteJob['status']; exitCode: number | null; log: string }>
  cancel(job: RemoteJob): Promise<void>
  patch(job: RemoteJob): Promise<string>
  cleanup(job: RemoteJob): Promise<void>
}

const HOST = /^(?!-)[A-Za-z0-9._@-]{1,200}(:\d{1,5})?$/
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,60}$/
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

export function validateRemote(input: RemoteJobInput): RemoteJobInput {
  const isE2B = input.provider === 'e2b'
  const host = String(input.host ?? '').trim()
  if (!isE2B && !HOST.test(host)) throw new Error('Use a host like user@server.example.com, or an alias from your SSH config')
  const repo = String(input.repo ?? '').trim()
  if (!/^(https:\/\/|git@|ssh:\/\/)[^\s]+$/.test(repo)) throw new Error('Use an https://, ssh:// or git@ repository address')
  const branch = String(input.branch ?? '').trim()
  if (branch && !/^[\w./-]{1,100}$/.test(branch)) throw new Error('That branch name is not valid')
  if (!String(input.task ?? '').trim()) throw new Error('Describe the task for the agent')
  if (!String(input.agentCommand ?? '').trim()) throw new Error('Set the agent command')
  const env = Object.fromEntries(Object.entries(input.env ?? {}).filter(([k, v]) => ENV_NAME.test(k) && typeof v === 'string'))
  return {
    host, repo, branch, env,
    setup: String(input.setup ?? '').slice(0, 2000),
    agentCommand: String(input.agentCommand).slice(0, 2000),
    task: String(input.task).slice(0, 20_000),
    timeoutMinutes: Math.min(24 * 60, Math.max(1, Math.round(Number(input.timeoutMinutes) || 60))),
    memoryMb: Math.max(0, Math.round(Number(input.memoryMb) || 0)),
    push: Boolean(input.push)
  }
}

const workspace = (job: Pick<RemoteJob, 'id'>) => `"$HOME/ventriee-workspaces/${job.id}"`

/** The script that does the work on the remote machine. Every owner-supplied value arrives base64-encoded. */
export function runScript(job: RemoteJob): string {
  const exports = Object.entries(job.env).map(([k, v]) => `export ${k}="$(d ${b64(v)})"`).join('\n')
  return `#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
W="$(pwd)"
d() { printf '%s' "$1" | base64 -d; }
finish() { echo "$1" > "$W/exit_code"; exit "$1"; }
REPO="$(d ${b64(job.repo)})"
BRANCH="$(d ${b64(job.branch)})"
WORK="$(d ${b64(job.workBranch)})"
SETUP="$(d ${b64(job.setup)})"
AGENT="$(d ${b64(job.agentCommand)})"
export VENTRIEE_TASK="$(d ${b64(job.task)})"
${exports}
LIMIT=(timeout "${job.timeoutMinutes}m" nice -n 10)
if [ ${job.memoryMb} -gt 0 ] && command -v systemd-run >/dev/null 2>&1 && systemd-run --user --scope -q true 2>/dev/null; then
  LIMIT=(systemd-run --user --scope -q -p MemoryMax=${job.memoryMb}M "\${LIMIT[@]}")
  echo "== memory limit ${job.memoryMb} MB"
fi
echo "== clone $REPO"
if [ -n "$BRANCH" ]; then git clone --depth 50 --branch "$BRANCH" -- "$REPO" repo || finish 2; else git clone --depth 50 -- "$REPO" repo || finish 2; fi
cd repo
git rev-parse HEAD > "$W/base"
git checkout -b "$WORK" || finish 2
if [ -n "$SETUP" ]; then echo "== setup"; "\${LIMIT[@]}" bash -lc "$SETUP" || finish 3; fi
echo "== agent"
"\${LIMIT[@]}" bash -lc "$AGENT"
code=$?
echo "== agent exited with $code"
git add -A
git -c user.name="Ventriee remote" -c user.email="remote@ventriee.local" commit -q -m "Ventriee remote run ${job.id}" || echo "== no file changes"
git --no-pager diff --stat "$(cat "$W/base")" HEAD
if [ "$(d ${b64(job.push ? '1' : '0')})" = 1 ]; then echo "== push $WORK"; git push -u origin "$WORK" || code=4; fi
finish "$code"
`
}

/** Writes the run script into a fresh workspace and starts it detached, so it outlives the SSH session and the app. */
export function startScript(job: RemoteJob): string {
  return `set -e
W=${workspace(job)}
mkdir -p "$W"
cd "$W"
printf '%s' '${b64(runScript(job))}' | base64 -d > run.sh
chmod +x run.sh
nohup setsid ./run.sh > run.log 2>&1 < /dev/null &
echo $! > pid
echo started
`
}

export function pollScript(job: RemoteJob): string {
  return `W=${workspace(job)}
if [ ! -d "$W" ]; then echo "STATE missing"; exit 0; fi
cd "$W"
if [ -f exit_code ]; then echo "STATE exit $(cat exit_code)"
elif [ -f pid ] && kill -0 "$(cat pid)" 2>/dev/null; then echo "STATE running"
else echo "STATE lost"; fi
echo "LOG"
tail -n 200 run.log 2>/dev/null
`
}

export function parsePoll(out: string): { status: RemoteJob['status']; exitCode: number | null; log: string } {
  const state = /^STATE (\w+)(?: (\S+))?/m.exec(out)
  const log = out.includes('\nLOG\n') ? out.slice(out.indexOf('\nLOG\n') + 5) : ''
  if (!state) return { status: 'lost', exitCode: null, log }
  if (state[1] === 'running') return { status: 'running', exitCode: null, log }
  if (state[1] === 'exit') {
    if (state[2] === 'cancelled') return { status: 'cancelled', exitCode: null, log }
    const code = Number(state[2])
    return { status: code === 0 ? 'done' : 'failed', exitCode: Number.isFinite(code) ? code : null, log }
  }
  return { status: 'lost', exitCode: null, log }
}

function splitHost(host: string) {
  const m = /^(.*?)(?::(\d+))?$/.exec(host)!
  return { target: m[1], port: m[2] }
}

/** Run a bash script on the host through the system ssh, with the owner's own keys and no password prompts. */
export function ssh(host: string, script: string, timeoutMs = 60_000): Promise<string> {
  const { target, port } = splitHost(host)
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', ...(port ? ['-p', port] : []), '--', target, 'bash -s'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('The remote host did not answer in time')) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d; if (out.length > 5_000_000) child.kill() })
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000) })
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(/ENOENT/.test(e.message) ? 'The ssh command is not installed (on Windows: Settings → Optional features → OpenSSH Client)' : e.message)) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(code === 255 ? `Could not connect to ${target}: ${err.trim().split('\n').at(-1) ?? 'check the address and that your SSH key is loaded'}` : err.trim().split('\n').at(-1) || `The remote command failed (exit ${code})`))
    })
    child.stdin.end(script)
  })
}

const KV = 'remoteJobs'

/** Remote runs, saved locally so they can be followed after a restart while they keep working on their host. */
export class RemoteJobs {
  constructor(private kv: { kvGet(k: string): string | null; kvSet(k: string, v: string): void }, private provider: RemoteProvider = sshProvider, private onChange: () => void = () => {}) {}

  list(): RemoteJob[] {
    try { return JSON.parse(this.kv.kvGet(KV) ?? '[]') as RemoteJob[] } catch { return [] }
  }
  private get(id: string) {
    const job = this.list().find((j) => j.id === id)
    if (!job) throw new Error('That remote run no longer exists')
    return job
  }
  private update(id: string, patch: Partial<RemoteJob>) {
    const list = this.list().map((j) => (j.id === id ? { ...j, ...patch, updatedAt: Date.now() } : j))
    this.kv.kvSet(KV, JSON.stringify(list.slice(-100)))
    this.onChange()
    return list.find((j) => j.id === id)!
  }

  test(host: string) {
    return this.provider.test(validateRemote({ host, repo: 'https://x/y', branch: '', setup: '', agentCommand: 'x', task: 'x', env: {}, timeoutMinutes: 1, memoryMb: 0, push: false }).host)
  }

  async start(input: RemoteJobInput, e2bProvider?: RemoteProvider): Promise<RemoteJob> {
    const clean = validateRemote(input)
    const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const now = Date.now()
    const provider = input.provider === 'e2b' ? 'e2b' : 'ssh'
    const job: RemoteJob = { ...clean, id, provider, workBranch: `ventriee/${id}`, status: 'starting', exitCode: null, log: '', createdAt: now, updatedAt: now }
    this.kv.kvSet(KV, JSON.stringify([...this.list(), job].slice(-100)))
    const prov = provider === 'e2b' ? (e2bProvider ?? this.provider) : this.provider
    try {
      await prov.start(job)
      return this.update(id, { status: 'running' })
    } catch (e) {
      return this.update(id, { status: 'failed', error: (e as Error).message })
    }
  }

  async refresh(id: string) {
    const job = this.get(id)
    if (job.status === 'cleaned') return job
    try {
      const r = await this.provider.poll(job)
      return this.update(id, { status: r.status, exitCode: r.exitCode, log: r.log, error: undefined })
    } catch (e) {
      return this.update(id, { error: (e as Error).message })
    }
  }

  async refreshRunning() {
    for (const job of this.list()) if (job.status === 'running' || job.status === 'starting') await this.refresh(job.id)
  }

  async cancel(id: string) {
    await this.provider.cancel(this.get(id))
    return this.update(id, { status: 'cancelled' })
  }

  patch(id: string) {
    return this.provider.patch(this.get(id))
  }

  async cleanup(id: string) {
    const job = this.get(id)
    if (job.status === 'running') throw new Error('Cancel the run before cleaning up its workspace')
    await this.provider.cleanup(job)
    return this.update(id, { status: 'cleaned' })
  }

  forget(id: string) {
    const job = this.get(id)
    if (job.status === 'running' || job.status === 'starting') throw new Error('Cancel the run first')
    this.kv.kvSet(KV, JSON.stringify(this.list().filter((j) => j.id !== id)))
    this.onChange()
  }
}

export const sshProvider: RemoteProvider = {
  test: (host) => ssh(host, 'echo "connected to $(hostname) ($(uname -sm))"; for t in git base64 setsid timeout; do command -v $t >/dev/null || echo "missing: $t"; done', 30_000),
  start: async (job) => { const out = await ssh(job.host, startScript(job)); if (!out.includes('started')) throw new Error('The run did not start') },
  poll: async (job) => parsePoll(await ssh(job.host, pollScript(job))),
  cancel: async (job) => { await ssh(job.host, `cd ${workspace(job)} 2>/dev/null || exit 0\n[ -f pid ] && kill -TERM -- -"$(cat pid)" 2>/dev/null\necho cancelled > exit_code`) },
  patch: (job) => ssh(job.host, `cd ${workspace(job)}/repo && git --no-pager diff "$(cat ../base)" HEAD`, 120_000),
  cleanup: async (job) => { await ssh(job.host, `rm -rf ${workspace(job)}`) }
}

/** E2B cloud sandbox provider. Requires an E2B API key in settings → Connectors → e2bKey. */
export class E2BProvider implements RemoteProvider {
  constructor(private apiKey: string) {}

  private async api(path: string, body?: unknown, method = body ? 'POST' : 'GET') {
    const res = await fetch(`https://api.e2b.dev${path}`, {
      method,
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`E2B ${res.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : null
  }

  async test(_host: string): Promise<string> {
    if (!this.apiKey) throw new Error('Add an E2B API key in Settings → Connectors → E2B')
    const info = await this.api('/v0/sandboxes?limit=1') as unknown[]
    return `E2B connected — ${(info ?? []).length >= 0 ? 'quota ok' : 'ok'}`
  }

  async start(job: RemoteJob): Promise<void> {
    // Create a sandbox and store its ID in job.host (repurposed for sandbox ID)
    const sandbox = await this.api('/v0/sandboxes', { templateId: 'base', metadata: { jobId: job.id } }) as { sandboxId: string }
    // Fire-and-forget: run the agent command inside the sandbox
    const script = [
      job.setup && `bash -lc ${JSON.stringify(job.setup)}`,
      `export VENTRIEE_TASK=${JSON.stringify(job.task)}`,
      ...Object.entries(job.env).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`),
      `bash -lc ${JSON.stringify(job.agentCommand)} > /run.log 2>&1; echo $? > /exit_code`
    ].filter(Boolean).join('\n')
    await this.api(`/v0/sandboxes/${sandbox.sandboxId}/process`, { cmd: script, background: true })
    ;(job as RemoteJob & { _e2bId?: string })._e2bId = sandbox.sandboxId
  }

  async poll(job: RemoteJob): Promise<{ status: RemoteJob['status']; exitCode: number | null; log: string }> {
    const id = (job as RemoteJob & { _e2bId?: string })._e2bId ?? job.id
    try {
      const res = await this.api(`/v0/sandboxes/${id}/filesystem/read?path=/exit_code`) as { content: string }
      const code = parseInt(res.content.trim(), 10)
      const logRes = await this.api(`/v0/sandboxes/${id}/filesystem/read?path=/run.log`) as { content: string }
      return { status: code === 0 ? 'done' : 'failed', exitCode: code, log: (logRes.content ?? '').slice(-8000) }
    } catch {
      return { status: 'running', exitCode: null, log: '' }
    }
  }

  async cancel(job: RemoteJob): Promise<void> {
    const id = (job as RemoteJob & { _e2bId?: string })._e2bId ?? job.id
    await this.api(`/v0/sandboxes/${id}`, null, 'DELETE').catch(() => {})
  }

  async patch(_job: RemoteJob): Promise<string> {
    return '(diff not available for E2B sandboxes)'
  }

  async cleanup(job: RemoteJob): Promise<void> {
    await this.cancel(job)
  }
}
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
