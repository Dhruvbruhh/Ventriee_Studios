import { useEffect, useRef, useState } from 'react'
import { guard, useStore } from '../store'
import { RichText } from './RichText'
import { Preview } from './Preview'
import { NewProjectDialog } from '../shell'
import { useAttachments, useVoice } from './Attachments'
import { useClarify } from './Clarify'
import { IconCheck, IconSend, IconSpark } from '../icons'
import type { ChatMessage, PromptDoc, Task } from '../../../shared/types'

/**
 * Simple mode: a chat-first surface for non-technical owners. It drives the
 * SAME orchestrator as the developer IDE (chatSend → promptCreate → assignPrompt
 * → tasks), just presented in plain language, and never forks the pipeline.
 */
export type SimplePhase = 'chat' | 'plan' | 'building' | 'done'

/** Which step of the chat → plan → build → done flow the project is in. Pure, for testing. */
export function simplePhase(args: { tasks: Task[]; prompts: PromptDoc[]; running: boolean }): SimplePhase {
  const { tasks, prompts, running } = args
  if (tasks.length) return !running && tasks.every((t) => t.status === 'done') ? 'done' : 'building'
  return prompts.length ? 'plan' : 'chat'
}

export function SimpleMode() {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const settings = snapshot.settings
  const [newProject, setNewProject] = useState(false)
  const [busy, setBusy] = useState(false)

  const planner = { engine: settings.plannerEngine, model: settings.plannerModel, endpoint: settings.plannerEndpoint }
  const configured = snapshot.providers.filter((p) => p.available).length
  const phase = simplePhase({ tasks: snapshot.tasks, prompts: snapshot.prompts, running: snapshot.running })
  const plan = snapshot.prompts.length ? snapshot.prompts[snapshot.prompts.length - 1] : null

  const toDeveloper = () => void guard(() => window.ventriee.saveSettings({ simpleMode: false }))

  const createPlan = async () => {
    if (!project || busy) return
    setBusy(true)
    await guard(() => window.ventriee.promptCreate({ projectId: project.id, ...planner }), 'Plan ready to review')
    setBusy(false)
  }

  const clarify = useClarify(project?.id)
  const build = () => {
    if (!project || !plan || busy || clarify.checking) return
    void clarify.ask(plan.body, async (clarifications) => {
      setBusy(true)
      const result = await guard(
        () => window.ventriee.assignPrompt({ projectId: project.id, promptId: plan.id, mode: 'orchestrator', clarifications }),
        'Building started'
      )
      setBusy(false)
      if (result) useStore.getState().notify(`On it: ${result.taskCount || 'the'} ${result.taskCount === 1 ? 'step' : 'steps'} planned.`)
    })
  }

  const startOver = () => {
    if (!project) return
    if (!window.confirm('Start a fresh idea? The finished work stays in the project folder.')) return
    void guard(() => window.ventriee.chatSessionNew(project.id))
  }

  return (
    <div className="simple">
      <header className="simple-top">
        <div className="simple-brand">
          <IconSpark width={16} height={16} />
          <div>
            <div className="simple-title">Ventriee · Simple</div>
            <div className="simple-sub">{project ? project.name : 'No project yet'}</div>
          </div>
        </div>
        <div className="simple-top-right">
          <span className="health" title={`${configured} of ${snapshot.providers.length} engines ready`}>
            <span className={`health-dot${snapshot.running ? ' on' : configured > 0 ? ' warn' : ''}`} />
            <span className="health-label">{snapshot.running ? 'working' : configured > 0 ? `${configured} engines` : 'no engines'}</span>
          </span>
          <button className="btn" onClick={toDeveloper} title="Open the full developer workspace">Developer mode</button>
        </div>
      </header>

      {!project ? (
        <div className="simple-stage">
          <div className="simple-empty">
            <h1>Let's build something</h1>
            <p className="dim">Create a project folder first. Then describe what you want in plain words and the studio builds it for you.</p>
            <button className="btn primary lg" onClick={() => setNewProject(true)}>Create a project</button>
            {snapshot.projects.length ? (
              <div className="simple-pick">
                <span className="faint text-sm">Or open an existing one:</span>
                {snapshot.projects.map((p) => (
                  <button key={p.id} className="btn" onClick={() => void guard(() => window.ventriee.selectProject(p.id))}>{p.name}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : phase === 'building' || phase === 'done' ? (
        <BuildView tasks={snapshot.tasks} running={snapshot.running} done={phase === 'done'} requireApproval={settings.requireDeployApproval} onStartOver={startOver} />
      ) : (
        <div className="simple-stage">
          <ChatThread chat={snapshot.chat} />
          {plan ? (
            <section className="simple-plan">
              <div className="simple-plan-head"><IconCheck width={14} height={14} /> Here's the plan</div>
              <div className="simple-plan-body"><RichText text={plan.body} /></div>
              {clarify.pending ? null : <div className="simple-plan-actions">
                <button className="btn primary lg" onClick={build} disabled={busy || clarify.checking}>{busy ? 'Starting…' : clarify.checking ? 'Checking…' : 'Approve & build'}</button>
                <span className="faint text-sm">Not quite right? Keep chatting below and press “Update the plan”.</span>
              </div>}
            </section>
          ) : null}
          {clarify.panel}
          <Composer
            busy={busy}
            canPlan={snapshot.chat.some((m) => m.role === 'owner' && m.content.trim())}
            hasPlan={Boolean(plan)}
            onPlan={createPlan}
            noEngine={configured === 0}
          />
        </div>
      )}

      {newProject ? <NewProjectDialog onClose={() => setNewProject(false)} /> : null}
    </div>
  )
}

function ChatThread({ chat }: { chat: ChatMessage[] }) {
  const stream = useStore((s) => s.chatStream)
  const end = useRef<HTMLDivElement>(null)
  const last = chat[chat.length - 1]
  const live = last ? stream[last.id] ?? '' : ''
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [chat.length, live.length])

  if (!chat.length) {
    return (
      <div className="simple-welcome">
        <h1>What would you like to build?</h1>
        <p className="dim">Describe it in your own words — a website, an app, a tool. I'll ask a few questions, then show you a plan to approve before any work starts.</p>
      </div>
    )
  }
  return (
    <div className="simple-chat">
      {chat.map((m) => {
        const text = m.status === 'streaming' ? stream[m.id] ?? '' : m.content
        return (
          <article key={m.id} className={`msg ${m.role}`}>
            <div className="msg-head"><span className="msg-who">{m.role === 'owner' ? 'You' : 'Ada'}</span></div>
            {text ? <div className="msg-body"><RichText text={text} /></div>
              : m.status === 'streaming' ? <div className="msg-body typing"><span /><span /><span /></div>
              : <div className="msg-body error-text">{m.content || 'No reply. Try again, or switch engine in Developer mode.'}</div>}
          </article>
        )
      })}
      <div ref={end} />
    </div>
  )
}

function Composer({ busy, canPlan, hasPlan, onPlan, noEngine }: {
  busy: boolean; canPlan: boolean; hasPlan: boolean; onPlan: () => void; noEngine: boolean
}) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const settings = snapshot.settings
  const draft = useStore((s) => s.chatDraft)
  const setDraft = useStore((s) => s.setChatDraft)
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const attach = useAttachments(project?.id)
  const mic = useVoice((text) => { const d = useStore.getState().chatDraft; setDraft(d ? `${d} ${text}` : text) })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft])

  const send = async () => {
    if (!project || !draft.trim() || sending) return
    setSending(true)
    const result = await guard(() => window.ventriee.chatSend({
      projectId: project.id, text: draft.trim(), images: attach.paths,
      engine: settings.plannerEngine, model: settings.plannerModel, endpoint: settings.plannerEndpoint
    }))
    setSending(false)
    if (result) { setDraft(''); attach.clear() }
  }

  return (
    <div className="simple-composer">
      <div className="chat-box">
        <textarea
          id="owner-input"
          ref={ref}
          value={draft}
          rows={1}
          placeholder="Describe what you want to build…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          aria-label="Describe what you want to build"
          {...attach.handlers}
        />
        {attach.strip}
        <div className="chat-box-foot">
          {noEngine ? <span className="faint text-sm">No engine is set up yet — switch to Developer mode to add one.</span>
            : <span className="chat-hint"><span className="kbd">Enter</span> send</span>}
          <div className="ml-auto flex gap-8">
            {attach.button}{mic}
            <button className="btn" onClick={onPlan} disabled={!canPlan || busy} title="Turn this conversation into a plan to approve">
              <IconSpark width={12} height={12} /> {busy ? 'Thinking…' : hasPlan ? 'Update the plan' : 'Create the plan'}
            </button>
            <button className="btn primary" data-fx="send" onClick={send} disabled={!draft.trim() || sending}>
              <IconSend width={12} height={12} /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BuildView({ tasks, running, done, requireApproval, onStartOver }: {
  tasks: Task[]; running: boolean; done: boolean; requireApproval: boolean; onStartOver: () => void
}) {
  const total = tasks.length
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'rework')
  const approvals = tasks.filter((t) => t.status === 'approval')
  const current = tasks.find((t) => t.status === 'running') ?? null
  const finishedWithIssues = done === false && !running && failed.length > 0

  return (
    <div className="simple-stage build">
      <section className="simple-progress">
        <div className="simple-progress-head">
          {done ? <h1>All done 🎉</h1>
            : finishedWithIssues ? <h1>Finished — a few steps need a look</h1>
            : <h1>Building your project…</h1>}
          <div className="simple-counts">
            <span className="ok">{doneCount} done</span>
            {running || current ? <span className="accent">{current ? current.title : 'working'}</span> : null}
            {failed.length ? <span className="warn">{failed.length} need attention</span> : null}
            <span className="faint">of {total}</span>
          </div>
          <div className="simple-bar" role="progressbar" aria-valuenow={doneCount} aria-valuemax={total} aria-label="Build progress">
            <span style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }} />
          </div>
        </div>

        {approvals.length ? (
          <div className="simple-approvals">
            <div className="section-label">Waiting for your OK{requireApproval ? '' : ''}</div>
            {approvals.map((t) => (
              <div key={t.id} className="simple-approval">
                <div className="simple-approval-main">
                  <div className="simple-approval-title">{t.title}</div>
                  {t.review ? <div className="faint text-sm clamp-3">{t.review}</div> : null}
                </div>
                <button className="btn primary" onClick={() => void guard(() => window.ventriee.approveTask(t.id), 'Approved')}>
                  <IconCheck width={12} height={12} /> Approve
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <ol className="simple-steps" aria-label="Steps">
          {tasks.map((t) => (
            <li key={t.id} className={`simple-step ${t.status}`}>
              <span className="simple-step-dot" />
              <span className="simple-step-title">{t.title}</span>
              <span className="simple-step-status">{STATUS_WORD[t.status] ?? t.status}</span>
            </li>
          ))}
        </ol>

        {(done || finishedWithIssues) ? (
          <div className="simple-progress-actions">
            <button className="btn" onClick={onStartOver}>Build something else</button>
          </div>
        ) : null}
      </section>

      <aside className="simple-preview"><Preview /></aside>
    </div>
  )
}

const STATUS_WORD: Partial<Record<Task['status'], string>> = {
  todo: 'queued', ready: 'queued', running: 'working', review: 'checking',
  rework: 'redoing', blocked: 'waiting', approval: 'needs you', done: 'done', failed: 'failed'
}
