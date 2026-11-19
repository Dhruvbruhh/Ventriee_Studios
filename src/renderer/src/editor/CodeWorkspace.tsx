import { useCallback, useEffect, useRef, useState } from 'react'
import { monaco, languageFor, editorLanguages } from './monaco'
import { SourceControl } from './SourceControl'
import { Preview } from '../components/Preview'
import { Modal } from '../shell'
import { guard, useStore } from '../store'
import type { FileEntry, TextFile } from '../../../shared/workspace'
import type { Project } from '../../../shared/types'

interface Tab { file: TextFile; model: monaco.editor.ITextModel; saved: string; subscription: monaco.IDisposable; view?: monaco.editor.ICodeEditorViewState | null }
interface Diff { path: string; original: string; modified: string; staged: boolean; label?: string }

function Directory({ projectId, path, depth, revision, onOpen }: { projectId: string; path: string; depth: number; revision: number; onOpen: (path: string) => void }) {
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
    <button className="file-tree-row" style={{ paddingLeft: depth * 14 + 12 }} title={entry.path}
      aria-expanded={entry.directory ? expanded.has(entry.path) : undefined}
      onClick={() => {
        if (!entry.directory) { onOpen(entry.path); return }
        setExpanded((old) => { const next = new Set(old); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next })
      }}><span className="file-glyph">{entry.directory ? expanded.has(entry.path) ? '▾' : '▸' : '·'}</span><span>{entry.name}</span></button>
    {entry.directory && expanded.has(entry.path) ? <Directory {...{ projectId, revision, onOpen }} path={entry.path} depth={depth + 1} /> : null}
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

export default function CodeWorkspace({ project, visible }: { project: Project; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const tabs = useRef<Map<string, Tab>>(new Map())
  const selected = useRef<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [, setRender] = useState(0)
  const [sidebar, setSidebar] = useState<'files' | 'git'>('files')
  const [preview, setPreview] = useState(false)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 })
  const [create, setCreate] = useState<'file' | 'folder' | 'copy' | null>(null)
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
    return () => {
      mounted.current = false; position.dispose(); instance.dispose()
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
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(event.shiftKey) }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setQuick(true) }
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
  const openDiff = async (path: string, staged: boolean) => {
    const request = ++comparing.current
    opening.current++; setLoading(false)
    const result = await guard(() => window.ventriee.gitDiff(project.id, path, staged))
    if (result && mounted.current && request === comparing.current) setDiff({ ...result, staged })
  }
  const tab = active ? tabs.current.get(active) : null
  return <div className={`code-workspace${preview ? ' with-preview' : ''}`} style={{ display: visible ? undefined : 'none' }}>
    <aside className="code-sidebar"><div className="code-sidebar-tabs"><button className={sidebar === 'files' ? 'on' : ''} onClick={() => setSidebar('files')}>Explorer</button><button className={sidebar === 'git' ? 'on' : ''} onClick={() => setSidebar('git')}>Source Control</button></div>
      {sidebar === 'files' ? <><div className="code-section-head"><strong title={project.path}>{project.name}</strong><button className="btn tiny" onClick={() => setRevision((v) => v + 1)}>Refresh</button></div>
        <div className="code-file-actions"><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('file') }}>New file</button><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('folder') }}>New folder</button><button className="btn tiny" onClick={() => setQuick(true)}>Find file</button></div>
        <div className="file-tree" aria-label="Project files"><Directory projectId={project.id} path="" depth={0} revision={revision} onOpen={(path) => void open(path)} /></div></>
        : <SourceControl projectId={project.id} refreshKey={revision} onDiff={(path, staged) => void openDiff(path, staged)} onOpen={(path) => void open(path)} />}
    </aside>
    <section className="code-main" aria-label="Code editor">
      <div className="code-tabs" role="tablist" aria-label="Open files">{[...tabs.current].map(([path, value]) => <div className={`code-tab${path === active && !diff ? ' on' : ''}`} key={path}>
        <button role="tab" aria-selected={path === active && !diff} title={path} onClick={() => activate(path)}>{path.split('/').at(-1)}{value.saved !== value.model.getValue() ? <span aria-label="Unsaved"> ●</span> : null}</button><button className="tab-close" onClick={() => close(path)} aria-label={`Close ${path}`}>×</button></div>)}</div>
      <div className="code-toolbar"><span className="code-breadcrumb" title={diff?.path ?? active ?? project.path}>{diff ? `${diff.label ?? (diff.staged ? 'Staged' : 'Working tree')} / ${diff.path}` : active ?? 'Open a file to begin'}</span>
        {diff ? <button className="btn tiny" onClick={() => setDiff(null)}>Back to editor</button> : <><button className="btn tiny" disabled={!tab || busy} onClick={() => void reload()}>Reload</button><button className="btn tiny" disabled={!tab || busy} onClick={() => { setNewPath(''); setCreate('copy') }}>Save copy</button><button className="btn tiny primary" disabled={!tab || busy || tab.saved === tab.model.getValue()} onClick={() => void save()}>Save</button></>}
        <button className="btn tiny" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Show preview'}</button></div>
      <div className="code-editor-body">{conflict && conflict === active && !diff ? <div className="editor-conflict" role="alert"><span>{conflict} changed on disk after you opened it. Your edits are kept here and were not saved.</span>
        <button className="btn tiny" onClick={() => void compareWithDisk()}>Compare with disk</button><button className="btn tiny" onClick={() => void reload()}>Reload from disk</button><button className="btn tiny" onClick={() => { setNewPath(''); setCreate('copy') }}>Save a copy</button></div> : null}
        <div ref={host} className="monaco-surface" style={{ visibility: active && !diff ? 'visible' : 'hidden' }} />
        {diff ? <DiffView diff={diff} /> : !active ? <div className="code-welcome"><span className="code-welcome-symbol">{'{ }'}</span><h2>Your code, in one place</h2><p>Open a file in Explorer or press Ctrl+P.</p><p>Ctrl+S to save · Ctrl+F to find · Ctrl+H to replace</p><p>UTF-8 text files up to 2 MB. Language runtimes are installed separately.</p></div> : null}
        {loading ? <div className="editor-loading" role="status">Opening file…</div> : null}</div>
      <footer className="code-status"><span>{busy ? 'Saving…' : tab && tab.saved !== tab.model.getValue() ? 'Unsaved changes' : 'Saved'}</span><span className="grow" /><span>Ln {cursor.lineNumber}, Col {cursor.column}</span><span>UTF-8{tab?.file.bom ? ' BOM' : ''}</span>
        <select aria-label="Editor language" value={tab?.model.getLanguageId() ?? 'plaintext'} disabled={!tab || Boolean(diff)} onChange={(e) => { if (tab) { monaco.editor.setModelLanguage(tab.model, e.target.value); changed() } }}>
          {editorLanguages().sort((a, b) => a.id.localeCompare(b.id)).map((lang) => <option value={lang.id} key={lang.id}>{lang.aliases?.[0] ?? lang.id}</option>)}
        </select></footer>
    </section>
    {preview ? <aside className="code-preview"><Preview /></aside> : null}
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
    {quick ? <Modal title="Go to file" onClose={() => setQuick(false)} narrow><input className="input" autoFocus aria-label="Find a file by path" placeholder="Search file paths…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter' && matches[0] && !searching) { event.preventDefault(); void open(matches[0].path); setQuick(false) }
      if (event.key === 'ArrowDown') { event.preventDefault(); document.querySelector<HTMLButtonElement>('.quick-files button')?.focus() }
    }} />
      <div className="quick-files">{searching ? <p role="status">Searching…</p> : matches.length ? matches.map((file) => <button key={file.path} onClick={() => { void open(file.path); setQuick(false) }}>{file.path}</button>) : <p>No matching files.</p>}</div><p className="hint">Up to 100 results across 5,000 entries. Dependency and build folders are hidden.</p></Modal> : null}
  </div>
}
