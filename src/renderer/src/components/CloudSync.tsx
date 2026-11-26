import { useEffect, useState } from 'react'
import { guard, useStore } from '../store'
import { Switch } from '../shell'
import type { SyncStatus } from '../../../shared/ipc'

const LABEL: Record<SyncStatus['state'], string> = {
  off: 'Cloud sync off', 'signed-out': 'Not signed in', syncing: 'Syncing…', synced: 'Synced',
  pending: 'Waiting to sync', error: 'Sync error', conflict: 'Sync conflict'
}

function useSyncStatus(): [SyncStatus | null, () => void] {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const load = () => { window.ventriee.cloudSyncStatus().then(setStatus).catch(() => {}) }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
  return [status, load]
}

/** Header dot: green synced, amber pending/syncing, red error or conflict. Hidden when off or signed out. */
export function CloudSyncBadge() {
  const [status] = useSyncStatus()
  if (!status || status.state === 'off' || status.state === 'signed-out') return null
  const tone = status.state === 'synced' ? ' on' : status.state === 'error' || status.state === 'conflict' ? ' bad' : ' warn'
  const detail = status.error || (status.conflicts.length ? `${status.conflicts.length} conflict(s): open Settings` : status.pending ? `${status.pending} change(s) queued` : 'Projects and tasks are up to date in the cloud')
  return <div className="health" title={detail} role="status">
    <span className={`health-dot${tone}`} />
    <span className="health-label">{LABEL[status.state]}</span>
  </div>
}

/** Settings: the on/off switch, current state, and conflicts the owner must resolve. */
export function CloudSyncSection() {
  const settings = useStore((s) => s.snapshot?.settings)
  const [status, load] = useSyncStatus()
  if (!settings) return null
  const on = settings.cloudSync !== false
  return <>
    <div className="section-label space-above">Cloud sync</div>
    <div className="kv-row">
      <div className="kv-row-main">
        <div className="kv-row-title">Show this desktop's projects and tasks on the web and mobile apps</div>
        <div className="kv-row-sub">
          Sends project names, task titles, task status and which model is working, to your active workspace. Never code, files, prompts, memory or keys.
          New tasks created in the cloud arrive as messages; nothing runs by itself.
          {status ? <> Now: <strong>{LABEL[status.state]}</strong>{status.pending ? `, ${status.pending} queued` : ''}{status.error ? ` (${status.error})` : ''}.</> : null}
        </div>
      </div>
      <Switch on={on} onClick={() => void guard(() => window.ventriee.saveSettings({ cloudSync: !on }), on ? 'Cloud sync off' : 'Cloud sync on').then(load)} label="Cloud sync" />
    </div>
    {status?.conflicts.map((c) => <div className="kv-row" key={`${c.kind}:${c.localId}`}>
      <div className="kv-row-main">
        <div className="kv-row-title">{c.kind === 'project' ? 'Project' : 'Task'}: {c.title}</div>
        <div className="kv-row-sub">{c.reason}. The cloud copy was kept; this item stops syncing until you choose.</div>
      </div>
      <button className="btn tiny" onClick={() => void guard(() => window.ventriee.cloudSyncKeepDesktop(c.kind, c.localId), 'Desktop version will overwrite the cloud').then(load)}>Keep desktop version</button>
    </div>)}
  </>
}
