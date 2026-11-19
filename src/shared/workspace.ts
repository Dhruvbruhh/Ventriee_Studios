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
export interface LineChange { kind: 'added' | 'modified' | 'deleted'; start: number; end: number }
export interface BlameLine { hash: string; author: string; time: number; summary: string }
export interface GitChange { path: string; originalPath?: string; index: string; working: string }
export interface GitState { repository: boolean; branch: string; branches: string[]; changes: GitChange[]; log: Array<{ hash: string; message: string }>; ahead: number; behind: number; remote?: string; /** Set when more changes exist than are listed. */ totalChanges?: number }
export type GitAction = 'init' | 'stage' | 'unstage' | 'commit' | 'checkout' | 'branch' | 'remote' | 'fetch' | 'pull' | 'push' | 'discard'
