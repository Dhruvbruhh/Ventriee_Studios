import { useEffect, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { useAttachments, useVoice } from './Attachments'
import { useClarify } from './Clarify'
import { IconSend, IconStop } from '../icons'

const SUGGESTIONS = [
  'Build a modern marketing site with an admin panel, auth, responsive design and SEO',
  'Add Stripe checkout to the existing app and wire the webhook',
  'Audit this project for security issues, then fix what you find'
]

export function CommandBar() {
  const snapshot = useStore((s) => s.snapshot)!
  const draft = useStore((s) => s.draft)
  const setDraft = useStore((s) => s.setDraft)
  const notify = useStore((s) => s.notify)
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<'' | 'website'>('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const running = snapshot.running
  const attach = useAttachments(project?.id)
  const mic = useVoice((text) => { const d = useStore.getState().draft; setDraft(d ? `${d} ${text}` : text) })
  const configured = snapshot.providers.filter((p) => p.available).length
  const [shortcuts, setShortcuts] = useState<Array<{ id: string; title: string; prompt: string }>>([])
  // Refetched when settings change, which is what installing or removing a plugin does.
  useEffect(() => { void window.ventriee.pluginList().then((list) => setShortcuts(list.flatMap((p) => p.commands.map((c) => ({ ...c, id: `${p.id}:${c.id}` }))))).catch(() => {}) }, [snapshot.settings])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [draft])

  const clarify = useClarify(project?.id)
  const submit = () => {
    if (!project || busy || running || !draft.trim() || clarify.checking || clarify.pending) return
    const instruction = draft.trim()
    void clarify.ask(instruction, async (clarifications) => {
      setBusy(true)
      const result = await guard(() => window.ventriee.startRun({ projectId: project.id, instruction, attachments: attach.paths, profile: profile || undefined, clarifications }))
      setBusy(false)
      if (result) {
        setDraft('')
        attach.clear()
        useStore.getState().setRailTab('plan')
        notify('Brief sent to the orchestrator')
      }
    })
  }

  return (
    <div className="command">
      <div className="command-inner">
        {clarify.panel}
        {attach.strip}
        <div className="composer">
          <textarea
            id="owner-input"
            ref={ref}
            value={draft}
            rows={1}
            placeholder={
              project
                ? 'Brief the orchestrator. What should the studio build next?'
                : 'Create a project first, then brief the orchestrator.'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            disabled={!project}
            aria-label="Owner instruction"
            {...attach.handlers}
          />
          {attach.button}{mic}
          {shortcuts.length ? <select className="select" value="" onChange={(e) => { const c = shortcuts.find((x) => x.id === e.target.value); if (c) setDraft(c.prompt) }} aria-label="Plugin shortcuts" title="Prompt shortcuts from your plugins">
            <option value="" disabled>Shortcuts</option>
            {shortcuts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select> : null}
          <select className="select" value={profile} onChange={(e) => setProfile(e.target.value as typeof profile)} aria-label="Run profile" title="Client website: research, stack pick, folders, database, backend, frontend, security, review, QA, ship">
            <option value="">Auto</option>
            <option value="website">Client website</option>
          </select>
          {running ? (
            <button className="stop-btn" onClick={() => void guard(() => window.ventriee.stopRun(project!.id), 'Run stopped')}>
              <IconStop /> Stop
            </button>
          ) : (
            <button className="send-btn" data-fx="send" onClick={submit} disabled={!project || !draft.trim() || busy || clarify.checking || clarify.pending}>
              <IconSend /> {clarify.checking ? 'Checking…' : 'Run'}
            </button>
          )}
        </div>
        <div className="command-foot">
          <span><span className="kbd">Enter</span> send · <span className="kbd">Shift</span>+<span className="kbd">Enter</span> newline</span>
          <span>·</span>
          <span><span className="kbd">Ctrl</span>+<span className="kbd">K</span> focus</span>
          <span className="ml-auto">
            {running
              ? 'Orchestrator is dispatching. Stop halts every live session.'
              : draft.trim()
                ? 'Sends to the orchestrator, which plans and assigns the team.'
                : configured === 0
                  ? 'No engine available. Open settings to configure one.'
                  : SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]}
          </span>
        </div>
      </div>
    </div>
  )
}
