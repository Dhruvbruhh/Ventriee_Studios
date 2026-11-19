import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { findExecutable, spawnTool } from './lsp'
import type { FileService } from './files'
import type { Catalog, TestRunnerSpec } from '../shared/catalog'
import type { TestEvent, TestResult } from '../shared/workspace'

/** Test runners a project uses, by the files the catalog says mark them. */
export function detectRunners(root: string, catalog: Catalog): TestRunnerSpec[] {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch { /* not a Node project */ }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return catalog.testRunners.filter((r) => r.detect.some((d) => (d.startsWith('package.json:') ? d.slice(13) in deps : existsSync(join(root, d)))))
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&')
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]))

/** JUnit XML (pytest --junitxml, vitest --reporter=junit). */
export function parseJunit(xml: string): TestResult[] {
  const out: TestResult[] = []
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const a = attrs(m[1])
    const body = m[3] ?? ''
    const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body)
    out.push({ name: a.name ?? '', suite: a.classname ?? '', file: a.file || undefined, line: a.line ? Number(a.line) : undefined,
      status: failure ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed', duration: a.time ? Number(a.time) : undefined,
      message: failure ? decode(`${attrs(failure[2]).message ?? ''}\n${failure[3] ?? ''}`).replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 8000) : undefined })
  }
  return out
}

export function parseJestJson(text: string, root: string): TestResult[] {
  const r = JSON.parse(text) as { testResults?: Array<{ name: string; assertionResults?: Array<{ title: string; ancestorTitles?: string[]; status: string; failureMessages?: string[]; location?: { line: number }; duration?: number }> }> }
  return (r.testResults ?? []).flatMap((f) => (f.assertionResults ?? []).map((t) => ({ name: t.title, suite: (t.ancestorTitles ?? []).join(' › '), file: relative(root, f.name).replace(/\\/g, '/'),
    line: t.location?.line, status: t.status === 'passed' ? 'passed' as const : t.status === 'failed' ? 'failed' as const : 'skipped' as const,
    duration: t.duration ? t.duration / 1000 : undefined, message: t.failureMessages?.join('\n').slice(0, 8000) || undefined })))
}

/** `go test -json` lines. */
export function parseGoJson(text: string): TestResult[] {
  const results = new Map<string, TestResult>()
  for (const line of text.split('\n')) {
    let e: { Action?: string; Package?: string; Test?: string; Output?: string; Elapsed?: number }
    try { e = JSON.parse(line) } catch { continue }
    if (!e.Test) continue
    const key = `${e.Package}/${e.Test}`
    const r = results.get(key) ?? { name: e.Test, suite: e.Package ?? '', status: 'passed' as TestResult['status'], message: '' }
    if (e.Action === 'output') r.message = `${r.message}${e.Output ?? ''}`.slice(-8000)
    if (e.Action === 'pass' || e.Action === 'fail' || e.Action === 'skip') { r.status = e.Action === 'pass' ? 'passed' : e.Action === 'fail' ? 'failed' : 'skipped'; r.duration = e.Elapsed }
    results.set(key, r)
  }
  return [...results.values()].map((r) => ({ ...r, message: r.status === 'failed' ? r.message : undefined }))
}

/** `cargo test` text output. */
export function parseCargoText(text: string): TestResult[] {
  const failures = new Map<string, string>()
  for (const m of text.matchAll(/---- (\S+) stdout ----\n([\s\S]*?)(?=\n---- |\nfailures:|\ntest result:)/g)) failures.set(m[1], m[2].trim().slice(0, 8000))
  return [...text.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)/gm)].map((m) => {
    const parts = m[1].split('::')
    return { name: parts.at(-1)!, suite: parts.slice(0, -1).join('::'), status: m[2] === 'ok' ? 'passed' as const : m[2] === 'FAILED' ? 'failed' as const : 'skipped' as const, message: failures.get(m[1]) }
  })
}

/** Fill in file and line where the report left them out: a dotted class name, or a search for the test's definition. */
async function locate(root: string, results: TestResult[], files: FileService): Promise<TestResult[]> {
  const found = new Map<string, { file: string; line: number } | null>()
  for (const r of results.slice(0, 2000)) {
    if (r.file && isAbsolute(r.file)) r.file = relative(root, r.file).replace(/\\/g, '/')
    if (!r.file && r.suite) {
      // pytest: "tests.test_math.TestAdd" -> tests/test_math.py
      const parts = r.suite.split('.')
      for (let n = parts.length; n > 0 && !r.file; n--) { const candidate = `${parts.slice(0, n).join('/')}.py`; if (existsSync(join(root, candidate))) r.file = candidate }
      if (!r.file && existsSync(join(root, r.suite))) r.file = r.suite
    }
    if (r.line) continue
    const name = r.name.replace(/\[.*\]$/, '')
    const key = `${r.file ?? ''}|${name}`
    if (!found.has(key) && found.size < 300) {
      const patterns = [`def ${name}(`, `func ${name}(`, `fn ${name}(`, `'${name}'`, `"${name}"`, `\`${name}\``]
      let hit: { file: string; line: number } | null = null
      for (const p of patterns) {
        const s = await files.search(root, p, true).catch(() => null)
        const h = s?.hits.find((x) => !r.file || x.path === r.file)
        if (h) { hit = { file: h.path, line: h.line }; break }
      }
      found.set(key, hit)
    }
    const hit = found.get(key)
    if (hit) { r.file ??= hit.file; r.line = hit.line }
  }
  return results
}

/** One test run per window; its output streams to the Tests panel. */
export class TestService {
  private runs = new Map<number, ChildProcess>()
  constructor(private files: FileService) {}

  async run(owner: number, root: string, runner: TestRunnerSpec, target: { file?: string; name?: string }, emit: (e: TestEvent) => void) {
    this.stop(owner)
    const command = findExecutable(runner.command)
    if (!command) throw new Error(`${runner.command} was not found on PATH, so ${runner.name} cannot run`)
    const report = join(tmpdir(), `ventriee-tests-${owner}-${Date.now()}.${runner.report === 'jest-json' ? 'json' : 'xml'}`)
    const fill = (a: string) => a.replace('${report}', report).replace('${file}', target.file ?? '').replace('${name}', target.name ?? '')
    const args = [...runner.args, ...(target.file ? runner.fileArgs ?? [] : []), ...(target.name ? runner.nameArgs ?? [] : [])].map(fill)
    const child = spawnTool(command, args, root)
    this.runs.set(owner, child)
    emit({ type: 'started', command: `${runner.command} ${args.join(' ')}` })
    let output = ''
    const relay = (d: Buffer) => { const text = d.toString(); if (output.length < 4_000_000) output += text; emit({ type: 'output', text }) }
    child.stdout?.on('data', relay)
    child.stderr?.on('data', relay)
    child.on('error', (e) => emit({ type: 'output', text: `${e.message}\n` }))
    child.on('close', (code) => {
      if (this.runs.get(owner) === child) this.runs.delete(owner)
      void (async () => {
        let results: TestResult[] = []
        try {
          results = runner.report === 'go-json' ? parseGoJson(output) : runner.report === 'cargo-text' ? parseCargoText(output)
            : runner.report === 'jest-json' ? parseJestJson(readFileSync(report, 'utf8'), root) : parseJunit(readFileSync(report, 'utf8'))
        } catch { /* no report: the run failed before tests ran; the output says why */ }
        rmSync(report, { force: true })
        emit({ type: 'done', code: code ?? 1, results: await locate(root, results, this.files) })
      })()
    })
  }

  stop(owner: number) {
    const child = this.runs.get(owner)
    this.runs.delete(owner)
    // On Windows the runner sits under cmd.exe; end the whole process tree.
    if (child?.pid && process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    else child?.kill()
  }
  stopAll() { for (const owner of [...this.runs.keys()]) this.stop(owner) }
}
