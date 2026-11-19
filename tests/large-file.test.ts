import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileService } from '../src/main/files'

describe('large files', () => {
  it('opens files over the edit limit for reading, and refuses binary ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-large-'))
    writeFileSync(join(root, 'big.log'), 'line\n'.repeat(700_000))
    const files = new FileService()
    expect(() => files.read(root, 'big.log')).toThrow('2 MB editor limit')
    const large = files.readLarge(root, 'big.log')
    expect(large).toMatchObject({ size: 3_500_000, truncated: false })
    expect(large.text.length).toBe(3_500_000)
    writeFileSync(join(root, 'blob.bin'), Buffer.from([1, 0, 2]))
    expect(() => files.readLarge(root, 'blob.bin')).toThrow('Binary')
    expect(() => files.readLarge(root, '../x')).toThrow()
  })
})
