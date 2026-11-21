import { useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { Modal } from '../shell'
import { IconCheck, IconEdit, IconPin, IconPlus, IconSearch, IconTrash } from '../icons'
import type { MemoryDoc } from '../../../shared/types'

const SCOPES: Record<string, string> = { global: 'Everywhere', project: 'This project', agent: 'Workers', skill: 'Skills' }

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Partial<MemoryDoc> | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const docs = useMemo(() => {
    if (!query.trim()) return snapshot.memories
    const q = query.toLowerCase()
    return snapshot.memories.filter(
      (m) => m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q))
    )
  }, [snapshot.memories, query])

  const grouped = useMemo(() => {
    const map = new Map<string, MemoryDoc[]>()
    for (const doc of docs) {
      const key = doc.scope
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(doc)
    }
    return [...map.entries()]
  }, [docs])

  return (
    <Modal
      title="Memory"
      subtitle={`${snapshot.memories.length} documents: markdown on disk, indexed in SQLite`}
      onClose={onClose}
      actions={
        <button
          className="btn primary"
          onClick={() =>
            setEditing({ path: '', title: '', body: '', scope: 'project', projectId: snapshot.activeProjectId })
          }
        >
          <IconPlus /> New memory
        </button>
      }
    >
      <div className="list-toolbar">
        <label className="search-field">
          <IconSearch width={14} height={14} />
          <input placeholder={`Search ${snapshot.memories.length} documents`} aria-label="Search memory" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {editing ? (
        <MemoryEditor
          doc={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {grouped.map(([scope, items]) => (
        <section key={scope} className="space-below">
          <div className="section-label">
            <span>{SCOPES[scope] ?? scope}</span>
            <span className="faint">{items.length}</span>
          </div>
          <div className="item-list">
            {items.map((doc) => (
              <div key={doc.id} className="item-row mem-item">
                <div className="item-main">
                  <div className="item-title">
                    {doc.pinned ? <IconPin width={13} height={13} className="pin-mark" aria-label="Pinned" /> : null}
                    <b>{doc.title}</b>
                    <span className="item-meta mono truncate">{doc.path}</span>
                  </div>
                  <button className={`mem-body${open === doc.id ? ' open' : ''}`} onClick={() => setOpen(open === doc.id ? null : doc.id)} aria-expanded={open === doc.id} title={open === doc.id ? 'Collapse' : 'Show all'}>
                    {doc.body.slice(0, 1200)}
                  </button>
                  <p className="item-meta">{Math.round(doc.confidence * 100)}% confidence, {doc.source}, updated {new Date(doc.updatedAt).toLocaleDateString()}</p>
                </div>
                <div className="item-actions">
                  <button className="icon-btn" onClick={() => setEditing(doc)} aria-label={`Edit ${doc.title}`} title="Edit"><IconEdit /></button>
                  <button className={`icon-btn${doc.pinned ? ' active' : ''}`} onClick={() => void guard(() => window.ventriee.pinMemory(doc.id), doc.pinned ? 'Unpinned' : 'Pinned')} aria-label={doc.pinned ? `Unpin ${doc.title}` : `Pin ${doc.title}`} title={doc.pinned ? 'Unpin' : 'Pin'}>
                    <IconPin />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={`Delete ${doc.title}`}
                    title="Delete"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${doc.title}"? The markdown file is removed too.`)) return
                      await guard(() => window.ventriee.deleteMemory(doc.id), 'Memory deleted')
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!docs.length ? <p className="settings-empty">{query ? 'Nothing matches.' : 'No memory yet. Workers write lessons here after accepted tasks.'}</p> : null}
    </Modal>
  )
}

function MemoryEditor({ doc, onClose }: { doc: Partial<MemoryDoc>; onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [title, setTitle] = useState(doc.title ?? '')
  const [path, setPath] = useState(doc.path ?? '')
  const [body, setBody] = useState(doc.body ?? '')
  const [scope, setScope] = useState<MemoryDoc['scope']>(doc.scope ?? 'project')

  const suggested = path || (doc.scope === 'global' ? 'global/notes.md' : `projects/${snapshot.activeProjectId}/notes.md`)

  return (
    <div className="inset-form space-below">
      <div className="row">
        <div className="field">
          <label className="field-label" htmlFor="mem-title">Title</label>
          <input id="mem-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field field-narrow">
          <label className="field-label" htmlFor="mem-scope">Scope</label>
          <select id="mem-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value as MemoryDoc['scope'])}>
            {['global', 'project', 'agent', 'skill'].map((s) => <option key={s} value={s}>{SCOPES[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mem-path">File path (relative to the memory root)</label>
        <input id="mem-path" className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={suggested} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="mem-body">Content (markdown)</label>
        <textarea id="mem-body" className="textarea mono textarea-tall" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="form-foot">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          disabled={!title.trim() || !body.trim()}
          onClick={async () => {
            const saved = await guard(
              () =>
                window.ventriee.saveMemory({
                  id: doc.id,
                  path: path.trim() || suggested,
                  title: title.trim(),
                  body,
                  scope,
                  projectId: scope === 'project' ? snapshot.activeProjectId : doc.projectId ?? null
                }),
              'Memory saved'
            )
            if (saved) onClose()
          }}
        >
          <IconCheck /> Save
        </button>
      </div>
    </div>
  )
}
