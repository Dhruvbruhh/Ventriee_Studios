import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { editorConfigFor, globMatches } from '../src/main/editorconfig'
import { fixWhitespace } from '../src/shared/workspace'

const root = mkdtempSync(join(tmpdir(), 'ventriee-ec-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('.editorconfig', () => {
  it('matches section globs like editors do', () => {
    expect(globMatches('*', 'src/a.ts')).toBe(true)
    expect(globMatches('*.{js,ts}', 'src/deep/a.ts')).toBe(true)
    expect(globMatches('*.py', 'a.ts')).toBe(false)
    expect(globMatches('Makefile', 'tools/Makefile')).toBe(true)
    expect(globMatches('/lib/**.js', 'lib/x/y.js')).toBe(true)
    expect(globMatches('/lib/**.js', 'src/lib/y.js')).toBe(false)
  })

  it('merges files from the root down, later sections and nearer files winning', () => {
    writeFileSync(join(root, '.editorconfig'), 'root = true\n[*]\nindent_style = space\nindent_size = 2\ninsert_final_newline = true\n[*.py]\nindent_size = 4\n[Makefile]\nindent_style = tab\n')
    mkdirSync(join(root, 'legacy'))
    writeFileSync(join(root, 'legacy', '.editorconfig'), '[*.js]\nindent_size = tab\ntab_width = 8\ntrim_trailing_whitespace = true\nend_of_line = crlf\n')
    expect(editorConfigFor(root, join(root, 'a.ts'))).toEqual({ indentStyle: 'space', indentSize: 2, insertFinalNewline: true })
    expect(editorConfigFor(root, join(root, 'pkg', 'b.py'))).toMatchObject({ indentSize: 4 })
    expect(editorConfigFor(root, join(root, 'Makefile'))).toMatchObject({ indentStyle: 'tab' })
    expect(editorConfigFor(root, join(root, 'legacy', 'c.js'))).toEqual({ indentStyle: 'space', indentSize: 8, insertFinalNewline: true, trimTrailingWhitespace: true, endOfLine: 'crlf' })
  })

  it('is empty without a config', () => {
    const bare = mkdtempSync(join(tmpdir(), 'ventriee-ec-bare-'))
    try { expect(editorConfigFor(bare, join(bare, 'x.ts'))).toEqual({}) } finally { rmSync(bare, { recursive: true, force: true }) }
  })

  it('fixes whitespace on save', () => {
    expect(fixWhitespace('a  \nb\t\nc', { trimTrailingWhitespace: true, insertFinalNewline: true })).toBe('a\nb\nc\n')
    expect(fixWhitespace('a \r\nb', { insertFinalNewline: true })).toBe('a \r\nb\r\n')
    expect(fixWhitespace('a\n\n\n', { insertFinalNewline: false })).toBe('a')
    expect(fixWhitespace('', { insertFinalNewline: true })).toBe('')
    expect(fixWhitespace('a  \n', {})).toBe('a  \n')
  })
})
