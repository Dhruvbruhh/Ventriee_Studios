import { spawn, type IPty } from 'node-pty'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const MAX_PER_OWNER = 8

/** The owner's own shell: PowerShell on Windows (cmd if missing), $SHELL elsewhere. */
export function defaultShell(env: NodeJS.ProcessEnv = process.env): { file: string; args: string[] } {
  if (process.platform !== 'win32') return { file: env.SHELL || '/bin/bash', args: [] }
  const system = env.SystemRoot ?? 'C:\\Windows'
  const powershell = join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(powershell) ? { file: powershell, args: ['-NoLogo'] } : { file: env.ComSpec ?? 'cmd.exe', args: [] }
}

interface Session { pty: IPty; owner: number }

/** Interactive terminals owned by one studio window each, always started in the project folder. */
export class TerminalService {
  private sessions = new Map<string, Session>()
  private next = 0

  open(owner: number, cwd: string, cols: number, rows: number, onData: (id: string, data: string) => void, onExit: (id: string, code: number) => void): string {
    if (!existsSync(cwd)) throw new Error(`Project folder does not exist: ${cwd}`)
    if ([...this.sessions.values()].filter((s) => s.owner === owner).length >= MAX_PER_OWNER) throw new Error(`Close a terminal first (limit ${MAX_PER_OWNER} per window)`)
    const shell = defaultShell()
    const pty = spawn(shell.file, shell.args, { name: 'xterm-256color', cwd, cols: clamp(cols, 20, 500), rows: clamp(rows, 5, 200), env: process.env as Record<string, string> })
    const id = `term_${++this.next}`
    this.sessions.set(id, { pty, owner })
    pty.onData((data) => onData(id, data))
    pty.onExit(({ exitCode }) => { this.sessions.delete(id); onExit(id, exitCode) })
    return id
  }

  write(owner: number, id: string, data: string) {
    if (typeof data !== 'string' || data.length > 100_000) throw new Error('Invalid terminal input')
    this.get(owner, id).pty.write(data)
  }

  resize(owner: number, id: string, cols: number, rows: number) {
    this.get(owner, id).pty.resize(clamp(cols, 20, 500), clamp(rows, 5, 200))
  }

  close(owner: number, id: string) {
    const session = this.sessions.get(id)
    if (!session || session.owner !== owner) return
    this.sessions.delete(id)
    session.pty.kill()
  }

  closeOwner(owner: number) {
    for (const [id, session] of this.sessions) if (session.owner === owner) this.close(owner, id)
  }

  closeAll() {
    for (const [id, session] of this.sessions) this.close(session.owner, id)
  }

  private get(owner: number, id: string): Session {
    const session = this.sessions.get(id)
    if (!session || session.owner !== owner) throw new Error('Terminal is closed')
    return session
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(value)) || min))
