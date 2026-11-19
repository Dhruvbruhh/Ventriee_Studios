import { type ChildProcess } from 'node:child_process'
import { createServer, connect, type Socket } from 'node:net'
import { isAbsolute, relative } from 'node:path'
import { realpathSync } from 'node:fs'
import { FrameReader, encodeMessage, findExecutable, spawnTool } from './lsp'
import { forOs, type DebuggerSpec } from '../shared/catalog'
import type { DebugBreakpoint, DebugEvent, DebugFrame, DebugVariable } from '../shared/workspace'

type Message = { seq?: number; type: 'request' | 'response' | 'event'; command?: string; event?: string; request_seq?: number; success?: boolean; message?: string; body?: Record<string, unknown>; arguments?: unknown }

/** What the Debug panel drives; implemented by the Node.js inspector session and by DAP adapters. */
export interface Debugger {
  setBreakpoints(path: string, breakpoints: DebugBreakpoint[]): Promise<void>
  command(action: 'continue' | 'over' | 'into' | 'out' | 'pause'): Promise<void>
  evaluate(expression: string): Promise<string>
  variables?(ref: number): Promise<DebugVariable[]>
  selectThread?(threadId: number): Promise<void>
  stop(): void
}

const freePort = () => new Promise<number>((resolve, reject) => {
  const server = createServer()
  server.listen(0, '127.0.0.1', () => { const port = (server.address() as { port: number }).port; server.close(() => resolve(port)) })
  server.on('error', reject)
})

/** A debug adapter speaking the Debug Adapter Protocol (debugpy, Delve, lldb-dap, …), the one VS Code uses. */
export class DapSession implements Debugger {
  private child: ChildProcess | null = null
  private socket: Socket | null = null
  private reader = new FrameReader()
  private seq = 0
  private pending = new Map<number, { resolve: (m: Message) => void; reject: (e: Error) => void }>()
  private initialized: Promise<void>
  private markInitialized!: () => void
  private threadId = 1
  private topFrame: number | null = null
  private breakpoints = new Map<string, DebugBreakpoint[]>()
  private stderr = ''
  private ended = false

  private root: string
  constructor(root: string, private spec: DebuggerSpec, private emit: (event: DebugEvent) => void) {
    try { this.root = realpathSync.native(root) } catch { this.root = root }
    this.initialized = new Promise((resolve) => { this.markInitialized = resolve })
  }

  private write(m: Omit<Message, 'seq'>) {
    const data = encodeMessage({ seq: ++this.seq, ...m } as never)
    if (this.socket) this.socket.write(data); else this.child?.stdin?.write(data)
    return this.seq
  }

  request(command: string, args: unknown = {}, timeout = 30_000): Promise<Message> {
    if (this.ended) return Promise.reject(new Error('The program is not running'))
    return new Promise((resolve, reject) => {
      const seq = this.write({ type: 'request', command, arguments: args })
      const timer = setTimeout(() => { this.pending.delete(seq); reject(new Error(`The debugger did not answer ${command} in time`)) }, timeout)
      this.pending.set(seq, { resolve: (m) => { clearTimeout(timer); if (m.success) resolve(m); else reject(new Error(m.message || `${command} failed`)) }, reject: (e) => { clearTimeout(timer); reject(e) } })
    })
  }

  private relPath(path: string | undefined) {
    if (!path) return null
    const rel = relative(this.root, path).replace(/\\/g, '/')
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null
  }

  private async onMessage(m: Message) {
    if (m.type === 'response') { const p = this.pending.get(m.request_seq!); if (p) { this.pending.delete(m.request_seq!); p.resolve(m) } return }
    if (m.type === 'request') {
      // Reverse requests (runInTerminal, startDebugging) are not offered in our capabilities.
      this.write({ type: 'response', request_seq: m.seq, command: m.command, success: false, message: 'Not supported' } as never)
      return
    }
    const body = m.body ?? {}
    if (m.event === 'initialized') this.markInitialized()
    else if (m.event === 'output' && body.category !== 'telemetry') this.emit({ type: 'output', text: String(body.output ?? '') })
    else if (m.event === 'continued') this.emit({ type: 'running' })
    else if (m.event === 'stopped') { if (typeof body.threadId === 'number') this.threadId = body.threadId; await this.showStop(String(body.reason ?? 'pause')).catch(() => {}) }
    else if (m.event === 'exited') this.finish(Number(body.exitCode ?? 0))
    else if (m.event === 'terminated') this.finish(0)
  }

  private exitCode: number | null = null
  private finish(code: number) {
    if (this.exitCode === null) this.exitCode = code
    // 'exited' carries the code and 'terminated' follows; report once, after the last of them.
    setTimeout(() => { if (!this.ended) { this.ended = true; this.emit({ type: 'exited', code: this.exitCode ?? code }); this.kill() } }, 150)
  }

  private async showStop(reason: string) {
    const threads = ((await this.request('threads').catch(() => null))?.body?.threads as Array<{ id: number; name: string }> | undefined) ?? []
    const trace = await this.request('stackTrace', { threadId: this.threadId, startFrame: 0, levels: 50 })
    const raw = (trace.body?.stackFrames as Array<{ id: number; name: string; line: number; column: number; source?: { path?: string } }>) ?? []
    const frames: DebugFrame[] = raw.map((f) => { const path = this.relPath(f.source?.path); return { name: f.name, path: path ?? f.source?.path ?? '', line: f.line, column: f.column || 1, internal: !path } })
    const top = raw[frames.findIndex((f) => !f.internal)] ?? raw[0]
    this.topFrame = top?.id ?? null
    const variables: DebugVariable[] = []
    if (top) {
      const scopes = ((await this.request('scopes', { frameId: top.id }).catch(() => null))?.body?.scopes as Array<{ name: string; variablesReference: number; expensive?: boolean }>) ?? []
      for (const scope of scopes.filter((s) => !s.expensive).slice(0, 3)) for (const v of await this.variables(scope.variablesReference).catch(() => [])) variables.push({ ...v, scope: scope.name })
    }
    this.emit({ type: 'paused', reason, frames, variables, threads: threads.slice(0, 100), threadId: this.threadId })
  }

  async variables(ref: number): Promise<DebugVariable[]> {
    const r = await this.request('variables', { variablesReference: ref })
    return ((r.body?.variables as Array<{ name: string; value: string; type?: string; variablesReference: number }>) ?? []).slice(0, 200)
      .map((v) => ({ name: v.name, value: v.value, scope: v.type ?? '', ref: v.variablesReference || undefined }))
  }

  async selectThread(threadId: number) { this.threadId = threadId; await this.showStop('thread') }

  /** Start the adapter, then launch (or attach) with the given DAP arguments. */
  async start(args: Record<string, unknown>, breakpoints: Record<string, DebugBreakpoint[]>) {
    const file = findExecutable(this.spec.command)
    const install = forOs(this.spec.install?.command, process.platform)
    if (!file) throw new Error(`${this.spec.name} is not installed${install ? `. Install it with: ${install}` : ''}`)
    const tcp = (this.spec.args ?? []).some((a) => a.includes('${port}'))
    const port = tcp ? await freePort() : 0
    const child = spawnTool(file, (this.spec.args ?? []).map((a) => a.replace('${port}', String(port))), this.root)
    this.child = child
    const died = new Promise<never>((_, reject) => {
      child.on('error', (e) => reject(e))
      child.on('exit', (code) => {
        for (const p of this.pending.values()) p.reject(new Error(`${this.spec.name} stopped${this.stderr ? `: ${this.stderr.trim().split('\n').slice(-2).join(' ')}` : ''}${install ? `. If it is not installed: ${install}` : ''}`))
        this.pending.clear()
        if (!this.ended) { this.ended = true; this.emit({ type: 'exited', code: this.exitCode ?? code ?? 0 }) }
        reject(new Error(`${this.spec.name} stopped before the program started${this.stderr ? `: ${this.stderr.trim().split('\n').slice(-2).join(' ')}` : ''}${install ? `. If it is not installed: ${install}` : ''}`))
      })
    })
    died.catch(() => {})
    child.stderr?.on('data', (d: Buffer) => { this.stderr = (this.stderr + d.toString()).slice(-4000) })
    const onData = (chunk: Buffer) => { for (const m of this.reader.push(chunk)) void this.onMessage(m as Message) }
    if (tcp) {
      // The adapter needs a moment to listen; try for up to 10 seconds.
      for (let i = 0; ; i++) {
        try {
          this.socket = await Promise.race([died, new Promise<Socket>((resolve, reject) => { const s = connect(port, '127.0.0.1', () => resolve(s)); s.once('error', reject) })])
          break
        } catch (e) { if (i > 50 || this.ended) throw e; await new Promise((r) => setTimeout(r, 200)) }
      }
      this.socket.on('data', onData)
      child.stdout?.on('data', (d: Buffer) => this.emit({ type: 'output', text: d.toString() }))
    } else child.stdout?.on('data', onData)
    await Promise.race([died, this.request('initialize', { clientID: 'ventriee', clientName: 'Ventriee Studios', adapterID: this.spec.id, pathFormat: 'path', linesStartAt1: true, columnsStartAt1: true, supportsVariableType: true, supportsRunInTerminalRequest: false, locale: 'en' })])
    // Many adapters answer launch only after configurationDone, so send it without waiting.
    const launched = this.request(String(args.request ?? 'launch') === 'attach' ? 'attach' : 'launch', args, 60_000)
    launched.catch(() => {})
    await Promise.race([died, launched, this.initialized])
    for (const [path, list] of Object.entries(breakpoints)) await this.setBreakpoints(path, list).catch(() => {})
    await this.request('setExceptionBreakpoints', { filters: [] }).catch(() => {})
    await this.request('configurationDone').catch(() => {})
    await Promise.race([died, launched])
    this.emit({ type: 'running' })
  }

  async setBreakpoints(path: string, list: DebugBreakpoint[]) {
    this.breakpoints.set(path, list)
    const abs = `${this.root.replace(/[\\/]$/, '')}/${path}`.replace(/\//g, process.platform === 'win32' ? '\\' : '/')
    await this.request('setBreakpoints', { source: { path: abs }, breakpoints: list.slice(0, 200).map((b) => ({ line: b.line, condition: b.condition || undefined, logMessage: b.logMessage || undefined })) })
  }

  async command(action: 'continue' | 'over' | 'into' | 'out' | 'pause') {
    const command = { continue: 'continue', over: 'next', into: 'stepIn', out: 'stepOut', pause: 'pause' }[action]
    await this.request(command, { threadId: this.threadId })
    if (action !== 'pause') this.emit({ type: 'running' })
  }

  async evaluate(expression: string) {
    try {
      const r = await this.request('evaluate', { expression: expression.slice(0, 2000), frameId: this.topFrame ?? undefined, context: 'repl' })
      return String(r.body?.result ?? '')
    } catch (e) { return `Error: ${(e as Error).message}` }
  }

  private kill() { this.socket?.destroy(); this.child?.kill(); this.socket = null }

  stop() {
    if (this.ended) { this.kill(); return }
    void this.request('disconnect', { terminateDebuggee: true }, 2000).catch(() => {}).finally(() => setTimeout(() => this.kill(), 500))
  }
}
