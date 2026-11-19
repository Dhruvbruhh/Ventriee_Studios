import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const reply = vi.hoisted(() => ({ text: '' }))
vi.mock('../src/main/engines', () => ({
  runEngine: async () => ({ ok: true, text: reply.text }),
  modelFor: () => 'test-model',
  defaultEndpoint: () => ''
}))
import { changeFiles } from '../src/main/code-agent'
import { FileService } from '../src/main/files'
import type { AppSettings, Project } from '../src/shared/types'

const creds = { secretValues: () => [] } as never
const settings = { plannerEngine: 'api-openai', plannerModel: 'm', plannerEndpoint: '' } as AppSettings

describe('multi-file change agent', () => {
  it('returns each changed or new file with its original, drops unsafe and unchanged ones, writes nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-change-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1\n')
    writeFileSync(join(root, 'src', 'same.ts'), 'same\n')
    reply.text = 'Renamed a and added b.\n=== FILE: src/a.ts ===\nexport const a = 2\n=== END FILE ===\n=== FILE: src/b.ts ===\nexport const b = 1\n=== END FILE ===\n' +
      '=== FILE: src/same.ts ===\nsame\n=== END FILE ===\n=== FILE: ../escape.ts ===\nbad\n=== END FILE ===\n=== FILE: .git/config ===\nbad\n=== END FILE ==='
    const project = { id: 'p', name: 'P', path: root } as Project
    const result = await changeFiles(project, { request: 'rename a', paths: ['src/a.ts'] }, settings, creds, new FileService())
    expect(result.answer).toBe('Renamed a and added b.')
    expect(result.changes).toEqual([
      { path: 'src/a.ts', original: 'export const a = 1\n', text: 'export const a = 2\n', created: false },
      { path: 'src/b.ts', original: '', text: 'export const b = 1\n', created: true }
    ])
    expect(readFileSync(join(root, 'src', 'a.ts'), 'utf8')).toBe('export const a = 1\n')
  })

  it('says so when the reply contains no file changes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-change-'))
    reply.text = 'I would rename it.'
    await expect(changeFiles({ id: 'p', name: 'P', path: root } as Project, { request: 'x', paths: [] }, settings, creds, new FileService())).rejects.toThrow('without any file changes')
  })
})
