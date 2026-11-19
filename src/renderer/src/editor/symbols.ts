import { monaco } from './monaco'
import type { LspSession, OutlineSymbol } from './lsp'

type NavTree = { text: string; kind: string; spans: Array<{ start: number; length: number }>; nameSpan?: { start: number }; childItems?: NavTree[] }

const tsWorker = async (model: monaco.editor.ITextModel) => {
  const language = model.getLanguageId()
  if (language !== 'typescript' && language !== 'javascript') return null
  const get = language === 'typescript' ? monaco.typescript.getTypeScriptWorker : monaco.typescript.getJavaScriptWorker
  return (await get())(model.uri)
}

/** TypeScript/JavaScript symbols from Monaco's TypeScript worker, as an outline. */
async function tsOutline(model: monaco.editor.ITextModel): Promise<OutlineSymbol[] | null> {
  const worker = await tsWorker(model).catch(() => null)
  const tree = worker ? await worker.getNavigationTree(model.uri.toString()).catch(() => null) as NavTree | null : null
  if (!tree || model.isDisposed()) return null
  const convert = (items: NavTree[]): OutlineSymbol[] => items.filter((i) => i.spans?.length && i.text !== '<function>').map((i) => {
    const start = model.getPositionAt(i.nameSpan?.start ?? i.spans[0].start)
    const end = model.getPositionAt(i.spans[0].start + i.spans[0].length)
    return { name: i.text, detail: i.kind, kind: KIND_BY_NAME[i.kind] ?? 13, line: start.lineNumber, column: start.column, endLine: end.lineNumber, children: convert(i.childItems ?? []) }
  })
  return convert(tree.childItems ?? [])
}
/** TypeScript's kind names as LSP SymbolKind numbers, so both draw the same. */
const KIND_BY_NAME: Record<string, number> = { module: 2, class: 5, method: 6, property: 7, getter: 7, setter: 7, constructor: 9, enum: 10, interface: 11, function: 12, 'local function': 12, var: 13, let: 13, const: 14, 'enum member': 22, type: 26, alias: 26 }
export const SYMBOL_KINDS = ['', 'file', 'module', 'namespace', 'package', 'class', 'method', 'property', 'field', 'constructor', 'enum', 'interface', 'function', 'variable', 'constant', 'string', 'number', 'boolean', 'array', 'object', 'key', 'null', 'enum member', 'struct', 'event', 'operator', 'type']

export async function outlineFor(model: monaco.editor.ITextModel, lsp: LspSession | null): Promise<OutlineSymbol[] | null> {
  return (await lsp?.symbols(model).catch(() => null)) ?? tsOutline(model)
}

/** The chain of symbols around a line, outermost first: the breadcrumb. */
export function symbolPath(outline: OutlineSymbol[], line: number): OutlineSymbol[] {
  const hit = outline.find((s) => s.line <= line && line <= s.endLine)
  return hit ? [hit, ...symbolPath(hit.children, line)] : []
}

/** Symbols matching a query across the project: language servers, plus TypeScript files loaded for the TS service. */
export async function findSymbols(query: string, lsp: LspSession | null, projectId: string) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out = [...(await lsp?.workspaceSymbols(query).catch(() => []) ?? [])]
  const models = monaco.editor.getModels().filter((m) => m.uri.authority === projectId.toLowerCase() && ['typescript', 'javascript'].includes(m.getLanguageId()) && !m.uri.path.includes('/node_modules/')).slice(0, 400)
  for (const model of models) {
    const walk = (items: OutlineSymbol[], container: string) => { for (const s of items) {
      if (s.name.toLowerCase().includes(q)) out.push({ name: s.name, kind: s.kind, path: model.uri.path.slice(1), line: s.line, column: s.column, container })
      walk(s.children, s.name)
    } }
    walk((await tsOutline(model)) ?? [], '')
    if (out.length >= 200) break
  }
  return out.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, 200)
}
