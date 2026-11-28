import { spawn, type IPty } from 'node-pty'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { findExecutable } from './lsp'

export interface Shell { id: string; label: string; file: string; args: string[] }

/** `wsl -l -q` prints UTF-16 with NULs and blank lines; this turns it into distro names. */
export const wslDistros = (raw: Buffer) => raw.toString('utf16le').replace(/\0/g, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)

let cached: { at: number; list: Shell[] } | null = null
/** Shells installed here, the default first: PowerShell, pwsh, cmd, Git Bash and WSL distros on Windows; /etc/shells elsewhere. */
export function shells(env: NodeJS.ProcessEnv = process.env): Shell[] {
  if (cached && Date.now() - cached.at < 60_000) return cached.list
  const list: Shell[] = []
  if (process.platform === 'win32') {
    const def = defaultShell(env)
    list.push({ id: 'default', label: basename(def.file).toLowerCase().startsWith('powershell') ? 'PowerShell' : 'Command Prompt', ...def })
    const pwsh = findExecutable('pwsh')
    if (pwsh) list.push({ id: 'pwsh', label: 'PowerShell 7', file: pwsh, args: ['-NoLogo'] })
    list.push({ id: 'cmd', label: 'Command Prompt', file: env.ComSpec ?? 'cmd.exe', args: [] })
    const git = findExecutable('git')
    // git.exe is in Git/cmd (installer PATH) or Git/mingw64/bin (Git Bash PATH); bash.exe is in Git/bin.
    const bash = git ? [join(dirname(dirname(git)), 'bin', 'bash.exe'), join(dirname(dirname(dirname(git))), 'bin', 'bash.exe')].find((f) => existsSync(f)) : ''
    if (bash && existsSync(bash)) list.push({ id: 'git-bash', label: 'Git Bash', file: bash, args: ['--login', '-i'] })
    const wsl = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'wsl.exe')
    if (existsSync(wsl)) {
      try { for (const d of wslDistros(execFileSync(wsl, ['-l', '-q'], { timeout: 5000, windowsHide: true })).slice(0, 10)) list.push({ id: `wsl:${d}`, label: `WSL: ${d}`, file: wsl, args: ['-d', d] }) } catch { /* WSL not set up */ }
    }
  } else {
    list.push({ id: 'default', label: basename(env.SHELL || '/bin/bash'), file: env.SHELL || '/bin/bash', args: [] })
    try {
      for (const file of readFileSync('/etc/shells', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.startsWith('/') && existsSync(l)))
        if (!list.some((s) => s.file === file)) list.push({ id: file, label: basename(file), file, args: [] })
    } catch { /* no /etc/shells */ }
  }
  cached = { at: Date.now(), list }
  return list
}

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

  open(owner: number, cwd: string, cols: number, rows: number, onData: (id: string, data: string) => void, onExit: (id: string, code: number) => void, shellId?: string, extraEnv?: Record<string, string>): string {
    if (!existsSync(cwd)) throw new Error(`Project folder does not exist: ${cwd}`)
    if ([...this.sessions.values()].filter((s) => s.owner === owner).length >= MAX_PER_OWNER) throw new Error(`Close a terminal first (limit ${MAX_PER_OWNER} per window)`)
    // Only a shell from the detected list can be started, never a path the renderer sends.
    const shell = shells().find((s) => s.id === shellId) ?? defaultShell()
    const pty = spawn(shell.file, shell.args, { name: 'xterm-256color', cwd, cols: clamp(cols, 20, 500), rows: clamp(rows, 5, 200), env: { ...(process.env as Record<string, string>), ...(extraEnv ?? {}) } })
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
