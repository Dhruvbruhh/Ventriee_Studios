import { spawn, type ChildProcess } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { relative } from 'node:path'
import { existsSync, realpathSync } from 'node:fs'
import { workspacePath } from './files'
import type { DebugBreakpoint, DebugEvent, DebugFrame, DebugVariable } from '../shared/workspace'
import type { Debugger } from './dap'

type Breakpoints = Record<string, Array<DebugBreakpoint | number>>
/** A logpoint is a condition that logs and never stops; `{expr}` parts are interpolated, as in VS Code. */
export const logCondition = (message: string) =>
  'console.log(`' + message.replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${').replace(/(?<!\$)\{([^}]+)\}/g, '${$1}') + '`), false'

type Cdp = { id: number; result?: Record<string, unknown>; error?: { message: string }; method?: string; params?: Record<string, unknown> }

/** One debugged Node.js process per window, driven over the inspector protocol (the one VS Code uses for Node). */
export class DebugSession implements Debugger {
  private child: ChildProcess | null = null
  private ws: WebSocket | null = null
  private seq = 0
  private pending = new Map<number, (m: Cdp) => void>()
  private breakpoints = new Map<string, string[]>()
  private frames: Array<{ callFrameId: string }> = []
  private output = 0
  /** scriptId -> URL; paused frames carry only the id. */
  private scripts = new Map<string, string>()

  private root: string
  // Node reports long paths; a Windows short-name root (RUNNER~1) would never match a breakpoint URL.
  constructor(root: string, private emit: (event: DebugEvent) => void) { try { this.root = realpathSync.native(root) } catch { this.root = root } }

  private send(method: string, params: Record<string, unknown> = {}): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { reject(new Error('The program is not running')); return }
      const id = ++this.seq
      this.pending.set(id, resolve)
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  private rel(url: string): string {
    try { return relative(this.root, fileURLToPath(url)).replace(/\\/g, '/') } catch { return url }
  }

  /** Start `node --inspect-brk <file>` in the project folder with the given breakpoints. */
  async start(file: string, breakpoints: Breakpoints, nodePath = 'node') {
    const abs = workspacePath(this.root, file)
    if (!existsSync(abs)) throw new Error(`${file} does not exist`)
    const child = spawn(nodePath, ['--inspect-brk=127.0.0.1:0', abs], { cwd: this.root, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } })
    this.child = child
    const relay = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString()
      // The program has finished; Node keeps it alive until the debugger hangs up.
      if (stream === 'stderr' && text.includes('Waiting for the debugger to disconnect')) { this.ws?.close(); return }
      if (stream === 'stderr' && /Debugger (listening|attached)|For help, see: https:\/\/nodejs\.org/.test(text)) return
      if ((this.output += text.length) <= 2_000_000) this.emit({ type: 'output', text })
    }
    child.stdout?.on('data', relay('stdout'))
    child.on('exit', (code) => { this.ws?.close(); this.ws = null; this.child = null; this.emit({ type: 'exited', code: code ?? 0 }) })
    const url = await new Promise<string>((resolve, reject) => {
      let err = ''
      const onData = (chunk: Buffer) => {
        err += chunk.toString()
        const m = /ws:\/\/127\.0\.0\.1:\d+\/[\w-]+/.exec(err)
        if (m) { child.stderr?.off('data', onData); child.stderr?.on('data', relay('stderr')); resolve(m[0]) }
      }
      child.stderr?.on('data', onData)
      child.on('error', (e) => reject(new Error(e.message.includes('ENOENT') ? 'Node.js is not installed or is missing from PATH' : e.message)))
      child.on('exit', () => reject(new Error(err.trim().split('\n').slice(-3).join('\n') || 'The program exited before the debugger could attach')))
      setTimeout(() => reject(new Error('The debugger did not start within 10 seconds')), 10_000)
    })
    await this.connect(url, breakpoints)
  }

  /** Attach to a Node.js process already started with --inspect on this port. */
  async attach(port: number, breakpoints: Breakpoints) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json() as Promise<Array<{ webSocketDebuggerUrl?: string }>>).catch(() => [])
    const url = targets.find((t) => t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
    if (!url) throw new Error(`No Node.js inspector is listening on port ${port}`)
    await this.connect(url, breakpoints)
  }

  private async connect(url: string, breakpoints: Breakpoints) {
    this.ws = new WebSocket(url)
    this.ws.addEventListener('close', () => { if (!this.child && this.ws) { this.ws = null; this.emit({ type: 'exited', code: 0 }) } })
    await new Promise((resolve, reject) => { this.ws!.addEventListener('open', resolve); this.ws!.addEventListener('error', () => reject(new Error('Could not connect to the debugger'))) })
    this.ws.addEventListener('message', (e) => this.onMessage(JSON.parse(String(e.data)) as Cdp))
    await this.send('Runtime.enable')
    await this.send('Debugger.enable')
    for (const [path, lines] of Object.entries(breakpoints)) await this.setBreakpoints(path, lines)
    this.emit({ type: 'running' })
    await this.send('Runtime.runIfWaitingForDebugger')
  }

  async setBreakpoints(path: string, list: Array<DebugBreakpoint | number>) {
    for (const id of this.breakpoints.get(path) ?? []) await this.send('Debugger.removeBreakpoint', { breakpointId: id }).catch(() => {})
    const ids: string[] = []
    const url = pathToFileURL(workspacePath(this.root, path)).href
    for (const bp of list.map((b) => (typeof b === 'number' ? { line: b } : b)).filter((b) => Number.isInteger(b.line) && b.line > 0).slice(0, 200)) {
      const condition = bp.logMessage ? logCondition(bp.logMessage) : bp.condition || undefined
      const r = await this.send('Debugger.setBreakpointByUrl', { lineNumber: bp.line - 1, url, condition })
      if (r.result?.breakpointId) ids.push(String(r.result.breakpointId))
    }
    this.breakpoints.set(path, ids)
  }

  private async onMessage(m: Cdp) {
    if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); return }
    if (m.method === 'Debugger.scriptParsed') { const p = m.params as { scriptId: string; url: string }; this.scripts.set(p.scriptId, p.url); return }
    if (m.method === 'Debugger.paused') {
      const params = m.params as { reason: string; callFrames: Array<{ callFrameId: string; functionName: string; url?: string; location: { scriptId: string; lineNumber: number; columnNumber: number }; scopeChain: Array<{ type: string; object: { objectId?: string } }> }> }
      // The first stop of --inspect-brk is not one the owner asked for.
      if (params.reason === 'Break on start') { void this.send('Debugger.resume').catch(() => {}); return }
      this.frames = params.callFrames
      const frames: DebugFrame[] = params.callFrames.slice(0, 50).map((f) => {
        const url = f.url || this.scripts.get(f.location.scriptId) || ''
        return { name: f.functionName || '(anonymous)', path: this.rel(url), line: f.location.lineNumber + 1, column: f.location.columnNumber + 1, internal: !url.startsWith('file:') }
      })
      const variables: DebugVariable[] = []
      for (const scope of (params.callFrames[0]?.scopeChain ?? []).filter((s) => s.type === 'local' || s.type === 'closure' || s.type === 'block').slice(0, 3)) {
        if (!scope.object.objectId) continue
        const props = await this.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null)
        for (const p of ((props?.result?.result as Array<{ name: string; value?: { type: string; value?: unknown; description?: string } }>) ?? []).slice(0, 60)) {
          variables.push({ name: p.name, scope: scope.type, value: p.value ? (p.value.description ?? JSON.stringify(p.value.value) ?? String(p.value.type)) : 'undefined' })
        }
      }
      this.emit({ type: 'paused', reason: params.reason, frames, variables })
    } else if (m.method === 'Debugger.resumed') this.emit({ type: 'running' })
  }

  async command(action: 'continue' | 'over' | 'into' | 'out' | 'pause') {
    const method = { continue: 'Debugger.resume', over: 'Debugger.stepOver', into: 'Debugger.stepInto', out: 'Debugger.stepOut', pause: 'Debugger.pause' }[action]
    await this.send(method)
  }

  /** Evaluate an expression in the top paused frame. */
  async evaluate(expression: string): Promise<string> {
    if (!this.frames[0]) throw new Error('Pause the program first')
    const r = await this.send('Debugger.evaluateOnCallFrame', { callFrameId: this.frames[0].callFrameId, expression: expression.slice(0, 2000), returnByValue: false })
    const value = r.result?.result as { description?: string; value?: unknown; type?: string } | undefined
    const thrown = r.result?.exceptionDetails as { exception?: { description?: string } } | undefined
    return thrown ? `Error: ${thrown.exception?.description ?? 'evaluation failed'}` : (value?.description ?? JSON.stringify(value?.value) ?? String(value?.type))
  }

  stop() { const ws = this.ws; this.ws = null; ws?.close(); this.child?.kill() }
  get running() { return Boolean(this.child) }
}
