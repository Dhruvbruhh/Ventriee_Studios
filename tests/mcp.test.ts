import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validMcpServers, writeMcpConfig } from '../src/main/mcp'
import { buildCliInvocation } from '../src/main/engines'

describe('MCP servers', () => {
  it('drops malformed entries and writes only enabled servers in Claude Code format', () => {
    const servers = validMcpServers([
      { name: 'files', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], enabled: true },
      { name: 'off', command: 'x', args: [], enabled: false },
      { name: 'bad name!', command: 'x', args: [], enabled: true },
      { name: 'noargs', command: 'x', args: 'nope', enabled: true },
      null
    ])
    expect(servers.map((s) => s.name)).toEqual(['files', 'off'])
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-mcp-'))
    const file = writeMcpConfig(dir, servers)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ mcpServers: { files: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] } } })
    expect(writeMcpConfig(dir, servers.filter((s) => !s.enabled))).toBe('')
  })
  it('passes the file to Claude Code only', () => {
    const base = { model: '', endpoint: '', system: '', prompt: 'hi', cwd: '.', maxTokens: 10, timeoutMs: 10, mcpConfig: 'C:/m.json' }
    expect(buildCliInvocation({ ...base, engine: 'cli-claude' }).args).toContain('--mcp-config')
    expect(buildCliInvocation({ ...base, engine: 'cli-codex' }).args).not.toContain('--mcp-config')
  })
})
