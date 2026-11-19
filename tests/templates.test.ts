import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyTemplate, TEMPLATES } from '../src/main/templates'

describe('project templates', () => {
  it('writes a starter into an empty folder and returns its brief', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-tpl-'))
    expect(applyTemplate(root, 'react-vite')).toContain('Vite')
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts.dev).toBe('vite')
    expect(readFileSync(join(root, 'src', 'App.jsx'), 'utf8')).toContain('export default function App')
  })
  it('never touches a folder that already has files', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-tpl-'))
    writeFileSync(join(root, 'mine.txt'), 'keep')
    expect(() => applyTemplate(root, 'static')).toThrow('empty folder')
    expect(readFileSync(join(root, 'mine.txt'), 'utf8')).toBe('keep')
    expect(applyTemplate(root, 'empty')).toBe('')
  })
  it('keeps every template file inside the project', () => {
    for (const template of Object.values(TEMPLATES)) for (const path of Object.keys(template.files)) expect(path).not.toMatch(/^\/|\.\./)
  })
})
