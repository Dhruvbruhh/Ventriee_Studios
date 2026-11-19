import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ExtensionService, supportOf, unpackVsix } from '../src/main/extensions'

const dir = () => mkdtempSync(join(tmpdir(), 'ventriee-ext-'))

describe('extensions', () => {
  it('unpacks only the extension folder and refuses paths that escape it', () => {
    const dest = join(dir(), 'x')
    unpackVsix(zipSync({ 'extension/package.json': strToU8('{}'), 'extension/a/b.json': strToU8('1'), '[Content_Types].xml': strToU8('') }), dest)
    expect(existsSync(join(dest, 'a', 'b.json'))).toBe(true)
    expect(existsSync(join(dest, '[Content_Types].xml'))).toBe(false)
    expect(() => unpackVsix(zipSync({ 'extension/package.json': strToU8('{}'), 'extension/../../evil.txt': strToU8('x') }), join(dir(), 'y'))).toThrow('Unsafe path')
    expect(() => unpackVsix(zipSync({ 'extension/readme.md': strToU8('x') }), join(dir(), 'z'))).toThrow('package.json is missing')
  })

  it('says what an extension adds and whether it needs the VS Code runtime', () => {
    expect(supportOf({ name: 'a', publisher: 'p', version: '1', contributes: { themes: [{}], commands: [{}] } })).toEqual({ supported: ['themes'], needsRuntime: false })
    expect(supportOf({ name: 'a', publisher: 'p', version: '1', main: './out/ext.js', contributes: { commands: [{}] } })).toEqual({ supported: [], needsRuntime: true })
  })

  it('reads enabled extensions\' themes (with includes), snippets, languages and grammars', () => {
    const root = dir()
    const ext = join(root, 'pub.demo')
    mkdirSync(join(ext, 'themes'), { recursive: true })
    writeFileSync(join(ext, 'package.json'), JSON.stringify({ name: 'demo', displayName: 'Demo', publisher: 'pub', version: '1.0.0', contributes: {
      themes: [{ label: 'Demo Dark', uiTheme: 'vs-dark', path: './themes/dark.json' }],
      snippets: [{ language: 'python', path: './snip.json' }],
      languages: [{ id: 'demo', extensions: ['.demo'], configuration: './lang.json' }],
      grammars: [{ language: 'demo', scopeName: 'source.demo', path: './demo.tmLanguage.json' }, { scopeName: 'x', path: '../../outside.json' }]
    } }))
    writeFileSync(join(ext, 'themes', 'base.json'), '{ "colors": { "editor.background": "#000000" }, "tokenColors": [{ "scope": "comment", "settings": { "foreground": "#888888" } }] }')
    writeFileSync(join(ext, 'themes', 'dark.json'), '{ // own colors win\n "include": "./base.json", "colors": { "editor.foreground": "#ffffff" }, "tokenColors": [{ "scope": "string", "settings": { "foreground": "#00ff00" } }] }')
    writeFileSync(join(ext, 'snip.json'), '{ "Print": { "prefix": "pr", "body": ["print($1)"] } }')
    writeFileSync(join(ext, 'lang.json'), '{ "comments": { "lineComment": "#" } }')
    writeFileSync(join(ext, 'demo.tmLanguage.json'), '{ "scopeName": "source.demo", "patterns": [] }')
    const service = new ExtensionService(root)
    expect(service.list()).toMatchObject([{ id: 'pub.demo', name: 'Demo', enabled: true, supported: ['themes', 'snippets', 'languages', 'grammars'] }])
    const c = service.contributions()
    expect(c.themes[0]).toMatchObject({ label: 'Demo Dark', dark: true, colors: { 'editor.background': '#000000', 'editor.foreground': '#ffffff' } })
    expect(c.themes[0].tokenColors).toHaveLength(2)
    expect(c.snippets[0].snippets.Print.prefix).toBe('pr')
    expect(c.languages[0]).toMatchObject({ id: 'demo', configuration: { comments: { lineComment: '#' } } })
    expect(c.grammars.map((g) => g.scopeName)).toEqual(['source.demo'])
    service.setEnabled('pub.demo', false)
    expect(service.contributions().themes).toEqual([])
    service.uninstall('pub.demo')
    expect(service.list()).toEqual([])
  })
})
