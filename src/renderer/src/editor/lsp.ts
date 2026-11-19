import { cleanError } from '../store'
import { monaco } from './monaco'
import { fileUri } from './intellisense'
import type { LspStatus } from '../../../shared/catalog'
import { fileUrl, relativePath } from '../../../shared/fileurl'

/** Language Server Protocol client side: keeps servers in sync with editor models and turns their answers into Monaco features. */

type Pos = { line: number; character: number }
type Rng = { start: Pos; end: Pos }
type TextEdit = { range: Rng; newText: string }
type WorkspaceEdit = { changes?: Record<string, TextEdit[]>; documentChanges?: Array<{ textDocument?: { uri: string }; edits?: TextEdit[] }> }
type LspSymbol = { name: string; detail?: string; kind: number; range: Rng; selectionRange: Rng; children?: LspSymbol[]; location?: { uri: string; range: Rng }; containerName?: string }
export interface OutlineSymbol { name: string; detail: string; kind: number; line: number; column: number; endLine: number; children: OutlineSymbol[] }

const toPos = (p: monaco.IPosition): Pos => ({ line: p.lineNumber - 1, character: p.column - 1 })
const toRange = (r: Rng) => new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1)
const toLspRange = (r: monaco.IRange): Rng => ({ start: { line: r.startLineNumber - 1, character: r.startColumn - 1 }, end: { line: r.endLineNumber - 1, character: r.endColumn - 1 } })
const markdown = (value: unknown): monaco.IMarkdownString | undefined => {
  if (value == null) return undefined
  if (typeof value === 'string') return { value }
  const v = value as { kind?: string; value?: string; language?: string }
  return { value: v.language ? `\`\`\`${v.language}\n${v.value}\n\`\`\`` : v.value ?? '' }
}
const KINDS = ['Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'] as const
const completionKind = (kind?: number) => monaco.languages.CompletionItemKind[KINDS[(kind ?? 1) - 1] ?? 'Text']

export interface LspSession {
  dispose(): void
  symbols(model: monaco.editor.ITextModel): Promise<OutlineSymbol[] | null>
  workspaceSymbols(query: string): Promise<Array<{ name: string; kind: number; path: string; line: number; column: number; container: string }>>
  status(language: string): LspStatus | undefined
}

export async function startLsp(project: { id: string; path: string }, hooks: {
  /** Opens a project file as an editor tab without switching to it, so edits to other files are visible and saved by the owner. */
  adopt(path: string): Promise<monaco.editor.ITextModel | null>
  onStatus(language: string, status: LspStatus): void
}): Promise<LspSession> {
  const catalog = await window.ventriee.toolCatalog()
  const languages = new Set(catalog.languages.map((l) => l.id))
  const authority = project.id.toLowerCase()
  const statuses = new Map<string, LspStatus>()
  const starting = new Map<string, Promise<LspStatus>>()
  const docs = new Map<string, { language: string; url: string; version: number; timer: ReturnType<typeof setTimeout> | null; subscription: monaco.IDisposable }>()
  const disposables: monaco.IDisposable[] = []
  const registered = new Set<string>()
  const restarts = new Map<string, number>()
  let disposed = false
  const loaded = new Set<monaco.editor.ITextModel>()

  const ours = (model: monaco.editor.ITextModel) => model.uri.scheme === 'inmemory' && model.uri.authority === authority && languages.has(model.getLanguageId())
  const pathOf = (model: monaco.editor.ITextModel) => model.uri.path.slice(1)
  const caps = (language: string) => { const s = statuses.get(language); return s?.state === 'ready' ? s.capabilities : {} }

  const ensure = (language: string) => {
    let p = starting.get(language)
    if (!p) {
      p = window.ventriee.lspEnsure(project.id, language).catch((error): LspStatus => ({ state: 'missing', language, install: undefined, url: cleanError(error) }))
        .then((status) => { statuses.set(language, status); if (!disposed) hooks.onStatus(language, status); if (status.state === 'ready') register(language, status.capabilities); return status })
      starting.set(language, p)
    }
    return p
  }
  const send = (language: string, method: string, params: unknown) => void window.ventriee.lspNotify(project.id, language, method, params).catch(() => {})
  const flush = (model: monaco.editor.ITextModel) => {
    const doc = docs.get(model.uri.toString())
    if (!doc?.timer) return
    clearTimeout(doc.timer); doc.timer = null
    send(doc.language, 'textDocument/didChange', { textDocument: { uri: doc.url, version: ++doc.version }, contentChanges: [{ text: model.getValue() }] })
  }
  const attach = async (model: monaco.editor.ITextModel) => {
    // Huge files (read-only views of logs and dumps) are not sent to language servers.
    if (!ours(model) || docs.has(model.uri.toString()) || model.getValueLength() > 2_000_000) return
    const language = model.getLanguageId()
    const status = await ensure(language)
    if (status.state !== 'ready' || model.isDisposed() || docs.has(model.uri.toString()) || disposed) return
    const url = fileUrl(project.path, pathOf(model))
    const doc = { language, url, version: 1, timer: null as ReturnType<typeof setTimeout> | null, subscription: model.onDidChangeContent(() => {
      if (doc.timer) clearTimeout(doc.timer)
      doc.timer = setTimeout(() => flush(model), 250)
    }) }
    docs.set(model.uri.toString(), doc)
    send(language, 'textDocument/didOpen', { textDocument: { uri: url, languageId: language, version: 1, text: model.getValue() } })
  }
  const detach = (model: monaco.editor.ITextModel) => {
    const doc = docs.get(model.uri.toString())
    if (!doc) return
    if (doc.timer) clearTimeout(doc.timer)
    doc.subscription.dispose(); docs.delete(model.uri.toString())
    send(doc.language, 'textDocument/didClose', { textDocument: { uri: doc.url } })
    monaco.editor.setModelMarkers(model, `lsp:${doc.language}`, [])
  }
  const request = async <T>(model: monaco.editor.ITextModel, method: string, params: Record<string, unknown> = {}): Promise<T | null> => {
    const doc = docs.get(model.uri.toString())
    if (!doc) return null
    flush(model)
    return window.ventriee.lspRequest(project.id, doc.language, method, { textDocument: { uri: doc.url }, ...params }).then((r) => r as T, () => null)
  }
  const modelUri = (url: string) => { const rel = relativePath(project.path, url); return rel ? fileUri(project.id, rel) : null }
  const locations = (result: unknown): monaco.languages.Location[] => {
    const list = (Array.isArray(result) ? result : result ? [result] : []) as Array<{ uri?: string; range?: Rng; targetUri?: string; targetSelectionRange?: Rng }>
    return list.flatMap((l) => { const uri = modelUri(l.uri ?? l.targetUri ?? ''); const range = l.range ?? l.targetSelectionRange; return uri && range ? [{ uri, range: toRange(range) }] : [] })
  }
  /** Monaco's peek and edit services only see loaded models; load the files a result points to. */
  const loadModels = async (uris: monaco.Uri[]) => {
    for (const uri of [...new Set(uris.map((u) => u.toString()))].slice(0, 50)) if (!monaco.editor.getModel(monaco.Uri.parse(uri))) {
      const path = monaco.Uri.parse(uri).path.slice(1)
      const file = await window.ventriee.filesRead(project.id, path).catch(() => null)
      if (file && !monaco.editor.getModel(monaco.Uri.parse(uri))) loaded.add(monaco.editor.createModel(file.text, undefined, monaco.Uri.parse(uri)))
    }
  }
  const workspaceEdit = async (edit: WorkspaceEdit | null): Promise<monaco.languages.WorkspaceEdit> => {
    const groups: Array<[string, TextEdit[]]> = [...Object.entries(edit?.changes ?? {}), ...(edit?.documentChanges ?? []).flatMap((c): Array<[string, TextEdit[]]> => (c.textDocument && c.edits ? [[c.textDocument.uri, c.edits]] : []))]
    const edits: monaco.languages.IWorkspaceTextEdit[] = []
    for (const [url, list] of groups) {
      const rel = relativePath(project.path, url)
      if (!rel) continue
      // Every touched file becomes an open, unsaved tab: the owner sees and saves each change.
      const model = await hooks.adopt(rel)
      if (model) for (const e of list) edits.push({ resource: model.uri, textEdit: { range: toRange(e.range), text: e.newText }, versionId: undefined })
    }
    return { edits }
  }
  const outline = (items: LspSymbol[]): OutlineSymbol[] => items.slice(0, 2000).map((s) => {
    const range = s.selectionRange ?? s.location?.range ?? s.range
    const full = s.range ?? s.location?.range ?? range
    return { name: s.name, detail: s.detail ?? s.containerName ?? '', kind: s.kind, line: range.start.line + 1, column: range.start.character + 1, endLine: full.end.line + 1, children: outline(s.children ?? []) }
  })

  function register(language: string, capabilities: Record<string, unknown>) {
    if (registered.has(language)) return
    registered.add(language)
    const L = monaco.languages
    const has = (key: string) => Boolean(capabilities[key])
    const completion = capabilities.completionProvider as { triggerCharacters?: string[]; resolveProvider?: boolean } | undefined
    if (completion) disposables.push(L.registerCompletionItemProvider(language, {
      triggerCharacters: completion.triggerCharacters,
      provideCompletionItems: async (model, position) => {
        if (!ours(model)) return null
        const r = await request<{ items?: unknown[]; isIncomplete?: boolean } | unknown[]>(model, 'textDocument/completion', { position: toPos(position) })
        const items = (Array.isArray(r) ? r : r?.items ?? []) as Array<{ label: string | { label: string }; kind?: number; detail?: string; documentation?: unknown; insertText?: string; insertTextFormat?: number; textEdit?: { range?: Rng; insert?: Rng; replace?: Rng; newText: string }; sortText?: string; filterText?: string; additionalTextEdits?: TextEdit[] }>
        const word = model.getWordUntilPosition(position)
        const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        return { incomplete: !Array.isArray(r) && Boolean(r?.isIncomplete), suggestions: items.slice(0, 1000).map((item) => ({
          label: typeof item.label === 'string' ? item.label : item.label.label, kind: completionKind(item.kind), detail: item.detail, documentation: markdown(item.documentation),
          insertText: item.textEdit?.newText ?? item.insertText ?? (typeof item.label === 'string' ? item.label : item.label.label),
          insertTextRules: item.insertTextFormat === 2 ? L.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: item.textEdit?.range ? toRange(item.textEdit.range) : item.textEdit?.insert && item.textEdit.replace ? { insert: toRange(item.textEdit.insert), replace: toRange(item.textEdit.replace) } : fallback,
          sortText: item.sortText, filterText: item.filterText,
          additionalTextEdits: item.additionalTextEdits?.map((e) => ({ range: toRange(e.range), text: e.newText })),
          lsp: item
        } as monaco.languages.CompletionItem)) }
      },
      resolveCompletionItem: completion.resolveProvider ? async (item) => {
        const raw = (item as { lsp?: unknown }).lsp
        if (!raw) return item
        const r = await window.ventriee.lspRequest(project.id, language, 'completionItem/resolve', raw).catch(() => null) as { detail?: string; documentation?: unknown } | null
        return r ? { ...item, detail: r.detail ?? item.detail, documentation: markdown(r.documentation) ?? item.documentation } : item
      } : undefined
    }))
    if (has('hoverProvider')) disposables.push(L.registerHoverProvider(language, { provideHover: async (model, position) => {
      if (!ours(model)) return null
      const r = await request<{ contents: unknown; range?: Rng }>(model, 'textDocument/hover', { position: toPos(position) })
      if (!r?.contents) return null
      const contents = (Array.isArray(r.contents) ? r.contents : [r.contents]).map(markdown).filter((m): m is monaco.IMarkdownString => Boolean(m?.value))
      return contents.length ? { contents, range: r.range ? toRange(r.range) : undefined } : null
    } }))
    const signature = capabilities.signatureHelpProvider as { triggerCharacters?: string[]; retriggerCharacters?: string[] } | undefined
    if (signature) disposables.push(L.registerSignatureHelpProvider(language, {
      signatureHelpTriggerCharacters: signature.triggerCharacters ?? ['(', ','], signatureHelpRetriggerCharacters: signature.retriggerCharacters,
      provideSignatureHelp: async (model, position) => {
        if (!ours(model)) return null
        const r = await request<{ signatures: Array<{ label: string; documentation?: unknown; parameters?: Array<{ label: string | [number, number]; documentation?: unknown }> }>; activeSignature?: number; activeParameter?: number }>(model, 'textDocument/signatureHelp', { position: toPos(position) })
        if (!r?.signatures?.length) return null
        return { dispose() {}, value: { activeSignature: r.activeSignature ?? 0, activeParameter: r.activeParameter ?? 0,
          signatures: r.signatures.map((s) => ({ label: s.label, documentation: markdown(s.documentation), parameters: (s.parameters ?? []).map((p) => ({ label: p.label, documentation: markdown(p.documentation) })) })) } }
      }
    }))
    if (has('definitionProvider')) disposables.push(L.registerDefinitionProvider(language, { provideDefinition: async (model, position) => {
      if (!ours(model)) return null
      const found = locations(await request(model, 'textDocument/definition', { position: toPos(position) }))
      await loadModels(found.map((l) => l.uri))
      return found
    } }))
    if (has('referencesProvider')) disposables.push(L.registerReferenceProvider(language, { provideReferences: async (model, position, context) => {
      if (!ours(model)) return null
      const found = locations(await request(model, 'textDocument/references', { position: toPos(position), context }))
      await loadModels(found.map((l) => l.uri))
      return found
    } }))
    if (has('documentHighlightProvider')) disposables.push(L.registerDocumentHighlightProvider(language, { provideDocumentHighlights: async (model, position) => {
      if (!ours(model)) return null
      const r = await request<Array<{ range: Rng; kind?: number }>>(model, 'textDocument/documentHighlight', { position: toPos(position) })
      return (r ?? []).map((h) => ({ range: toRange(h.range), kind: (h.kind ?? 1) - 1 }))
    } }))
    if (has('renameProvider')) disposables.push(L.registerRenameProvider(language, { provideRenameEdits: async (model, position, newName) => {
      if (!ours(model)) return null
      return workspaceEdit(await request<WorkspaceEdit>(model, 'textDocument/rename', { position: toPos(position), newName }))
    } }))
    const formatEdits = (r: TextEdit[] | null) => (r ?? []).map((e) => ({ range: toRange(e.range), text: e.newText }))
    if (has('documentFormattingProvider')) disposables.push(L.registerDocumentFormattingEditProvider(language, { provideDocumentFormattingEdits: async (model, options) =>
      ours(model) ? formatEdits(await request<TextEdit[]>(model, 'textDocument/formatting', { options })) : null }))
    if (has('documentRangeFormattingProvider')) disposables.push(L.registerDocumentRangeFormattingEditProvider(language, { provideDocumentRangeFormattingEdits: async (model, range, options) =>
      ours(model) ? formatEdits(await request<TextEdit[]>(model, 'textDocument/rangeFormatting', { range: toLspRange(range), options })) : null }))
    if (has('codeActionProvider')) disposables.push(L.registerCodeActionProvider(language, { provideCodeActions: async (model, range, context) => {
      if (!ours(model)) return null
      const diagnostics = context.markers.map((m) => ({ range: toLspRange(m), message: m.message, severity: m.severity === 8 ? 1 : m.severity === 4 ? 2 : 3, code: m.code }))
      const r = await request<Array<{ title: string; kind?: string; edit?: WorkspaceEdit; isPreferred?: boolean }>>(model, 'textDocument/codeAction', { range: toLspRange(range), context: { diagnostics } })
      // Only actions that carry their edit: commands would need the server to edit files behind the owner's back.
      const actions: monaco.languages.CodeAction[] = []
      for (const a of (r ?? []).filter((a) => a.edit).slice(0, 30)) actions.push({ title: a.title, kind: a.kind, isPreferred: a.isPreferred, edit: await workspaceEdit(a.edit!) })
      return { actions, dispose() {} }
    } }))
    if (has('documentSymbolProvider')) disposables.push(L.registerDocumentSymbolProvider(language, { provideDocumentSymbols: async (model) => {
      if (!ours(model)) return null
      const symbols = await request<LspSymbol[]>(model, 'textDocument/documentSymbol')
      const convert = (items: LspSymbol[]): monaco.languages.DocumentSymbol[] => items.map((s) => {
        const range = toRange(s.range ?? s.location!.range)
        return { name: s.name, detail: s.detail ?? '', kind: Math.max(0, s.kind - 1), tags: [], range, selectionRange: s.selectionRange ? toRange(s.selectionRange) : range, children: convert(s.children ?? []) }
      })
      return convert(symbols ?? [])
    } }))
    if (has('foldingRangeProvider')) disposables.push(L.registerFoldingRangeProvider(language, { provideFoldingRanges: async (model) => {
      if (!ours(model)) return null
      const r = await request<Array<{ startLine: number; endLine: number; kind?: string }>>(model, 'textDocument/foldingRange')
      return (r ?? []).map((f) => ({ start: f.startLine + 1, end: f.endLine + 1, kind: f.kind ? new L.FoldingRangeKind(f.kind) : undefined }))
    } }))
    if (has('inlayHintProvider')) disposables.push(L.registerInlayHintsProvider(language, { provideInlayHints: async (model, range) => {
      if (!ours(model)) return null
      const r = await request<Array<{ position: Pos; label: string | Array<{ value: string }>; kind?: number; paddingLeft?: boolean; paddingRight?: boolean }>>(model, 'textDocument/inlayHint', { range: toLspRange(range) })
      return { dispose() {}, hints: (r ?? []).slice(0, 2000).map((h) => ({ position: { lineNumber: h.position.line + 1, column: h.position.character + 1 },
        label: typeof h.label === 'string' ? h.label : h.label.map((p) => p.value).join(''), kind: h.kind, paddingLeft: h.paddingLeft, paddingRight: h.paddingRight })) }
    } }))
  }

  const off = window.ventriee.onLsp((e) => {
    if (disposed) return
    if (e.method === 'textDocument/publishDiagnostics') {
      const p = e.params as { uri: string; diagnostics: Array<{ range: Rng; message: string; severity?: number; source?: string; code?: string | number }> }
      const uri = modelUri(p.uri)
      const model = uri ? monaco.editor.getModel(uri) : null
      if (!model) return
      monaco.editor.setModelMarkers(model, `lsp:${e.language}`, p.diagnostics.slice(0, 1000).map((d) => ({ ...toRange(d.range), message: d.message, source: d.source, code: d.code === undefined ? undefined : String(d.code),
        severity: d.severity === 2 ? monaco.MarkerSeverity.Warning : d.severity === 3 ? monaco.MarkerSeverity.Info : d.severity === 4 ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Error })))
    } else if (e.method === '$/exit') {
      // The server stopped: forget it and reattach open files, a few times at most.
      const tries = (restarts.get(e.language) ?? 0) + 1
      restarts.set(e.language, tries)
      starting.delete(e.language); statuses.delete(e.language)
      const affected = monaco.editor.getModels().filter((m) => docs.get(m.uri.toString())?.language === e.language)
      for (const m of affected) detach(m)
      if (tries <= 3) setTimeout(() => { if (!disposed) for (const m of affected) if (!m.isDisposed()) void attach(m) }, 1000 * tries)
      else hooks.onStatus(e.language, { state: 'missing', language: e.language, url: 'The language server keeps stopping. Check its installation.' })
    }
  })
  disposables.push(monaco.editor.onDidCreateModel((m) => void attach(m)))
  disposables.push(monaco.editor.onWillDisposeModel(detach))
  disposables.push(monaco.editor.onDidChangeModelLanguage(({ model }) => { detach(model); void attach(model) }))
  for (const m of monaco.editor.getModels()) void attach(m)

  return {
    dispose() {
      disposed = true; off()
      for (const m of monaco.editor.getModels()) detach(m)
      for (const d of disposables) d.dispose()
      for (const m of loaded) if (!m.isDisposed()) m.dispose()
    },
    async symbols(model) {
      if (!docs.has(model.uri.toString()) || !caps(docs.get(model.uri.toString())!.language).documentSymbolProvider) return null
      return outline((await request<LspSymbol[]>(model, 'textDocument/documentSymbol')) ?? [])
    },
    async workspaceSymbols(query) {
      const out: Awaited<ReturnType<LspSession['workspaceSymbols']>> = []
      for (const [language, status] of statuses) {
        if (status.state !== 'ready' || !status.capabilities.workspaceSymbolProvider) continue
        const r = await window.ventriee.lspRequest(project.id, language, 'workspace/symbol', { query }).catch(() => null) as LspSymbol[] | null
        for (const s of r ?? []) {
          const path = s.location ? relativePath(project.path, s.location.uri) : null
          if (path && s.location) out.push({ name: s.name, kind: s.kind, path, line: s.location.range.start.line + 1, column: s.location.range.start.character + 1, container: s.containerName ?? '' })
        }
      }
      return out.slice(0, 200)
    },
    status: (language) => statuses.get(language)
  }
}
