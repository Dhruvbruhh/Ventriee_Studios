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
// Monaco cannot read CSS variables, so its two themes mirror the warm tokens in styles.css.
monaco.editor.defineTheme('ventriee', { base: 'vs-dark', inherit: true, rules: [], colors: {
  'editor.background': '#22211f', 'editorLineNumber.foreground': '#7c776d', 'editorCursor.foreground': '#d98a68',
  'editor.selectionBackground': '#d98a6838', 'editor.inactiveSelectionBackground': '#3d3b37', 'editorLineNumber.activeForeground': '#f2efe8',
  'editor.lineHighlightBackground': '#2a2927', 'minimap.background': '#1f1e1c'
} })
monaco.editor.defineTheme('ventriee-light', { base: 'vs', inherit: true, rules: [], colors: {
  'editor.background': '#faf9f5', 'editorLineNumber.foreground': '#9a958a', 'editorCursor.foreground': '#a2441e',
  'editor.selectionBackground': '#a2441e26', 'editor.inactiveSelectionBackground': '#e7e3d8', 'editorLineNumber.activeForeground': '#262624',
  'editor.lineHighlightBackground': '#f3f0e8', 'minimap.background': '#f5f3ec'
} })
const lightMedia = matchMedia('(prefers-color-scheme: light)')
/** The editor theme matching Windows' light/dark setting right now. */
export const editorTheme = () => (lightMedia.matches ? 'ventriee-light' : 'ventriee')
lightMedia.addEventListener('change', () => monaco.editor.setTheme(editorTheme()))
export interface SupportedLanguage { id: string; filenames?: string[]; extensions?: string[]; aliases?: string[] }
export function editorLanguages(): SupportedLanguage[] { return monaco.languages.getLanguages() }
export function languageFor(path: string) {
  const name = path.split('/').at(-1)!.toLowerCase()
  const languages = editorLanguages()
  return languages.find((lang) => lang.filenames?.some((filename) => filename.toLowerCase() === name))?.id
    ?? languages.find((lang) => lang.extensions?.some((extension) => name.endsWith(extension)))?.id ?? 'plaintext'
}
export { monaco }
