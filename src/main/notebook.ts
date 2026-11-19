import { spawn, type ChildProcess } from 'node:child_process'
import { dirname } from 'node:path'
import { findExecutable } from './lsp'
import { workspacePath } from './files'
import type { NotebookEvent } from '../shared/workspace'

interface Kernel { owner: number; child: ChildProcess; ready: Promise<void> }

/** One Jupyter kernel per open notebook, run through resources/kernel_bridge.py (jupyter_client). */
export class NotebookService {
  private kernels = new Map<string, Kernel>()
  constructor(private bridge: () => string) {}

  private key = (owner: number, root: string, path: string) => `${owner}|${root}|${path}`

  /** Starts the notebook's kernel (once) in the notebook's folder; output and status go to `emit`. */
  start(owner: number, root: string, path: string, emit: (e: NotebookEvent) => void): Promise<void> {
    const key = this.key(owner, root, path)
    const running = this.kernels.get(key)
    if (running) return running.ready
    const python = findExecutable('python') ?? findExecutable('python3')
    if (!python) return Promise.reject(new Error('Python is not installed. Install Python 3, then: python -m pip install jupyter_client ipykernel'))
    const child = spawn(python, [this.bridge(), 'python3'], { cwd: dirname(workspacePath(root, path)), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let buffer = ''
    let stderr = ''
    let markReady!: () => void
    let fail!: (e: Error) => void
    const ready = new Promise<void>((resolve, reject) => { markReady = resolve; fail = reject })
    ready.catch(() => {})
    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      let nl
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1)
        let msg: NotebookEvent
        try { msg = JSON.parse(line) as NotebookEvent } catch { continue }
        if (msg.type === 'ready') markReady()
        if (msg.type === 'error') fail(new Error(msg.message))
        emit({ ...msg, path } as NotebookEvent)
      }
    })
    child.stderr!.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-4000) })
    child.on('error', (e) => fail(e))
    child.on('exit', (code) => {
      if (this.kernels.get(key)?.child === child) this.kernels.delete(key)
      fail(new Error(`The kernel stopped${stderr.trim() ? `: ${stderr.trim().split('\n').at(-1)}` : ''}`))
      emit({ type: 'exit', path, code: code ?? 0 })
    })
    this.kernels.set(key, { owner, child, ready })
    return ready
  }

  private send(owner: number, root: string, path: string, msg: object) {
    const k = this.kernels.get(this.key(owner, root, path))
    if (!k) throw new Error('Start the kernel first')
    k.child.stdin!.write(JSON.stringify(msg) + '\n')
  }

  execute(owner: number, root: string, path: string, id: string, code: string) {
    if (typeof code !== 'string' || code.length > 1_000_000) throw new Error('The cell is too large to run')
    this.send(owner, root, path, { type: 'execute', id: String(id).slice(0, 100), code })
  }
  interrupt(owner: number, root: string, path: string) { this.send(owner, root, path, { type: 'interrupt' }) }
  restart(owner: number, root: string, path: string) { this.send(owner, root, path, { type: 'restart' }) }

  shutdown(owner: number, root: string, path: string) {
    const key = this.key(owner, root, path)
    const k = this.kernels.get(key)
    if (!k) return
    this.kernels.delete(key)
    stopKernel(k)
  }
  closeOwner(owner: number) { for (const [key, k] of this.kernels) if (k.owner === owner) { this.kernels.delete(key); stopKernel(k) } }
  closeAll() { for (const k of this.kernels.values()) stopKernel(k); this.kernels.clear() }
}

/** Ask the bridge to shut the kernel down cleanly; kill it if it does not within 3 seconds. */
function stopKernel(k: Kernel) {
  try { k.child.stdin!.write('{"type":"shutdown"}\n') } catch { /* already gone */ }
  setTimeout(() => { if (k.child.exitCode === null) k.child.kill() }, 3000).unref()
}
