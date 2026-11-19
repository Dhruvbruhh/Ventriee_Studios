import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCliInvocation, loadImages, userContent } from '../src/main/engines'
import { attachmentPaths, saveAttachment } from '../src/main/attachments'

const png = Buffer.from('89504e470d0a1a0a', 'hex')

describe('attached images', () => {
  it('are saved inside the project and only those are sent', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-att-'))
    const rel = saveAttachment(root, 'shot.png', new Uint8Array(png))
    expect(rel).toMatch(/^\.ventriee\/attachments\/\d+-\w+\.png$/)
    writeFileSync(join(root, 'secret.png'), png)
    expect(attachmentPaths(root, [rel, 'secret.png', '../x.png', '.ventriee/attachments/../../secret.png', 42])).toEqual([join(root, rel)])
    expect(() => saveAttachment(root, 'evil.exe', new Uint8Array(png))).toThrow('PNG')
    expect(() => saveAttachment(root, 'big.png', new Uint8Array(6 * 1024 * 1024))).toThrow('5 MB')
  })

  it('go to each API in its own shape, and to CLI agents by path', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-img-'))
    const file = join(root, 'a.png')
    writeFileSync(file, png)
    const input = { prompt: 'Build this', images: [file, join(root, 'missing.png'), join(root, 'notes.txt')] }
    expect(loadImages(input.images)).toHaveLength(1)
    const data = png.toString('base64')
    expect(userContent(input, 'openai')).toEqual([{ type: 'text', text: 'Build this' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } }])
    expect(userContent(input, 'anthropic')).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }, { type: 'text', text: 'Build this' }])
    expect(userContent(input, 'gemini')).toEqual([{ text: 'Build this' }, { inline_data: { mime_type: 'image/png', data } }])
    expect(userContent({ prompt: 'plain' }, 'openai')).toBe('plain')
    const codex = buildCliInvocation({ engine: 'cli-codex', model: '', endpoint: '', system: '', prompt: 'x', cwd: root, maxTokens: 1, timeoutMs: 1, images: [file] })
    expect(codex.args).toEqual(expect.arrayContaining(['--image', file]))
  })
})
