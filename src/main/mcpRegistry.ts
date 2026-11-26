import type { McpServer, RegistryInput, RegistryInstall, RegistryServer } from '../shared/types'

export const REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers'

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const inputs = (list: unknown): RegistryInput[] => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.name === 'string').slice(0, 30).map((x) => ({
  name: str(x.name, 200), description: str(x.description, 500), required: Boolean(x.isRequired), secret: Boolean(x.isSecret), template: str(x.value, 500) || undefined
}))

/** The registry's response, reduced to what the marketplace shows and can install. Anything malformed is dropped. */
export function parseRegistry(json: unknown): { servers: RegistryServer[]; nextCursor: string } {
  const body = (json ?? {}) as { servers?: unknown[]; metadata?: { nextCursor?: unknown } }
  const servers: RegistryServer[] = []
  for (const entry of Array.isArray(body.servers) ? body.servers : []) {
    const s = (entry as { server?: Record<string, any> })?.server
    const meta = (entry as { _meta?: Record<string, any> })?._meta?.['io.modelcontextprotocol.registry/official'] ?? {}
    if (!s || typeof s.name !== 'string') continue
    const installs: RegistryInstall[] = []
    for (const p of Array.isArray(s.packages) ? s.packages : []) {
      const kind = p?.registryType
      if ((kind !== 'npm' && kind !== 'pypi' && kind !== 'oci') || typeof p.identifier !== 'string' || p.transport?.type !== 'stdio') continue
      installs.push({ kind, label: kind === 'npm' ? 'npm (npx)' : kind === 'pypi' ? 'Python (uvx)' : 'Docker', identifier: str(p.identifier, 300), version: str(p.version, 60), transport: 'stdio', env: inputs(p.environmentVariables), headers: [] })
    }
    for (const r of Array.isArray(s.remotes) ? s.remotes : []) {
      const transport = r?.type === 'streamable-http' ? 'http' : r?.type === 'sse' ? 'sse' : null
      if (!transport || typeof r.url !== 'string' || !/^https:\/\//i.test(r.url)) continue
      installs.push({ kind: 'remote', label: transport === 'http' ? 'Remote (HTTP)' : 'Remote (SSE)', identifier: str(r.url, 500), version: str(s.version, 60), url: str(r.url, 500), transport, env: [], headers: inputs(r.headers) })
    }
    servers.push({
      name: str(s.name, 200), title: str(s.title, 200) || str(s.name, 200).split('/').pop() || s.name, description: str(s.description, 1000),
      version: str(s.version, 60), repository: str(s.repository?.url, 500), website: str(s.websiteUrl, 500),
      publishedAt: str(meta.publishedAt, 40), status: str(meta.status, 30) || 'active', installs
    })
  }
  return { servers, nextCursor: str(body.metadata?.nextCursor, 500) }
}

export async function searchRegistry(query: string, cursor = '', fetcher: typeof fetch = fetch) {
  const url = new URL(REGISTRY_URL)
  url.searchParams.set('limit', '30')
  url.searchParams.set('version', 'latest')
  if (query.trim()) url.searchParams.set('search', query.trim().slice(0, 100))
  if (cursor) url.searchParams.set('cursor', cursor)
  const res = await fetcher(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`The MCP registry answered HTTP ${res.status}`)
  return parseRegistry(await res.json())
}

/** A server name Claude Code accepts, unique among the ones already installed. */
export function serverName(registryName: string, taken: string[]): string {
  const base = (registryName.split('/').pop() ?? 'server').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'server'
  let name = base
  for (let i = 2; taken.includes(name); i++) name = `${base.slice(0, 36)}-${i}`
  return name
}

/** Turn a registry install option and the owner's answers into a saved server. It starts disabled: the owner tests it, then turns it on. */
export function installServer(server: RegistryServer, option: RegistryInstall, values: Record<string, string>, taken: string[], platform = process.platform): McpServer {
  const missing = [...option.env, ...option.headers].filter((i) => i.required && !values[i.name]?.trim()).map((i) => i.name)
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')}`)
  const env = Object.fromEntries(option.env.filter((i) => values[i.name]?.trim()).map((i) => [i.name, values[i.name].trim()]))
  const name = serverName(server.name, taken)
  const base = { name, enabled: false, source: server.name }
  const pinned = (sep: string) => (option.version ? `${option.identifier}${sep}${option.version}` : option.identifier)
  switch (option.kind) {
    case 'npm': return platform === 'win32'
      ? { ...base, command: 'cmd', args: ['/c', 'npx', '-y', pinned('@')], env }
      : { ...base, command: 'npx', args: ['-y', pinned('@')], env }
    case 'pypi': return { ...base, command: 'uvx', args: [pinned('==')], env }
    case 'oci': return { ...base, command: 'docker', args: ['run', '-i', '--rm', ...Object.keys(env).flatMap((k) => ['-e', k]), option.version && !option.identifier.includes(':') ? `${option.identifier}:${option.version}` : option.identifier], env }
    case 'remote': {
      // A header template like "Bearer {api_key}" takes the owner's value in place of its placeholder.
      const headers = Object.fromEntries(option.headers.filter((h) => values[h.name]?.trim()).map((h) => [h.name, h.template?.includes('{') ? h.template.replace(/\{[^}]+\}/, values[h.name].trim()) : values[h.name].trim()]))
      return { ...base, command: '', args: [], url: option.url, transport: option.transport === 'sse' ? 'sse' : 'http', headers }
    }
  }
}
