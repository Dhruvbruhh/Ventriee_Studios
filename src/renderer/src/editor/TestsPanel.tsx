import { useEffect, useRef, useState } from 'react'
import { guard } from '../store'
import { impact } from '../fx'
import type { TestResult } from '../../../shared/workspace'

export interface TestsState {
  runners: Array<{ id: string; name: string }>
  runner: string
  setRunner(id: string): void
  running: boolean
  command: string
  output: string
  results: TestResult[]
  code: number | null
  run(target?: { file?: string; name?: string }): void
  stop(): void
  refresh(): void
}

/** Test runs for the project: kept here so results survive switching sidebar tabs and drive the gutter marks. */
export function useTests(projectId: string): TestsState {
  const [runners, setRunners] = useState<Array<{ id: string; name: string }>>([])
  const [runner, setRunner] = useState('')
  const [running, setRunning] = useState(false)
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')
  const [results, setResults] = useState<TestResult[]>([])
  const [code, setCode] = useState<number | null>(null)
  const refresh = () => void window.ventriee.testsRunners(projectId).then((list) => { setRunners(list); setRunner((r) => (list.some((x) => x.id === r) ? r : list[0]?.id ?? '')) }).catch(() => setRunners([]))
  useEffect(refresh, [projectId])
  useEffect(() => window.ventriee.onTests((e) => {
    if (e.type === 'started') { setCommand(e.command); setOutput(''); setRunning(true); setCode(null) }
    else if (e.type === 'output') setOutput((o) => (o + e.text).slice(-200_000))
    else { setRunning(false); setCode(e.code); setResults(e.results) }
  }), [])
  return { runners, runner, setRunner, running, command, output, results, code, refresh,
    run: (target = {}) => { if (runner) { setRunning(true); void guard(() => window.ventriee.testsRun(projectId, runner, target)).then((r) => { if (r === null) setRunning(false) }) } },
    stop: () => void window.ventriee.testsStop().catch(() => {}) }
}

/** The test nearest above the cursor, by the usual ways tests are declared. */
export function testAt(text: string, line: number): string | null {
  const lines = text.split('\n').slice(0, line).reverse()
  for (const l of lines) {
    const m = /^\s*(?:async\s+)?def\s+(test\w*)\s*\(/.exec(l) ?? /^\s*func\s+(Test\w*)\s*\(/.exec(l) ?? /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/.exec(l) ?? /\b(?:it|test)(?:\.\w+)?\(\s*(['"`])(.+?)\1/.exec(l)
    if (m) return m[2] && m[1].length === 1 ? m[2] : m[1]
  }
  return null
}

export function TestsPanel({ tests, onOpen, onFix }: { tests: TestsState; onOpen: (path: string, line: number) => void; onFix: (result: TestResult) => void }) {
  const [filter, setFilter] = useState<'all' | 'failed'>('all')
  const [showOutput, setShowOutput] = useState(false)
  const shown = tests.results.filter((r) => filter === 'all' || r.status === 'failed')
  const byFile = [...shown.reduce((m, r) => m.set(r.file ?? r.suite ?? '', [...(m.get(r.file ?? r.suite ?? '') ?? []), r]), new Map<string, TestResult[]>())]
  const failed = tests.results.filter((r) => r.status === 'failed').length
  const passed = tests.results.filter((r) => r.status === 'passed').length
  // A finished run with every test passing lands the impact effect on the summary line.
  const summary = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (!tests.running && tests.code === 0 && passed > 0 && !failed) impact(summary.current) }, [tests.running, tests.code])
  if (!tests.runners.length) return <div className="ext-panel"><p className="tree-note">No test runner found. Ventriee looks for Vitest, Jest, pytest, go test and cargo test.</p><button className="btn tiny" onClick={tests.refresh}>Look again</button></div>
  return <div className="ext-panel">
    <div className="code-search-row">
      {tests.runners.length > 1 ? <select aria-label="Test runner" value={tests.runner} onChange={(e) => tests.setRunner(e.target.value)}>{tests.runners.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select> : <b>{tests.runners[0].name}</b>}
      {tests.running ? <button className="btn tiny" onClick={tests.stop}>Stop</button> : <button className="btn tiny primary" onClick={() => tests.run()}>Run all</button>}
    </div>
    <p ref={summary} className="tree-note" role="status">{tests.running ? 'Running…' : tests.code === null ? 'Run the tests to see results here and in the editor margin.' : `${passed} passed · ${failed} failed · ${tests.results.length - passed - failed} skipped${tests.code !== 0 && !tests.results.length ? ' — the run failed; see the output' : ''}`}</p>
    {tests.results.length ? <div className="code-search-row"><label><input type="checkbox" checked={filter === 'failed'} onChange={(e) => setFilter(e.target.checked ? 'failed' : 'all')} /> Failed only</label></div> : null}
    <div className="code-search-results">{byFile.map(([file, list]) => <section key={file}><h4 title={file}>{file || 'Tests'}</h4>
      {list.map((r, i) => <div key={i} className={`test-row test-${r.status}`}>
        <button onClick={() => r.file && onOpen(r.file, r.line ?? 1)} title={r.message ?? r.name}><span aria-hidden>{r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : '–'}</span> {r.name}{r.duration !== undefined ? <span className="dim"> {r.duration.toFixed(2)}s</span> : null}</button>
        {r.file ? <button className="tab-close" title="Run this test" aria-label={`Run ${r.name}`} onClick={() => tests.run({ name: r.name.replace(/\[.*\]$/, '') })}>▶</button> : null}
        {r.status === 'failed' ? <><pre className="test-message">{r.message}</pre><button className="btn tiny" onClick={() => onFix(r)}>Fix with agent</button></> : null}</div>)}</section>)}</div>
    {tests.command ? <><button className="btn tiny" onClick={() => setShowOutput(!showOutput)}>{showOutput ? 'Hide output' : 'Show output'}</button>{showOutput ? <pre className="debug-output" aria-label="Test output">{tests.command}{'\n'}{tests.output}</pre> : null}</> : null}
  </div>
}
