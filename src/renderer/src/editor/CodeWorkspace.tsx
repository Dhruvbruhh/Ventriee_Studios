import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevron, IconClose, IconEdit, IconTrash } from '../icons'
import { monaco, languageFor, editorLanguages } from './monaco'
import { SourceControl } from './SourceControl'
import { AgentChanges } from './AgentChanges'
import { Preview } from '../components/Preview'
import { TerminalView } from '../components/Terminal'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import type { FileEntry, SearchResult, TextFile } from '../../../shared/workspace'
import type { Project } from '../../../shared/types'

interface Tab { file: TextFile; model: monaco.editor.ITextModel; saved: string; subscription: monaco.IDisposable; view?: monaco.editor.ICodeEditorViewState | null }
interface Diff { path: string; original: string; modified: string; staged: boolean; label?: string; proposal?: boolean }
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
    const editor = monaco.editor.createDiffEditor(host.current!, { theme: 'ventriee', automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false } })
    editor.setModel({ original, modified })
    return () => { editor.dispose(); original.dispose(); modified.dispose() }
  }, [diff])
  return <div ref={host} className="monaco-surface" aria-label={`Changes in ${diff.path}`} />
}

export default function CodeWorkspace({ project, visible, onNavigate }: { project: Project; visible: boolean; onNavigate?: (workspace: 'plan' | 'office') => void }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const tabs = useRef<Map<string, Tab>>(new Map())
  const selected = useRef<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [, setRender] = useState(0)
  const [sidebar, setSidebar] = useState<'files' | 'search' | 'git' | 'agents'>('files')
  const [panel, setPanel] = useState<'terminal' | 'problems' | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [palette, setPalette] = useState(false)
  const [command, setCommand] = useState('')
  const [findText, setFindText] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [found, setFound] = useState<SearchResult | null>(null)
  const [findBusy, setFindBusy] = useState(false)
  const [findError, setFindError] = useState('')
  const searchRun = useRef(0)
  const [ask, setAsk] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState<'ask' | 'edit' | null>(null)
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
    const instance = monaco.editor.create(host.current!, { theme: 'ventriee', automaticLayout: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13,
      minimap: { enabled: true }, padding: { top: 12 }, scrollBeyondLastLine: false, tabSize: 2, model: null })
    editor.current = instance
    const position = instance.onDidChangeCursorPosition((event: { position: { lineNumber: number; column: number } }) => setCursor(event.position))
    const selected = instance.onDidChangeCursorSelection(({ selection: s }) => setSelection(s.isEmpty() ? null : [s.startLineNumber, s.endLineNumber]))
    return () => {
      mounted.current = false; position.dispose(); selected.dispose(); instance.dispose()
      for (const tab of tabs.current.values()) { tab.subscription.dispose(); tab.model.dispose() }
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
    if (tab.view) editor.current?.restoreViewState(tab.view)
    editor.current?.focus()
  }
  const open = async (path: string) => {
    const request = ++opening.current
    if (tabs.current.has(path)) { activate(path); return }
    setLoading(true)
    try {
      const file = await window.ventriee.filesRead(project.id, path)
      if (!mounted.current) return
      if (!tabs.current.has(path)) {
        const uri = monaco.Uri.from({ scheme: 'inmemory', authority: project.id, path: `/${path}` })
        const model = monaco.editor.createModel(file.text, languageFor(path), uri)
        tabs.current.set(path, { file, model, saved: model.getValue(), subscription: model.onDidChangeContent(changed) })
      }
      if (request === opening.current) activate(path)
      changed()
    } catch (error) { useStore.getState().notify(String(error), 'error') }
    finally { if (mounted.current && request === opening.current) setLoading(false) }
  }
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
      if (mounted.current && run === searchRun.current) { setFound(null); setFindError(String(error).replace(/^Error invoking remote method '[^']+':\s*(Error: )?/, '')) }
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
      const result = await window.ventriee.codeAsk(project.id, { path, code: tab.model.getValueInRange(range), question, mode,
        ...(picked && !picked.isEmpty() ? { startLine: range.startLineNumber, endLine: range.endLineNumber } : {}) })
      if (!mounted.current) return
      setReply({ answer: result.answer, model: result.model, path })
      if (result.replacement !== null) {
        const next = { path, range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.endColumn }, versionId, replacement: result.replacement }
        setProposal(next); showProposal(next)
      }
    } catch (error) {
      if (mounted.current) setAskError(String(error).replace(/^Error invoking remote method '[^']+':\s*(Error: )?/, ''))
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
  const save = async (all = false) => {
    if (saving.current) return
    saving.current = true; setBusy(true)
    let current = ''
    try {
      const targets = all ? [...tabs.current.values()] : active && tabs.current.has(active) ? [tabs.current.get(active)!] : []
      for (const tab of targets) {
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
    tab.subscription.dispose(); tab.model.dispose(); tabs.current.delete(path)
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
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') { event.preventDefault(); void save(event.shiftKey) }
      else if (key === 'p' && event.shiftKey) { event.preventDefault(); setCommand(''); setPalette(true) }
      else if (key === 'p') { event.preventDefault(); setQuick(true) }
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
  const tab = active ? tabs.current.get(active) : null
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
    { label: 'View: Toggle terminal', keys: 'Ctrl+`', run: () => setPanel((open) => open === 'terminal' ? null : 'terminal') },
    { label: 'View: Problems', run: () => setPanel('problems') },
    { label: `View: ${preview ? 'Hide' : 'Show'} preview`, run: () => { setPreview(!preview); setAsk(false) } },
    { label: 'Agent: Ask about this code', run: () => { setAsk(true); setPreview(false); setTimeout(() => document.querySelector<HTMLTextAreaElement>('[aria-label="Question for the agent"]')?.focus()) }, disabled: !tab },
    { label: 'Editor: Find in file', keys: 'Ctrl+F', run: () => { editor.current?.focus(); void editor.current?.getAction('actions.find')?.run() }, disabled: !tab },
    { label: 'Editor: Format document', run: () => { void editor.current?.getAction('editor.action.formatDocument')?.run() }, disabled: !tab },
    ...(onNavigate ? [{ label: 'Studio: Go to Plan', run: () => onNavigate('plan') }, { label: 'Studio: Go to Office', run: () => onNavigate('office') }] : [])
  ]
  const shownCommands = commands.filter((c) => !c.disabled && c.label.toLowerCase().includes(command.trim().toLowerCase()))
  const runCommand = (c: Command) => { setPalette(false); c.run() }
  const grouped = found ? [...found.hits.reduce((map, hit) => map.set(hit.path, [...(map.get(hit.path) ?? []), hit]), new Map<string, SearchResult['hits']>())] : []
  return <div className={`code-workspace${preview || ask ? ' with-preview' : ''}`} style={{ display: visible ? undefined : 'none' }}>
    <aside className="code-sidebar"><div className="code-sidebar-tabs"><button className={sidebar === 'files' ? 'on' : ''} onClick={() => setSidebar('files')}>Explorer</button><button className={sidebar === 'search' ? 'on' : ''} onClick={() => setSidebar('search')}>Search</button><button className={sidebar === 'git' ? 'on' : ''} onClick={() => setSidebar('git')} aria-label="Source Control" title="Source Control">Git</button><button className={sidebar === 'agents' ? 'on' : ''} onClick={() => setSidebar('agents')} aria-label="Agent changes" title="Files changed by agent tasks">Agents</button></div>
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
        : sidebar === 'agents' ? <AgentChanges projectId={project.id} onDiff={(path) => void openDiff(path, false)} onOpen={(path) => void open(path)} />
        : <SourceControl projectId={project.id} refreshKey={revision} onDiff={(path, staged) => void openDiff(path, staged)} onOpen={(path) => void open(path)} />}
    </aside>
    <section className={`code-main${panel ? ' with-panel' : ''}`} aria-label="Code editor">
      <div className="code-tabs" role="tablist" aria-label="Open files">{[...tabs.current].map(([path, value]) => <div className={`code-tab${path === active && !diff ? ' on' : ''}`} key={path}>
        <button role="tab" aria-selected={path === active && !diff} title={path} onClick={() => activate(path)}>{path.split('/').at(-1)}{value.saved !== value.model.getValue() ? <span aria-label="Unsaved"> ●</span> : null}</button><button className="tab-close" onClick={() => close(path)} aria-label={`Close ${path}`}><IconClose width={12} height={12} aria-hidden /></button></div>)}</div>
      <div className="code-toolbar"><span className="code-breadcrumb" title={diff?.path ?? active ?? project.path}>{diff ? `${diff.label ?? (diff.staged ? 'Staged' : 'Working tree')} / ${diff.path}` : active ?? 'Open a file to begin'}</span>
        {diff?.proposal && proposal ? <><button className="btn tiny" onClick={() => { setProposal(null); setDiff(null) }}>Reject</button><button className="btn tiny primary" onClick={acceptProposal}>Accept into editor</button></>
          : diff ? <button className="btn tiny" onClick={() => setDiff(null)}>Back to editor</button> : <><button className="btn tiny" disabled={!tab || busy} onClick={() => void reload()}>Reload</button><button className="btn tiny" disabled={!tab || busy} onClick={() => { setNewPath(''); setCreate('copy') }}>Save copy</button><button className="btn tiny primary" disabled={!tab || busy || tab.saved === tab.model.getValue()} onClick={() => void save()}>Save</button></>}
        <button className="btn tiny" aria-pressed={ask} onClick={() => { setAsk(!ask); setPreview(false) }}>Ask agent</button>
        <button className="btn tiny" aria-pressed={preview} onClick={() => { setPreview(!preview); setAsk(false) }}>{preview ? 'Hide preview' : 'Show preview'}</button></div>
      <div className="code-editor-body">{conflict && conflict === active && !diff ? <div className="editor-conflict" role="alert"><span>{conflict} changed on disk after you opened it. Your edits are kept here and were not saved.</span>
        <button className="btn tiny" onClick={() => void compareWithDisk()}>Compare with disk</button><button className="btn tiny" onClick={() => void reload()}>Reload from disk</button><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('copy') }}>Save a copy</button></div> : null}
        <div ref={host} className="monaco-surface" style={{ visibility: active && !diff ? 'visible' : 'hidden' }} />
        {diff ? <DiffView diff={diff} /> : !active ? <div className="code-welcome"><span className="code-welcome-symbol">{'{ }'}</span><h2>Your code, in one place</h2><p>Open a file in Explorer or press Ctrl+P.</p><p>Ctrl+S to save · Ctrl+F to find · Ctrl+H to replace</p><p>UTF-8 text files up to 2 MB. Language runtimes are installed separately.</p></div> : null}
        {loading ? <div className="editor-loading" role="status">Opening file…</div> : null}</div>
      {panel ? <section className="code-panel" aria-label="Panel">
        <div className="code-panel-tabs" role="tablist"><button role="tab" aria-selected={panel === 'terminal'} className={panel === 'terminal' ? 'on' : ''} onClick={() => setPanel('terminal')}>Terminal</button>
          <button role="tab" aria-selected={panel === 'problems'} className={panel === 'problems' ? 'on' : ''} onClick={() => setPanel('problems')}>Problems <span className="badge">{problems.length}</span></button>
          <span className="grow" /><button className="tab-close" aria-label="Close panel" onClick={() => setPanel(null)}><IconClose width={12} height={12} aria-hidden /></button></div>
        {panel === 'terminal' ? <TerminalView projectId={project.id} slot="panel" label="Terminal" />
          : <div className="code-problems">{problems.length ? problems.map((p, i) => <button key={i} onClick={() => void openAt(p.path, p.line, p.column)}>
            <b className={p.severity === monaco.MarkerSeverity.Error ? 'problem-error' : 'problem-warn'}>{p.severity === monaco.MarkerSeverity.Error ? 'Error' : p.severity === monaco.MarkerSeverity.Warning ? 'Warning' : 'Info'}</b>
            <span>{p.message}</span><span className="dim">{p.path}:{p.line}</span></button>) : <p className="code-empty">No problems in open files. Diagnostics come from Monaco's built-in TypeScript, JavaScript, JSON, CSS and HTML support.</p>}</div>}
      </section> : null}
      <footer className="code-status"><span>{busy ? 'Saving…' : tab && tab.saved !== tab.model.getValue() ? 'Unsaved changes' : 'Saved'}</span>
        <button className="status-btn" onClick={() => setPanel((open) => open === 'problems' ? null : 'problems')} aria-label={`${problems.length} problems`}>{errors} errors · {problems.length - errors} warnings</button>
        <button className="status-btn" onClick={() => setPanel((open) => open === 'terminal' ? null : 'terminal')}>Terminal</button>
        <button className="status-btn" onClick={() => { setCommand(''); setPalette(true) }} title="Command palette (Ctrl+Shift+P)">Commands</button><span className="grow" /><span>Ln {cursor.lineNumber}, Col {cursor.column}</span><span>UTF-8{tab?.file.bom ? ' BOM' : ''}</span>
        <select aria-label="Editor language" value={tab?.model.getLanguageId() ?? 'plaintext'} disabled={!tab || Boolean(diff)} onChange={(e) => { if (tab) { monaco.editor.setModelLanguage(tab.model, e.target.value); changed() } }}>
          {editorLanguages().sort((a, b) => a.id.localeCompare(b.id)).map((lang) => <option value={lang.id} key={lang.id}>{lang.aliases?.[0] ?? lang.id}</option>)}
        </select></footer>
    </section>
    {ask ? <aside className="code-ask" aria-label="Ask agent">
      <div className="code-section-head"><strong>ASK AGENT</strong><button className="tab-close" aria-label="Close Ask agent" onClick={() => setAsk(false)}><IconClose width={12} height={12} aria-hidden /></button></div>
      <p className="tree-note">{tab && active ? `About ${selection ? `lines ${selection[0]}–${selection[1]} of` : 'all of'} ${active}. Select code to narrow it.` : 'Open a file first.'} Answers come from the planner model in Settings; nothing is saved until you save.</p>
      <textarea className="textarea" aria-label="Question for the agent" rows={4} maxLength={4000} placeholder="Explain this, find the bug, add error handling…" value={question} onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void askAgent('ask') } }} />
      <div className="code-ask-actions"><button className="btn" disabled={!tab || !question.trim() || Boolean(asking)} onClick={() => void askAgent('ask')}>{asking === 'ask' ? 'Asking…' : 'Ask'}</button>
        <button className="btn primary" disabled={!tab || !question.trim() || Boolean(asking)} onClick={() => void askAgent('edit')}>{asking === 'edit' ? 'Writing edit…' : 'Propose edit'}</button></div>
      {askError ? <p className="editor-error" role="alert">{askError}</p> : null}
      {asking ? <p className="tree-note" role="status">Waiting for the model. This can take a minute.</p> : null}
      {reply ? <div className="code-ask-reply"><small className="dim">{reply.model} · {reply.path}</small><div className="code-ask-text">{reply.answer || 'The agent sent only the edit.'}</div>
        {proposal ? <button className="btn tiny" onClick={() => showProposal(proposal)}>Review proposed edit</button> : null}</div> : null}
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
    {quick ? <Modal title="Go to file" onClose={() => setQuick(false)} narrow><input className="input" autoFocus aria-label="Find a file by path" placeholder="Search file paths…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter' && matches[0] && !searching) { event.preventDefault(); void open(matches[0].path); setQuick(false) }
      if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector<HTMLButtonElement>('.quick-files button')?.focus() }
    }} />
      <div className="quick-files">{searching ? <p role="status">Searching…</p> : matches.length ? matches.map((file) => <button key={file.path} onClick={() => { void open(file.path); setQuick(false) }}>{file.path}</button>) : <p>No matching files.</p>}</div><p className="hint">Up to 100 results across 5,000 entries. Dependency and build folders are hidden.</p></Modal> : null}
  </div>
}
