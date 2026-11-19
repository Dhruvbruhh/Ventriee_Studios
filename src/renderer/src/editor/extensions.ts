import { INITIAL, Registry, parseRawGrammar, type IGrammar, type StateStack } from 'vscode-textmate'
import { OnigScanner, OnigString, loadWASM } from 'vscode-oniguruma'
import onigUrl from 'vscode-oniguruma/release/onig.wasm?url'
import { monaco } from './monaco'
import type { ExtensionContributions } from '../../../shared/workspace'

/** Turns installed extensions' data (themes, snippets, languages, TextMate grammars) into Monaco features. */

type ThemeData = ExtensionContributions['themes'][number]
const hex = (c: unknown) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null)

/** A VS Code color theme as a Monaco theme. Rules match TextMate scopes and, by their first segment, Monaco's own token names. */
export function toMonacoTheme(theme: ThemeData): monaco.editor.IStandaloneThemeData {
  const rules: monaco.editor.ITokenThemeRule[] = []
  const seen = new Set<string>()
  for (const entry of theme.tokenColors as Array<{ scope?: string | string[]; settings?: { foreground?: string; background?: string; fontStyle?: string } }>) {
    const scopes = typeof entry.scope === 'string' ? entry.scope.split(',') : entry.scope ?? ['']
    const fg = hex(entry.settings?.foreground)
    for (const raw of scopes.map((s) => s.trim())) {
      const scope = raw.split(' ').at(-1)!
      const rule = { token: scope, foreground: fg?.slice(1), fontStyle: entry.settings?.fontStyle }
      rules.push(rule)
      const head = scope.split('.')[0]
      if (scope && !seen.has(head)) { seen.add(head); rules.push({ ...rule, token: head }) }
    }
  }
  const colors = Object.fromEntries(Object.entries(theme.colors ?? {}).filter(([, v]) => hex(v)))
  return { base: theme.dark ? 'vs-dark' : 'vs', inherit: true, rules, colors }
}

const regex = (v: unknown) => { try { return typeof v === 'string' ? new RegExp(v) : v && typeof v === 'object' && 'pattern' in v ? new RegExp(String((v as { pattern: string }).pattern), String((v as { flags?: string }).flags ?? '')) : undefined } catch { return undefined } }
const pairs = (list: unknown) => Array.isArray(list) ? list.map((p) => (Array.isArray(p) ? { open: p[0], close: p[1] } : p as { open: string; close: string })) : undefined

/** A VS Code language-configuration.json as Monaco's language configuration. */
export function toLanguageConfiguration(c: Record<string, unknown>): monaco.languages.LanguageConfiguration {
  const comments = c.comments as { lineComment?: string; blockComment?: [string, string] } | undefined
  const indentation = c.indentationRules as Record<string, unknown> | undefined
  const folding = c.folding as { markers?: { start: unknown; end: unknown } } | undefined
  return {
    comments, brackets: Array.isArray(c.brackets) ? c.brackets as [string, string][] : undefined,
    autoClosingPairs: pairs(c.autoClosingPairs), surroundingPairs: pairs(c.surroundingPairs), wordPattern: regex(c.wordPattern),
    indentationRules: indentation && regex(indentation.increaseIndentPattern) && regex(indentation.decreaseIndentPattern)
      ? { increaseIndentPattern: regex(indentation.increaseIndentPattern)!, decreaseIndentPattern: regex(indentation.decreaseIndentPattern)! } : undefined,
    folding: folding?.markers && regex(folding.markers.start) && regex(folding.markers.end) ? { markers: { start: regex(folding.markers.start)!, end: regex(folding.markers.end)! } } : undefined
  }
}

let onig: Promise<void> | null = null
class TokenState implements monaco.languages.IState {
  constructor(public stack: StateStack) {}
  clone() { return new TokenState(this.stack) }
  equals(other: monaco.languages.IState) { return other instanceof TokenState && other.stack === this.stack }
}

let applied: monaco.IDisposable[] = []
export let extensionThemes: Array<{ id: string; label: string }> = []

export async function applyContributions(c: ExtensionContributions) {
  for (const d of applied) d.dispose()
  applied = []
  extensionThemes = c.themes.map((t) => ({ id: t.id, label: t.label }))
  for (const t of c.themes) { try { monaco.editor.defineTheme(themeName(t.id), toMonacoTheme(t)) } catch { /* a malformed theme is skipped */ } }

  const known = new Set(monaco.languages.getLanguages().map((l) => l.id))
  const added = new Set<string>()
  for (const l of c.languages) {
    if (!known.has(l.id) && !added.has(l.id)) { monaco.languages.register({ id: l.id, extensions: l.extensions, filenames: l.filenames, aliases: l.aliases }); added.add(l.id) }
    if (l.configuration && !known.has(l.id)) applied.push(monaco.languages.setLanguageConfiguration(l.id, toLanguageConfiguration(l.configuration)))
  }

  for (const s of c.snippets) applied.push(monaco.languages.registerCompletionItemProvider(s.language, { provideCompletionItems: (model, position) => {
    const word = model.getWordUntilPosition(position)
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    return { suggestions: Object.entries(s.snippets).flatMap(([name, snip]) => (Array.isArray(snip.prefix) ? snip.prefix : [snip.prefix]).filter(Boolean).map((prefix) => ({
      label: prefix, kind: monaco.languages.CompletionItemKind.Snippet, detail: name, documentation: snip.description,
      insertText: Array.isArray(snip.body) ? snip.body.join('\n') : snip.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range }))) }
  } }))

  // TextMate grammars, only for languages Monaco has no highlighter for: its own tokenizers stay in charge of the rest.
  const grammars = c.grammars.filter((g) => g.language && added.has(g.language))
  if (!grammars.length) return
  onig ??= fetch(onigUrl).then((r) => r.arrayBuffer()).then((data) => loadWASM(data))
  await onig
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner: (patterns: string[]) => new OnigScanner(patterns), createOnigString: (s: string) => new OnigString(s) }),
    loadGrammar: async (scopeName) => { const g = c.grammars.find((x) => x.scopeName === scopeName); return g ? parseRawGrammar(g.content, g.path) : null }
  })
  for (const g of grammars) {
    const grammar: IGrammar | null = await registry.loadGrammar(g.scopeName).catch(() => null)
    if (!grammar) continue
    applied.push(monaco.languages.setTokensProvider(g.language!, {
      getInitialState: () => new TokenState(INITIAL),
      tokenize: (line, state) => {
        const r = grammar.tokenizeLine(line, (state as TokenState).stack, 50)
        return { endState: new TokenState(r.ruleStack), tokens: r.tokens.map((t) => ({ startIndex: t.startIndex, scopes: t.scopes.at(-1) ?? '' })) }
      }
    }))
  }
}

export const themeName = (id: string) => (id === 'ventriee' ? 'ventriee' : `ext-${id.replace(/[^\w-]/g, '-')}`)

/** Loads installed extensions into Monaco, then applies the chosen editor theme (the built-in one when it is gone). */
export async function loadExtensions(theme: string) {
  await applyContributions(await window.ventriee.extContributions()).catch(() => {})
  monaco.editor.setTheme(extensionThemes.some((t) => t.id === theme) ? themeName(theme) : 'ventriee')
}
