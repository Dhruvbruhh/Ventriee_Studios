import { useState, type CSSProperties } from 'react'
import { guard, useStore } from '../store'
import { Modal } from '../shell'
import { IconExternal, IconTrash } from '../icons'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function ProjectPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')

  if (!project) return null

  const sessions = snapshot.sessions
  const tokens = sessions.reduce((sum, s) => sum + s.inputTokens + s.outputTokens, 0)
  const cost = sessions.reduce((sum, s) => sum + s.costUsd, 0)
  const done = snapshot.tasks.filter((t) => t.status === 'done').length
  const working = snapshot.agents.filter((a) => a.status === 'working').length
  const pct = snapshot.tasks.length ? Math.round((done / snapshot.tasks.length) * 100) : 0
  const dirty = name.trim() !== project.name || description !== (project.description ?? '')

  return (
    <Modal
      title={project.name}
      subtitle={project.path}
      onClose={onClose}
      narrow
      actions={
        <button className="btn" onClick={() => void guard(() => window.ventriee.openPath(project.path), 'Workspace opened')}>
          <IconExternal /> Open folder
        </button>
      }
    >
      <div className="metrics">
        <div className="metric"><div className="metric-value">{snapshot.agents.length}</div><div className="metric-label">{working ? `Workers, ${working} active` : 'Workers'}</div></div>
        <div className="metric">
          <div className="metric-value">{done}<small>/{snapshot.tasks.length}</small></div>
          <div className="metric-label">Tasks done</div>
          <div className="metric-bar" role="img" aria-label={`${pct}% of tasks done`}><span style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="metric"><div className="metric-value">{tokens ? compact.format(tokens) : '0'}</div><div className="metric-label">Tokens</div></div>
        <div className="metric"><div className="metric-value">{cost ? `$${cost.toFixed(2)}` : '$0'}</div><div className="metric-label">API spend</div></div>
      </div>

      <form
        className="project-form"
        onSubmit={async (e) => {
          e.preventDefault()
          const saved = await guard(() => window.ventriee.updateProject(project.id, { name: name.trim(), description }), 'Project saved')
          if (saved !== null) onClose()
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="project-name">Name</label>
          <input id="project-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="project-brief">Brief</label>
          <textarea
            id="project-brief"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this project is, who it is for, and what counts as done. The planner and workers read this."
          />
        </div>
        <div className="project-form-actions">
          <button className="btn primary" type="submit" disabled={!name.trim() || !dirty}>Save changes</button>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              const unsaved = useStore.getState().editorDirty ? ' Unsaved code edits will be discarded.' : ''
              if (!window.confirm(`Delete "${project.name}" from the studio? The workspace folder and files are not touched; memory is archived.${unsaved}`)) return
              const ok = await guard(() => window.ventriee.deleteProject(project.id), 'Project removed from studio')
              if (ok === null) return
              onClose()
            }}
          >
            <IconTrash /> Remove project
          </button>
        </div>
      </form>

      <div className="section-label space-above">Recent sessions <span className="faint">{sessions.length}</span></div>
      {sessions.length ? (
        <ul className="session-list">
          {sessions.slice(0, 8).map((s) => {
            const agent = snapshot.agents.find((a) => a.id === s.agentId)
            const name = agent?.name ?? s.agentId.slice(0, 6)
            return (
              <li key={s.id} className="session-item">
                <span className="avatar" style={{ ['--who' as string]: agent?.color ?? 'var(--faint)' } as CSSProperties}>{name.slice(0, 2).toUpperCase()}</span>
                <span className="session-main">
                  <b>{name}</b>
                  <small className="mono">{s.engine} / {s.model || 'default'}</small>
                </span>
                <span className="session-end">
                  <span className={`badge ${s.status === 'done' ? 'ok' : s.status === 'failed' ? 'err' : s.status === 'running' ? 'accent' : ''}`}>{s.status}</span>
                  <small>{new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{s.outputTokens ? `, ${s.outputTokens.toLocaleString()} out` : ''}</small>
                </span>
              </li>
            )
          })}
        </ul>
      ) : <p className="settings-empty">No sessions yet. Assign a prompt to start the team.</p>}
    </Modal>
  )
}
