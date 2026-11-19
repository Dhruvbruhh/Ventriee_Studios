import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Catalog, LanguageSpec, LspEvent, LspStatus, ServerSpec } from '../shared/catalog'

type Message = { jsonrpc?: string; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string } }

export function encodeMessage(message: Message): Buffer {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body])
}

/** Splits the LSP/DAP byte stream (`Content-Length` headers) into JSON messages. */
export class FrameReader {
  private buffer = Buffer.alloc(0)
  push(chunk: Buffer): Message[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const out: Message[] = []
    for (;;) {
      const end = this.buffer.indexOf('\r\n\r\n')
      if (end < 0) break
      const length = Number(/content-length:\s*(\d+)/i.exec(this.buffer.subarray(0, end).toString('ascii'))?.[1])
      if (!Number.isFinite(length)) { this.buffer = this.buffer.subarray(end + 4); continue }
      if (this.buffer.length < end + 4 + length) break
      const body = this.buffer.subarray(end + 4, end + 4 + length).toString('utf8')
      this.buffer = this.buffer.subarray(end + 4 + length)
      try { out.push(JSON.parse(body) as Message) } catch { /* a broken frame is skipped, not fatal */ }
    }
    if (this.buffer.length > 64_000_000) this.buffer = Buffer.alloc(0)
    return out
  }
}

/**
 * A program on PATH or in the standard per-user toolchain folders. Never one inside the project:
 * opening a file must not run code that came with a cloned repository.
 */
let pathCheckedAt = 0
/** Windows: add PATH entries saved since the app started (a toolchain installed while it runs), so tools and their children find them. */
export function refreshPath(force = false) {
  const env = process.env
  if (process.platform !== 'win32' || (!force && Date.now() - pathCheckedAt < 5000)) return
  pathCheckedAt = Date.now()
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'Path'
  const have = new Set((env[key] ?? '').split(delimiter).map((d) => d.toLowerCase()))
  const saved = ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'HKCU\\Environment'].flatMap((hive) => {
    try {
      const out = execFileSync('reg', ['query', hive, '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
      return (/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i.exec(out)?.[1] ?? '').split(delimiter)
    } catch { return [] }
  }).map((d) => d.trim().replace(/%([^%]+)%/g, (whole, name: string) => env[name] ?? whole)).filter((d) => d && !have.has(d.toLowerCase()))
  if (saved.length) env[key] = [env[key], ...new Set(saved)].filter(Boolean).join(delimiter)
}

export function findExecutable(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (env === process.env) refreshPath()
  const dirs = [...(env.PATH ?? env.Path ?? '').split(delimiter), join(homedir(), 'go', 'bin'), join(homedir(), '.cargo', 'bin'), join(homedir(), '.local', 'bin')]
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of dirs.filter(Boolean)) for (const ext of exts) {
    const file = join(dir, name + ext)
    try { if (statSync(file).isFile()) return file } catch { /* not here */ }
  }
  return null
}

/** Spawn that also works for Windows .cmd shims (npm global installs), which need a shell. */
export function spawnTool(file: string, args: string[], cwd: string): ChildProcess {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${[file, ...args].map(quote).join(' ')}"`], { cwd, windowsHide: true, windowsVerbatimArguments: true })
  }
  return spawn(file, args, { cwd, windowsHide: true })
}

const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ['utf-16'] },
  workspace: { configuration: true, workspaceFolders: true, applyEdit: false, symbol: {}, didChangeConfiguration: { dynamicRegistration: true } },
  textDocument: {
    synchronization: { didSave: true },
    completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], resolveSupport: { properties: ['documentation', 'detail'] } } },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
    definition: {}, references: {}, documentHighlight: {}, rename: { prepareSupport: false },
    formatting: {}, rangeFormatting: {}, codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['', 'quickfix', 'refactor', 'source'] } } },
    documentSymbol: { hierarchicalDocumentSymbolSupport: true }, foldingRange: {}, inlayHint: {},
    publishDiagnostics: { relatedInformation: false }
  },
  window: { workDoneProgress: false }
}

export class LspServer {
  private child: ChildProcess | null = null
  private reader = new FrameReader()
  private seq = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
  capabilities: Record<string, unknown> = {}
  stderr = ''

  constructor(private file: string, private spec: ServerSpec, private root: string, private onNotify: (method: string, params: unknown) => void, private onExit: (code: number) => void) {}

  async start() {
    const child = spawnTool(this.file, this.spec.args ?? [], this.root)
    this.child = child
    child.stdout!.on('data', (chunk: Buffer) => { for (const m of this.reader.push(chunk)) this.handle(m) })
    child.stderr!.on('data', (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-4000) })
    child.on('error', (e) => this.fail(e))
    child.on('exit', (code) => { this.fail(new Error(`${this.spec.name} stopped${this.stderr ? `: ${this.stderr.trim().split('\n').at(-1)}` : ''}`)); this.child = null; this.onExit(code ?? 1) })
    const rootUri = pathToFileURL(this.root).href
    const init = await this.request('initialize', { processId: process.pid, clientInfo: { name: 'Ventriee Studios' }, rootUri, rootPath: this.root,
      workspaceFolders: [{ uri: rootUri, name: basename(this.root) }], capabilities: CLIENT_CAPABILITIES, initializationOptions: this.spec.initializationOptions }, 60_000) as { capabilities?: Record<string, unknown> }
    this.capabilities = init?.capabilities ?? {}
    this.notify('initialized', {})
  }

  request(method: string, params: unknown, timeout = 20_000): Promise<unknown> {
    if (!this.child?.stdin?.writable) return Promise.reject(new Error(`${this.spec.name} is not running`))
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.spec.name} did not answer ${method} in time`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.child!.stdin!.write(encodeMessage({ id, method, params }))
    })
  }

  notify(method: string, params: unknown) { if (this.child?.stdin?.writable) this.child.stdin.write(encodeMessage({ method, params })) }

  private handle(m: Message) {
    if (m.id !== undefined && !m.method) {
      const p = this.pending.get(Number(m.id))
      if (!p) return
      this.pending.delete(Number(m.id)); clearTimeout(p.timer)
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result ?? null)
    } else if (m.method && m.id !== undefined) {
      // Requests from the server: answer the few that block servers when ignored.
      const params = m.params as { items?: unknown[] } | undefined
      const result = m.method === 'workspace/configuration' ? (params?.items ?? []).map(() => null)
        : m.method === 'workspace/workspaceFolders' ? [{ uri: pathToFileURL(this.root).href, name: basename(this.root) }]
        : null
      const known = ['workspace/configuration', 'workspace/workspaceFolders', 'client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create', 'window/showMessageRequest', 'workspace/semanticTokens/refresh', 'workspace/inlayHint/refresh', 'workspace/diagnostic/refresh', 'workspace/codeLens/refresh']
      this.child?.stdin?.write(encodeMessage(known.includes(m.method) ? { id: m.id, result } : { id: m.id, error: { code: -32601, message: 'Not supported' } }))
    } else if (m.method) this.onNotify(m.method, m.params)
  }

  private fail(error: Error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error) } this.pending.clear() }

  async stop() {
    const child = this.child
    if (!child) return
    await this.request('shutdown', null, 2000).catch(() => {})
    this.notify('exit', null)
    setTimeout(() => { if (this.child === child) child.kill() }, 1000)
  }
}


/** One running server per window, project folder and server program (C and C++ share clangd). */
export class LspService {
  private servers = new Map<string, { owner: number; server: LspServer; ready: Promise<void> }>()
  /** language id -> server name picked by the last ensure(); requests skip the PATH search. */
  private chosen = new Map<string, string>()
  constructor(private catalog: () => Catalog) {}

  private pick(languageId: string): { spec: LanguageSpec; server?: ServerSpec; file?: string } | null {
    const spec = this.catalog().languages.find((l) => l.id === languageId)
    if (!spec) return null
    for (const server of spec.servers) { const file = findExecutable(server.command); if (file) return { spec, server, file } }
    return { spec }
  }

  async ensure(owner: number, root: string, languageId: string, emit: (e: LspEvent) => void): Promise<LspStatus> {
    const found = this.pick(languageId)
    if (!found) return { state: 'none' }
    if (!found.server || !found.file) {
      const command = found.spec.install?.command
      return { state: 'missing', language: found.spec.name, install: typeof command === 'string' ? command : command?.[process.platform as 'win32'] ?? command?.default, url: found.spec.install?.url }
    }
    const key = `${owner}|${root}|${found.server.name}`
    this.chosen.set(languageId, found.server.name)
    let entry = this.servers.get(key)
    if (!entry) {
      const server = new LspServer(found.file, found.server, root, (method, params) => emit({ language: languageId, method, params }),
        () => { if (this.servers.get(key)?.server === server) this.servers.delete(key); emit({ language: languageId, method: '$/exit', params: null }) })
      entry = { owner, server, ready: server.start() }
      this.servers.set(key, entry)
      entry.ready.catch(() => { if (this.servers.get(key)?.server === server) { this.servers.delete(key); void server.stop() } })
    }
    await entry.ready
    return { state: 'ready', server: found.server.name, capabilities: entry.server.capabilities }
  }

  private get(owner: number, root: string, languageId: string): LspServer {
    const name = this.chosen.get(languageId)
    const entry = name ? this.servers.get(`${owner}|${root}|${name}`) : undefined
    if (!entry) throw new Error('The language server is not running')
    return entry.server
  }

  request(owner: number, root: string, languageId: string, method: string, params: unknown) { return this.get(owner, root, languageId).request(method, params) }
  notify(owner: number, root: string, languageId: string, method: string, params: unknown) { this.get(owner, root, languageId).notify(method, params) }

  closeOwner(owner: number) { for (const [key, e] of this.servers) if (e.owner === owner) { this.servers.delete(key); void e.server.stop() } }
  closeAll() { for (const e of this.servers.values()) void e.server.stop(); this.servers.clear() }
}

