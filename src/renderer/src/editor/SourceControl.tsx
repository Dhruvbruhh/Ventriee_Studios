import { useCallback, useEffect, useState } from 'react'
import { IconExternal } from '../icons'
import type { GitAction, GitChange, GitState } from '../../../shared/workspace'
import { guard, useStore } from '../store'

export function SourceControl({ projectId, onDiff, onOpen, refreshKey }: {
  projectId: string; onDiff: (path: string, staged: boolean) => void; onOpen: (path: string) => void; refreshKey: number
}) {
  const [state, setState] = useState<GitState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [branch, setBranch] = useState('')
  const [remote, setRemote] = useState('')
  const refresh = useCallback(async () => {
    try { const next = await window.ventriee.gitStatus(projectId); setState(next); setError('') }
    catch (reason) { setError(String(reason).replace(/^Error invoking remote method '[^']+':\s*(Error: )?/, '')) }
  }, [projectId])
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer) }, [refresh, refreshKey])
  const run = async (action: GitAction, path?: string, value?: string) => {
    if (busy) return
    if (['checkout', 'branch', 'pull'].includes(action) && useStore.getState().editorDirty) {
      useStore.getState().notify('Save or close unsaved files before changing the working tree.', 'error'); return
    }
    if (action === 'push' && !window.confirm('Push your committed changes to the configured remote?')) return
    setBusy(true)
    try {
      await window.ventriee.gitAction(projectId, action, path, value)
      if (action === 'commit') setMessage('')
      if (action === 'branch') setBranch('')
      await refresh()
    } catch (reason) { setError(String(reason).replace(/^Error invoking remote method '[^']+':\s*(Error: )?/, '')) }
    finally { setBusy(false) }
  }
  const group = (title: string, changes: GitChange[], staged: boolean) => <section className="sc-group"><h3>{title}<span>{changes.length}</span></h3>
    {changes.map((change) => <div className="sc-file" key={change.path}>
      <button className="sc-path" onClick={() => onDiff(change.path, staged)} title={`${change.originalPath ? `${change.originalPath} → ` : ''}${change.path}`}>
        <b className={`git-${staged ? change.index : change.working}`}>{staged ? change.index : change.working}</b><span>{change.path}</span>
      </button>
      <button className="sc-action" disabled={busy} onClick={() => void run(staged ? 'unstage' : 'stage', change.path)} aria-label={`${staged ? 'Unstage' : 'Stage'} ${change.path}`} title={staged ? 'Unstage' : 'Stage'}>{staged ? '−' : '+'}</button>
      {change.working !== 'D' && change.index !== 'D' ? <button className="sc-action" onClick={() => onOpen(change.path)} aria-label={`Edit ${change.path}`} title="Open file"><IconExternal width={13} height={13} aria-hidden /></button> : null}
    </div>)}
  </section>
  return <div className="source-control"><div className="code-section-head"><strong>SOURCE CONTROL</strong><button className="btn tiny" onClick={() => void refresh()} disabled={busy}>Refresh</button></div>
    {error ? <p className="editor-error" role="alert">{error}</p> : null}
    {!state ? <p className="code-empty" role="status">{error ? 'Source Control is unavailable.' : 'Reading repository…'}</p> : !state.repository ? <div className="code-empty"><p>This workspace has no Git repository.</p><button className="btn primary" disabled={busy} onClick={() => void run('init')}>Initialize repository</button></div> : <>
      <div className="sc-branch"><label htmlFor="git-branch">Branch</label><select id="git-branch" className="select" value={state.branch} disabled={busy} onChange={(e) => void run('checkout', undefined, e.target.value)}>
        {!state.branches.includes(state.branch) ? <option>{state.branch}</option> : null}{state.branches.map((name) => <option key={name}>{name}</option>)}</select><small>{state.ahead} ahead · {state.behind} behind</small></div>
      <div className="sc-remote">{(['fetch', 'pull', 'push'] as const).map((action) => <button className="btn" key={action} disabled={busy} onClick={() => void run(action)}>{action[0].toUpperCase() + action.slice(1)}</button>)}</div>
      <form className="sc-new-branch" onSubmit={(e) => { e.preventDefault(); if (state.remote && !window.confirm('Replace the origin remote URL?')) return; void run('remote', undefined, remote) }}>
        <label className="field-label" htmlFor="git-remote">Origin remote</label><small className="dim" style={{ overflowWrap: 'anywhere' }}>{state.remote || 'No remote configured'}</small>
        <input id="git-remote" className="input" value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://github.com/owner/repo.git" /><button className="btn" disabled={busy || !remote.trim()}>Set remote</button>
      </form>
      <div className="sc-commit"><textarea className="textarea" aria-label="Commit message" placeholder="Commit message" value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} rows={3} />
        <button className="btn primary" disabled={busy || !message.trim() || !state.changes.some((c) => c.index !== ' ' && c.index !== '?')} onClick={() => void run('commit', undefined, message)}>{busy ? 'Working…' : 'Commit staged changes'}</button></div>
      {group('STAGED CHANGES', state.changes.filter((c) => c.index !== ' ' && c.index !== '?'), true)}
      {group('WORKING TREE', state.changes.filter((c) => c.working !== ' '), false)}
      {!state.changes.length ? <p className="code-empty">Working tree clean</p> : null}
      {state.totalChanges ? <p className="tree-note" role="status">Showing {state.changes.length.toLocaleString()} of {state.totalChanges.toLocaleString()} changes. Add generated folders to .gitignore to see the rest.</p> : null}
      <form className="sc-new-branch" onSubmit={(e) => { e.preventDefault(); void run('branch', undefined, branch) }}><input className="input" aria-label="New branch name" placeholder="New branch name" value={branch} onChange={(e) => setBranch(e.target.value)} /><button className="btn" disabled={busy || !branch.trim()}>Create branch</button></form>
      <section className="sc-group"><h3>RECENT COMMITS</h3>{state.log.map((entry) => <div className="sc-log" key={entry.hash}><code>{entry.hash}</code><span>{entry.message}</span></div>)}</section>
    </>}
  </div>
}
