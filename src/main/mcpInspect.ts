import { spawn } from 'node:child_process'
import type { McpInspectResult, McpServer } from '../shared/types'

type RpcMessage = { id?: number; result?: any; error?: { message?: string } }
type Rpc = { request(method: string, params: object): Promise<any>; notify(method: string): void }

/** initialize, then list tools, resources and prompts (each paged), as the server's capabilities allow. */
async function handshake(rpc: Rpc, fallbackName: string, started: number): Promise<McpInspectResult> {
  const init = await rpc.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ventriee-studios', version: '1' } })
  rpc.notify('notifications/initialized')
  const caps = init?.capabilities ?? {}
  const all = async (method: string, key: string) => {
    const items: any[] = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const r = await rpc.request(method, cursor ? { cursor } : {})
      items.push(...(r?.[key] ?? []))
      cursor = r?.nextCursor
      if (!cursor) break
    }
    return items
  }
  const tools = caps.tools === undefined && caps.resources !== undefined ? [] : await all('tools/list', 'tools')
  const resources = caps.resources ? await all('resources/list', 'resources').catch(() => []) : []
  const prompts = caps.prompts ? await all('prompts/list', 'prompts').catch(() => []) : []
  return {
    ok: true,
    serverName: String(init?.serverInfo?.name ?? fallbackName),
    serverVersion: String(init?.serverInfo?.version ?? ''),
    tools: tools.map((t) => ({ name: String(t.name), description: String(t.description ?? '') })),
    resources: resources.map((r) => ({ name: String(r.name ?? r.uri), uri: String(r.uri ?? '') })),
    prompts: prompts.map((p) => ({ name: String(p.name), description: String(p.description ?? '') })),
    ms: Date.now() - started
  }
}

/** Streamable HTTP: each request is a POST; the answer is JSON or a short event stream. */
function inspectRemote(server: McpServer, timeoutMs: number, started: number): Promise<McpInspectResult> {
  if (server.transport === 'sse') return Promise.resolve({ ok: false, serverName: server.name, serverVersion: '', tools: [], ms: 0, error: 'Testing works for HTTP servers; this one uses the older SSE transport. Workers can still use it.' })
  const signal = AbortSignal.timeout(timeoutMs)
  let sessionId = ''
  let nextId = 1
  const post = async (body: object) => {
    const res = await fetch(server.url!, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(sessionId ? { 'mcp-session-id': sessionId } : {}), ...server.headers },
      body: JSON.stringify({ jsonrpc: '2.0', ...body })
    })
    sessionId = res.headers.get('mcp-session-id') ?? sessionId
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 401 ? ': check the server\'s token' : ''}`)
    return res
  }
  const rpc: Rpc = {
    async request(method, params) {
      const id = nextId++
      const res = await post({ id, method, params })
      const text = await res.text()
      const messages: RpcMessage[] = (res.headers.get('content-type') ?? '').includes('text/event-stream')
        ? text.split('\n').filter((l) => l.startsWith('data:')).flatMap((l) => { try { return [JSON.parse(l.slice(5))] } catch { return [] } })
        : [JSON.parse(text)]
      const msg = messages.find((m) => m.id === id)
      if (!msg) throw new Error(`No answer to ${method}`)
      if (msg.error) throw new Error(msg.error.message || `${method} failed`)
      return msg.result
    },
    notify(method) { void post({ method }).then((r) => r.body?.cancel()).catch(() => {}) }
  }
  return handshake(rpc, server.name, started).catch((e) => ({ ok: false, serverName: server.name, serverVersion: '', tools: [], ms: Date.now() - started, error: e instanceof Error ? (e.name === 'TimeoutError' ? `No answer within ${Math.round(timeoutMs / 1000)} s` : e.message) : String(e) }))
}

/** Start a stdio MCP server (or reach a remote one), run the handshake, list what it offers, then stop it. */
export function inspectMcp(server: Pick<McpServer, 'name' | 'command' | 'args'> & Partial<McpServer>, timeoutMs = 30_000): Promise<McpInspectResult> {
  const started = Date.now()
  if (server.url) return inspectRemote(server as McpServer, timeoutMs, started)
  const fail = (error: string): McpInspectResult => ({ ok: false, serverName: server.name, serverVersion: '', tools: [], ms: Date.now() - started, error })
  return new Promise((resolve) => {
    let done = false
    let stderr = ''
    let buffer = ''
    let nextId = 1
    const pending = new Map<number, (m: RpcMessage) => void>()
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(server.command, server.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...server.env } })
    } catch (e) {
      resolve(fail(e instanceof Error ? e.message : String(e)))
      return
    }
    const finish = (r: McpInspectResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      resolve(r)
    }
    const timer = setTimeout(() => finish(fail(`No answer within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
    const send = (msg: object) => child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')
    const rpc: Rpc = {
      request: (method, params) => new Promise<any>((ok, bad) => {
        const id = nextId++
        pending.set(id, (m) => (m.error ? bad(new Error(m.error.message || `${method} failed`)) : ok(m.result)))
        send({ id, method, params })
      }),
      notify: (method) => send({ method })
    }

    child.stdin!.on('error', () => { /* the exit handler reports why */ })
    child.stderr!.on('data', (d) => { stderr = (stderr + String(d)).slice(-2000) })
    child.stdout!.on('data', (d) => {
      buffer += String(d)
      let i: number
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (!line) continue
        let msg: RpcMessage
        try { msg = JSON.parse(line) } catch { continue }
        if (typeof msg.id === 'number' && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id) }
      }
    })
    child.on('error', (e) => finish(fail(e.message)))
    child.on('exit', (code) => finish(fail(`The server exited (code ${code})${stderr.trim() ? `: ${stderr.trim().split('\n').at(-1)}` : ''}`)))
    handshake(rpc, server.name, started).then(finish, (e) => finish(fail(e instanceof Error ? e.message : String(e))))
  })
}
