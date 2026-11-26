import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServer } from '../shared/types'

const stringMap = (v: unknown) => v === undefined || (typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.entries(v).length <= 40 && Object.entries(v).every(([k, x]) => /^[A-Za-z_][A-Za-z0-9_.-]{0,100}$/.test(k) && typeof x === 'string' && x.length <= 4000))

/** Owner-entered servers, validated: a name Claude Code accepts, and either a command with plain arguments or an https address. */
export function validMcpServers(servers: unknown): McpServer[] {
  if (!Array.isArray(servers)) return []
  return servers.filter((s): s is McpServer => {
    if (!s || typeof s.name !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(s.name)) return false
    if (!stringMap(s.env) || !stringMap(s.headers)) return false
    if (typeof s.url === 'string' && s.url) return /^https?:\/\//i.test(s.url) && s.url.length <= 1000 && (s.transport === undefined || s.transport === 'http' || s.transport === 'sse')
    return typeof s.command === 'string' && s.command.trim().length > 0 && s.command.length <= 500 &&
      Array.isArray(s.args) && s.args.every((a: unknown) => typeof a === 'string' && a.length <= 1000)
  }).slice(0, 40)
}

/** Writes the enabled servers as Claude Code's --mcp-config JSON; returns '' when there are none.
 *  Pass `filter` to restrict to those server names (empty filter = all enabled). */
export function writeMcpConfig(dir: string, servers: McpServer[], filter?: string[]): string {
  const enabled = validMcpServers(servers).filter((s) => s.enabled && (!filter?.length || filter.includes(s.name)))
  if (!enabled.length) return ''
  const file = join(dir, 'mcp-servers.json')
  const entry = (s: McpServer) => s.url
    ? { type: s.transport ?? 'http', url: s.url, ...(s.headers && Object.keys(s.headers).length ? { headers: s.headers } : {}) }
    : { command: s.command.trim(), args: s.args, ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}) }
  writeFileSync(file, JSON.stringify({ mcpServers: Object.fromEntries(enabled.map((s) => [s.name, entry(s)])) }, null, 2))
  return file
}
