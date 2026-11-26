import { useEffect, useMemo, useState } from 'react'
import { guard, useStore } from '../store'
import { Modal } from '../shell'
import { IconCheck, IconEdit, IconPin, IconPlus, IconSearch, IconTrash } from '../icons'
import type { MemoryDoc, MemoryVersion } from '../../../shared/types'

const SCOPES: Record<string, string> = { global: 'Everywhere', org: 'Organization', project: 'This project', agent: 'Workers', skill: 'Skills' }

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Partial<MemoryDoc> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [history, setHistory] = useState<string | null>(null)

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
      <OrgWorkspace />
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
                  {history === doc.id ? <VersionHistory doc={doc} /> : null}
                </div>
                <div className="item-actions">
                  <button className={`btn tiny${history === doc.id ? ' active' : ''}`} onClick={() => setHistory(history === doc.id ? null : doc.id)} aria-expanded={history === doc.id} aria-label={`History of ${doc.title}`}>History</button>
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

  // Org docs: main files them under orgs/<active org>/, so only the file name matters.
  const suggested = path || (scope === 'global' ? 'global/notes.md' : scope === 'org' ? 'notes.md' : `projects/${snapshot.activeProjectId}/notes.md`)

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
            {['global', 'org', 'project', 'agent', 'skill'].map((s) => <option key={s} value={s}>{SCOPES[s]}</option>)}
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

/** Saved states of a doc, newest first; restoring writes the old content as a new version. */
function VersionHistory({ doc }: { doc: MemoryDoc }) {
  const [versions, setVersions] = useState<MemoryVersion[] | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    void window.ventriee.memoryVersions(doc.id).then(setVersions, () => setVersions([]))
  }, [doc.id, doc.updatedAt])
  if (!versions) return <p className="item-meta">Loading history…</p>
  if (!versions.length) return <p className="item-meta">No changes recorded yet.</p>
  return (
    <ol className="mem-history">
      {versions.map((v, i) => (
        <li key={v.id}>
          <div className="item-meta">
            {new Date(v.createdAt).toLocaleString()} · {v.source || 'unknown'}{v.taskId ? ` · task ${v.taskId}` : ''}{i === 0 ? ' · current' : ''}
          </div>
          <div className="row">
            <button className="btn tiny" onClick={() => setShown(shown === v.id ? null : v.id)} aria-expanded={shown === v.id}>{shown === v.id ? 'Hide' : 'View'}</button>
            {i > 0 ? (
              <button className="btn tiny" onClick={() => void guard(() => window.ventriee.restoreMemoryVersion(v.id), 'Version restored')}>Restore</button>
            ) : null}
          </div>
          {shown === v.id ? <pre className="debug-output max-h-sm">{v.body}</pre> : null}
        </li>
      ))}
    </ol>
  )
}

/**
 * Which org's memory this window sees. Org memory stays on this desktop; a project
 * sees the org it was created in, or the one it is added to here.
 */
function OrgWorkspace() {
  const snapshot = useStore((s) => s.snapshot)!
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }> | null>(null)
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    void window.ventriee.authStatus().then(async (session) => {
      if (!session) return
      setActive(session.activeOrgId)
      setOrgs(await window.ventriee.cloudOrgs())
    }).catch(() => setOrgs(null))
  }, [])
  if (!orgs?.length) return null
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId)
  const projectOrg = orgs.find((o) => o.id === project?.orgId)
  return (
    <div className="kv-row space-below">
      <div className="kv-row-main">
        <div className="kv-row-title">Organization memory</div>
        <div className="kv-row-sub">
          {project ? (projectOrg ? `${project.name} uses ${projectOrg.name}'s memory.` : `${project.name} is not in an organization.`) : 'No project open.'}
          {' '}Kept on this desktop only.
        </div>
      </div>
      <select
        className="select w-sm"
        aria-label="Organization workspace"
        value={active ?? ''}
        onChange={async (e) => {
          const next = e.target.value || null
          if (await guard(() => window.ventriee.cloudSetWorkspace(next))) setActive(next)
        }}
      >
        <option value="">Personal</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {project && active && project.orgId !== active ? (
        <button className="btn tiny" onClick={() => void guard(() => window.ventriee.updateProject(project.id, { orgId: active }), 'Project added to organization')}>
          Use in this project
        </button>
      ) : null}
    </div>
  )
}
