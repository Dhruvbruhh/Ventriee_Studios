import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../shell'
import { guard, useStore, cleanError } from '../store'
import type { RunSummary, UsageRow } from '../../../shared/types'

type Change = { path: string; status: 'added' | 'modified' | 'deleted' }
const tokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const money = (run: { costUsd: number; costReported?: boolean }) => run.costUsd > 0 ? `$${run.costUsd.toFixed(run.costUsd < 1 ? 3 : 2)}` : run.costReported === false ? 'not reported' : '$0'
const time = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds)} s`
/** Instructions are often markdown prompts: skip bare headings like "## Objective" and show the first real line. */
export function runTitle(instruction: string) {
  const lines = instruction.split('\n').map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean)
  const first = lines[0] ?? ''
  const line = /^(objective|goal|task|brief|overview|summary)$/i.test(first) && lines[1] ? lines[1] : first
  return line.slice(0, 120) || 'Run'
}

function Usage({ title, rows }: { title: string; rows: UsageRow[] }) {
  return <table className="runs-table"><caption>{title}</caption><thead><tr><th>Name</th><th>Sessions</th><th>Tokens in / out</th><th>Time</th><th>Cost</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.sessions}</td><td>{tokens(r.inputTokens)} / {tokens(r.outputTokens)}</td><td>{time(r.seconds)}</td><td>{money({ costUsd: r.costUsd })}</td></tr>)}</tbody></table>
}

/** Every run of this project: what it used, what it cost, and an undo back to its pre-run checkpoint. */
export function RunsPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)!
  const project = snapshot.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [changes, setChanges] = useState<Record<string, Change[] | 'loading'>>({})
  const [undoing, setUndoing] = useState('')
  const [spend, setSpend] = useState<Awaited<ReturnType<typeof window.ventriee.spendToday>> | null>(null)
  const load = useCallback(async () => {
    if (!project) return
    try { setRuns(await window.ventriee.runsList(project.id)); setSpend(await window.ventriee.spendToday(project.id)); setError('') } catch (e) { setError(cleanError(e)) }
  }, [project])
  useEffect(() => { void load() }, [load, snapshot.running])
  const review = async (jobId: string) => {
    if (!project) return
    setChanges((c) => ({ ...c, [jobId]: 'loading' }))
    const list = await guard(() => window.ventriee.runChanges(project.id, jobId))
    setChanges((c) => ({ ...c, [jobId]: list ?? [] }))
  }
  const undo = async (run: RunSummary, list: Change[]) => {
    if (!project || undoing) return
    const added = list.filter((c) => c.status === 'added').length
    if (!window.confirm(`Undo "${run.instruction.slice(0, 80)}"?\n\n${list.length - added} file(s) go back to how they were before this run and ${added} file(s) it created are deleted. Any edits you made to these files since then are lost too.`)) return
    setUndoing(run.jobId)
    const count = await guard(() => window.ventriee.runUndo(project.id, run.jobId), 'Run undone: files restored from the checkpoint')
    setUndoing('')
    if (count !== null) { setChanges((c) => ({ ...c, [run.jobId]: [] })); void load() }
  }
  const total = runs?.reduce((n, r) => n + r.costUsd, 0) ?? 0
  const allTokens = runs?.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0) ?? 0
  const succeeded = runs?.filter((r) => r.status === 'done').length ?? 0
  return <Modal title="Runs" subtitle={project ? `${project.name}: usage, cost and undo for each run` : 'No project open'} onClose={onClose}>
    {error ? <p className="editor-error" role="alert">{error}</p> : null}
    {runs?.length ? <div className="metrics space-below">
      <div className="metric"><div className="metric-value">{runs.length}</div><div className="metric-label">Runs</div></div>
      <div className="metric"><div className="metric-value">{succeeded}<small>/{runs.length}</small></div><div className="metric-label">Finished cleanly</div></div>
      <div className="metric"><div className="metric-value">{tokens(allTokens)}</div><div className="metric-label">Tokens</div></div>
      <div className="metric"><div className="metric-value">{total > 0 ? `$${total.toFixed(2)}` : '$0'}</div><div className="metric-label">{spend ? `Today $${spend.all.toFixed(2)}${spend.dailyBudgetUsd > 0 ? ` of $${spend.dailyBudgetUsd.toFixed(2)}` : ''}` : 'Reported cost'}</div></div>
    </div> : null}
    {!runs ? <p className="hint" role="status">Loading runs…</p> : !runs.length ? <p className="settings-empty">No runs yet. Assign a prompt or brief the orchestrator to start one.</p> : <>
      <p className="hint space-below">Cost is only what an engine reports (API usage); subscription CLIs usually report none. Sessions are matched to a run by when they started. Daily and project limits are in Settings.</p>
      {runs.map((run) => {
        const list = changes[run.jobId]
        return <section className={`run-card${open === run.jobId ? ' open' : ''}`} key={run.jobId}>
          <button className="run-head" aria-expanded={open === run.jobId} onClick={() => setOpen(open === run.jobId ? null : run.jobId)}>
            <span className="run-title" title={run.instruction}>{runTitle(run.instruction)}</span>
            <span className={`badge ${run.status === 'done' ? 'ok' : run.status === 'failed' ? 'err' : run.status === 'running' ? 'accent' : ''}`}>{run.status}</span>
            <span className="dim">{new Date(run.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="run-stats">{run.sessions} {run.sessions === 1 ? 'session' : 'sessions'}<i />{tokens(run.inputTokens + run.outputTokens)} tokens<i />{money(run)}{run.endedAt ? <><i />{time((run.endedAt - run.startedAt) / 1000)}</> : null}</span>
          </button>
          {open === run.jobId ? <div className="run-body">
            {run.byModel.length ? <><Usage title="By model" rows={run.byModel} /><Usage title="By worker" rows={run.byAgent} /></> : <p className="hint">No worker sessions recorded for this run.</p>}
            <div className="run-undo">
              {!run.checkpoint ? <p className="hint">No checkpoint for this run (it started before checkpoints existed, or saving one failed; the Activity log says why), so it cannot be undone here.</p>
                : list === undefined ? <button className="btn" onClick={() => void review(run.jobId)}>Review undo</button>
                : list === 'loading' ? <p className="hint" role="status">Comparing with the checkpoint…</p>
                : !list.length ? <p className="hint">The project matches this run's checkpoint: nothing to undo.</p>
                : <><p className="hint">Undoing puts the project back to just before this run. Later runs' changes to the same files are undone too.</p>
                  <ul className="run-changes">{list.slice(0, 200).map((c) => <li key={c.path}><b className={`git-${c.status === 'added' ? 'A' : c.status === 'deleted' ? 'D' : 'M'}`}>{c.status === 'added' ? 'delete' : 'restore'}</b> {c.path}</li>)}</ul>
                  {list.length > 200 ? <p className="hint">…and {list.length - 200} more</p> : null}
                  <button className="btn danger" disabled={Boolean(undoing) || snapshot.running} onClick={() => void undo(run, list)}>{undoing === run.jobId ? 'Undoing…' : snapshot.running ? 'Stop the active run first' : `Undo this run (${list.length} files)`}</button></>}
            </div>
          </div> : null}
        </section>
      })}
    </>}
  </Modal>
}
