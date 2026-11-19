import { useCallback, useEffect, useState } from 'react'
import { guard, cleanError } from '../store'

/** Knowledge-graph panel: build a graphify index for the project and query it. */
export function GraphPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<{ installed: boolean; indexed: boolean; nodes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try { setStatus(await window.ventriee.graphifyStatus(projectId)); setError('') }
    catch (reason) { setError(cleanError(reason)) }
  }, [projectId])
  useEffect(() => { void refresh() }, [refresh])

  const build = async () => {
    setBusy(true); setAnswer('')
    const result = await guard(() => window.ventriee.graphifyBuild(projectId), 'Knowledge graph built')
    setBusy(false)
    if (result?.ok === false) setError(result.out)
    await refresh()
  }

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || busy) return
    setBusy(true); setError(''); setAnswer('')
    const result = await guard(() => window.ventriee.graphifyQuery(projectId, question.trim()))
    setBusy(false)
    if (result) { setAnswer(result.out || 'No answer'); if (result.ok === false) setError(result.out) }
  }

  return (
    <div className="graph-panel">
      <div className="code-section-head">
        <strong>KNOWLEDGE GRAPH</strong>
        <button className="btn tiny" onClick={() => void refresh()} disabled={busy}>Refresh</button>
      </div>
      {error ? <p className="editor-error" role="alert">{error}</p> : null}
      {!status ? <p className="code-empty" role="status">Checking graphify…</p> : !status.installed ? (
        <p className="code-empty">graphify is not installed. Run <code>pip install graphifyy</code>, then rebuild.</p>
      ) : !status.indexed ? (
        <div className="code-empty">
          <p>No knowledge graph for this project yet. Indexes code locally (no API key); large projects take a few minutes.</p>
          <button className="btn primary" disabled={busy} onClick={() => void build()}>{busy ? 'Building…' : 'Build knowledge graph'}</button>
        </div>
      ) : (
        <>
          <p className="dim">{status.nodes} concepts indexed. <button className="btn tiny" disabled={busy} onClick={() => void build()}>{busy ? 'Rebuilding…' : 'Rebuild'}</button></p>
          <form onSubmit={ask} className="graph-query">
            <input className="input" aria-label="Ask the knowledge graph" placeholder="What connects auth to the database?" value={question} onChange={(e) => setQuestion(e.target.value)} />
            <button className="btn primary" disabled={busy || !question.trim()}>Ask</button>
          </form>
          {answer ? <pre className="graph-answer">{answer}</pre> : null}
        </>
      )}
    </div>
  )
}
