export interface FileEntry { name: string; path: string; directory: boolean }
export interface CodeAskInput { path: string; code: string; question: string; mode: 'ask' | 'edit'; startLine?: number; endLine?: number }
export interface CodeCompleteInput { path: string; language: string; prefix: string; suffix: string }
export interface CodeChangeInput { request: string; paths: string[] }
export interface CodeChangeResult { answer: string; model: string; changes: Array<{ path: string; original: string; text: string; created: boolean }> }
export interface CodeAskResult { answer: string; replacement: string | null; model: string }
export interface SearchHit { path: string; line: number; column: number; preview: string }
export interface SearchResult { hits: SearchHit[]; filesSearched: number; truncated: boolean }
export interface TextFile { path: string; text: string; version: string; bom: boolean }
export interface ProjectTypes { sources: Array<{ path: string; text: string }>; libs: Array<{ path: string; text: string }>; compilerOptions: Record<string, unknown>; truncated: boolean }
export interface DebugFrame { name: string; path: string; line: number; column: number; internal: boolean }
/** `ref` > 0: the value has children, fetched with debugVariables(ref). */
export interface DebugVariable { name: string; value: string; scope: string; ref?: number }
export interface DebugBreakpoint { line: number; condition?: string; logMessage?: string }
export interface DebugStartInput { file: string; language: string; /** a launch.json configuration name; default: debug the current file */ config?: string }
export type DebugEvent = { type: 'running' } | { type: 'paused'; reason: string; frames: DebugFrame[]; variables: DebugVariable[]; threads?: Array<{ id: number; name: string }>; threadId?: number } | { type: 'output'; text: string } | { type: 'exited'; code: number }
export interface LintMessage { line: number; column: number; endLine: number; endColumn: number; severity: 'error' | 'warning'; message: string }
export interface LineChange { kind: 'added' | 'modified' | 'deleted'; start: number; end: number }
export interface BlameLine { hash: string; author: string; time: number; summary: string }
export interface GitChange { path: string; originalPath?: string; index: string; working: string }
export interface GitState { repository: boolean; branch: string; branches: string[]; changes: GitChange[]; log: Array<{ hash: string; message: string }>; ahead: number; behind: number; remote?: string; /** Set when more changes exist than are listed. */ totalChanges?: number }
export type GitAction = 'init' | 'stage' | 'unstage' | 'commit' | 'checkout' | 'branch' | 'remote' | 'fetch' | 'pull' | 'push' | 'discard'

export interface ExtensionSearchHit { id: string; name: string; publisher: string; version: string; description: string; downloads: number; icon: string | null }
export interface ExtensionInfo { id: string; name: string; publisher: string; version: string; description: string; enabled: boolean; supported: string[]; needsRuntime: boolean }
export interface ExtensionContributions {
  themes: Array<{ id: string; label: string; dark: boolean; colors: Record<string, string>; tokenColors: unknown[] }>
  snippets: Array<{ language: string; snippets: Record<string, { prefix: string | string[]; body: string | string[]; description?: string }> }>
  languages: Array<{ id: string; extensions?: string[]; filenames?: string[]; aliases?: string[]; configuration?: Record<string, unknown> }>
  grammars: Array<{ language?: string; scopeName: string; path: string; content: string }>
}
export interface TestResult { name: string; suite: string; file?: string; line?: number; status: 'passed' | 'failed' | 'skipped'; duration?: number; message?: string }
export type TestEvent = { type: 'started'; command: string } | { type: 'output'; text: string } | { type: 'done'; code: number; results: TestResult[] }
export interface ProjectTask { label: string; command: string; source: string; detail?: string }
export type GithubAction =
  | { kind: 'prs' } | { kind: 'issues' } | { kind: 'pr'; number: number } | { kind: 'issue'; number: number } | { kind: 'diff'; number: number }
  | { kind: 'checkout'; number: number } | { kind: 'review'; number: number; event: 'approve' | 'request-changes' | 'comment'; body: string }
  | { kind: 'comment'; number: number; body: string; issue?: boolean } | { kind: 'merge'; number: number; method: 'merge' | 'squash' | 'rebase' }

