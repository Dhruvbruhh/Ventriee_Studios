import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

;(self as typeof self & { MonacoEnvironment: { getWorker(id: string, label: string): Worker } }).MonacoEnvironment = { getWorker(_id: string, label: string) {
  if (label === 'json') return new JsonWorker()
  if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
  if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
  if (['typescript', 'javascript'].includes(label)) return new TsWorker()
  return new EditorWorker()
} }
monaco.editor.defineTheme('ventriee', { base: 'vs-dark', inherit: true, rules: [], colors: {
  'editor.background': '#101216', 'editorLineNumber.foreground': '#59616f', 'editorCursor.foreground': '#a78bfa',
  'editor.selectionBackground': '#4a3c6c80', 'editor.inactiveSelectionBackground': '#34303f', 'editorLineNumber.activeForeground': '#d6c6fb'
} })
monaco.editor.setTheme('ventriee')
export interface SupportedLanguage { id: string; filenames?: string[]; extensions?: string[]; aliases?: string[] }
export function editorLanguages(): SupportedLanguage[] { return monaco.languages.getLanguages() }
export function languageFor(path: string) {
  const name = path.split('/').at(-1)!.toLowerCase()
  const languages = editorLanguages()
  return languages.find((lang) => lang.filenames?.some((filename) => filename.toLowerCase() === name))?.id
    ?? languages.find((lang) => lang.extensions?.some((extension) => name.endsWith(extension)))?.id ?? 'plaintext'
}
export { monaco }
