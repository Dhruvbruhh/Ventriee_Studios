import { useEffect, useState } from 'react'
import { Modal } from '../shell'
import { guard } from '../store'
import type { BrowserLog, BrowserStepResult } from '../../../shared/types'

const SCRIPT_KEY = 'ventriee.browser.script'
const EXAMPLE = `# One step per line. Clicking or typing on a non-local site asks you first.
goto http://localhost:3000
screenshot desktop
viewport 390x844
screenshot mobile
inspect`
const HELP = 'goto <url> · click <selector> · type <selector> => <text> · press Enter · wait <ms> · waitfor <selector> · scroll top|bottom|<px> · screenshot [name] · text [selector] · viewport 390x844 · expect <selector> contains <text> · inspect'

export function BrowserPanel({ onClose }: { onClose: () => void }) {
  const [script, setScript] = useState(() => localStorage.getItem(SCRIPT_KEY) ?? EXAMPLE)
  const [results, setResults] = useState<BrowserStepResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'steps' | 'console' | 'network'>('steps')
  const [logs, setLogs] = useState<{ console: BrowserLog[]; network: BrowserLog[]; url: string }>({ console: [], network: [], url: '' })

  useEffect(() => { localStorage.setItem(SCRIPT_KEY, script) }, [script])
  useEffect(() => window.ventriee.onBrowserEvent((r) => setResults((old) => [...old, r])), [])
  const refreshLogs = async () => { const l = await guard(() => window.ventriee.browserLogs()); if (l) setLogs(l) }
  useEffect(() => { if (tab !== 'steps') void refreshLogs() }, [tab])

  const run = async () => {
    setResults([])
    setError('')
    setRunning(true)
    setTab('steps')
    const r = await guard(() => window.ventriee.browserRun(script))
    setRunning(false)
    if (r && !r.ok) setError(r.error ?? 'The script failed')
    void refreshLogs()
  }

  const list = tab === 'console' ? logs.console : logs.network
  return (
    <Modal title="Browser automation" subtitle="Drive a separate, sandboxed browser window with simple steps: test local apps, check layouts, capture screenshots." onClose={onClose}>
      <div className="br">
        <div className="br-edit">
          <textarea className="input mono" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} aria-label="Browser steps" />
          <p className="hint">{HELP}</p>
          <div className="wf-toolbar">
            <button className="btn primary" onClick={() => void run()} disabled={running}>{running ? 'Running…' : 'Run steps'}</button>
            <button className="btn" onClick={() => void guard(() => window.ventriee.browserClose())}>Close browser window</button>
          </div>
        </div>
        <div className="br-out">
          <div className="vx-modes" role="tablist" style={{ maxWidth: 320 }}>
            {(['steps', 'console', 'network'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          {error ? <p className="vx-err" role="alert">{error}</p> : null}
          {tab === 'steps' ? (
            <div className="br-results" aria-live="polite">
              {!results.length && !running ? <p className="settings-empty">Run the steps to see each result here. The browser window opens next to the studio.</p> : null}
              {results.map((r, i) => (
                <div key={i} className={`br-step${r.ok ? '' : ' bad'}`}>
                  <div className="br-step-head"><b>Line {r.line}</b> {r.action} <span className="dim">{r.ms} ms</span></div>
                  {r.output ? <pre>{r.output}</pre> : null}
                  {r.image ? <img src={r.image} alt={`Screenshot from line ${r.line}`} /> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="br-results">
              <div className="wf-toolbar"><span className="dim text-sm">{logs.url || 'No page open'}</span><button className="btn tiny" onClick={() => void refreshLogs()}>Refresh</button></div>
              {!list.length ? <p className="settings-empty">Nothing yet.</p> : list.slice().reverse().map((l, i) => (
                <div key={i} className={`br-log ${l.level}`}><span className="dim">{new Date(l.at).toLocaleTimeString()}</span> {l.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
