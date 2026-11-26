import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installServer, parseRegistry, serverName } from '../src/main/mcpRegistry'
import { inspectMcp } from '../src/main/mcpInspect'
import { validMcpServers, writeMcpConfig } from '../src/main/mcp'

const SAMPLE = {
  servers: [
    { server: { name: 'com.foreverworks/notion', title: 'Notion', description: 'Notion pages', version: '0.1.2', repository: { url: 'https://github.com/foreverworks/mcps' },
      packages: [{ registryType: 'npm', identifier: '@foreverworks/mcp-notion', version: '0.1.2', transport: { type: 'stdio' }, environmentVariables: [{ name: 'NOTION_TOKENS_DIR', isRequired: true, description: 'folder' }] },
        { registryType: 'nuget', identifier: 'x', transport: { type: 'stdio' } }] },
      _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active', publishedAt: '2026-11-16T05:01:43Z' } } },
    { server: { name: 'ai.smithery/obsidian', version: '0.4.0', remotes: [
      { type: 'streamable-http', url: 'https://server.example/mcp', headers: [{ name: 'Authorization', value: 'Bearer {smithery_api_key}', isRequired: true, isSecret: true }] },
      { type: 'streamable-http', url: 'http://insecure.example/mcp' }] } },
    { server: { description: 'no name' } },
    null
  ],
  metadata: { nextCursor: 'next-page' }
}

describe('MCP registry', () => {
  it('keeps installable entries and drops what it cannot run', () => {
    const { servers, nextCursor } = parseRegistry(SAMPLE)
    expect(nextCursor).toBe('next-page')
    expect(servers.map((s) => s.name)).toEqual(['com.foreverworks/notion', 'ai.smithery/obsidian'])
    expect(servers[0].installs).toHaveLength(1)
    expect(servers[0].installs[0]).toMatchObject({ kind: 'npm', identifier: '@foreverworks/mcp-notion', env: [{ name: 'NOTION_TOKENS_DIR', required: true }] })
    expect(servers[1].installs).toHaveLength(1)
    expect(servers[1].installs[0]).toMatchObject({ kind: 'remote', transport: 'http', url: 'https://server.example/mcp' })
    expect(parseRegistry('garbage').servers).toEqual([])
  })

  it('installs a pinned, disabled server and asks for required values', () => {
    const [notion, remote] = parseRegistry(SAMPLE).servers
    expect(() => installServer(notion, notion.installs[0], {}, [])).toThrow(/NOTION_TOKENS_DIR/)
    const win = installServer(notion, notion.installs[0], { NOTION_TOKENS_DIR: 'C:\\tokens' }, ['notion'], 'win32')
    expect(win).toMatchObject({ name: 'notion-2', enabled: false, command: 'cmd', args: ['/c', 'npx', '-y', '@foreverworks/mcp-notion@0.1.2'], env: { NOTION_TOKENS_DIR: 'C:\\tokens' }, source: 'com.foreverworks/notion' })
    const r = installServer(remote, remote.installs[0], { Authorization: 'sk-123' }, [])
    expect(r).toMatchObject({ url: 'https://server.example/mcp', transport: 'http', headers: { Authorization: 'Bearer sk-123' } })
    expect(validMcpServers([win, r])).toHaveLength(2)
  })

  it('makes names Claude Code accepts', () => {
    expect(serverName('io.github.someone/My Server!', [])).toBe('My-Server')
    expect(serverName('x/a', ['a', 'a-2'])).toBe('a-3')
  })

  it('writes env and remote servers into the worker config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-mcp-'))
    const file = writeMcpConfig(dir, [
      { name: 'db', command: 'npx', args: ['pg'], enabled: true, env: { DATABASE_URL: 'postgres://x' } },
      { name: 'remote', command: '', args: [], enabled: true, url: 'https://server.example/mcp', transport: 'http', headers: { Authorization: 'Bearer t' } }
    ])
    expect(JSON.parse(readFileSync(file, 'utf8')).mcpServers).toEqual({
      db: { command: 'npx', args: ['pg'], env: { DATABASE_URL: 'postgres://x' } },
      remote: { type: 'http', url: 'https://server.example/mcp', headers: { Authorization: 'Bearer t' } }
    })
  })

  it('tests a remote HTTP server, including its resources and prompts', async () => {
    const seen: string[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const m = JSON.parse(body)
        seen.push(`${m.method}:${req.headers.authorization ?? ''}:${req.headers['mcp-session-id'] ?? ''}`)
        if (m.id === undefined) { res.writeHead(202); res.end(); return }
        const result = m.method === 'initialize'
          ? { serverInfo: { name: 'remote-fake', version: '2' }, capabilities: { tools: {}, resources: {}, prompts: {} } }
          : m.method === 'tools/list' ? { tools: [{ name: 't1' }] }
          : m.method === 'resources/list' ? { resources: [{ name: 'readme', uri: 'file:///readme' }] }
          : { prompts: [{ name: 'p1', description: 'a prompt' }] }
        // Answer initialize as an event stream, the rest as plain JSON: both are allowed.
        if (m.method === 'initialize') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' })
          res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result })}\n\n`)
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }))
        }
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const r = await inspectMcp({ name: 'remote', command: '', args: [], url: `http://127.0.0.1:${port}/mcp`, headers: { authorization: 'Bearer t' } })
      expect(r.error).toBeUndefined()
      expect(r).toMatchObject({ ok: true, serverName: 'remote-fake', tools: [{ name: 't1', description: '' }], resources: [{ name: 'readme', uri: 'file:///readme' }], prompts: [{ name: 'p1', description: 'a prompt' }] })
      expect(seen[0]).toBe('initialize:Bearer t:')
      expect(seen.slice(1).every((s) => s.endsWith(':sess-1'))).toBe(true)
    } finally {
      server.close()
    }
  })
})
