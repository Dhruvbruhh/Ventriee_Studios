import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { editor } from 'monaco-editor'
import { RichText } from '../components/RichText'
import { cleanError } from '../store'
import { joinText, parseNotebook, serializeNotebook, type Notebook, type NotebookCell } from '../../../shared/notebook'
import type { NotebookOutput } from '../../../shared/workspace'

const ids = new WeakMap<NotebookCell, string>()
/** nbformat 4.5+ cells carry an id; older ones get one for this session only (not saved). */
const cellId = (c: NotebookCell) => c.id ?? ids.get(c) ?? (ids.set(c, `c${Math.random().toString(36).slice(2)}`), ids.get(c)!)
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const INSTALL = 'python -m pip install jupyter_client ipykernel'

function Output({ o }: { o: NotebookOutput }) {
  if (o.output_type === 'stream') return <pre className={`nb-out${o.name === 'stderr' ? ' nb-err' : ''}`}>{joinText(o.text)}</pre>
  if (o.output_type === 'error') return <pre className="nb-out nb-err">{stripAnsi(o.traceback.join('\n')) || `${o.ename}: ${o.evalue}`}</pre>
  const d = o.data
  for (const type of ['image/png', 'image/jpeg'] as const) if (d[type]) return <img className="nb-img" src={`data:${type};base64,${joinText(d[type]).trim()}`} alt="Cell output" />
  // Kernel HTML is untrusted: sanitized, so no scripts or event handlers run.
  if (d['text/html']) return <div className="nb-html" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(joinText(d['text/html'])) }} />
  if (d['text/markdown']) return <div className="nb-html"><RichText text={joinText(d['text/markdown'])} /></div>
  return <pre className="nb-out">{joinText(d['text/plain'])}</pre>
}

/** A Jupyter notebook: cells edited here are written back into the tab's text, so Save, dirty marks and history work as for any file. */
export function NotebookView({ projectId, path, model, onInstall }: { projectId: string; path: string; model: editor.ITextModel; onInstall: (command: string) => void }) {
  const [nb, setNb] = useState<Notebook | null>(null)
  const [error, setError] = useState('')
  const [kernel, setKernel] = useState<'off' | 'starting' | 'ready'>('off')
  const [kernelError, setKernelError] = useState('')
  const [running, setRunning] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const nbRef = useRef<Notebook | null>(null)
  const writing = useRef(false)
  const queue = useRef<string[]>([])

  useEffect(() => {
    const load = () => { if (writing.current) return; try { nbRef.current = parseNotebook(model.getValue()); setNb(nbRef.current); setError('') } catch (e) { setError(cleanError(e)) } }
    load()
    const sub = model.onDidChangeContent(load)
    return () => sub.dispose()
  }, [model])

  const commit = () => {
    if (!nbRef.current) return
    writing.current = true
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: serializeNotebook(nbRef.current) }], () => null)
    writing.current = false
    setNb({ ...nbRef.current })
  }
  const find = (id: string) => nbRef.current?.cells.find((c) => cellId(c) === id)

  useEffect(() => window.ventriee.onNotebook((e) => {
    if (e.path !== path) return
    if (e.type === 'ready') setKernel('ready')
    else if (e.type === 'exit') { setKernel('off'); setRunning([]); queue.current = [] }
    else if (e.type === 'output') { const c = find(e.id); if (c) { (c.outputs ??= []).push(e.output); commit() } }
    else if (e.type === 'done') {
      const c = find(e.id)
      if (c) { c.execution_count = e.count; commit() }
      setRunning((r) => r.filter((id) => id !== e.id))
      if (e.status === 'error') queue.current = []
      const next = queue.current.shift()
      if (next) void send(next)
    }
  }), [path])
  useEffect(() => () => { void window.ventriee.notebookShutdown(projectId, path).catch(() => {}) }, [projectId, path])

  const ensureKernel = async () => {
    if (kernel === 'ready') return true
    setKernel('starting'); setKernelError('')
    try { await window.ventriee.notebookStart(projectId, path); setKernel('ready'); return true } catch (e) { setKernel('off'); setKernelError(cleanError(e)); return false }
  }
  const send = async (id: string) => {
    const c = find(id)
    if (!c || c.cell_type !== 'code') return
    c.outputs = []; c.execution_count = null; commit()
    setRunning((r) => [...r, id])
    await window.ventriee.notebookExecute(projectId, path, id, joinText(c.source)).catch((e) => { setKernelError(cleanError(e)); setRunning((r) => r.filter((x) => x !== id)) })
  }
  /** Cells run one at a time in order; an error stops the rest, as in Jupyter. */
  const run = async (list: string[]) => {
    if (!list.length || !(await ensureKernel())) return
    if (running.length) { queue.current.push(...list); return }
    queue.current = list.slice(1)
    await send(list[0])
  }
  const edit = (c: NotebookCell, source: string) => { c.source = source; commit() }
  const add = (at: number, cell_type: 'code' | 'markdown') => {
    const cell: NotebookCell = cell_type === 'code' ? { cell_type, source: '', outputs: [], execution_count: null, metadata: {} } : { cell_type, source: '', metadata: {} }
    if ((nbRef.current!.nbformat_minor ?? 0) >= 5) cell.id = `cell-${Date.now().toString(36)}`
    nbRef.current!.cells.splice(at, 0, cell); commit(); setEditing(cellId(cell))
  }
  const move = (i: number, by: number) => { const cells = nbRef.current!.cells; const j = i + by; if (j < 0 || j >= cells.length) return; [cells[i], cells[j]] = [cells[j], cells[i]]; commit() }
  const remove = (i: number) => { nbRef.current!.cells.splice(i, 1); commit() }

  if (error) return <div className="notebook"><p className="editor-error" role="alert">{error}. The file is shown as text instead.</p></div>
  if (!nb) return <div className="notebook"><p className="tree-note" role="status">Opening notebook…</p></div>
  const code = nb.cells.filter((c) => c.cell_type === 'code').map(cellId)
  return <div className="notebook" aria-label={`Notebook ${path}`}>
    <div className="nb-toolbar">
      <button className="btn tiny primary" onClick={() => void run(code)} disabled={!code.length}>Run all</button>
      <button className="btn tiny" disabled={!running.length} onClick={() => void window.ventriee.notebookInterrupt(projectId, path)}>Interrupt</button>
      <button className="btn tiny" disabled={kernel !== 'ready'} onClick={() => { setKernel('starting'); void window.ventriee.notebookRestart(projectId, path) }}>Restart kernel</button>
      <button className="btn tiny" onClick={() => add(nb.cells.length, 'code')}>+ Code</button>
      <button className="btn tiny" onClick={() => add(nb.cells.length, 'markdown')}>+ Text</button>
      <span className="tree-note" role="status">Kernel: {kernel === 'ready' ? (running.length ? 'busy' : 'idle') : kernel === 'starting' ? 'starting…' : 'not started'}</span>
    </div>
    {kernelError ? <p className="editor-error" role="alert">{kernelError}{/jupyter|pip install/i.test(kernelError) ? <> <button className="btn tiny" onClick={() => onInstall(INSTALL)}>Install Jupyter</button></> : null}</p> : null}
    {nb.cells.map((c, i) => {
      const id = cellId(c)
      const busy = running.includes(id)
      return <section key={id} className={`nb-cell nb-${c.cell_type}${busy ? ' busy' : ''}`} aria-label={`${c.cell_type === 'code' ? 'Code' : 'Text'} cell ${i + 1}`}>
        <div className="nb-gutter">{c.cell_type === 'code' ? <><button className="btn tiny" aria-label={`Run cell ${i + 1}`} disabled={busy} onClick={() => void run([id])}>▶</button><span className="nb-count">[{busy ? '*' : c.execution_count ?? ' '}]</span></> : null}</div>
        <div className="nb-body">
          {c.cell_type === 'markdown' && editing !== id
            ? <div className="nb-md" role="button" tabIndex={0} title="Double-click to edit" onDoubleClick={() => setEditing(id)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(id) }}><RichText text={joinText(c.source) || '*Empty text cell*'} /></div>
            : <textarea className="nb-source" spellCheck={false} aria-label={`Source of cell ${i + 1}`} value={joinText(c.source)} rows={Math.max(2, joinText(c.source).split('\n').length)}
                onChange={(e) => edit(c, e.target.value)} onBlur={() => { if (c.cell_type === 'markdown') setEditing(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); if (c.cell_type === 'code') void run([id]); else setEditing(null) } }} />}
          {(c.outputs ?? []).map((o, j) => <Output key={j} o={o} />)}
        </div>
        <div className="nb-actions">
          <button className="tab-close" aria-label={`Move cell ${i + 1} up`} onClick={() => move(i, -1)}>↑</button>
          <button className="tab-close" aria-label={`Move cell ${i + 1} down`} onClick={() => move(i, 1)}>↓</button>
          <button className="tab-close" aria-label={`Delete cell ${i + 1}`} onClick={() => remove(i)}>×</button>
        </div>
      </section>
    })}
    {!nb.cells.length ? <p className="tree-note">Empty notebook. Add a code or text cell.</p> : null}
  </div>
}
