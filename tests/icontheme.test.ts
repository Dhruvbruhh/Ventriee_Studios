import { describe, expect, it } from 'vitest'
import { parseIconTheme, supportOf } from '../src/main/extensions'

describe('file icon themes', () => {
  it('inline svg/png icons, skip font glyphs and missing or huge files, and lower-case the keys', () => {
    const files: Record<string, Buffer> = { 'icons/ts.svg': Buffer.from('<svg/>'), 'icons/folder.png': Buffer.from('png'), 'icons/huge.svg': Buffer.alloc(70 * 1024) }
    const theme = parseIconTheme({
      iconDefinitions: { ts: { iconPath: 'icons/ts.svg' }, folder: { iconPath: 'icons/folder.png' }, glyph: { fontCharacter: '\\E001' }, gone: { iconPath: 'icons/gone.svg' }, huge: { iconPath: 'icons/huge.svg' } },
      file: 'glyph', folder: 'folder', fileExtensions: { TS: 'ts', js: 'glyph', 'Test.ts': 'ts' }, fileNames: { 'Dockerfile': 'huge' }, languageIds: { typescript: 'ts' }
    }, (p) => files[p] ?? null)
    expect(Object.keys(theme.icons)).toEqual(['ts', 'folder'])
    expect(theme.icons.ts).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`)
    expect(theme.file).toBeUndefined()
    expect(theme.folder).toBe('folder')
    expect(theme.fileExtensions).toEqual({ ts: 'ts', 'test.ts': 'ts' })
    expect(theme.fileNames).toEqual({})
    expect(supportOf({ name: 'm', publisher: 'p', version: '1', main: './x.js', contributes: { iconThemes: [{ id: 'm', path: 'm.json' }] } }).supported).toEqual(['iconThemes'])
  })
})
