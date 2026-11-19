import { useEffect, useState } from 'react'
import { RichText } from '../components/RichText'
import { guard } from '../store'

type Item = { number: number; title: string; author?: { login: string }; headRefName?: string; isDraft?: boolean; updatedAt: string; url: string; reviewDecision?: string; labels?: Array<{ name: string }> }
type Details = Item & { body: string; baseRefName?: string; state: string; files?: Array<{ path: string; additions: number; deletions: number }>; comments?: Array<{ author: { login: string }; body: string }>
  statusCheckRollup?: Array<{ name?: string; context?: string; conclusion?: string; state?: string; status?: string }>; mergeable?: string }

/** Pull requests and issues of the project's GitHub repository, through the owner's `gh` login. Anything posted is a button press. */
export function GitHubPanel({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<'prs' | 'issues'>('prs')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<Details | null>(null)
  const [diff, setDiff] = useState('')
  const [review, setReview] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState('')
  const run = (action: Parameters<typeof window.ventriee.github>[1]) => window.ventriee.github(projectId, action)
  const load = () => {
    setItems(null); setError('')
    run({ kind }).then((list) => setItems(list as Item[]), (e) => setError(String(e).replace(/^Error invoking remote method '[^']+':\s*(Error: )?/, '')))
  }
  useEffect(load, [kind, projectId])
  const show = async (n: number) => {
    setDiff(''); setReview(''); setBody('')
    const d = await guard(() => run({ kind: kind === 'prs' ? 'pr' : 'issue', number: n }))
    if (d) setOpen(d as Details)
  }
  const act = async (label: string, work: () => Promise<unknown>, done: string) => {
    setBusy(label)
    const r = await guard(work, done)
    setBusy('')
    if (r !== null && open) { setBody(''); await show(open.number) }
  }

  if (open) {
    const isPr = kind === 'prs'
    const checks = open.statusCheckRollup ?? []
    const failing = checks.filter((c) => /fail|error|cancel/i.test(c.conclusion ?? c.state ?? ''))
    return <div className="ext-panel">
      <button className="btn tiny" onClick={() => setOpen(null)}>Back</button>
      <h3>#{open.number} {open.title}</h3>
      <p className="tree-note">{open.author?.login} · {open.state}{isPr ? ` · ${open.headRefName} → ${open.baseRefName}${open.isDraft ? ' · draft' : ''}${open.reviewDecision ? ` · ${open.reviewDecision.toLowerCase().replace(/_/g, ' ')}` : ''}` : ''}</p>
      {isPr && checks.length ? <p className="tree-note">Checks: {checks.length - failing.length}/{checks.length} passing{failing.length ? ` — failing: ${failing.map((c) => c.name ?? c.context).join(', ')}` : ''}</p> : null}
      <div className="ext-readme"><RichText text={open.body || '(no description)'} /></div>
      {isPr ? <>
        <p className="tree-note">{open.files?.length ?? 0} files changed</p>
        <div className="code-search-row">
          <button className="btn tiny" onClick={() => void guard(() => run({ kind: 'diff', number: open.number })).then((d) => setDiff(String(d ?? '')))}>View diff</button>
          <button className="btn tiny" disabled={busy === 'ai'} onClick={() => { setBusy('ai'); void guard(() => window.ventriee.githubReview(projectId, open.number)).then((r) => { setBusy(''); if (r) setReview(r.answer) }) }}>{busy === 'ai' ? 'Reviewing…' : 'AI review'}</button>
          <button className="btn tiny" disabled={busy === 'checkout'} onClick={() => void act('checkout', () => run({ kind: 'checkout', number: open.number }), `Checked out #${open.number}`)}>Check out</button>
        </div></> : null}
      {review ? <div className="ext-readme" aria-label="AI review"><b>AI review</b><RichText text={review} /></div> : null}
      {diff ? <pre className="gh-diff" aria-label="Pull request diff">{diff.split('\n').slice(0, 5000).map((l, i) => <span key={i} className={l.startsWith('+') && !l.startsWith('+++') ? 'add' : l.startsWith('-') && !l.startsWith('---') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}>{l}{'\n'}</span>)}</pre> : null}
      {(open.comments ?? []).slice(-20).map((c, i) => <div key={i} className="gh-comment"><b>{c.author.login}</b><RichText text={c.body} /></div>)}
      <textarea className="textarea" rows={4} aria-label="Comment or review" placeholder="Write a comment or review…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={65_000} />
      <div className="code-search-row">
        <button className="btn tiny" disabled={!body.trim() || Boolean(busy)} onClick={() => void act('comment', () => run({ kind: 'comment', number: open.number, body, issue: !isPr }), 'Comment posted')}>Comment</button>
        {isPr ? <>
          <button className="btn tiny" disabled={!body.trim() || Boolean(busy)} onClick={() => void act('changes', () => run({ kind: 'review', number: open.number, event: 'request-changes', body }), 'Changes requested')}>Request changes</button>
          <button className="btn tiny" disabled={Boolean(busy)} onClick={() => void act('approve', () => run({ kind: 'review', number: open.number, event: 'approve', body }), 'Approved')}>Approve</button>
          <button className="btn tiny primary" disabled={Boolean(busy) || open.state !== 'OPEN'} onClick={() => { if (window.confirm(`Merge #${open.number} into ${open.baseRefName}?`)) void act('merge', () => run({ kind: 'merge', number: open.number, method: 'merge' }), `Merged #${open.number}`) }}>Merge</button></> : null}
      </div>
      <a className="tree-note" href={open.url} target="_blank" rel="noreferrer">Open on GitHub</a>
    </div>
  }
  return <div className="ext-panel">
    <div className="code-search-row"><div className="seg"><button className={kind === 'prs' ? 'on' : ''} onClick={() => setKind('prs')}>Pull requests</button><button className={kind === 'issues' ? 'on' : ''} onClick={() => setKind('issues')}>Issues</button></div><button className="btn tiny" onClick={load}>Refresh</button></div>
    {error ? <p className="editor-error" role="alert">{error}</p> : items === null ? <p className="tree-note" role="status">Loading…</p>
      : items.length ? items.map((i) => <button key={i.number} className="ext-row" onClick={() => void show(i.number)}><span><b>#{i.number} {i.title}</b>
        <small>{i.author?.login}{i.headRefName ? ` · ${i.headRefName}` : ''}{i.isDraft ? ' · draft' : ''}{i.labels?.length ? ` · ${i.labels.map((l) => l.name).join(', ')}` : ''}</small></span></button>)
      : <p className="tree-note">No open {kind === 'prs' ? 'pull requests' : 'issues'}.</p>}
  </div>
}
