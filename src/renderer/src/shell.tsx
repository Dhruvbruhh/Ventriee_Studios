import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from './store'
import { IconClose } from './icons'
import { guard } from './store'
import { notice } from './fx'
import type { Project } from '../../shared/types'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  narrow,
  tabs,
  nav,
  actions
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  narrow?: boolean
  tabs?: ReactNode
  /** A navigation column beside the body, for modals with many sections. */
  nav?: ReactNode
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${narrow ? ' narrow' : ''}${nav ? ' with-nav' : ''}`}>
        <div className="modal-head">
          <div className="grow">
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <div className="modal-actions">
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          </div>
        </div>
        {tabs}
        {nav ? <div className="modal-split">{nav}<div className="modal-body">{children}</div></div> : <div className="modal-body">{children}</div>}
      </div>
    </div>
  )
}

export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
    />
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (toast) notice(box.current, toast.kind === 'error') }, [toast])
  if (!toast) return null
  return (
    <div ref={box} className={`toast${toast.kind === 'error' ? ' error' : ''}`} role="status" onClick={dismiss}>
      <span>{toast.text}</span>
    </div>
  )
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<'empty' | 'static' | 'react-vite' | 'express-api' | 'fastapi'>('empty')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || !path.trim() || busy) return
    if (useStore.getState().editorDirty && !window.confirm('Discard unsaved code edits and create a project?')) return
    setBusy(true)
    const project = await guard(
      () => window.ventriee.createProject({ name, path, description, template }),
      'Project created'
    )
    setBusy(false)
    if (project) onClose()
  }

  return (
    <Modal
      title="New project"
      subtitle="A workspace folder and a squad are created for you."
      onClose={onClose}
      narrow
    >
      <div className="field">
        <label className="field-label" htmlFor="proj-name">Project name</label>
        <input id="proj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client site refresh" autoFocus />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proj-template">Start from</label>
        <select id="proj-template" className="select" value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
          <option value="empty">Empty folder (or an existing project)</option>
          <option value="static">Static website (HTML, CSS, JS)</option>
          <option value="react-vite">React + Vite app</option>
          <option value="express-api">Node API (Express)</option>
          <option value="fastapi">Python API (FastAPI)</option>
        </select>
        {template !== 'empty' ? <p className="hint">Starter files are written only into an empty folder. Dependencies install when you start the preview or run the install in a terminal.</p> : null}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proj-path">Workspace folder</label>
        <div className="row">
          <input id="proj-path" className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder={'D:\\Work\\client-site'} />
          <button
            className="btn flex-none"
            onClick={async () => {
              const picked = await guard(() => window.ventriee.pickFolder())
              if (picked) {
                setPath(picked)
                if (!name.trim()) setName(picked.split(/[\\/]/).filter(Boolean).pop() ?? '')
              }
            }}
          >
            Browse
          </button>
        </div>
        <div className="hint">Agents are restricted to this folder. It is created if missing.</div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="proj-desc">Brief (optional)</label>
        <textarea
          id="proj-desc"
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this project is, who it is for, and what counts as done."
        />
      </div>
      <div className="modal-foot">
        <p className="hint">Creating a project seeds the 14 default workers and the memory files for this project.</p>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={submit} disabled={!name.trim() || !path.trim() || busy}>
          {busy ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </Modal>
  )
}

export function useProject(): Project | null {
  const snapshot = useStore((s) => s.snapshot)
  return useMemo(
    () => snapshot?.projects.find((p) => p.id === snapshot.activeProjectId) ?? null,
    [snapshot]
  )
}
