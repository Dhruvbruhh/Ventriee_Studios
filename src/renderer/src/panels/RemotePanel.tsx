import { useEffect, useState } from 'react'
import { Modal } from '../shell'
import { guard } from '../store'
import type { RemoteJob, RemoteJobInput } from '../../../shared/types'

const FORM_KEY = 'ventriee.remote.form'
const DEFAULTS: RemoteJobInput & { envText: string } = {
  provider: 'ssh', host: '', repo: '', branch: 'main', setup: 'npm ci', agentCommand: 'claude -p "$VENTRIEE_TASK" --permission-mode acceptEdits',
  task: '', env: {}, envText: '', timeoutMinutes: 60, memoryMb: 4096, push: true
}
const STATUS: Record<RemoteJob['status'], string> = { starting: 'Starting', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', lost: 'Lost contact', cleaned: 'Cleaned up' }

const parseEnv = (text: string) => Object.fromEntries(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1)]))

export function RemotePanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<typeof DEFAULTS>(() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(FORM_KEY) ?? '{}'), task: '', envText: '' } } catch { return DEFAULTS } })
  const [jobs, setJobs] = useState<RemoteJob[]>([])
  const [test, setTest] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const load = async () => setJobs(((await guard(() => window.ventriee.remoteList())) ?? []).slice().reverse())
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10_000); return () => clearInterval(t) }, [])
  // Remember the host and repo settings, never the task or keys.
  useEffect(() => { const { task: _t, envText: _e, env: _v, ...keep } = form; localStorage.setItem(FORM_KEY, JSON.stringify(keep)) }, [form])

  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => { setBusy(label); await guard(fn, done); setBusy(''); await load() }
  const start = () => act('start', async () => {
    const job = await window.ventriee.remoteStart({ ...form, env: parseEnv(form.envText) })
    setOpen(job.id)
    if (job.status === 'failed') throw new Error(job.error ?? 'The run did not start')
    set('task', '')
  }, 'Remote run started')
  const hosts = [...new Set(jobs.map((j) => j.host))]

  return (
    <Modal title="Remote agents" subtitle="Run an agent on a machine you control (a cloud VM, a build server) over SSH. It keeps working after you close Ventriee." onClose={onClose}>
      <div className="rm">
        <section className="rm-form">
          <div className="section-label">New remote run</div>
          <div className="vx-modes" role="radiogroup" aria-label="Remote provider" style={{ maxWidth: 300, marginBottom: 12 }}>
            {(['ssh', 'e2b'] as const).map((p) => (
              <button key={p} role="radio" aria-checked={form.provider === p} className={form.provider === p ? 'on' : ''} onClick={() => set('provider', p)}>
                {p === 'ssh' ? 'SSH machine' : 'E2B cloud'}
              </button>
            ))}
          </div>
          {form.provider === 'e2b' ? (
            <p className="hint" style={{ marginBottom: 12 }}>
              Runs in an <b>E2B sandbox</b>. Add your E2B API key under <b>Settings → Connectors → E2B</b>. No SSH config needed.
            </p>
          ) : <>
            <label className="field">Host
              <div className="flex gap-8">
                <input className="input mono grow" list="rm-hosts" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="ubuntu@203.0.113.10 or an SSH config alias" />
                <button className="btn" disabled={!form.host.trim() || busy === 'test'} onClick={() => void (async () => { setBusy('test'); setTest(''); const r = await guard(() => window.ventriee.remoteTest(form.host)); setBusy(''); if (r) setTest(r) })()}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
              </div>
              <datalist id="rm-hosts">{hosts.map((h) => <option key={h} value={h} />)}</datalist>
            </label>
            {test ? <pre className="rm-test">{test}</pre> : null}
            <p className="hint">Uses this computer's <code>ssh</code> and your SSH keys; no passwords are asked or stored. The host needs git and the agent CLI, signed in.</p>
          </>}
          <label className="field">Repository<input className="input mono" value={form.repo} onChange={(e) => set('repo', e.target.value)} placeholder="https://github.com/acme/site.git" /></label>
          <div className="flex gap-8">
            <label className="field grow">Branch<input className="input mono" value={form.branch} onChange={(e) => set('branch', e.target.value)} /></label>
            <label className="field grow">Setup command<input className="input mono" value={form.setup} onChange={(e) => set('setup', e.target.value)} /></label>
          </div>
          <label className="field"><span>Agent command (the task is in <code>$VENTRIEE_TASK</code>)</span><input className="input mono" value={form.agentCommand} onChange={(e) => set('agentCommand', e.target.value)} /></label>
          <label className="field">Task<textarea className="input" rows={4} value={form.task} onChange={(e) => set('task', e.target.value)} placeholder="Fix the mobile overflow on the homepage and make the tests pass" /></label>
          <label className="field">Environment variables (KEY=value per line, sent only to this run)<textarea className="input mono" rows={2} value={form.envText} onChange={(e) => set('envText', e.target.value)} placeholder="ANTHROPIC_API_KEY=…" /></label>
          <div className="flex gap-8">
            <label className="field grow">Time limit (min)<input className="input" type="number" min={1} max={1440} value={form.timeoutMinutes} onChange={(e) => set('timeoutMinutes', Number(e.target.value))} /></label>
            <label className="field grow">Memory limit (MB, 0 = none)<input className="input" type="number" min={0} value={form.memoryMb} onChange={(e) => set('memoryMb', Number(e.target.value))} /></label>
          </div>
          <label className="rm-check"><input type="checkbox" checked={form.push} onChange={(e) => set('push', e.target.checked)} /> Push the result to a new <code>ventriee/…</code> branch</label>
          <button className="btn primary" disabled={busy === 'start' || (form.provider !== 'e2b' && !form.host.trim()) || !form.repo.trim() || !form.task.trim()} onClick={() => void start()}>{busy === 'start' ? 'Starting…' : 'Start remote run'}</button>
          <p className="hint">The memory limit needs systemd on the host; the time limit always applies.</p>
        </section>

        <section className="rm-jobs">
          <div className="wf-toolbar"><div className="section-label">Runs</div><button className="btn tiny" onClick={() => void act('refresh', () => Promise.all(jobs.filter((j) => j.status === 'running').map((j) => window.ventriee.remoteRefresh(j.id))))}>Refresh</button></div>
          {!jobs.length ? <p className="settings-empty">No remote runs yet.</p> : jobs.map((j) => (
            <article key={j.id} className={`rm-job ${j.status}`}>
              <button className="rm-job-head" onClick={() => setOpen(open === j.id ? null : j.id)} aria-expanded={open === j.id}>
                <span className={`badge ${j.status === 'done' ? 'ok' : j.status === 'running' || j.status === 'starting' ? 'accent' : j.status === 'cleaned' ? '' : 'warn'}`}>{STATUS[j.status]}</span>
                <span className="truncate"><b>{j.task.split('\n')[0]}</b></span>
                <span className="dim text-sm">{new Date(j.createdAt).toLocaleString()}</span>
              </button>
              <div className="dim text-sm mono">{j.host} · {j.repo}{j.branch ? `@${j.branch}` : ''} → {j.workBranch}{j.exitCode !== null ? ` · exit ${j.exitCode}` : ''}</div>
              {j.error ? <p className="vx-err">{j.error}</p> : null}
              {open === j.id ? <pre className="rm-log">{j.log || 'No output yet.'}</pre> : null}
              <div className="mk-foot">
                {j.status === 'running' ? <button className="btn tiny" onClick={() => void act(j.id, () => window.ventriee.remoteRefresh(j.id))}>Update</button> : null}
                {j.status === 'running' || j.status === 'starting' ? <button className="btn tiny" onClick={() => void act(j.id, () => window.ventriee.remoteCancel(j.id), 'Cancelled')}>Cancel</button> : null}
                {['done', 'failed', 'cancelled', 'lost'].includes(j.status) ? <>
                  <button className="btn tiny" onClick={() => void act(j.id, async () => { const file = await window.ventriee.remotePatch(j.id); await window.ventriee.revealFile(file) }, 'Patch saved')}>Save changes as patch</button>
                  <button className="btn tiny" onClick={() => void act(j.id, () => window.ventriee.remoteCleanup(j.id), 'Remote workspace deleted')}>Clean up</button>
                </> : null}
                {j.status !== 'running' && j.status !== 'starting' ? <button className="btn tiny ghost" onClick={() => void act(j.id, () => window.ventriee.remoteForget(j.id))}>Forget</button> : null}
              </div>
            </article>
          ))}
        </section>
      </div>
    </Modal>
  )
}
