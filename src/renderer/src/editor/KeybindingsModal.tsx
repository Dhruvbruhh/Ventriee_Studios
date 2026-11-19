import { useState } from 'react'
import { Modal } from '../shell'
import { chordOf, importVsCode, parseChord } from './keybindings'

type Binding = { key: string; command: string }

/** Search every command, press keys to bind one, see clashes, or import VS Code's keybindings.json. */
export function KeybindingsModal({ commands, bindings, onSave, onClose }: {
  commands: Array<{ id: string; label: string; keys?: string }>; bindings: Binding[]; onSave: (next: Binding[]) => void; onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [error, setError] = useState('')
  const q = filter.trim().toLowerCase()
  const shown = commands.filter((c) => !q || c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || bindings.some((b) => b.command === c.id && b.key.includes(q))).slice(0, 200)
  const keyOf = (id: string) => bindings.find((b) => b.command === id)?.key
  const clash = (id: string, key: string) => [...bindings.filter((b) => b.command !== id && b.key === key).map((b) => commands.find((c) => c.id === b.command)?.label ?? b.command),
    ...commands.filter((c) => c.id !== id && !keyOf(c.id) && c.keys?.toLowerCase().replace(/\s/g, '') === key).map((c) => c.label)]
  const set = (id: string, key: string | null) => onSave([...bindings.filter((b) => b.command !== id), ...(key ? [{ key, command: id }] : [])])
  return <Modal title="Keyboard shortcuts" onClose={onClose}>
    <input className="input" autoFocus aria-label="Search commands" placeholder="Search by command or key" value={filter} onChange={(e) => setFilter(e.target.value)} />
    <div className="kb-list">{shown.map((c) => { const key = keyOf(c.id); const clashes = key ? clash(c.id, key) : []; return <div className="kb-row" key={c.id}>
      <span title={c.id}>{c.label}</span>
      {recording === c.id ? <input className="input mono" autoFocus aria-label={`Press the keys for ${c.label}`} placeholder="Press keys…" readOnly onBlur={() => setRecording(null)}
        onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { setRecording(null); return } const chord = chordOf(e.nativeEvent); if (chord && parseChord(chord) !== null) { set(c.id, chord); setRecording(null) } }} />
        : <button className="btn tiny" onClick={() => setRecording(c.id)} title="Change shortcut"><kbd>{key ?? c.keys ?? '—'}</kbd></button>}
      {key ? <button className="btn tiny" onClick={() => set(c.id, null)}>Reset</button> : null}
      {clashes.length ? <small className="editor-error">Also used by {clashes.join(', ')}</small> : null}</div> })}</div>
    {importing ? <div><textarea className="textarea mono" rows={6} aria-label="VS Code keybindings.json" placeholder='[{ "key": "ctrl+shift+d", "command": "editor.action.copyLinesDownAction" }]' value={importText} onChange={(e) => setImportText(e.target.value)} />
      {error ? <p className="editor-error" role="alert">{error}</p> : null}
      <button className="btn tiny primary" onClick={() => { try { const list = importVsCode(importText); onSave([...bindings.filter((b) => !list.some((x) => x.command === b.command)), ...list]); setImporting(false); setError('') } catch (e) { setError(String(e)) } }}>Import</button></div>
      : <button className="btn tiny" onClick={() => setImporting(true)}>Import VS Code keybindings.json</button>}
    <p className="hint">Editor command ids match VS Code's, so most imported shortcuts work as they do there.</p>
  </Modal>
}
