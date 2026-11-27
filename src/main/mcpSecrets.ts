import { safeStorage } from 'electron'
import type { McpServer } from '../shared/types'
import { validMcpServers } from './mcp'

/**
 * MCP servers carry secrets in `env` and `headers`. Those two maps are stored
 * encrypted at rest (OS keychain via safeStorage) in a separate kv entry, never
 * in the plaintext settings blob. `decryptMcpServers` reassembles full server
 * objects only for writing the worker MCP config; nothing else reads them.
 */

export interface McpSecretStore {
  /** Plaintext env/header maps per server name, as the owner typed them. */
  get(): Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>
  set(secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>): void
}

/** Real store: encrypted kv under `mcpSecrets`. Throws when the OS keychain is gone. */
export class SafeStorageSecrets implements McpSecretStore {
  constructor(private db: { kvGet(key: string): string | null; kvSet(key: string, value: string): void }) {}

  private unseal(): Record<string, { env?: Record<string, string>; headers?: Record<string, string> }> {
    const raw = this.db.kvGet('mcpSecrets')
    if (!raw) return {}
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw, 'base64'))) as Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>
    } catch {
      // Wrong OS user or a rotated key: the secrets are gone, not recoverable.
      return {}
    }
  }

  get() {
    return this.unseal()
  }

  set(secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>) {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
      throw new Error('Secure storage is unavailable: MCP env/header values would be saved in plain text. Configure an OS keychain.')
    }
    this.db.kvSet('mcpSecrets', safeStorage.encryptString(JSON.stringify(secrets)).toString('base64'))
  }
}

/** In-memory store for tests and for the plaintext fallback migration. */
export class MemorySecrets implements McpSecretStore {
  constructor(private data: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }> = {}) {}
  get() { return this.data }
  set(secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>) { this.data = structuredClone(secrets) }
}

/** Split servers into the public shape (env/headers stripped) plus the sealed half. */
export function splitMcpServers(servers: McpServer[]): {
  public: McpServer[]
  secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>
} {
  const secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }> = {}
  const pub = validMcpServers(servers).map((s) => {
    const rest = { ...s } as McpServer
    if (s.env && Object.keys(s.env).length) {
      secrets[s.name] = { ...secrets[s.name], env: s.env }
      delete rest.env
    }
    if (s.headers && Object.keys(s.headers).length) {
      secrets[s.name] = { ...secrets[s.name], headers: s.headers }
      delete rest.headers
    }
    return rest
  })
  return { public: pub, secrets }
}

/** Rejoin the halves; used only when writing the worker MCP config. */
export function joinMcpServers(
  publicServers: McpServer[],
  secrets: Record<string, { env?: Record<string, string>; headers?: Record<string, string> }>
): McpServer[] {
  return validMcpServers(publicServers.map((s) => {
    const sec = secrets[s.name]
    return sec ? { ...s, ...(sec.env ? { env: sec.env } : {}), ...(sec.headers ? { headers: sec.headers } : {}) } : s
  }))
}

/**
 * One-time move of plaintext env/header values into the secret store. Runs on
 * startup with whatever store is available; when secure storage is unusable the
 * values stay put (current behaviour) and the caller shows a warning.
 * Returns the number of servers whose secrets were moved.
 */
export function migrateMcpSecrets(servers: McpServer[], store: McpSecretStore): number {
  const existing = store.get()
  const { public: pub, secrets } = splitMcpServers(servers)
  const moved = Object.keys(secrets).filter((name) => !existing[name])
  if (!moved.length) return 0
  store.set({ ...existing, ...Object.fromEntries(moved.map((name) => [name, secrets[name]])) })
  return moved.length
}
