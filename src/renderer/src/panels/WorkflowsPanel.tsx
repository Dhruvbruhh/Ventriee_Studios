import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Modal, Switch } from '../shell'
import { guard, useStore } from '../store'
import { WEBHOOK_PORT, type Workflow, type WorkflowEdge, type WorkflowNode, type WorkflowNodeKind, type WorkflowRunEvent } from '../../../shared/types'

type Field = { key: string; label: string; multiline?: boolean; placeholder?: string; options?: Array<[string, string]> }
const TRIGGERS: Array<[string, string]> = [
  ['manual', 'By hand (and the schedule, if set)'], ['webhook', 'Webhook (an HTTP POST on this computer)'], ['files', 'A file in the project changes'],
  ['git', 'A new git commit in the project'], ['run_done', 'An agent run finishes'], ['run_failed', 'An agent run fails'],
  ['github_pr', 'GitHub: the PR list changes'], ['github_ci', 'GitHub: a CI run fails']
]
const KINDS: Record<WorkflowNodeKind, { label: string; hint: string; fields: Field[] }> = {
  trigger: { label: 'Start', hint: 'Where every run begins. The trigger\'s details (the webhook body, changed files, the commit) become the input of the next step.', fields: [
    { key: 'on', label: 'Starts when', options: TRIGGERS },
    { key: 'filter', label: 'Only paths containing (files trigger)', placeholder: 'src/  or  .tsx' },
    { key: 'input', label: 'Starting text for manual runs (optional)', multiline: true }
  ] },
  wait: { label: 'Wait', hint: 'Pauses, then passes its input on unchanged.', fields: [{ key: 'seconds', label: 'Seconds (up to 3600)', placeholder: '60' }] },
  workflow: { label: 'Run workflow', hint: 'Runs another saved workflow with this input and waits for its result.', fields: [{ key: 'workflow', label: 'Workflow' }] },
  browser: { label: 'Browser', hint: 'Runs steps in the automation browser window. One step per line: goto, click, type <sel> => <text>, press, wait, waitfor, scroll, screenshot, text, viewport 390x844, expect <sel> contains <text>, inspect.', fields: [
    { key: 'steps', label: 'Steps', multiline: true, placeholder: 'goto http://localhost:3000\nviewport 390x844\nscreenshot mobile\nexpect h1 contains Welcome' }
  ] },
  ai: { label: 'Ask AI', hint: 'Asks the planner engine. {{input}} is replaced with the previous step\'s output.', fields: [
    { key: 'prompt', label: 'Prompt', multiline: true, placeholder: 'Summarise this for the client: {{input}}' },
    { key: 'system', label: 'Instructions (optional)', multiline: true }
  ] },
  agent: { label: 'Agent team', hint: 'Starts a full agent run on the workflow\'s project and waits for it to finish.', fields: [{ key: 'instruction', label: 'What the team should do', multiline: true, placeholder: 'Run the test suite and fix anything that fails' }] },
  shell: { label: 'Command', hint: 'Runs in the project folder. The previous output is in the VENTRIEE_INPUT environment variable, never pasted into the command.', fields: [
    { key: 'command', label: 'Command', placeholder: 'npm test' },
    { key: 'timeoutSec', label: 'Time limit (seconds)', placeholder: '300' }
  ] },
  http: { label: 'HTTP request', hint: 'Calls a URL. {{input}} works in the body.', fields: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/hook' },
    { key: 'method', label: 'Method', placeholder: 'POST' },
    { key: 'body', label: 'Body (optional)', multiline: true, placeholder: '{"text": "{{input}}"}' }
  ] },
  condition: { label: 'If', hint: 'Follows the green exit when the input contains this text (or matches a /regex/), otherwise the red one. Empty: any output counts as yes.', fields: [{ key: 'match', label: 'Contains', placeholder: 'FAIL  or  /error|failed/i' }] },
  notify: { label: 'Notify', hint: 'Shows a desktop notification and logs it on the project.', fields: [
    { key: 'title', label: 'Title', placeholder: 'Nightly check' },
    { key: 'message', label: 'Message', multiline: true, placeholder: '{{input}}' }
  ] },
  approval: { label: 'Approval', hint: 'Pauses the run and waits for a human to approve or reject. A desktop notification is shown. Rejecting fails the run.', fields: [
    { key: 'message', label: 'What to show the approver', placeholder: 'Please review before we deploy' }
  ] },
  switch: { label: 'Switch', hint: 'Routes to different branches based on the output. Set a "case" on each outgoing edge; the branch whose case text appears in the output is taken.', fields: [] },
  loop: { label: 'Loop', hint: 'Runs the AI prompt N times, feeding each output back as the next input. Stops early when the output matches the until condition.', fields: [
    { key: 'prompt', label: 'Prompt', multiline: true, placeholder: 'Improve this draft: {{input}}' },
    { key: 'times', label: 'Max iterations (1–10)', placeholder: '3' },
    { key: 'until', label: 'Stop early when output contains (optional)', placeholder: 'LGTM' },
    { key: 'system', label: 'Instructions (optional)', multiline: true }
  ] },
  parallel: { label: 'Parallel', hint: 'Runs multiple AI prompts at the same time and joins the results.', fields: [
    { key: 'prompts', label: 'One prompt per line ({{input}} is replaced)', multiline: true, placeholder: 'Translate to Spanish: {{input}}\nTranslate to French: {{input}}' },
    { key: 'system', label: 'Instructions (optional)', multiline: true }
  ] }
}
const PALETTE: WorkflowNodeKind[] = ['ai', 'agent', 'shell', 'browser', 'http', 'condition', 'wait', 'workflow', 'notify', 'approval', 'switch', 'loop', 'parallel']
const RETRIES: Array<[string, string]> = [['0', 'No retries'], ['1', 'Retry once'], ['2', 'Retry twice'], ['3', 'Retry 3 times']]

type Template = { name: string; scheduleMinutes?: number; steps: Array<{ kind: WorkflowNodeKind; label?: string; config?: Record<string, string> }> }
/** Each template is a chain: every step links to the next. */
const TEMPLATES: Template[] = [
  { name: 'Test on every commit', steps: [
    { kind: 'trigger', config: { on: 'git' } },
    { kind: 'shell', label: 'Run tests', config: { command: 'npm test', timeoutSec: '600' } },
    { kind: 'notify', label: 'Tests passed', config: { title: 'Tests passed', message: 'Latest commit is green.' } }
  ] },
  { name: 'Nightly agent QA', scheduleMinutes: 1440, steps: [
    { kind: 'trigger' },
    { kind: 'agent', label: 'QA pass', config: { instruction: 'Run the test suite and type checks, fix anything that fails, and summarise what changed.' } },
    { kind: 'notify', config: { title: 'Nightly QA', message: '{{input}}' } }
  ] },
  { name: 'Check the site on mobile', steps: [
    { kind: 'trigger', config: { input: 'http://localhost:3000' } },
    { kind: 'browser', label: 'Mobile check', config: { steps: 'goto http://localhost:3000\nviewport 390x844\nscreenshot mobile-home\ninspect', retries: '1' } },
    { kind: 'ai', label: 'Review layout', config: { prompt: 'These are the interactive elements on the mobile homepage. Point out anything missing or likely broken:\n{{input}}' } },
    { kind: 'notify', config: { title: 'Mobile check', message: '{{input}}' } }
  ] },
  { name: 'Summarise incoming webhook', steps: [
    { kind: 'trigger', config: { on: 'webhook' } },
    { kind: 'ai', label: 'Summarise', config: { prompt: 'Summarise this event in two sentences for the team:\n{{input}}' } },
    { kind: 'notify', config: { title: 'Webhook', message: '{{input}}' } }
  ] }
]

function fromTemplate(t: Template, projectId: string | null): Partial<Workflow> & { name: string } {
  const nodes: WorkflowNode[] = t.steps.map((s, i) => ({
    id: uid('n'), kind: s.kind, x: 40 + i * (NODE_W + 50), y: 80, label: s.label ?? KINDS[s.kind].label,
    config: s.kind === 'trigger' && s.config?.on === 'webhook' ? { ...s.config, token: crypto.randomUUID().replaceAll('-', '') } : { ...s.config }
  }))
  const edges: WorkflowEdge[] = nodes.slice(1).map((n, i) => ({ id: uid('e'), from: nodes[i].id, to: n.id }))
  return { name: t.name, projectId, nodes, edges, scheduleMinutes: t.scheduleMinutes ?? 0, enabled: true }
}
const NODE_W = 180
const NODE_H = 54
const uid = (p: string) => `${p}_${crypto.randomUUID().slice(0, 8)}`
const snap = (n: number) => Math.max(0, Math.round(n / 10) * 10)

function portY(node: WorkflowNode, branch?: 'true' | 'false') {
  if (node.kind !== 'condition' || !branch) return node.y + NODE_H / 2
  return node.y + NODE_H * (branch === 'true' ? 0.35 : 0.7)
}
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

export function WorkflowsPanel({ onClose }: { onClose: () => void }) {
  const projects = useStore((s) => s.snapshot?.projects ?? [])
  const activeProjectId = useStore((s) => s.snapshot?.activeProjectId ?? null)
  const [list, setList] = useState<Workflow[]>([])
  const [draft, setDraft] = useState<Workflow | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [run, setRun] = useState<{ runId: string; status: Record<string, WorkflowRunEvent['status']>; log: WorkflowRunEvent[]; done: boolean; pendingApproval: { nodeId: string; label: string } | null } | null>(null)
  const [linking, setLinking] = useState<{ from: string; branch?: 'true' | 'false'; x: number; y: number } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<import('../../../shared/types').WorkflowVersion[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const load = async (keep?: string) => {
    const all = await guard(() => window.ventriee.workflowList())
    if (!all) return
    setList(all)
    const pick = all.find((w) => w.id === (keep ?? draft?.id)) ?? all[0] ?? null
    setDraft(pick)
    setDirty(false)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => window.ventriee.onWorkflowEvent((e) => {
    setRun((r) => {
      if (!r || e.runId !== r.runId) return r
      const isApproval = e.status === 'running' && e.output?.startsWith('Waiting for approval:')
      return {
        ...r,
        status: e.nodeId ? { ...r.status, [e.nodeId]: e.status } : r.status,
        log: [...r.log, e].slice(-200),
        done: r.done || (!e.nodeId && (e.status === 'finished' || e.status === 'failed')),
        pendingApproval: isApproval && e.nodeId ? { nodeId: e.nodeId, label: e.output.slice('Waiting for approval: '.length) } : (r.pendingApproval && r.status[r.pendingApproval.nodeId] !== 'running' ? null : r.pendingApproval)
      }
    })
  }), [])

  const change = (patch: Partial<Workflow>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true) }
  const changeNode = (id: string, patch: Partial<WorkflowNode>) => {
    setDirty(true)
    setDraft((d) => (d ? { ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } : d))
  }

  const create = async () => {
    const wf = await guard(() => window.ventriee.workflowSave({
      name: `Workflow ${list.length + 1}`,
      projectId: activeProjectId,
      nodes: [{ id: uid('n'), kind: 'trigger', x: 40, y: 80, label: 'Start', config: {} }],
      edges: []
    }))
    if (wf) { setRun(null); await load(wf.id) }
  }
  const createFrom = async (index: number) => {
    const t = TEMPLATES[index]
    if (!t) return
    const wf = await guard(() => window.ventriee.workflowSave(fromTemplate(t, activeProjectId)), `Added "${t.name}"`)
    if (wf) { setRun(null); setSelected(null); await load(wf.id) }
  }
  const save = async () => {
    if (!draft) return null
    const saved = await guard(() => window.ventriee.workflowSave(draft), 'Workflow saved')
    if (saved) { setDraft(saved); setDirty(false); setList((l) => l.map((w) => (w.id === saved.id ? saved : w))) }
    return saved
  }
  const remove = async () => {
    if (!draft || !window.confirm(`Delete the workflow "${draft.name}"?`)) return
    await guard(() => window.ventriee.workflowDelete(draft.id))
    setRun(null)
    setSelected(null)
    await load('')
  }
  const start = async () => {
    const saved = dirty ? await save() : draft
    if (!saved) return
    const r = await guard(() => window.ventriee.workflowRun(saved.id))
    if (r) setRun({ runId: r.runId, status: {}, log: [], done: false, pendingApproval: null })
  }

  const openHistory = async () => {
    if (!draft) return
    const vers = await guard(() => window.ventriee.workflowVersions(draft.id))
    if (vers) { setVersions(vers as import('../../../shared/types').WorkflowVersion[]); setShowHistory(true) }
  }

  const restoreVersion = async (versionId: string) => {
    if (!draft) return
    const restored = await guard(() => window.ventriee.workflowRestore(draft.id, versionId), 'Workflow restored')
    if (restored) { setDraft(restored); setDirty(false); setShowHistory(false) }
  }

  const approve = async (approved: boolean) => {
    if (!run?.pendingApproval) return
    await guard(() => window.ventriee.workflowApprove(run.runId, run.pendingApproval!.nodeId, approved))
    setRun((r) => r ? { ...r, pendingApproval: null } : r)
  }
  const choose = async (wf: Workflow) => {
    if (dirty && draft && !window.confirm('Discard unsaved changes to this workflow?')) return
    setDraft(wf)
    setDirty(false)
    setSelected(null)
    setRun(null)
  }

  const addNode = (kind: WorkflowNodeKind) => {
    if (!draft) return
    // Next to the newest step, wrapping to a new row so steps never stack.
    const last = draft.nodes.at(-1)
    const visible = stageRef.current?.parentElement?.clientWidth ?? 800
    const wrap = !last || last.x + NODE_W * 2 + 60 > visible
    const x = snap(last ? (wrap ? 40 : last.x + NODE_W + 50) : 40)
    const y = snap(last ? (wrap ? last.y + NODE_H + 60 : last.y) : 80)
    const node: WorkflowNode = { id: uid('n'), kind, x, y, label: KINDS[kind].label, config: {} }
    change({ nodes: [...draft.nodes, node] })
    setSelected(node.id)
  }
  const deleteNode = (id: string) => {
    if (!draft) return
    change({ nodes: draft.nodes.filter((n) => n.id !== id), edges: draft.edges.filter((e) => e.from !== id && e.to !== id) })
    setSelected(null)
  }
  const deleteEdge = (id: string) => draft && change({ edges: draft.edges.filter((e) => e.id !== id) })

  const stagePoint = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onNodeDown = (e: ReactPointerEvent, node: WorkflowNode) => {
    if ((e.target as HTMLElement).closest('.wf-port')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = stagePoint(e)
    drag.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y }
    setSelected(node.id)
  }
  const onNodeMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const p = stagePoint(e)
    changeNode(drag.current.id, { x: snap(p.x - drag.current.dx), y: snap(p.y - drag.current.dy) })
  }
  const onNodeUp = () => { drag.current = null }

  const startLink = (e: ReactPointerEvent, node: WorkflowNode, branch?: 'true' | 'false') => {
    e.stopPropagation()
    e.preventDefault()
    setLinking({ from: node.id, branch, ...stagePoint(e) })
    const move = (ev: PointerEvent) => setLinking((l) => (l ? { ...l, ...stagePoint(ev) } : l))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLinking(null)
      const to = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-node]')?.dataset.node
      if (!to || to === node.id) return
      setDirty(true)
      setDraft((d) => {
        if (!d || d.edges.some((x) => x.from === node.id && x.to === to && x.branch === branch)) return d
        const edge: WorkflowEdge = { id: uid('e'), from: node.id, to, ...(branch ? { branch } : {}) }
        return { ...d, edges: [...d.edges, edge] }
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const node = draft?.nodes.find((n) => n.id === selected) ?? null
  const byId = new Map(draft?.nodes.map((n) => [n.id, n]) ?? [])
  const running = Boolean(run && !run.done)

  return (
    <Modal title="Workflows" subtitle="Chain AI, agent runs, commands and checks into a flow you can run by hand or on a schedule." onClose={onClose}>
      <div className="wf">
        <aside className="wf-side">
          <button className="btn primary" onClick={() => void create()}>New workflow</button>
          <select className="input" value="" onChange={(e) => void createFrom(Number(e.target.value))} aria-label="Start from a template">
            <option value="" disabled>From a template…</option>
            {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
          </select>
          <nav className="wf-list" aria-label="Workflows">
            {list.map((w) => <button key={w.id} className={w.id === draft?.id ? 'on' : ''} onClick={() => void choose(w)}>{w.name}{w.scheduleMinutes ? ' ⏱' : ''}</button>)}
          </nav>
          {draft ? <>
            <div className="section-label">Add a step</div>
            <div className="wf-palette">
              {PALETTE.map((k) => <button key={k} onClick={() => addNode(k)} title={KINDS[k].hint}>+ {KINDS[k].label}</button>)}
            </div>
          </> : null}
        </aside>

        <div className="wf-canvas" onPointerDown={(e) => { if (e.target === e.currentTarget || e.target === stageRef.current) setSelected(null) }}
          onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && selected && byId.get(selected)?.kind !== 'trigger') deleteNode(selected) }} tabIndex={0}>
          {draft ? (
            <div className="wf-stage" ref={stageRef}>
              <svg aria-hidden={false}>
                {draft.edges.map((e) => {
                  const a = byId.get(e.from)
                  const b = byId.get(e.to)
                  if (!a || !b) return null
                  return <path key={e.id} className={`wf-edge${e.branch === 'false' ? ' false' : ''}`} d={curve(a.x + NODE_W, portY(a, e.branch ?? (a.kind === 'condition' ? 'true' : undefined)), b.x, b.y + NODE_H / 2)} onClick={() => deleteEdge(e.id)}>
                    <title>Click to remove this link</title>
                  </path>
                })}
                {linking && byId.get(linking.from) ? (() => {
                  const a = byId.get(linking.from)!
                  return <path className="wf-edge pending" d={curve(a.x + NODE_W, portY(a, linking.branch), linking.x, linking.y)} />
                })() : null}
              </svg>
              {draft.nodes.map((n) => (
                <div key={n.id} data-node={n.id} className={`wf-node${n.id === selected ? ' selected' : ''}${run?.status[n.id] ? ` ${run.status[n.id]}` : ''}`}
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                  onPointerDown={(e) => onNodeDown(e, n)} onPointerMove={onNodeMove} onPointerUp={onNodeUp}
                  onClick={() => setSelected(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id) } }}
                  tabIndex={0} role="button" aria-label={`${KINDS[n.kind].label}: ${n.label}`} aria-pressed={n.id === selected}>
                  <div className="wf-kind">{KINDS[n.kind].label}</div>
                  <div className="wf-label">{n.label}</div>
                  {n.kind !== 'trigger' ? <span className="wf-port in" /> : null}
                  {n.kind === 'condition' ? <>
                    <span className="wf-port out true" title="Yes: drag to the next step" onPointerDown={(e) => startLink(e, n, 'true')} />
                    <span className="wf-port out false" title="No: drag to the next step" onPointerDown={(e) => startLink(e, n, 'false')} />
                  </> : <span className="wf-port out" title="Drag to the next step" onPointerDown={(e) => startLink(e, n)} />}
                </div>
              ))}
            </div>
          ) : <p className="settings-empty" style={{ padding: 24 }}>No workflows yet. Create one to start.</p>}
        </div>

        <aside className="wf-props">
          {draft ? <>
            <div className="wf-toolbar">
              {running
                ? <button className="btn" onClick={() => void guard(() => window.ventriee.workflowStop(draft.id))}>Stop</button>
                : <button className="btn primary" onClick={() => void start()}>Run</button>}
              <button className="btn" onClick={() => void save()} disabled={!dirty}>{dirty ? 'Save' : 'Saved'}</button>
              <button className="btn" onClick={() => void openHistory()} title="Version history">History</button>
            </div>
            {showHistory ? (
              <Modal title="Version history" onClose={() => setShowHistory(false)} narrow>
                {versions.length ? versions.map((v) => (
                  <div key={v.id} className="item-row">
                    <div className="item-main"><div className="item-title"><b>{v.name}</b></div><p className="item-meta">{new Date(v.createdAt).toLocaleString()}</p></div>
                    <button className="btn" onClick={() => void restoreVersion(v.id)}>Restore</button>
                  </div>
                )) : <p className="settings-empty">No saved versions yet.</p>}
              </Modal>
            ) : null}
            {node ? <>
              <div className="section-label">{KINDS[node.kind].label} step</div>
              <p className="dim text-sm">{KINDS[node.kind].hint}</p>
              <label>Name<input className="input" value={node.label} onChange={(e) => changeNode(node.id, { label: e.target.value })} /></label>
              {KINDS[node.kind].fields.map((f) => {
                const set = (value: string) => {
                  const config = { ...node.config, [f.key]: value }
                  if (f.key === 'on' && value === 'webhook' && !config.token) config.token = crypto.randomUUID().replaceAll('-', '')
                  changeNode(node.id, { config })
                }
                const options = f.key === 'workflow' ? list.filter((w) => w.id !== draft.id).map((w): [string, string] => [w.name, w.name]) : f.options
                if (f.key === 'filter' && node.config.on !== 'files') return null
                return <label key={f.key}>{f.label}
                  {options
                    ? <select className="input" value={node.config[f.key] ?? options[0]?.[0] ?? ''} onChange={(e) => set(e.target.value)}>
                        {f.key === 'workflow' ? <option value="">Pick a workflow</option> : null}
                        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    : f.multiline
                      ? <textarea className="input" value={node.config[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
                      : <input className="input" value={node.config[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />}
                </label>
              })}
              {node.kind === 'trigger' && node.config.on === 'webhook' && node.config.token ? (
                <label>Webhook address (POST; the body becomes the input)
                  <input className="input mono" readOnly value={`http://127.0.0.1:${WEBHOOK_PORT}/hooks/${draft.id}/${node.config.token}`} onFocus={(e) => e.currentTarget.select()} />
                  <span className="dim">Only reachable from this computer. Save first; anyone with this address on this machine can start the workflow.</span>
                </label>
              ) : null}
              {node.kind === 'trigger' && ['files', 'git', 'run_done', 'run_failed', 'github_pr', 'github_ci'].includes(node.config.on ?? '') && !draft.projectId
                ? <p className="vx-err">Pick a project for this workflow (click the empty canvas) so this trigger knows where to watch.</p> : null}
              {node.kind !== 'trigger' && node.kind !== 'condition' ? (
                <label>If it fails
                  <select className="input" value={node.config.retries ?? '0'} onChange={(e) => changeNode(node.id, { config: { ...node.config, retries: e.target.value } })}>
                    {RETRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ) : null}
              {node.kind !== 'trigger' ? <button className="btn" onClick={() => deleteNode(node.id)}>Delete step</button> : null}
            </> : <>
              <label>Name<input className="input" value={draft.name} onChange={(e) => change({ name: e.target.value })} /></label>
              <label>Project
                <select className="input" value={draft.projectId ?? ''} onChange={(e) => change({ projectId: e.target.value || null })}>
                  <option value="">None (commands run in your home folder)</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label>Run every (minutes, 0 = only by hand)
                <input className="input" type="number" min={0} value={draft.scheduleMinutes} onChange={(e) => change({ scheduleMinutes: Number(e.target.value) || 0 })} />
              </label>
              <div className="row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch on={draft.enabled} onClick={() => change({ enabled: !draft.enabled })} label="Schedule enabled" />
                <span className="text-sm">Schedule enabled</span>
              </div>
              <p className="dim text-sm">Drag from a step's right dot to the next step to link them. Click a link to remove it.</p>
              <button className="btn" onClick={() => void remove()}>Delete workflow</button>
            </>}
            {run ? <>
              <div className="section-label">Last run</div>
              {run.pendingApproval ? (
                <div className="inset-form" style={{ marginBottom: 8 }}>
                  <p className="text-sm"><b>Approval required:</b> {run.pendingApproval.label}</p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <button className="btn primary" onClick={() => void approve(true)}>Approve</button>
                    <button className="btn" onClick={() => void approve(false)}>Reject</button>
                  </div>
                </div>
              ) : null}
              <div className="wf-log" aria-live="polite">
                {run.log.filter((e) => e.status !== 'running').map((e, i) => (
                  <div key={i} className={e.status}>
                    <b>{e.nodeId ? byId.get(e.nodeId)?.label ?? 'Step' : 'Workflow'}</b> · {e.status}{e.output ? `\n${e.output.slice(0, 1200)}` : ''}
                  </div>
                ))}
                {!run.done ? <div>Running…</div> : null}
              </div>
            </> : null}
          </> : null}
        </aside>
      </div>
    </Modal>
  )
}
