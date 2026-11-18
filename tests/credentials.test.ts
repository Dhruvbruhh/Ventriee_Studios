import { beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  decryptString: vi.fn((value: Buffer) => value.toString())
}))
vi.mock('electron', () => ({ safeStorage: storage }))
import { Credentials } from '../src/main/credentials'
import type { Db } from '../src/main/db'

function credentials() {
  const values = new Map<string, string>()
  const db = { kvGet: (key: string) => values.get(key),
    kvSet: (key: string, value: string) => values.set(key, value),
    kvDelete: (key: string) => values.delete(key) } as unknown as Db
  return { creds: new Credentials(db), values }
}
beforeEach(() => storage.isEncryptionAvailable.mockReturnValue(true))
describe('credential storage', () => {
  it('refuses to save plaintext when encryption is unavailable', () => {
    storage.isEncryptionAvailable.mockReturnValue(false)
    const { creds, values } = credentials()
    expect(() => creds.setKey('cred:test', 'secret')).toThrow('Secure credential storage')
    expect(values.size).toBe(0)
  })
  it('migrates legacy plaintext to encrypted storage', () => {
    const { creds, values } = credentials()
    values.set('cred:test', 'raw:legacy-secret')
    expect(creds.getKey('cred:test')).toBe('legacy-secret')
    expect(values.get('cred:test')).toMatch(/^enc:/)
  })
  it('preserves a legacy value if migration cannot run', () => {
    const { creds, values } = credentials()
    values.set('cred:test', 'raw:legacy-secret')
    storage.isEncryptionAvailable.mockReturnValue(false)
    expect(creds.getKey('cred:test')).toBeNull()
    expect(values.get('cred:test')).toBe('raw:legacy-secret')
  })
})
