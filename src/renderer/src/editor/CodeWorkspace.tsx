import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevron, IconClose, IconEdit, IconTrash } from '../icons'
import { monaco, languageFor, editorLanguages } from './monaco'
import { SourceControl } from './SourceControl'
import { findConflicts, resolveConflict } from './conflicts'
import { applyProjectTypes, clearProjectTypes, fileUri } from './intellisense'
import { GraphPanel } from '../components/GraphPanel'
import { AgentChanges } from './AgentChanges'
import { useAttachments, useVoice } from '../components/Attachments'
import { startLsp, type LspSession, type OutlineSymbol } from './lsp'
import { SYMBOL_KINDS, findSymbols, outlineFor, symbolPath } from './symbols'
import { ExtensionsPanel } from './ExtensionsPanel'
import { GitHubPanel } from './GitHubPanel'
import { KeybindingsModal } from './KeybindingsModal'
import { applyKeybindings, chordOf } from './keybindings'
import { TestsPanel, testAt, useTests } from './TestsPanel'
import { loadExtensions } from './extensions'
import type { LspStatus } from '../../../shared/catalog'
import { Preview } from '../components/Preview'
import { TerminalView, terminalOutput } from '../components/Terminal'
import { matchProblems, type MatchedProblem } from '../../../shared/problems'
import { Modal } from '../shell'
import { guard, useStore, cleanError } from '../store'
import type { CodeChangeResult, ProjectTask, TestResult, DebugBreakpoint, DebugFrame, DebugVariable, FileEntry, SearchResult, TextFile } from '../../../shared/workspace'
import type { Catalog } from '../../../shared/catalog'
import type { Project } from '../../../shared/types'

interface Tab { file: TextFile; model: monaco.editor.ITextModel; saved: string; subscription: monaco.IDisposable; view?: monaco.editor.ICodeEditorViewState | null; readOnly?: boolean }
type Change = CodeChangeResult['changes'][number]
interface Diff { path: string; original: string; modified: string; staged: boolean; label?: string; proposal?: boolean; change?: Change; restore?: string }
interface Proposal { path: string; range: monaco.IRange; versionId: number; replacement: string }
interface Problem { path: string; line: number; column: number; message: string; severity: number }
interface Command { label: string; keys?: string; run: () => void; disabled?: boolean }

type EntryAction = (entry: FileEntry) => void
function Directory({ projectId, path, depth, revision, onOpen, onRename, onDelete }: { projectId: string; path: string; depth: number; revision: number; onOpen: (path: string) => void; onRename: EntryAction; onDelete: EntryAction }) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    void window.ventriee.filesList(projectId, path).then((files) => { if (alive) { setEntries(files); setError(''); setLoading(false) } })
      .catch(() => { if (alive) { setError('Could not read this folder'); setLoading(false) } })
    return () => { alive = false }
  }, [projectId, path, revision])
  if (loading) return <p className="tree-note" role="status">Loading…</p>
  if (error) return <p className="editor-error" role="alert">{error}</p>
  if (!entries.length) return <p className="tree-note">Empty folder</p>
  return <div role="group">{entries.map((entry) => <div key={entry.path}>
    <div className="file-tree-item"><button className="file-tree-row" style={{ paddingLeft: depth * 14 + 12 }} title={entry.path}
      aria-expanded={entry.directory ? expanded.has(entry.path) : undefined}
      onClick={() => {
        if (!entry.directory) { onOpen(entry.path); return }
        setExpanded((old) => { const next = new Set(old); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next })
      }}><span className="file-glyph">{entry.directory ? <IconChevron width={12} height={12} aria-hidden style={{ transform: expanded.has(entry.path) ? undefined : 'rotate(-90deg)' }} /> : null}</span><span>{entry.name}</span></button>
      <span className="file-tree-actions"><button className="tab-close" aria-label={`Rename or move ${entry.path}`} title="Rename or move" onClick={() => onRename(entry)}><IconEdit width={12} height={12} aria-hidden /></button>
        <button className="tab-close" aria-label={`Delete ${entry.path}`} title="Move to Recycle Bin" onClick={() => onDelete(entry)}><IconTrash width={12} height={12} aria-hidden /></button></span></div>
    {entry.directory && expanded.has(entry.path) ? <Directory {...{ projectId, revision, onOpen, onRename, onDelete }} path={entry.path} depth={depth + 1} /> : null}
  </div>)}</div>
}

function DiffView({ diff }: { diff: Diff }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const original = monaco.editor.createModel(diff.original, languageFor(diff.path))
    const modified = monaco.editor.createModel(diff.modified, languageFor(diff.path))
    const editor = monaco.editor.createDiffEditor(host.current!, { automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false } })
    editor.setModel({ original, modified })
    return () => { editor.dispose(); original.dispose(); modified.dispose() }
  }, [diff])
  return <div ref={host} className="monaco-surface" aria-label={`Changes in ${diff.path}`} />
}

/** The file's symbols as a tree; the one around the cursor is marked. */
function OutlineTree({ items, current, onOpen, depth = 0 }: { items: OutlineSymbol[]; current?: OutlineSymbol; onOpen: (line: number, column: number) => void; depth?: number }) {
  return <>{items.map((s, i) => <div key={`${s.name}:${s.line}:${i}`}>
    <button className={`outline-row${s === current ? ' on' : ''}`} style={{ paddingLeft: depth * 12 + 6 }} onClick={() => onOpen(s.line, s.column)} title={`${SYMBOL_KINDS[s.kind] ?? ''} · line ${s.line}`}>
      <span className="outline-kind">{(SYMBOL_KINDS[s.kind] ?? '?').slice(0, 3)}</span> {s.name}</button>
    {s.children.length ? <OutlineTree items={s.children} current={current} onOpen={onOpen} depth={depth + 1} /> : null}</div>)}</>
}

/** A debugger variable; one with children expands on click. */
function VariableRow({ v, depth = 0 }: { v: DebugVariable; depth?: number }) {
  const [children, setChildren] = useState<DebugVariable[] | null>(null)
  const toggle = () => { if (children) setChildren(null); else if (v.ref) void window.ventriee.debugVariables(v.ref).then(setChildren, () => setChildren([])) }
  return <>
    <div className="debug-var" style={{ paddingLeft: depth * 12 }}>{v.ref ? <button className="tab-close" aria-expanded={Boolean(children)} aria-label={`Expand ${v.name}`} onClick={toggle}><IconChevron width={10} height={10} aria-hidden style={{ transform: children ? undefined : 'rotate(-90deg)' }} /></button> : null}
      <b>{v.name}</b> <span title={v.value}>{v.value}</span></div>
    {children?.map((c) => <VariableRow key={c.name} v={c} depth={depth + 1} />)}
  </>
}

export default function CodeWorkspace({ project, visible, onNavigate }: { project: Project; visible: boolean; onNavigate?: (workspace: 'plan' | 'office') => void }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const tabs = useRef<Map<string, Tab>>(new Map())
  const selected = useRef<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [, setRender] = useState(0)
  const [sidebar, setSidebar] = useState<'files' | 'search' | 'git' | 'graph' | 'agents' | 'extensions' | 'tests' | 'outline' | 'history' | 'github'>('files')
  const [versions, setVersions] = useState<Array<{ id: string; time: number; size: number }>>([])
  const tests = useTests(project.id)
  const [panel, setPanel] = useState<'terminal' | 'problems' | 'debug' | 'run' | null>(null)
  /** A command shown running in the Run panel (installs, tasks, tests); a new key starts a fresh shell. */
  const [run, setRun] = useState<{ label: string; command: string; key: number } | null>(null)
  const runInPanel = (label: string, command: string) => { setRun({ label, command, key: Date.now() }); setPanel('run') }
  const [breakpoints, setBreakpoints] = useState<Record<string, DebugBreakpoint[]>>({})
  const [debug, setDebug] = useState<{ status: 'idle' | 'starting' | 'running' | 'paused' | 'exited'; frames: DebugFrame[]; variables: DebugVariable[]; output: string; code?: number; error?: string; threads?: Array<{ id: number; name: string }>; threadId?: number }>({ status: 'idle', frames: [], variables: [], output: '' })
  const [evalText, setEvalText] = useState('')
  const [evalResult, setEvalResult] = useState('')
  const toggleBreakpoint = useRef((_path: string, _line: number) => {})
  const [markerProblems, setProblems] = useState<Problem[]>([])
  const [taskProblems, setTaskProblems] = useState<MatchedProblem[]>([])
  const [taskPick, setTaskPick] = useState<ProjectTask[] | null>(null)
  const [taskQuery, setTaskQuery] = useState('')
  const [palette, setPalette] = useState(false)
  const [command, setCommand] = useState('')
  const [findText, setFindText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [found, setFound] = useState<SearchResult | null>(null)
  const [findBusy, setFindBusy] = useState(false)
  const [findError, setFindError] = useState('')
  const searchRun = useRef(0)
  const background = useRef(new Set<monaco.editor.ITextModel>())
  const [typesInfo, setTypesInfo] = useState('')
  const loadTypes = useCallback(async () => {
    setTypesInfo('Loading project types…')
    try {
      const types = await window.ventriee.projectTypes(project.id)
      if (!mounted.current) return
      for (const model of applyProjectTypes(project.id, types)) background.current.add(model)
      const packages = new Set(types.libs.map((l) => l.path.split('/').slice(1, l.path.split('/')[1]?.startsWith('@') ? 3 : 2).join('/'))).size
      setTypesInfo(`TS: ${types.sources.length} files, ${packages} packages${types.truncated ? ' (limit reached)' : ''}`)
    } catch { if (mounted.current) setTypesInfo('') }
  }, [project.id])
  useEffect(() => { void loadTypes() }, [loadTypes])
  const [ask, setAsk] = useState(false)
  const [question, setQuestion] = useState('')
  const attach = useAttachments(project.id)
  const mic = useVoice((text) => setQuestion((q) => (q ? `${q} ${text}` : text)))
  const [asking, setAsking] = useState<'ask' | 'edit' | 'change' | null>(null)
  const [changes, setChanges] = useState<Change[]>([])
  const [reply, setReply] = useState<{ answer: string; model: string; path: string } | null>(null)
  const [askError, setAskError] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [selection, setSelection] = useState<[number, number] | null>(null)
  const [preview, setPreview] = useState(false)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 })
  const [create, setCreate] = useState<'file' | 'folder' | 'copy' | null>(null)
  const [moving, setMoving] = useState<FileEntry | null>(null)
  const [newPath, setNewPath] = useState('')
  const [quick, setQuick] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<FileEntry[]>([])
  const [searching, setSearching] = useState(false)
  const mounted = useRef(true)
  const saving = useRef(false)
  const opening = useRef(0)
  const comparing = useRef(0)
  const changed = useCallback(() => {
    useStore.setState({ editorDirty: [...tabs.current.values()].some((tab) => tab.model.getValue() !== tab.saved) })
    if (mounted.current) setRender((value) => value + 1)
  }, [])
  useEffect(() => {
    mounted.current = true
    const instance = monaco.editor.create(host.current!, { automaticLayout: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13,
      minimap: { enabled: true }, padding: { top: 12 }, scrollBeyondLastLine: false, tabSize: 2, model: null, glyphMargin: true, stickyScroll: { enabled: true } })
    editor.current = instance
    const position = instance.onDidChangeCursorPosition((event: { position: { lineNumber: number; column: number } }) => setCursor(event.position))
    const selectionSub = instance.onDidChangeCursorSelection(({ selection: s }) => setSelection(s.isEmpty() ? null : [s.startLineNumber, s.endLineNumber]))
    // Clicking the margin left of the line numbers toggles a breakpoint.
    const margin = instance.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && e.target.position && selected.current) toggleBreakpoint.current(selected.current, e.target.position.lineNumber)
    })
    return () => {
      mounted.current = false; position.dispose(); selectionSub.dispose(); margin.dispose(); instance.dispose()
      for (const tab of tabs.current.values()) { tab.subscription.dispose(); if (!background.current.has(tab.model)) tab.model.dispose() }
      for (const model of background.current) if (!model.isDisposed()) model.dispose()
      background.current.clear(); clearProjectTypes()
      tabs.current.clear(); editor.current = null; useStore.setState({ editorDirty: false })
    }
  }, [])
  const activate = (path: string) => {
    const tab = tabs.current.get(path)
    if (!tab) return
    opening.current++; comparing.current++; setLoading(false)
    const old = selected.current ? tabs.current.get(selected.current) : null
    if (old) old.view = editor.current?.saveViewState()
    selected.current = path; setActive(path); setDiff(null)
    editor.current?.setModel(tab.model)
    editor.current?.updateOptions({ readOnly: Boolean(tab.readOnly) })
    if (tab.view) editor.current?.restoreViewState(tab.view)
    editor.current?.focus()
  }
  const open = async (path: string, focus = true) => {
    const request = focus ? ++opening.current : opening.current
    if (tabs.current.has(path)) { if (focus) activate(path); return }
    setLoading(true)
    try {
      const file = await window.ventriee.filesRead(project.id, path)
      if (!mounted.current) return
      if (!tabs.current.has(path)) {
        const uri = fileUri(project.id, path)
        // A project file may already be loaded for the TypeScript service; the tab takes it over.
        const existing = monaco.editor.getModel(uri)
        if (existing && existing.getValue() !== file.text) existing.setValue(file.text)
        const model = existing ?? monaco.editor.createModel(file.text, languageFor(path), uri)
        tabs.current.set(path, { file, model, saved: model.getValue(), subscription: model.onDidChangeContent(changed) })
      }
      if (focus && request === opening.current) activate(path)
      changed()
    } catch (error) {
      // Over the edit limit: show it read-only instead of refusing (logs, data dumps, generated files).
      const large = /editor limit/.test(String(error)) ? await window.ventriee.filesReadLarge(project.id, path).catch(() => null) : null
      if (large && mounted.current && !tabs.current.has(path)) {
        const model = monaco.editor.createModel(large.text, languageFor(path), fileUri(project.id, path))
        tabs.current.set(path, { file: { path, text: '', version: '', bom: false }, model, saved: model.getValue(), subscription: { dispose() {} }, readOnly: true })
        if (focus && request === opening.current) activate(path)
        changed()
        useStore.getState().notify(`${path} is ${(large.size / 1048576).toFixed(1)} MB, so it opened read-only${large.truncated ? ' (first 10 MB)' : ''}.`, 'info')
      } else useStore.getState().notify(String(error), 'error')
    }
    finally { if (mounted.current && request === opening.current) setLoading(false) }
  }
  // Language servers for the languages in the catalog (Python, Go, Rust, C/C++, …), when installed.
  const lspSession = useRef<LspSession | null>(null)
  const [lspStatus, setLspStatus] = useState<Record<string, LspStatus>>({})
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    let alive = true
    let session: LspSession | null = null
    void startLsp(project, {
      adopt: async (path) => { await openRef.current(path, false); return tabs.current.get(path)?.model ?? null },
      onStatus: (language, status) => { if (alive) setLspStatus((all) => ({ ...all, [language]: status })) }
    }).then((s) => { if (alive) { session = s; lspSession.current = s } else s.dispose() }).catch(() => {})
    return () => { alive = false; session?.dispose(); lspSession.current = null }
  }, [project.id, project.path])
  useEffect(() => {
    // Go to definition into another project file opens it in a tab.
    const opener = monaco.editor.registerEditorOpener({ openCodeEditor: (_source, resource, selection) => {
      if (resource.scheme !== 'inmemory' || resource.authority !== project.id.toLowerCase()) return false
      const at = selection && 'startLineNumber' in selection ? selection : selection && 'lineNumber' in selection ? { startLineNumber: selection.lineNumber, startColumn: selection.column } : null
      void openAt(resource.path.slice(1), at?.startLineNumber ?? 1, at?.startColumn ?? 1)
      return true
    } })
    return () => opener.dispose()
  }, [project.id])
  const openAt = async (path: string, line: number, column: number) => {
    await open(path)
    if (selected.current !== path || !editor.current) return
    editor.current.setPosition({ lineNumber: line, column })
    editor.current.revealLineInCenter(line)
    editor.current.focus()
  }
  const runSearch = async () => {
    const query = findText.trim()
    if (!query) return
    const run = ++searchRun.current
    setFindBusy(true); setFindError('')
    try {
      const result = await window.ventriee.filesSearch(project.id, query, matchCase)
      if (mounted.current && run === searchRun.current) setFound(result)
    } catch (error) {
      if (mounted.current && run === searchRun.current) { setFound(null); setFindError(cleanError(error)) }
    } finally { if (mounted.current && run === searchRun.current) setFindBusy(false) }
  }
  /** Open tabs inside a file or folder; refuses when one has unsaved edits, so a move or delete never loses them. */
  const tabsUnder = (entry: FileEntry): string[] | null => {
    const hit = [...tabs.current.keys()].filter((p) => p === entry.path || (entry.directory && p.startsWith(`${entry.path}/`)))
    const dirty = hit.find((p) => { const t = tabs.current.get(p)!; return t.model.getValue() !== t.saved })
    if (dirty) { useStore.getState().notify(`Save or close ${dirty} first: it has unsaved edits.`, 'error'); return null }
    return hit
  }
  const trash = async (entry: FileEntry) => {
    const openTabs = tabsUnder(entry)
    if (!openTabs || !window.confirm(`Move ${entry.path} to the Recycle Bin?`)) return
    const done = await guard(() => window.ventriee.filesTrash(project.id, entry.path), `${entry.path} moved to the Recycle Bin`)
    if (done === null) return
    for (const path of openTabs) close(path)
    setRevision((v) => v + 1)
  }
  const move = async (entry: FileEntry, to: string) => {
    const openTabs = tabsUnder(entry)
    if (!openTabs) return false
    const done = await guard(() => window.ventriee.filesRename(project.id, entry.path, to))
    if (done === null) return false
    const wasActive = active
    for (const path of openTabs) close(path)
    // The file (or the active file inside a moved folder) reopens at its new path.
    if (!entry.directory && openTabs.length) void open(to)
    else if (entry.directory && wasActive && openTabs.includes(wasActive)) void open(`${to}${wasActive.slice(entry.path.length)}`)
    setRevision((v) => v + 1)
    return true
  }
  const showProposal = (p: Proposal) => {
    const tab = tabs.current.get(p.path)
    if (!tab || tab.model.isDisposed()) return
    const original = tab.model.getValue()
    const start = tab.model.getOffsetAt({ lineNumber: p.range.startLineNumber, column: p.range.startColumn })
    const end = tab.model.getOffsetAt({ lineNumber: p.range.endLineNumber, column: p.range.endColumn })
    setDiff({ path: p.path, original, modified: original.slice(0, start) + p.replacement + original.slice(end), staged: false, label: 'Agent proposal: current (left) / proposed (right)', proposal: true })
  }
  const askAgent = async (mode: 'ask' | 'edit') => {
    const path = active
    const tab = path ? tabs.current.get(path) : null
    if (!path || !tab || !editor.current || !question.trim() || asking) return
    const picked = editor.current.getSelection()
    const range = picked && !picked.isEmpty() ? picked : tab.model.getFullModelRange()
    const versionId = tab.model.getAlternativeVersionId()
    setAsking(mode); setAskError(''); setReply(null); setProposal(null)
    try {
      const result = await window.ventriee.codeAsk(project.id, { path, code: tab.model.getValueInRange(range), question, mode, images: attach.paths,
        ...(picked && !picked.isEmpty() ? { startLine: range.startLineNumber, endLine: range.endLineNumber } : {}) })
      if (!mounted.current) return
      setReply({ answer: result.answer, model: result.model, path })
      if (result.replacement !== null) {
        const next = { path, range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.endColumn }, versionId, replacement: result.replacement }
        setProposal(next); showProposal(next)
      }
    } catch (error) {
      if (mounted.current) setAskError(cleanError(error))
    } finally { if (mounted.current) setAsking(null) }
  }
  const acceptProposal = () => {
    const tab = proposal ? tabs.current.get(proposal.path) : null
    if (!proposal || !tab || tab.model.isDisposed()) return
    if (tab.model.getAlternativeVersionId() !== proposal.versionId) { setAskError('The file changed after you asked, so this edit may not fit any more. Ask again.'); return }
    // An undoable edit in the open buffer; it reaches disk only when the owner saves.
    tab.model.pushStackElement()
    tab.model.pushEditOperations([], [{ range: proposal.range, text: proposal.replacement }], () => null)
    tab.model.pushStackElement()
    setProposal(null); setDiff(null); activate(proposal.path); changed()
  }
  const askChange = async (request = question) => {
    if (!request.trim() || asking) return
    // Open tabs are the agent's context, the file being looked at first.
    const paths = [...new Set([...(active ? [active] : []), ...tabs.current.keys()])]
    setAsking('change'); setAskError(''); setReply(null); setProposal(null); setChanges([])
    try {
      const result = await window.ventriee.codeChange(project.id, { request, paths, images: attach.paths })
      if (!mounted.current) return
      setReply({ answer: result.answer, model: result.model, path: `${result.changes.length} file${result.changes.length === 1 ? '' : 's'}` })
      setChanges(result.changes)
      if (result.changes[0]) showChange(result.changes[0])
    } catch (error) {
      if (mounted.current) setAskError(cleanError(error))
    } finally { if (mounted.current) setAsking(null) }
  }
  const showChange = (c: Change) => setDiff({ path: c.path, original: c.original, modified: c.text, staged: false,
    label: c.created ? 'New file proposed by the agent' : 'Agent change: current (left) / proposed (right)', change: c })
  const dropChange = (c: Change) => { setChanges((list) => list.filter((x) => x !== c)); setDiff((d) => (d?.change === c ? null : d)) }
  /** Puts one proposed file into an editor tab as an undoable, unsaved edit. */
  const acceptChange = async (c: Change) => {
    if (c.created && (await guard(() => window.ventriee.filesCreate(project.id, c.path, false))) === null) return false
    await open(c.path)
    const tab = tabs.current.get(c.path)
    if (!tab || tab.model.isDisposed()) { setAskError(`Could not open ${c.path} to apply the change.`); return false }
    if (tab.model.getValue() !== c.original && tab.model.getValue() !== '') {
      setAskError(`${c.path} changed after you asked, so this change may not fit any more. Ask again.`); return false
    }
    tab.model.pushStackElement()
    tab.model.pushEditOperations([], [{ range: tab.model.getFullModelRange(), text: c.text }], () => null)
    tab.model.pushStackElement()
    dropChange(c); changed()
    return true
  }
  const acceptAll = async () => { for (const c of [...changes]) if (!(await acceptChange(c))) break }
  const save = async (all = false) => {
    if (saving.current) return
    saving.current = true; setBusy(true)
    let current = ''
    try {
      const targets = all ? [...tabs.current.values()] : active && tabs.current.has(active) ? [tabs.current.get(active)!] : []
      for (const tab of targets) {
        if (tab.readOnly) continue
        const text = tab.model.getValue()
        if (text === tab.saved) continue
        current = tab.file.path
        const result = await window.ventriee.filesSave(project.id, { ...tab.file, text })
        if (!mounted.current || tab.model.isDisposed()) continue
        tab.file = result; tab.saved = text
        setConflict((path) => path === current ? null : path)
      }
      changed(); setRevision((value) => value + 1)
    } catch (error) {
      if (/changed on disk/i.test(String(error)) && tabs.current.has(current)) { setConflict(current); if (current !== selected.current) activate(current) }
      else useStore.getState().notify(String(error), 'error')
    }
    finally { saving.current = false; if (mounted.current) setBusy(false) }
  }
  const reload = async () => {
    const tab = active ? tabs.current.get(active) : null
    if (!tab || (tab.saved !== tab.model.getValue() && !window.confirm('Discard your unsaved edits and reload this file from disk?'))) return
    const file = await guard(() => window.ventriee.filesRead(project.id, active!))
    if (file && mounted.current && !tab.model.isDisposed()) { tab.file = file; tab.model.setValue(file.text); tab.saved = tab.model.getValue(); setConflict(null); changed() }
  }
  const compareWithDisk = async () => {
    const tab = conflict ? tabs.current.get(conflict) : null
    const disk = tab ? await guard(() => window.ventriee.filesRead(project.id, tab.file.path)) : null
    if (tab && disk && mounted.current && !tab.model.isDisposed()) setDiff({ path: tab.file.path, original: disk.text, modified: tab.model.getValue(), staged: false, label: 'On disk (left) / your draft (right)' })
  }
  const close = (path: string) => {
    if (saving.current) return
    const tab = tabs.current.get(path)!
    if (tab.saved !== tab.model.getValue() && !window.confirm(`Discard unsaved edits to ${path}?`)) return
    if (path === active) editor.current?.setModel(null)
    tab.subscription.dispose(); tabs.current.delete(path)
    // Background models stay for the TypeScript service, back at the saved text.
    if (background.current.has(tab.model)) tab.model.setValue(tab.saved)
    else tab.model.dispose()
    if (path === conflict) setConflict(null)
    if (path === active) {
      const next = [...tabs.current.keys()].at(-1)
      if (next) activate(next); else { selected.current = null; setActive(null); setDiff(null) }
    }
    changed()
  }
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!useStore.getState().editorDirty) return
      if (!window.confirm('Discard unsaved code edits and close this window?')) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [])
  useEffect(() => {
    if (!visible) return
    const keys = (event: KeyboardEvent) => {
      // Owner shortcuts for studio commands ("studio:<palette label>").
      const chord = chordOf(event)
      const own = chord ? keybindings.find((b) => b.key === chord && b.command.startsWith('studio:')) : undefined
      const target = own ? commands.find((c) => c.label === own.command.slice(7) && !c.disabled) : undefined
      if (target) { event.preventDefault(); target.run(); return }
      // F5: continue when paused, otherwise start debugging the open file.
      if (event.key === 'F5' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); if (debug.status === 'paused') debugCommand('continue'); else if (!debugLive) void startDebug(); return }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') { event.preventDefault(); void save(event.shiftKey) }
      else if (key === 'p' && event.shiftKey) { event.preventDefault(); setCommand(''); setPalette(true) }
      else if (key === 'p') { event.preventDefault(); setQuick(true) }
      else if (key === 't' && !event.shiftKey) { event.preventDefault(); setSymbolQuery(''); setSymbolPick(true) }
      else if (event.key === '\\') { event.preventDefault(); setSplitPath((s) => (s ? null : selected.current)) }
      else if (key === 'f' && event.shiftKey) { event.preventDefault(); setSidebar('search') }
      else if (event.code === 'Backquote') { event.preventDefault(); setPanel((open) => open === 'terminal' ? null : 'terminal') }
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  })
  useEffect(() => {
    if (!quick) return
    let alive = true; setSearching(true)
    const timer = setTimeout(() => {
      void window.ventriee.filesFind(project.id, query).then((files) => { if (alive) { setMatches(files); setSearching(false) } }).catch(() => { if (alive) { setMatches([]); setSearching(false) } })
    }, 150)
    return () => { alive = false; clearTimeout(timer) }
  }, [quick, query, project.id])
  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => {
      setRevision((value) => value + 1)
      const tab = selected.current ? tabs.current.get(selected.current) : null
      if (tab && tab.saved === tab.model.getValue() && !saving.current) {
        void window.ventriee.filesRead(project.id, tab.file.path).then((file) => {
          if (mounted.current && !tab.model.isDisposed() && tab.saved === tab.model.getValue() && tab.file.version !== file.version) {
            tab.file = file; tab.model.setValue(file.text); tab.saved = tab.model.getValue(); changed()
          }
        }).catch(() => {})
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [project.id, visible, changed])
  const completionModel = useStore((s) => s.snapshot?.settings.completionModel ?? '')
  const editorTheme = useStore((s) => s.snapshot?.settings.editorTheme ?? 'ventriee')
  const keybindings = useStore((s) => s.snapshot?.settings.keybindings) ?? []
  const keybindingKey = JSON.stringify(keybindings)
  useEffect(() => { const rules = applyKeybindings(keybindings); return () => rules.dispose() }, [keybindingKey])
  const [keysOpen, setKeysOpen] = useState(false)
  const vimMode = useStore((s) => s.snapshot?.settings.vimMode ?? false)
  const vimStatus = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!vimMode || !editor.current || !vimStatus.current) return
    let vim: { dispose(): void } | null = null
    let alive = true
    void import('monaco-vim').then(({ initVimMode }) => { if (alive && editor.current && vimStatus.current) vim = initVimMode(editor.current, vimStatus.current) })
    return () => { alive = false; vim?.dispose(); if (vimStatus.current) vimStatus.current.textContent = '' }
  }, [vimMode])
  useEffect(() => { void loadExtensions(editorTheme) }, [editorTheme])
  useEffect(() => {
    if (!completionModel) return
    // Ghost-text completions (Tab accepts). Waits for a pause in typing; a newer keystroke cancels the request.
    const provider = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position, _context, token) => {
        if (model.uri.authority !== project.id.toLowerCase()) return { items: [] }
        await new Promise((resolve) => setTimeout(resolve, 300))
        if (token.isCancellationRequested) return { items: [] }
        const all = model.getValue()
        const offset = model.getOffsetAt(position)
        const text = await window.ventriee.codeComplete(project.id, { path: model.uri.path.slice(1), language: model.getLanguageId(),
          prefix: all.slice(Math.max(0, offset - 4000), offset), suffix: all.slice(offset, offset + 1500) }).catch(() => '')
        if (!text || token.isCancellationRequested) return { items: [] }
        return { items: [{ insertText: text, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] }
      },
      disposeInlineCompletions: () => {}
    })
    return () => provider.dispose()
  }, [completionModel, project.id])
  useEffect(() => {
    // Monaco's own diagnostics (TypeScript, JSON, CSS, HTML) for the files open in tabs.
    const update = () => {
      const open = new Set([...tabs.current.values()].map((tab) => tab.model.uri.toString()))
      setProblems(monaco.editor.getModelMarkers({}).filter((m) => open.has(m.resource.toString())).slice(0, 500)
        .map((m) => ({ path: m.resource.path.slice(1), line: m.startLineNumber, column: m.startColumn, message: m.message, severity: m.severity })))
    }
    const subscription = monaco.editor.onDidChangeMarkers(update)
    update()
    return () => subscription.dispose()
  }, [])
  const openDiff = async (path: string, staged: boolean) => {
    const request = ++comparing.current
    opening.current++; setLoading(false)
    const result = await guard(() => window.ventriee.gitDiff(project.id, path, staged))
    if (result && mounted.current && request === comparing.current) setDiff({ ...result, staged })
  }
  // Gutter marks: how the saved file differs from the last commit. Refreshed with the explorer tick and on save.
  const gutter = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  useEffect(() => {
    if (!active || !editor.current) return
    let alive = true
    void window.ventriee.gitLineChanges(project.id, active).then((ranges) => {
      if (!alive || selected.current !== active || !editor.current) return
      gutter.current?.clear()
      gutter.current = editor.current.createDecorationsCollection(ranges.map((r) => ({
        range: new monaco.Range(r.start, 1, r.end, 1),
        options: { isWholeLine: true, linesDecorationsClassName: `gutter-${r.kind}`, overviewRuler: { color: r.kind === 'added' ? '#79dcb4' : r.kind === 'deleted' ? '#f4796b' : '#8ab4f8', position: monaco.editor.OverviewRulerLane.Left } }
      })))
    }).catch(() => { gutter.current?.clear() })
    return () => { alive = false }
  }, [active, revision, project.id])
  // Blame for the line the cursor rests on; only for a saved buffer, where line numbers match the commit.
  const [blame, setBlame] = useState('')
  useEffect(() => {
    setBlame('')
    const current = active ? tabs.current.get(active) : null
    if (!active || !current || current.model.getValue() !== current.saved) return
    let alive = true
    const timer = setTimeout(() => {
      void window.ventriee.gitBlame(project.id, active, cursor.lineNumber).then((b) => {
        if (!alive || !b) return
        const days = b.time ? Math.round((Date.now() - b.time) / 86_400_000) : -1
        setBlame(`${b.author}${days >= 0 ? `, ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}` : ''} · ${b.summary}`)
      }).catch(() => {})
    }, 500)
    return () => { alive = false; clearTimeout(timer) }
  }, [active, cursor.lineNumber, revision, project.id])
  // ---------- debugger ----------
  const debugLive = debug.status === 'running' || debug.status === 'paused' || debug.status === 'starting'
  const updateBreakpoints = (path: string, change: (list: DebugBreakpoint[]) => DebugBreakpoint[]) => setBreakpoints((all) => {
    const next = change(all[path] ?? []).sort((a, b) => a.line - b.line)
    if (debugLive) void window.ventriee.debugBreakpoints(path, next).catch(() => {})
    return { ...all, [path]: next }
  })
  toggleBreakpoint.current = (path, line) => updateBreakpoints(path, (list) => list.some((b) => b.line === line) ? list.filter((b) => b.line !== line) : [...list, { line }])
  useEffect(() => window.ventriee.onDebug((e) => {
    if (!mounted.current) return
    if (e.type === 'output') setDebug((d) => ({ ...d, output: (d.output + e.text).slice(-40_000) }))
    else if (e.type === 'running') setDebug((d) => ({ ...d, status: 'running', frames: [], variables: [] }))
    else if (e.type === 'exited') setDebug((d) => ({ ...d, status: 'exited', code: e.code, frames: [], variables: [] }))
    else if (e.type === 'paused') {
      setDebug((d) => ({ ...d, status: 'paused', frames: e.frames, variables: e.variables, threads: e.threads, threadId: e.threadId }))
      setEvalResult('')
      const top = e.frames.find((f) => !f.internal)
      if (top) void openAt(top.path, top.line, top.column)
    }
  }), [])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => { void window.ventriee.toolCatalog().then(setCatalog).catch(() => {}) }, [])
  const [launchConfigs, setLaunchConfigs] = useState<Array<{ name: string; type: string }>>([])
  const [launchConfig, setLaunchConfig] = useState('')
  useEffect(() => { if (panel === 'debug') void window.ventriee.debugConfigs(project.id).then(setLaunchConfigs).catch(() => setLaunchConfigs([])) }, [panel, project.id])
  const activeLanguageId = active ? tabs.current.get(active)?.model.getLanguageId() ?? '' : ''
  const debuggerSpec = catalog?.debuggers.find((d) => d.languages.includes(activeLanguageId))
  const debuggable = ['javascript', 'typescript'].includes(activeLanguageId) || Boolean(debuggerSpec)
  const startDebug = async () => {
    if (!launchConfig && !active) return
    if (!launchConfig && !debuggable) { useStore.getState().notify(`No debugger is known for ${activeLanguageId || 'this file'}. Add one in .vscode/launch.json or install an extension that provides it.`, 'info'); return }
    setPanel('debug'); setEvalResult('')
    setDebug({ status: 'starting', frames: [], variables: [], output: '' })
    try { await window.ventriee.debugStart(project.id, { file: active ?? '', language: activeLanguageId, config: launchConfig || undefined }, breakpoints) } catch (error) {
      if (mounted.current) setDebug({ status: 'idle', frames: [], variables: [], output: '', error: cleanError(error) })
    }
  }
  const debugCommand = (action: 'continue' | 'over' | 'into' | 'out' | 'pause') => void window.ventriee.debugCommand(action).catch(() => {})
  // Breakpoint dots in the margin and the line the program is paused on.
  const debugMarks = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  useEffect(() => {
    if (!editor.current || !active) return
    const paused = debug.status === 'paused' ? debug.frames.find((f) => !f.internal && f.path === active) : undefined
    debugMarks.current?.clear()
    debugMarks.current = editor.current.createDecorationsCollection([
      ...(breakpoints[active] ?? []).map((b) => ({ range: new monaco.Range(b.line, 1, b.line, 1), options: { glyphMarginClassName: b.logMessage ? 'bp-dot bp-log' : b.condition ? 'bp-dot bp-cond' : 'bp-dot',
        glyphMarginHoverMessage: { value: b.logMessage ? `Logpoint: ${b.logMessage}` : b.condition ? `Breakpoint when ${b.condition}` : 'Breakpoint (click to remove; add a condition in the Debug panel)' } } })),
      ...(paused ? [{ range: new monaco.Range(paused.line, 1, paused.line, 1), options: { isWholeLine: true, className: 'debug-current-line', glyphMarginClassName: 'debug-arrow' } }] : [])
    ])
  }, [breakpoints, active, debug])
  // Pass/fail marks next to tests in the open file.
  const testMarks = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  useEffect(() => {
    testMarks.current?.clear()
    if (!editor.current || !active) return
    testMarks.current = editor.current.createDecorationsCollection(tests.results.filter((r) => r.file === active && r.line).map((r) => ({ range: new monaco.Range(r.line!, 1, r.line!, 1),
      options: { linesDecorationsClassName: `test-mark test-${r.status}`, hoverMessage: { value: `${r.status === 'passed' ? '✓ Passed' : r.status === 'failed' ? '✗ Failed' : 'Skipped'}: ${r.name}${r.message ? `\n\n\`\`\`\n${r.message.slice(0, 2000)}\n\`\`\`` : ''}` } } })))
  }, [tests.results, active])
  const fixTest = async (r: TestResult) => {
    if (r.file) await openAt(r.file, r.line ?? 1, 1)
    setAsk(true); setPreview(false)
    const request = `The test "${r.name}"${r.file ? ` in ${r.file}` : ''} fails. Fix the code (or the test, only if the test itself is wrong). Failure output:\n${(r.message ?? '').slice(0, 6000)}`
    setQuestion(request)
    await askChange(request)
  }
  /** The project's Prettier (with its config) when installed, otherwise Monaco's own formatter. One undoable edit. */
  const formatDocument = async () => {
    const current = active ? tabs.current.get(active) : null
    if (!active || !current || !editor.current) return
    const text = current.model.getValue()
    let formatted: string | null
    try { formatted = await window.ventriee.toolsFormat(project.id, active, text) } catch (error) {
      // Prettier's own message (usually a syntax error in the file), not a silent fallback.
      useStore.getState().notify(cleanError(error), 'error'); return
    }
    if (formatted === null) { void editor.current?.getAction('editor.action.formatDocument')?.run(); return }
    if (current.model.isDisposed() || current.model.getValue() !== text || formatted === text) return
    current.model.pushStackElement()
    current.model.pushEditOperations([], [{ range: current.model.getFullModelRange(), text: formatted }], () => null)
    current.model.pushStackElement()
    changed()
  }
  // ESLint findings on open and after each save, from the project's own ESLint and config.
  const activeVersion = active ? tabs.current.get(active)?.file.version : undefined
  useEffect(() => {
    const current = active ? tabs.current.get(active) : null
    if (!active || !current || !/\.(m|c)?(j|t)sx?$|\.vue$/.test(active)) return
    let alive = true
    void window.ventriee.toolsLint(project.id, active, current.model.getValue()).then((found) => {
      if (!alive || current.model.isDisposed()) return
      monaco.editor.setModelMarkers(current.model, 'eslint', found.map((m) => ({ startLineNumber: m.line, startColumn: m.column, endLineNumber: m.endLine, endColumn: m.endColumn, message: m.message, source: 'eslint',
        severity: m.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning })))
    }).catch(() => {})
    return () => { alive = false }
  }, [active, activeVersion, project.id])
  const tab = active ? tabs.current.get(active) : null
  // The merge conflict under the cursor, if any, with one-click resolutions.
  const conflictHere = tab && !diff ? findConflicts(tab.model.getValue()).find((c) => cursor.lineNumber >= c.start && cursor.lineNumber <= c.end) : undefined
  const resolveHere = (choice: 'current' | 'incoming' | 'both') => {
    if (!tab || !conflictHere) return
    const text = resolveConflict(tab.model.getValue(), conflictHere, choice)
    tab.model.pushStackElement()
    tab.model.pushEditOperations([], [{ range: new monaco.Range(conflictHere.start, 1, conflictHere.end, tab.model.getLineMaxColumn(conflictHere.end)), text }], () => null)
    tab.model.pushStackElement()
    changed()
  }
  const activeLanguage = tab?.model.getLanguageId()
  const status = activeLanguage ? lspStatus[activeLanguage] : undefined
  const languageStatus = !status || status.state === 'none' ? null
    : status.state === 'ready' ? <span title="Language server running for this file">{status.server} ●</span>
    : status.install ? <button className="status-btn" title={`Runs: ${status.install}`} onClick={() => runInPanel(`Install ${status.language} support`, status.install!)}>Install {status.language} support</button>
    : status.url?.startsWith('http') ? <button className="status-btn" onClick={() => window.open(status.url)}>Get {status.language} support</button>
    : <span title={status.url}>{status.language}: no language server</span>
  // Compiler and linter output of the running task becomes problems; files not open in a tab are listed too.
  useEffect(() => {
    if (!run) { setTaskProblems([]); return }
    const root = project.path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const toProject = (p: string) => {
      const path = p.replace(/\\/g, '/').replace(/^\.\//, '')
      if (!/^([A-Za-z]:)?\//.test(path)) return path.includes('..') ? null : path
      return path.toLowerCase().startsWith(`${root}/`) ? path.slice(root.length + 1) : null
    }
    let last = ''
    const timer = setInterval(() => {
      const output = terminalOutput(project.id, `run-${run.key}`)
      if (output === last) return
      last = output
      const found = matchProblems(output, toProject)
      setTaskProblems(found)
      for (const [path, t] of tabs.current) monaco.editor.setModelMarkers(t.model, 'task', found.filter((p) => p.path === path).map((p) => ({ startLineNumber: p.line, startColumn: p.column, endLineNumber: p.line, endColumn: p.column + 1, message: p.message,
        severity: p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, source: run.label })))
    }, 1500)
    return () => clearInterval(timer)
  }, [run, project.id, project.path])
  const problems: Problem[] = [...markerProblems, ...taskProblems.filter((p) => !tabs.current.has(p.path)).map((p) => ({ path: p.path, line: p.line, column: p.column, message: p.message, severity: p.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning }))]
  const openTasks = () => { setTaskQuery(''); void guard(() => window.ventriee.tasksList(project.id)).then((list) => { if (list) setTaskPick(list) }) }
  const shownTasks = (taskPick ?? []).filter((t) => `${t.label} ${t.command}`.toLowerCase().includes(taskQuery.trim().toLowerCase()))
  // Outline of the open file (language server or TypeScript), refreshed after edits; drives the breadcrumb.
  const [outline, setOutline] = useState<OutlineSymbol[]>([])
  useEffect(() => {
    const model = active ? tabs.current.get(active)?.model : null
    if (!model) { setOutline([]); return }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = () => void outlineFor(model, lspSession.current).then((o) => { if (alive) setOutline(o ?? []) })
    load()
    const sub = model.onDidChangeContent(() => { if (timer) clearTimeout(timer); timer = setTimeout(load, 700) })
    return () => { alive = false; sub.dispose(); if (timer) clearTimeout(timer) }
  }, [active, lspStatus])
  const crumbs = symbolPath(outline, cursor.lineNumber)
  // Workspace symbols (Ctrl+T).
  const [symbolPick, setSymbolPick] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')
  const [symbolHits, setSymbolHits] = useState<Awaited<ReturnType<typeof findSymbols>>>([])
  useEffect(() => {
    if (!symbolPick) return
    let alive = true
    const timer = setTimeout(() => void findSymbols(symbolQuery, lspSession.current, project.id).then((hits) => { if (alive) setSymbolHits(hits) }), 200)
    return () => { alive = false; clearTimeout(timer) }
  }, [symbolPick, symbolQuery, project.id])
  // A second editor beside the first, showing any open tab; both edit the same buffer.
  const [splitPath, setSplitPath] = useState<string | null>(null)
  const splitHost = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const model = splitPath ? tabs.current.get(splitPath)?.model : null
    if (!model || !splitHost.current) return
    const second = monaco.editor.create(splitHost.current, { model, automaticLayout: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, minimap: { enabled: false }, padding: { top: 12 }, scrollBeyondLastLine: false, tabSize: 2, stickyScroll: { enabled: true } })
    const gone = model.onWillDispose(() => setSplitPath(null))
    return () => { gone.dispose(); second.dispose() }
  }, [splitPath])
  useEffect(() => {
    if (sidebar !== 'history' || !active) { setVersions([]); return }
    let alive = true
    void window.ventriee.historyList(project.id, active).then((v) => { if (alive) setVersions(v) }).catch(() => {})
    return () => { alive = false }
  }, [sidebar, active, revision, project.id])
  const compareVersion = async (id: string, time: number) => {
    const current = active ? tabs.current.get(active) : null
    const text = active ? await guard(() => window.ventriee.historyRead(project.id, active, id)) : null
    if (current && text !== null && active) setDiff({ path: active, original: text, modified: current.model.getValue(), staged: false, label: `Saved ${new Date(time).toLocaleString()} (left) / now (right)`, restore: text })
  }
  const restoreVersion = (text: string) => {
    const current = active ? tabs.current.get(active) : null
    if (!current || current.model.isDisposed()) return
    // An undoable edit; it reaches disk when the owner saves.
    current.model.pushStackElement()
    current.model.pushEditOperations([], [{ range: current.model.getFullModelRange(), text }], () => null)
    current.model.pushStackElement()
    setDiff(null); changed()
  }
  const errors = problems.filter((p) => p.severity === monaco.MarkerSeverity.Error).length
  const commands: Command[] = [
    { label: 'File: Save', keys: 'Ctrl+S', run: () => void save(), disabled: !tab },
    { label: 'File: Save all', keys: 'Ctrl+Shift+S', run: () => void save(true) },
    { label: 'File: Save a copy', run: () => { setNewPath(''); setCreate('copy') }, disabled: !tab },
    { label: 'File: Reload from disk', run: () => void reload(), disabled: !tab },
    { label: 'File: Close editor', run: () => { if (active) close(active) }, disabled: !active },
    { label: 'File: New file', run: () => { setNewPath(''); setCreate('file') } },
    { label: 'File: New folder', run: () => { setNewPath(''); setCreate('folder') } },
    { label: 'Go to file', keys: 'Ctrl+P', run: () => setQuick(true) },
    { label: 'Search: Find in files', keys: 'Ctrl+Shift+F', run: () => setSidebar('search') },
    { label: 'View: Explorer', run: () => setSidebar('files') },
    { label: 'View: Source Control', run: () => setSidebar('git') },
    { label: 'View: Agent changes', run: () => setSidebar('agents') },
    { label: 'View: Extensions', run: () => setSidebar('extensions') },
    { label: 'View: Tests', run: () => setSidebar('tests') },
    { label: 'View: Outline', run: () => setSidebar('outline') },
    { label: 'View: Local history', run: () => setSidebar('history') },
    { label: 'View: GitHub pull requests and issues', run: () => setSidebar('github') },
    { label: 'Go to symbol in workspace', keys: 'Ctrl+T', run: () => { setSymbolQuery(''); setSymbolPick(true) } },
    { label: 'Go to symbol in file', keys: 'Ctrl+Shift+O', run: () => { editor.current?.focus(); void editor.current?.getAction('editor.action.quickOutline')?.run() }, disabled: !tab },
    { label: splitPath ? 'View: Close split editor' : 'View: Split editor right', keys: 'Ctrl+\\', run: () => setSplitPath(splitPath ? null : active), disabled: !splitPath && !active },
    { label: 'Tasks: Run task…', run: openTasks },
    { label: 'Preferences: Keyboard shortcuts', run: () => setKeysOpen(true) },
    { label: `Preferences: ${vimMode ? 'Turn off' : 'Turn on'} Vim mode`, run: () => void guard(() => window.ventriee.saveSettings({ vimMode: !vimMode })) },
    { label: 'Test: Run all tests', run: () => { setSidebar('tests'); tests.run() }, disabled: !tests.runner },
    { label: 'Test: Run tests in this file', run: () => { setSidebar('tests'); tests.run({ file: active! }) }, disabled: !tests.runner || !active },
    { label: 'Test: Run the test at the cursor', run: () => { const name = tab ? testAt(tab.model.getValue(), cursor.lineNumber) : null; if (name) { setSidebar('tests'); tests.run({ name }) } else useStore.getState().notify('No test found above the cursor', 'info') }, disabled: !tests.runner || !tab },
    { label: 'View: Toggle terminal', keys: 'Ctrl+`', run: () => setPanel((open) => open === 'terminal' ? null : 'terminal') },
    { label: 'View: Problems', run: () => setPanel('problems') },
    { label: `View: ${preview ? 'Hide' : 'Show'} preview`, run: () => { setPreview(!preview); setAsk(false) } },
    { label: 'Agent: Ask about this code', run: () => { setAsk(true); setPreview(false); setTimeout(() => document.querySelector<HTMLTextAreaElement>('[aria-label="Question for the agent"]')?.focus()) }, disabled: !tab },
    { label: 'Editor: Find in file', keys: 'Ctrl+F', run: () => { editor.current?.focus(); void editor.current?.getAction('actions.find')?.run() }, disabled: !tab },
    { label: 'Editor: Reload project types', run: () => void loadTypes() },
    { label: 'Debug: Start debugging this file', keys: 'F5', run: () => void startDebug(), disabled: !active },
    { label: 'Editor: Format document', keys: 'Shift+Alt+F', run: () => void formatDocument(), disabled: !tab },
    ...(onNavigate ? [{ label: 'Studio: Go to Plan', run: () => onNavigate('plan') }, { label: 'Studio: Go to Office', run: () => onNavigate('office') }] : [])
  ]
  const shownCommands = commands.filter((c) => !c.disabled && c.label.toLowerCase().includes(command.trim().toLowerCase()))
  const runCommand = (c: Command) => { setPalette(false); c.run() }
  const grouped = found ? [...found.hits.reduce((map, hit) => map.set(hit.path, [...(map.get(hit.path) ?? []), hit]), new Map<string, SearchResult['hits']>())] : []
  return <div className={`code-workspace${preview || ask ? ' with-preview' : ''}`} style={{ display: visible ? undefined : 'none' }}>
    <aside className="code-sidebar"><div className="code-sidebar-tabs"><button className={sidebar === 'files' ? 'on' : ''} onClick={() => setSidebar('files')}>Explorer</button><button className={sidebar === 'search' ? 'on' : ''} onClick={() => setSidebar('search')}>Search</button><button className={sidebar === 'git' ? 'on' : ''} onClick={() => setSidebar('git')} aria-label="Source Control" title="Source Control">Git</button><button className={sidebar === 'graph' ? 'on' : ''} onClick={() => setSidebar('graph')} aria-label="Knowledge graph" title="Knowledge graph (graphify)">Graph</button><button className={sidebar === 'agents' ? 'on' : ''} onClick={() => setSidebar('agents')} aria-label="Agent changes" title="Files changed by agent tasks">Agents</button><button className={sidebar === 'outline' ? 'on' : ''} onClick={() => setSidebar('outline')} aria-label="Outline" title="Symbols in this file">Outline</button><button className={sidebar === 'history' ? 'on' : ''} onClick={() => setSidebar('history')} aria-label="Local history" title="Saved versions of this file">History</button><button className={sidebar === 'github' ? 'on' : ''} onClick={() => setSidebar('github')} aria-label="GitHub" title="Pull requests and issues">GitHub</button><button className={sidebar === 'tests' ? 'on' : ''} onClick={() => setSidebar('tests')} aria-label="Tests" title="Run and see tests">Tests</button><button className={sidebar === 'extensions' ? 'on' : ''} onClick={() => setSidebar('extensions')} aria-label="Extensions" title="Extensions from Open VSX">Ext</button></div>
      {sidebar === 'files' ? <><div className="code-section-head"><strong title={project.path}>{project.name}</strong><button className="btn tiny" onClick={() => setRevision((v) => v + 1)}>Refresh</button></div>
        <div className="code-file-actions"><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('file') }}>New file</button><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('folder') }}>New folder</button><button className="btn tiny" onClick={() => setQuick(true)}>Find file</button></div>
        <div className="file-tree" aria-label="Project files"><Directory projectId={project.id} path="" depth={0} revision={revision} onOpen={(path) => void open(path)} onRename={(entry) => { setNewPath(entry.path); setMoving(entry) }} onDelete={(entry) => void trash(entry)} /></div></>
        : sidebar === 'search' ? <div className="code-search">
          <form onSubmit={(event) => { event.preventDefault(); void runSearch() }}>
            <input className="input" autoFocus aria-label="Search text in project files" placeholder="Search in files" value={findText} onChange={(e) => setFindText(e.target.value)} maxLength={200} />
            <div className="code-search-row"><label><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label><button className="btn tiny primary" disabled={findBusy || !findText.trim()}>{findBusy ? 'Searching…' : 'Search'}</button></div>
          </form>
          {findError ? <p className="editor-error" role="alert">{findError}</p> : null}
          {found ? <p className="tree-note" role="status">{found.hits.length} result{found.hits.length === 1 ? '' : 's'} in {grouped.length} file{grouped.length === 1 ? '' : 's'} · {found.filesSearched} searched{found.truncated ? ' · stopped at the limit, refine the search' : ''}</p> : <p className="tree-note">Searches text files up to 2 MB. Dependency and build folders are skipped.</p>}
          <div className="code-search-results">{grouped.map(([path, hits]) => <section key={path}><h4 title={path}>{path}</h4>
            {hits.map((hit) => <button key={`${hit.line}:${hit.column}`} onClick={() => void openAt(hit.path, hit.line, hit.column)} title={`${path}:${hit.line}`}><span className="dim">{hit.line}</span> {hit.preview}</button>)}</section>)}</div>
        </div>
        : sidebar === 'extensions' ? <ExtensionsPanel />
        : sidebar === 'outline' ? <div className="ext-panel" aria-label="Outline">{outline.length ? <OutlineTree items={outline} current={crumbs.at(-1)} onOpen={(line, column) => { if (active) void openAt(active, line, column) }} />
          : <p className="tree-note">{active ? 'No symbols in this file. TypeScript and JavaScript work out of the box; other languages need their language server.' : 'Open a file to see its outline.'}</p>}</div>
        : sidebar === 'history' ? <div className="ext-panel" aria-label="Local history">{active ? <><p className="tree-note">Every save of {active.split('/').pop()} is kept for 30 days (up to 50 versions), outside the project.</p>
          {versions.length ? versions.map((v) => <button key={v.id} className="outline-row" onClick={() => void compareVersion(v.id, v.time)}>{new Date(v.time).toLocaleString()} <span className="dim">{(v.size / 1024).toFixed(1)} KB</span></button>)
            : <p className="tree-note">No saved versions yet.</p>}</> : <p className="tree-note">Open a file to see its saved versions.</p>}</div>
        : sidebar === 'github' ? <GitHubPanel projectId={project.id} />
        : sidebar === 'tests' ? <TestsPanel tests={tests} onOpen={(path, line) => void openAt(path, line, 1)} onFix={(r) => void fixTest(r)} />
        : sidebar === 'agents' ? <AgentChanges projectId={project.id} onDiff={(path) => void openDiff(path, false)} onOpen={(path) => void open(path)} />
        : sidebar === 'graph' ? <GraphPanel projectId={project.id} />
        : <SourceControl projectId={project.id} refreshKey={revision} onDiff={(path, staged) => void openDiff(path, staged)} onOpen={(path) => void open(path)} />}
    </aside>
    <section className={`code-main${panel ? ' with-panel' : ''}`} aria-label="Code editor">
      <div className="code-tabs" role="tablist" aria-label="Open files">{[...tabs.current].map(([path, value]) => <div className={`code-tab${path === active && !diff ? ' on' : ''}`} key={path}>
        <button role="tab" aria-selected={path === active && !diff} title={path} onClick={() => activate(path)}>{path.split('/').at(-1)}{value.saved !== value.model.getValue() ? <span aria-label="Unsaved"> ●</span> : null}</button><button className="tab-close" onClick={() => close(path)} aria-label={`Close ${path}`}><IconClose width={12} height={12} aria-hidden /></button></div>)}</div>
      <div className="code-toolbar"><span className="code-breadcrumb" title={diff?.path ?? active ?? project.path}>{diff ? `${diff.label ?? (diff.staged ? 'Staged' : 'Working tree')} / ${diff.path}` : active ? [active.split('/').join(' › '), ...crumbs.map((c) => c.name)].join(' › ') : 'Open a file to begin'}</span>
        {diff?.change ? <><button className="btn tiny" onClick={() => dropChange(diff.change!)}>Reject</button><button className="btn tiny primary" onClick={() => void acceptChange(diff.change!)}>Accept into editor</button></>
          : diff?.proposal && proposal ? <><button className="btn tiny" onClick={() => { setProposal(null); setDiff(null) }}>Reject</button><button className="btn tiny primary" onClick={acceptProposal}>Accept into editor</button></>
          : diff?.restore !== undefined ? <><button className="btn tiny" onClick={() => setDiff(null)}>Back to editor</button><button className="btn tiny primary" onClick={() => restoreVersion(diff.restore!)}>Restore this version</button></>
          : diff ? <button className="btn tiny" onClick={() => setDiff(null)}>Back to editor</button> : <><button className="btn tiny" disabled={!tab || busy} onClick={() => void reload()}>Reload</button><button className="btn tiny" disabled={!tab || busy} onClick={() => { setNewPath(''); setCreate('copy') }}>Save copy</button><button className="btn tiny primary" disabled={!tab || busy || tab.saved === tab.model.getValue()} onClick={() => void save()}>Save</button></>}
        <button className="btn tiny" aria-pressed={ask} onClick={() => { setAsk(!ask); setPreview(false) }}>Ask agent</button>
        <button className="btn tiny" aria-pressed={preview} onClick={() => { setPreview(!preview); setAsk(false) }}>{preview ? 'Hide preview' : 'Show preview'}</button></div>
      <div className="code-editor-body">{conflictHere ? <div className="editor-conflict merge" role="region" aria-label="Merge conflict"><span>Merge conflict at lines {conflictHere.start}–{conflictHere.end}. Keep which side?</span>
        <button className="btn tiny" onClick={() => resolveHere('current')}>Accept current</button><button className="btn tiny" onClick={() => resolveHere('incoming')}>Accept incoming</button><button className="btn tiny" onClick={() => resolveHere('both')}>Accept both</button></div> : null}
        {conflict && conflict === active && !diff ? <div className="editor-conflict" role="alert"><span>{conflict} changed on disk after you opened it. Your edits are kept here and were not saved.</span>
        <button className="btn tiny" onClick={() => void compareWithDisk()}>Compare with disk</button><button className="btn tiny" onClick={() => void reload()}>Reload from disk</button><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('copy') }}>Save a copy</button></div> : null}
        <div ref={host} className={`monaco-surface${splitPath && !diff ? ' split-left' : ''}`} style={{ visibility: active && !diff ? 'visible' : 'hidden' }} />
        {splitPath && !diff ? <div className="split-pane"><div className="split-head"><select aria-label="File in the split editor" value={splitPath} onChange={(e) => setSplitPath(e.target.value)}>{[...tabs.current.keys()].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <button className="tab-close" aria-label="Close split editor" onClick={() => setSplitPath(null)}><IconClose width={12} height={12} aria-hidden /></button></div><div ref={splitHost} className="split-surface" key={splitPath} /></div> : null}
        {diff ? <DiffView diff={diff} /> : !active ? <div className="code-welcome"><span className="code-welcome-symbol">{'{ }'}</span><h2>Your code, in one place</h2><p>Open a file in Explorer or press Ctrl+P.</p><p>Ctrl+S to save · Ctrl+F to find · Ctrl+H to replace</p><p>UTF-8 text files up to 2 MB. Language runtimes are installed separately.</p></div> : null}
        {loading ? <div className="editor-loading" role="status">Opening file…</div> : null}</div>
      {panel || run ? <section className="code-panel" aria-label="Panel" style={{ display: panel ? undefined : 'none' }}>
        <div className="code-panel-tabs" role="tablist"><button role="tab" aria-selected={panel === 'terminal'} className={panel === 'terminal' ? 'on' : ''} onClick={() => setPanel('terminal')}>Terminal</button>
          <button role="tab" aria-selected={panel === 'problems'} className={panel === 'problems' ? 'on' : ''} onClick={() => setPanel('problems')}>Problems <span className="badge">{problems.length}</span></button>
          <button role="tab" aria-selected={panel === 'debug'} className={panel === 'debug' ? 'on' : ''} onClick={() => setPanel('debug')}>Debug{debugLive ? <span className="badge">{debug.status}</span> : null}</button>
          {run ? <button role="tab" aria-selected={panel === 'run'} className={panel === 'run' ? 'on' : ''} onClick={() => setPanel('run')} title={run.command}>{run.label}</button> : null}
          <span className="grow" /><button className="tab-close" aria-label="Close panel" onClick={() => setPanel(null)}><IconClose width={12} height={12} aria-hidden /></button></div>
        {run ? <div className="code-run" style={{ display: panel === 'run' ? undefined : 'none' }}><TerminalView key={run.key} projectId={project.id} slot={`run-${run.key}`} label={run.label} command={run.command} closeOnUnmount /></div> : null}
        {panel === 'run' ? null : panel === 'terminal' ? <TerminalView projectId={project.id} slot="panel" label="Terminal" />
          : panel === 'debug' ? <div className="code-debug">
            <div className="debug-bar">
              {debugLive ? <button className="btn tiny" onClick={() => void window.ventriee.debugStop()}>Stop</button>
                : <><select aria-label="Debug configuration" value={launchConfig} onChange={(e) => setLaunchConfig(e.target.value)} disabled={!launchConfigs.length} title="Configurations come from .vscode/launch.json and .ventriee/launch.json">
                  <option value="">Current file</option>{launchConfigs.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
                  <button className="btn tiny primary" disabled={!launchConfig && (!active || !debuggable)} onClick={() => void startDebug()} title={launchConfig ? `Start "${launchConfig}"` : `Run the open file under ${debuggerSpec?.name ?? 'the Node.js debugger'}`}>{launchConfig ? 'Start' : `Debug ${active?.split('/').pop() ?? 'file'}`}</button></>}
              <button className="btn tiny" disabled={debug.status !== 'paused'} onClick={() => debugCommand('continue')}>Continue</button>
              <button className="btn tiny" disabled={debug.status !== 'paused'} onClick={() => debugCommand('over')}>Step over</button>
              <button className="btn tiny" disabled={debug.status !== 'paused'} onClick={() => debugCommand('into')}>Step into</button>
              <button className="btn tiny" disabled={debug.status !== 'paused'} onClick={() => debugCommand('out')}>Step out</button>
              <button className="btn tiny" disabled={debug.status !== 'running'} onClick={() => debugCommand('pause')}>Pause</button>
              <span className="tree-note" role="status">{debug.error ? '' : debug.status === 'exited' ? `Exited with code ${debug.code}` : debug.status === 'idle' ? 'Click the margin left of a line number to set a breakpoint, then Debug. JavaScript/TypeScript, Python, Go, C/C++ and Rust, with your installed tools.' : debug.status === 'paused' ? 'Paused' : debug.status === 'starting' ? 'Starting…' : 'Running'}</span>
            </div>
            {debug.error ? <p className="editor-error" role="alert">{debug.error}{(() => { const command = debuggerSpec?.install?.command; const install = typeof command === 'string' ? command : command?.[navigator.platform.startsWith('Win') ? 'win32' : navigator.platform.startsWith('Mac') ? 'darwin' : 'linux'] ?? command?.default
              return install && /not installed|No module named/i.test(debug.error) ? <> <button className="btn tiny" onClick={() => runInPanel(`Install ${debuggerSpec!.name}`, install)}>Install debugger</button></> : null })()}</p> : null}
            <div className="debug-columns">
              <section aria-label="Call stack"><h4>Call stack</h4>
                {debug.threads && debug.threads.length > 1 ? <select aria-label="Thread" value={debug.threadId} onChange={(e) => void window.ventriee.debugThread(Number(e.target.value)).catch(() => {})}>{debug.threads.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select> : null}
                {debug.frames.filter((f) => !f.internal).map((f, i) => <button key={i} onClick={() => void openAt(f.path, f.line, f.column)}><b>{f.name}</b> <span className="dim">{f.path}:{f.line}</span></button>)}
                <h4>Breakpoints</h4>{Object.entries(breakpoints).flatMap(([path, list]) => list.map((b) => <div className="debug-bp" key={`${path}:${b.line}`}>
                  <button className="change-path" onClick={() => void openAt(path, b.line, 1)}>{path.split('/').pop()}:{b.line}</button>
                  <input className="input mono" aria-label={`Condition or log message for ${path}:${b.line}`} placeholder="condition, or log: message {expr}" defaultValue={b.logMessage ? `log: ${b.logMessage}` : b.condition ?? ''}
                    onBlur={(e) => { const v = e.target.value.trim(); updateBreakpoints(path, (all) => all.map((x) => x.line === b.line ? { line: x.line, ...(v.startsWith('log:') ? { logMessage: v.slice(4).trim() } : v ? { condition: v } : {}) } : x)) }} />
                  <button className="tab-close" aria-label={`Remove breakpoint ${path}:${b.line}`} onClick={() => toggleBreakpoint.current(path, b.line)}><IconClose width={10} height={10} aria-hidden /></button></div>))}</section>
              <section aria-label="Variables"><h4>Variables</h4>{debug.variables.map((v) => <VariableRow key={`${v.scope}:${v.name}`} v={v} />)}
                {debug.status === 'paused' ? <form onSubmit={(e) => { e.preventDefault(); void window.ventriee.debugEvaluate(evalText).then(setEvalResult, (err) => setEvalResult(String(err))) }}>
                  <input className="input mono" aria-label="Expression to evaluate" placeholder="Evaluate an expression" value={evalText} onChange={(e) => setEvalText(e.target.value)} />
                  {evalResult ? <div className="debug-var"><b>=</b> <span>{evalResult}</span></div> : null}</form> : null}</section>
              <section aria-label="Program output"><h4>Output</h4><pre className="debug-output">{debug.output || ' '}</pre></section>
            </div>
          </div>
          : <div className="code-problems">{problems.length ? problems.map((p, i) => <button key={i} onClick={() => void openAt(p.path, p.line, p.column)}>
            <b className={p.severity === monaco.MarkerSeverity.Error ? 'problem-error' : 'problem-warn'}>{p.severity === monaco.MarkerSeverity.Error ? 'Error' : p.severity === monaco.MarkerSeverity.Warning ? 'Warning' : 'Info'}</b>
            <span>{p.message}</span><span className="dim">{p.path}:{p.line}</span></button>) : <p className="code-empty">No problems in open files. Diagnostics come from Monaco's built-in TypeScript, JavaScript, JSON, CSS and HTML support.</p>}</div>}
      </section> : null}
      <footer className="code-status"><span>{busy ? 'Saving…' : tab && tab.saved !== tab.model.getValue() ? 'Unsaved changes' : 'Saved'}</span>
        <button className="status-btn" onClick={() => setPanel((open) => open === 'problems' ? null : 'problems')} aria-label={`${problems.length} problems`}>{errors} errors · {problems.length - errors} warnings</button>
        <button className="status-btn" onClick={() => setPanel((open) => open === 'terminal' ? null : 'terminal')}>Terminal</button>
        <button className="status-btn" onClick={openTasks} title="Run a task from tasks.json, package.json, Makefile, Go or Cargo">Tasks</button>
        <button className="status-btn" onClick={() => { setCommand(''); setPalette(true) }} title="Command palette (Ctrl+Shift+P)">Commands</button><span className="grow" />{blame ? <span className="status-blame" title={blame}>{blame}</span> : null}{typesInfo ? <span title="Files and installed packages the TypeScript service knows about">{typesInfo}</span> : null}{languageStatus}<span ref={vimStatus} className="vim-status" aria-live="polite" /><span>Ln {cursor.lineNumber}, Col {cursor.column}</span><span>UTF-8{tab?.file.bom ? ' BOM' : ''}</span>
        <select aria-label="Editor language" value={tab?.model.getLanguageId() ?? 'plaintext'} disabled={!tab || Boolean(diff)} onChange={(e) => { if (tab) { monaco.editor.setModelLanguage(tab.model, e.target.value); changed() } }}>
          {editorLanguages().sort((a, b) => a.id.localeCompare(b.id)).map((lang) => <option value={lang.id} key={lang.id}>{lang.aliases?.[0] ?? lang.id}</option>)}
        </select></footer>
    </section>
    {ask ? <aside className="code-ask" aria-label="Ask agent">
      <div className="code-section-head"><strong>ASK AGENT</strong><button className="tab-close" aria-label="Close Ask agent" onClick={() => setAsk(false)}><IconClose width={12} height={12} aria-hidden /></button></div>
      <p className="tree-note">{tab && active ? `About ${selection ? `lines ${selection[0]}–${selection[1]} of` : 'all of'} ${active}. Select code to narrow it.` : 'Open a file first.'} Answers come from the planner model in Settings; nothing is saved until you save.</p>
      <textarea className="textarea" aria-label="Question for the agent" rows={4} maxLength={4000} placeholder="Explain this, find the bug, add error handling…" value={question} onChange={(e) => setQuestion(e.target.value)} {...attach.handlers}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void askAgent('ask') } }} />
      {attach.strip}
      <div className="code-ask-actions">{attach.button}{mic}<button className="btn" disabled={!tab || !question.trim() || Boolean(asking)} onClick={() => void askAgent('ask')}>{asking === 'ask' ? 'Asking…' : 'Ask'}</button>
        <button className="btn" disabled={!tab || !question.trim() || Boolean(asking)} onClick={() => void askAgent('edit')}>{asking === 'edit' ? 'Writing edit…' : 'Propose edit'}</button>
        <button className="btn primary" disabled={!question.trim() || Boolean(asking)} onClick={() => void askChange()} title="Change or create several files; your open tabs are the context">{asking === 'change' ? 'Changing files…' : 'Change files'}</button></div>
      {askError ? <p className="editor-error" role="alert">{askError}</p> : null}
      {asking ? <p className="tree-note" role="status">Waiting for the model. This can take a minute.</p> : null}
      {reply ? <div className="code-ask-reply"><small className="dim">{reply.model} · {reply.path}</small><div className="code-ask-text">{reply.answer || 'The agent sent only the edit.'}</div>
        {proposal ? <button className="btn tiny" onClick={() => showProposal(proposal)}>Review proposed edit</button> : null}</div> : null}
      {changes.length ? <div className="code-ask-reply" aria-label="Proposed file changes"><b>{changes.length} file{changes.length === 1 ? '' : 's'} to review</b>
        {changes.map((c) => <div className="change-row" key={c.path}><button className="change-path" onClick={() => showChange(c)} title={`Review ${c.path}`}>{c.created ? <span className="badge">new</span> : null} {c.path}</button>
          <button className="btn tiny" onClick={() => dropChange(c)}>Reject</button><button className="btn tiny primary" onClick={() => void acceptChange(c)}>Accept</button></div>)}
        <button className="btn tiny" onClick={() => void acceptAll()}>Accept all into the editor</button></div> : null}
    </aside> : preview ? <aside className="code-preview"><Preview /></aside> : null}
    {create ? <Modal title={create === 'copy' ? 'Save a copy' : `New ${create}`} onClose={() => setCreate(null)} narrow><form onSubmit={(event) => {
      event.preventDefault(); if (busy) return; setBusy(true)
      const copy = create === 'copy' && tab ? { text: tab.model.getValue(), bom: tab.file.bom } : null
      void guard(async () => {
        await window.ventriee.filesCreate(project.id, newPath, create === 'folder')
        if (copy) {
          const blank = await window.ventriee.filesRead(project.id, newPath)
          await window.ventriee.filesSave(project.id, { ...blank, ...copy })
        }
      }).then((result) => {
        if (result !== null) { if (create !== 'folder') void open(newPath); setCreate(null); setRevision((v) => v + 1) }
      }).finally(() => setBusy(false))
    }}><label className="field-label" htmlFor="new-file-path">Path relative to project root</label><input id="new-file-path" className="input" autoFocus value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder={create !== 'folder' ? 'src/example.ts' : 'src/components'} required /><p className="hint">The parent folder must already exist.</p><button className="btn primary" disabled={busy || !newPath.trim()}>{create === 'copy' ? 'Save copy' : `Create ${create}`}</button></form></Modal> : null}
    {palette ? <Modal title="Command palette" onClose={() => setPalette(false)} narrow><input className="input" autoFocus aria-label="Type a command" placeholder="Type a command…" value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter' && shownCommands[0]) { event.preventDefault(); runCommand(shownCommands[0]) }
      if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector<HTMLButtonElement>('.palette-list button')?.focus() }
    }} />
      <div className="quick-files palette-list" onKeyDown={(event) => {
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const at = items.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'ArrowDown' && at < items.length - 1) { event.preventDefault(); items[at + 1].focus() }
        if (event.key === 'ArrowUp') { event.preventDefault(); if (at > 0) items[at - 1].focus(); else document.querySelector<HTMLInputElement>('[aria-label="Type a command"]')?.focus() }
      }}>{shownCommands.length ? shownCommands.map((c) => <button key={c.label} onClick={() => runCommand(c)}><span>{c.label}</span>{c.keys ? <kbd>{c.keys}</kbd> : null}</button>) : <p>No matching commands.</p>}</div></Modal> : null}
    {moving ? <Modal title={`Rename or move ${moving.directory ? 'folder' : 'file'}`} onClose={() => setMoving(null)} narrow><form onSubmit={(event) => {
      event.preventDefault(); if (busy) return; setBusy(true)
      void move(moving, newPath.trim()).then((ok) => { if (ok) setMoving(null) }).finally(() => setBusy(false))
    }}><label className="field-label" htmlFor="move-path">New path, relative to the project</label>
      <input id="move-path" className="input" autoFocus value={newPath} onChange={(e) => setNewPath(e.target.value)} onFocus={(e) => { const name = e.target.value.lastIndexOf('/') + 1; e.target.setSelectionRange(name, e.target.value.length) }} required />
      <p className="hint">Change the name to rename it. Change the folders in the path to move it; the destination folder must exist.</p>
      <button className="btn primary" disabled={busy || !newPath.trim() || newPath.trim() === moving.path}>Rename</button></form></Modal> : null}
    {keysOpen ? <KeybindingsModal bindings={keybindings} onClose={() => setKeysOpen(false)} onSave={(next) => void guard(() => window.ventriee.saveSettings({ keybindings: next }))}
      commands={[...commands.filter((c) => !c.label.startsWith('Preferences: Turn')).map((c) => ({ id: `studio:${c.label}`, label: c.label, keys: c.keys })),
        ...(editor.current?.getSupportedActions() ?? []).map((a) => ({ id: a.id, label: `Editor: ${a.label}` }))]} /> : null}
    {symbolPick ? <Modal title="Go to symbol" onClose={() => setSymbolPick(false)} narrow><input className="input" autoFocus aria-label="Find a symbol" placeholder="Class, function, method…" value={symbolQuery} onChange={(e) => setSymbolQuery(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && symbolHits[0]) { e.preventDefault(); void openAt(symbolHits[0].path, symbolHits[0].line, symbolHits[0].column); setSymbolPick(false) } }} />
      <div className="quick-files">{symbolHits.map((h, i) => <button key={i} onClick={() => { void openAt(h.path, h.line, h.column); setSymbolPick(false) }}><span>{h.name} <small className="dim">{SYMBOL_KINDS[h.kind]}</small></span> <small className="dim">{h.path}:{h.line}</small></button>)}
        {symbolQuery.trim() && !symbolHits.length ? <p>No matching symbols.</p> : null}</div>
      <p className="hint">TypeScript and JavaScript project files, plus what running language servers know.</p></Modal> : null}
    {taskPick ? <Modal title="Run a task" onClose={() => setTaskPick(null)} narrow><input className="input" autoFocus aria-label="Find a task" placeholder="Filter tasks…" value={taskQuery} onChange={(e) => setTaskQuery(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && shownTasks[0]) { e.preventDefault(); runInPanel(shownTasks[0].label, shownTasks[0].command); setTaskPick(null) } }} />
      <div className="quick-files">{shownTasks.length ? shownTasks.map((t) => <button key={`${t.source}:${t.label}`} title={t.detail ?? t.command} onClick={() => { runInPanel(t.label, t.command); setTaskPick(null) }}><span>{t.label}</span> <small className="dim">{t.source}</small></button>)
        : <p>{taskPick.length ? 'No matching tasks.' : 'This project defines no tasks. Add .vscode/tasks.json, package.json scripts, or a Makefile.'}</p>}</div>
      <p className="hint">Runs in the Run panel. Errors from tsc, ESLint, gcc/clang, Rust and Go appear in Problems.</p></Modal> : null}
    {quick ? <Modal title="Go to file" onClose={() => setQuick(false)} narrow><input className="input" autoFocus aria-label="Find a file by path" placeholder="Search file paths…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter' && matches[0] && !searching) { event.preventDefault(); void open(matches[0].path); setQuick(false) }
      if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector<HTMLButtonElement>('.quick-files button')?.focus() }
    }} />
      <div className="quick-files">{searching ? <p role="status">Searching…</p> : matches.length ? matches.map((file) => <button key={file.path} onClick={() => { void open(file.path); setQuick(false) }}>{file.path}</button>) : <p>No matching files.</p>}</div><p className="hint">Up to 100 results across 5,000 entries. Dependency and build folders are hidden.</p></Modal> : null}
  </div>
}
