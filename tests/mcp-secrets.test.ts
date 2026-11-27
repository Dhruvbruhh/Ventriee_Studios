import { describe, expect, it } from 'vitest'
import { joinMcpServers, MemorySecrets, migrateMcpSecrets, splitMcpServers } from '../src/main/mcpSecrets'
import type { McpServer } from '../src/shared/types'

const server = (over: Partial<McpServer> = {}): McpServer => ({
  name: 'github', command: 'npx', args: ['-y', 'mcp-github'], enabled: true, ...over
})

describe('mcp secret storage', () => {
  it('splits env/headers out of the public shape and rejoins them exactly', () => {
    const s = server({ env: { GITHUB_TOKEN: 'gh_secret' }, headers: { Authorization: 'Bearer wh_1' } })
    const { public: pub, secrets } = splitMcpServers([s])
    // Nothing secret remains in the settings blob.
    expect(JSON.stringify(pub)).not.toContain('gh_secret')
    expect(JSON.stringify(pub)).not.toContain('wh_1')
    expect(pub[0].env).toBeUndefined()
    expect(pub[0].headers).toBeUndefined()
    expect(secrets.github).toEqual({ env: { GITHUB_TOKEN: 'gh_secret' }, headers: { Authorization: 'Bearer wh_1' } })
    expect(joinMcpServers(pub, secrets)[0]).toEqual(s)
  })

  it('leaves servers without secrets untouched', () => {
    const s = server()
    const { public: pub, secrets } = splitMcpServers([s])
    expect(pub).toEqual([s])
    expect(secrets).toEqual({})
  })

  it('migrates plaintext values on startup and keeps what the store already had', () => {
    const store = new MemorySecrets({ existing: { env: { K: 'v' } } })
    const moved = migrateMcpSecrets([server({ name: 'fresh', env: { TOKEN: 't' } }), server({ name: 'existing', env: { K: 'newer' } })], store)
    expect(moved).toBe(1)
    expect(store.get().fresh).toEqual({ env: { TOKEN: 't' } })
    // A server already in the store keeps its sealed copy; no silent overwrite.
    expect(store.get().existing).toEqual({ env: { K: 'v' } })
  })

  it('reports nothing to migrate when there are no secrets', () => {
    const store = new MemorySecrets()
    expect(migrateMcpSecrets([server(), server({ url: 'https://mcp.example.com' })], store)).toBe(0)
    expect(store.get()).toEqual({})
  })
})
