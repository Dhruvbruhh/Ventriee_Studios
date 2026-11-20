import { readFileSync } from 'node:fs'
import { dirname, join, matchesGlob, relative } from 'node:path'
import type { EditorConfig } from '../shared/workspace'

/** Parse one .editorconfig file into its sections, in file order. */
export function parseEditorConfig(text: string): { root: boolean; sections: Array<{ glob: string; props: Record<string, string> }> } {
  let root = false
  const sections: Array<{ glob: string; props: Record<string, string> }> = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const header = /^\[(.+)\]$/.exec(line)
    if (header) { sections.push({ glob: header[1], props: {} }); continue }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim().toLowerCase()
    if (sections.length) sections[sections.length - 1].props[key] = value
    else if (key === 'root') root = value === 'true'
  }
  return { root, sections }
}

/** Does an .editorconfig section glob match a path relative to that file's folder (with `/`)? */
export function globMatches(glob: string, path: string): boolean {
  // A glob without a slash matches the file name in any folder; a leading slash anchors it to the config's folder.
  const pattern = glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`
  // In .editorconfig `**` also crosses folders inside a segment (`**.js`); in Node's glob that is `**/*.js`.
  return matchesGlob(path, pattern.replace(/(?<=^|\/)\*\*(?=[^/])/g, '**/*'))
}

/** The properties for `file` (absolute), from every .editorconfig between it and `root` (or the first with root=true). */
export function editorConfigFor(root: string, file: string): EditorConfig {
  const configs: Array<{ dir: string; text: string }> = []
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    let text: string | null = null
    try { text = readFileSync(join(dir, '.editorconfig'), 'utf8') } catch { /* none here */ }
    if (text !== null) { configs.unshift({ dir, text }); if (parseEditorConfig(text).root) break }
    if (relative(root, dir) === '' || dirname(dir) === dir || relative(root, dir).startsWith('..')) break
  }
  // Nearer files and later sections win.
  const props: Record<string, string> = {}
  for (const { dir, text } of configs) {
    const rel = relative(dir, file).replace(/\\/g, '/')
    for (const section of parseEditorConfig(text).sections) if (globMatches(section.glob, rel)) Object.assign(props, section.props)
  }
  const size = Number(props.indent_size === 'tab' ? props.tab_width : props.indent_size ?? props.tab_width)
  const flag = (v?: string) => v === 'true' ? true : v === 'false' ? false : undefined
  return {
    indentStyle: props.indent_style === 'tab' || props.indent_style === 'space' ? props.indent_style : undefined,
    indentSize: Number.isInteger(size) && size > 0 && size <= 16 ? size : undefined,
    trimTrailingWhitespace: flag(props.trim_trailing_whitespace),
    insertFinalNewline: flag(props.insert_final_newline),
    endOfLine: props.end_of_line === 'lf' || props.end_of_line === 'crlf' ? props.end_of_line : undefined
  }
}
