import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { emmetCSS, emmetHTML, emmetJSX } from 'emmet-monaco-es'

;(self as typeof self & { MonacoEnvironment: { getWorker(id: string, label: string): Worker } }).MonacoEnvironment = { getWorker(_id: string, label: string) {
  if (label === 'json') return new JsonWorker()
  if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
  if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
  if (['typescript', 'javascript'].includes(label)) return new TsWorker()
  return new EditorWorker()
} }
// Colours come from the theme tokens in styles.css (loaded before this lazy chunk).
const css = getComputedStyle(document.documentElement)
const token = (name: string) => css.getPropertyValue(name).trim()
monaco.editor.defineTheme('ventriee', { base: 'vs-dark', inherit: true, rules: [], colors: {
  'editor.background': token('--bg-deep'), 'editorLineNumber.foreground': token('--faint'), 'editorCursor.foreground': token('--accent'),
  'editor.selectionBackground': token('--selection'), 'editor.inactiveSelectionBackground': token('--selection'), 'editorLineNumber.activeForeground': token('--text')
} })
monaco.editor.setTheme('ventriee')
// Emmet abbreviations (div.card>p*3) as completions in markup, styles and JSX.
emmetHTML(monaco, ['html', 'php', 'handlebars', 'razor'])
emmetCSS(monaco, ['css', 'scss', 'less'])
emmetJSX(monaco, ['javascript', 'typescript'])
export interface SupportedLanguage { id: string; filenames?: string[]; extensions?: string[]; aliases?: string[] }
export function editorLanguages(): SupportedLanguage[] { return monaco.languages.getLanguages() }
export function languageFor(path: string) {
  const name = path.split('/').at(-1)!.toLowerCase()
  const languages = editorLanguages()
  return languages.find((lang) => lang.filenames?.some((filename) => filename.toLowerCase() === name))?.id
    ?? languages.find((lang) => lang.extensions?.some((extension) => name.endsWith(extension)))?.id ?? 'plaintext'
}
export { monaco }
