import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServer } from '../shared/types'

/** Owner-entered servers, validated: a name Claude Code accepts and a command with plain arguments. */
export function validMcpServers(servers: unknown): McpServer[] {
  if (!Array.isArray(servers)) return []
  return servers.filter((s): s is McpServer => Boolean(s) && typeof s.name === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.name) &&
    typeof s.command === 'string' && s.command.trim().length > 0 && s.command.length <= 500 &&
    Array.isArray(s.args) && s.args.every((a: unknown) => typeof a === 'string' && a.length <= 1000)).slice(0, 20)
}

/** Writes the enabled servers as Claude Code's --mcp-config JSON; returns '' when there are none. */
export function writeMcpConfig(dir: string, servers: McpServer[]): string {
  const enabled = validMcpServers(servers).filter((s) => s.enabled)
  if (!enabled.length) return ''
  const file = join(dir, 'mcp-servers.json')
  writeFileSync(file, JSON.stringify({ mcpServers: Object.fromEntries(enabled.map((s) => [s.name, { command: s.command.trim(), args: s.args }])) }, null, 2))
  return file
}
