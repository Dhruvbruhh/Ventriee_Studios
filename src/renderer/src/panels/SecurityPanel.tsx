import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../shell'
import { cleanError, useStore } from '../store'
import { SEVERITY_ORDER, type SecurityFinding, type SecurityReport } from '../../../shared/security'

const STATE_COLOR: Record<string, string> = { critical: '#b42318', high: '#b0600f', medium: '#8a6d00', low: 'var(--text-dim, #667085)' }

function Finding({ finding }: { finding: SecurityFinding }) {
  return (
    <div className="security-finding">
      <div className="security-finding-head">
        <span className="security-sev" style={{ color: STATE_COLOR[finding.severity] }}>{finding.severity}</span>
        <span className="resource-card-name">{finding.title}</span>
      </div>
      {finding.file ? (
        <div className="dim text-xs">{finding.file}{finding.line ? `:${finding.line}` : ''}</div>
      ) : null}
      {finding.evidence ? <code className="resource-install">{finding.evidence}</code> : null}
      <div className="text-xs" style={{ marginTop: 4 }}><strong>Impact:</strong> {finding.impact}</div>
      <div className="text-xs"><strong>Fix:</strong> {finding.fix}</div>
    </div>
  )
}

/** Read-only security report over the active project. Nothing is fixed automatically. */
export function SecurityPanel({ onClose }: { onClose: () => void }) {
  const snapshot = useStore((s) => s.snapshot)
  const project = snapshot?.projects.find((p) => p.id === snapshot.activeProjectId) ?? null
  const [report, setReport] = useState<SecurityReport | null>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [severity, setSeverity] = useState<string>('all')

  const scan = useCallback(async () => {
    if (!project || scanning) return
    setScanning(true)
    setError('')
    try {
      setReport(await window.ventriee.securityScan(project.id))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setScanning(false)
    }
  }, [project, scanning])

  useEffect(() => {
    if (project) void scan()
    // Scan once when the panel opens for a project; the button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const findings = report ? [...report.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)) : []
  const shown = severity === 'all' ? findings : findings.filter((f) => f.severity === severity)

  return (
    <Modal title="Security Review" subtitle={project ? `Read-only scan of ${project.name}. Nothing is changed or fixed automatically.` : 'Open a project to scan it.'} onClose={onClose} wide>
      {!project ? <p className="dim text-sm">Select a project first.</p> : (
        <>
          <div className="resources-toolbar">
            <button className="btn primary" onClick={() => void scan()} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan again'}</button>
            {report ? (
              <div className="seg" role="group" aria-label="Filter by severity">
                <button className={severity === 'all' ? 'on' : ''} onClick={() => setSeverity('all')}>All {findings.length}</button>
                {SEVERITY_ORDER.filter((s) => report.summary[s] > 0).map((s) => (
                  <button key={s} className={severity === s ? 'on' : ''} onClick={() => setSeverity(s)} style={{ color: STATE_COLOR[s] }}>{s} {report.summary[s]}</button>
                ))}
              </div>
            ) : null}
          </div>
          {error ? <div className="text-sm" style={{ color: '#b42318', padding: '8px 0' }}>{error}</div> : null}
          {scanning && !report ? <div className="dim text-sm" style={{ padding: '16px 0' }}>Walking the project, checking secrets, patterns and dependencies…</div> : null}
          {report ? (
            <>
              <p className="dim text-xs" style={{ margin: '8px 0' }}>
                {report.files} files scanned{report.truncated ? ' (cap reached, report is partial)' : ''}. Ran: {report.tools.map((t) => `${t.tool} (${t.status})`).join(', ')}.
              </p>
              {findings.length === 0 ? (
                <p className="text-sm" style={{ padding: '8px 0' }}>
                  These checks found nothing. That is not proof the project is secure — see the limits below.
                </p>
              ) : (
                <div className="security-list">
                  {shown.map((f) => <Finding key={f.id} finding={f} />)}
                </div>
              )}
              <div className="dim text-xs" style={{ marginTop: 12 }}>
                {report.limits.map((l) => <div key={l}>· {l}</div>)}
              </div>
            </>
          ) : null}
        </>
      )}
    </Modal>
  )
}
