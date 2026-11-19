import { useEffect, useState } from 'react'

type Detected = Awaited<ReturnType<typeof window.ventriee.toolsDetect>>

/** What is installed on this computer for coding, and the command to get each missing language server or debugger. */
export function Toolchains() {
  const [found, setFound] = useState<Detected | null>(null)
  useEffect(() => { void window.ventriee.toolsDetect().then(setFound).catch(() => {}) }, [])
  if (!found) return <p className="dim" role="status">Checking installed tools…</p>
  const copy = (text: string) => void navigator.clipboard.writeText(text).catch(() => {})
  // Languages whose toolchain is installed, or that already have a server.
  const NEEDS: Record<string, string> = { python: 'python', go: 'go', rust: 'cargo', java: 'java', csharp: 'dotnet' }
  const relevant = found.languages.filter((l) => l.server || found.tools.find((t) => t.name === NEEDS[l.id])?.found)
  return <div className="toolchains">
    <p className="kv-row-sub">{found.tools.map((t) => <span key={t.name} className={`tool-chip${t.found ? ' on' : ''}`} title={t.found ? 'Installed' : 'Not found on PATH'}>{t.found ? '✓' : '·'} {t.name}</span>)}</p>
    {relevant.map((l) => <div key={l.id} className="kv-row"><div className="kv-row-main"><div className="kv-row-title">{l.name}</div>
      <div className="kv-row-sub">{l.server ? `Smart editing on (${l.server})` : l.install ? <>Smart editing needs a language server: <span className="mono">{l.install}</span></> : 'No language server found'}</div></div>
      {!l.server && l.install && !l.install.startsWith('http') ? <button className="btn tiny" onClick={() => copy(l.install!)}>Copy command</button> : null}</div>)}
  </div>
}
