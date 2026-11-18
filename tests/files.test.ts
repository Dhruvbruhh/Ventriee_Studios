import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileService, MAX_TEXT_BYTES, workspacePath } from '../src/main/files'
let root: string
const files = new FileService()
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'ventriee-files-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))
describe('workspace editor files', () => {
  it('round-trips Unicode, BOM, CRLF and atomic replacement', (context) => {
    writeFileSync(join(root, 'hello.py'), '\ufeffprint("नमस्ते")\r\n')
    const file = files.read(root, 'hello.py')
    expect(file.bom).toBe(true)
    let saved
    try { saved = files.save(root, { ...file, text: file.text + '# edited\r\n' }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('File replacement is denied by this environment'); return }
      throw error
    }
    expect(saved.version).not.toBe(file.version)
    expect(readFileSync(join(root, 'hello.py'), 'utf8')).toBe('\ufeffprint("नमस्ते")\r\n# edited\r\n')
    expect(files.list(root).some((entry) => entry.name.endsWith('.tmp'))).toBe(false)
  })
  it('refuses to overwrite changes made by an agent', () => {
    writeFileSync(join(root, 'a.ts'), 'original')
    const opened = files.read(root, 'a.ts')
    writeFileSync(join(root, 'a.ts'), 'agent version')
    expect(() => files.save(root, { ...opened, text: 'my edits' })).toThrow('changed on disk')
    expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe('agent version')
  })
  it.each(['../outside.txt', 'C:\\outside.txt', '.git/config', 'file.txt:stream', 'NUL', 'bad\nname.txt'])('rejects unsafe paths: %s', (path) => {
    expect(() => workspacePath(root, path)).toThrow()
  })
  it('rejects binary, non-UTF8 and oversized files', () => {
    writeFileSync(join(root, 'binary'), Buffer.from([1, 0, 2]))
    writeFileSync(join(root, 'encoded'), Buffer.from([0xff, 0xfe, 0xff]))
    writeFileSync(join(root, 'large'), Buffer.alloc(MAX_TEXT_BYTES + 1, 'a'))
    expect(() => files.read(root, 'binary')).toThrow('Binary')
    expect(() => files.read(root, 'encoded')).toThrow('UTF-8')
    expect(() => files.read(root, 'large')).toThrow('2 MB')
  })
  it('creates files without clobbering and searches nested source paths', () => {
    files.create(root, 'src', true); files.create(root, 'src/main.rs', false)
    expect(() => files.create(root, 'src/main.rs', false)).toThrow()
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'hidden.rs'), '')
    expect(files.find(root, '.rs').map((entry) => entry.path)).toEqual(['src/main.rs'])
  })
})
