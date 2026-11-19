import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LspService, findExecutable, refreshPath } from '../src/main/lsp'
import { DapSession } from '../src/main/dap'
import { currentFileLaunch } from '../src/main/launch'
import { parseCargoText, parseGoJson } from '../src/main/testrunner'
import { baseCatalog } from '../src/shared/catalog'
import { fileUrl } from '../src/shared/fileurl'
import type { DebugEvent } from '../src/shared/workspace'

// Real toolchains only: each block runs where its tools are installed.
const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'ventriee-lang-'))
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
  return root
}

async function hoverAndErrors(lang: string, root: string, path: string, text: string, at: { line: number; character: number }, word: string) {
  const events: Array<{ method: string; params: unknown }> = []
  const service = new LspService(() => baseCatalog)
  try {
    expect((await service.ensure(1, root, lang, (e) => events.push(e))).state).toBe('ready')
    const uri = fileUrl(root, path)
    service.notify(1, root, lang, 'textDocument/didOpen', { textDocument: { uri, languageId: lang, version: 1, text } })
    let hover = ''
    for (let i = 0; i < 120 && !hover.includes(word); i++) {
      hover = JSON.stringify(await service.request(1, root, lang, 'textDocument/hover', { textDocument: { uri }, position: at }).catch((e: Error) => 'ERR ' + e.message))
      if (!hover.includes(word)) await new Promise((r) => setTimeout(r, 500))
    }
    expect(hover).toContain(word)
    const errors = () => events.some((e) => e.method === 'textDocument/publishDiagnostics' && /"severity":1/.test(JSON.stringify(e.params)))
    for (let i = 0; i < 120 && !errors(); i++) await new Promise((r) => setTimeout(r, 250))
    expect(errors()).toBe(true)
  } finally { service.closeAll() }
}

async function debugTo(debuggerId: string, language: string, root: string, file: string, line: number, variable: string, value: string) {
  const events: DebugEvent[] = []
  const wait = (type: DebugEvent['type']) => new Promise<DebugEvent>((resolve, reject) => {
    const seen = events.length
    const timer = setInterval(() => { const e = events.slice(seen).find((x) => x.type === type); if (e) { clearInterval(timer); resolve(e) } }, 20)
    setTimeout(() => { clearInterval(timer); reject(new Error(`no ${type}: ${JSON.stringify(events.slice(-5))}`)) }, 60_000)
  })
  const spec = baseCatalog.debuggers.find((d) => d.id === debuggerId)!
  const session = new DapSession(root, spec, (e) => events.push(e))
  const paused = wait('paused')
  await session.start(await currentFileLaunch(spec, language, root, file), { [file]: [{ line }] })
  const stop = await paused
  if (stop.type !== 'paused') throw new Error('not paused')
  expect(stop.frames.find((f) => !f.internal)).toMatchObject({ path: file, line })
  expect(stop.variables.find((v) => v.name === variable)?.value).toContain(value)
  const exited = wait('exited')
  await session.command('continue')
  await exited
  session.stop()
}

const go = { 'go.mod': 'module demo\n\ngo 1.22\n', 'main.go': 'package main\n\nimport "fmt"\n\nfunc total(xs []int) int {\n\ts := 0\n\tfor _, x := range xs {\n\t\ts += x\n\t}\n\treturn s\n}\n\nfunc main() {\n\tn := total([]int{20, 1})\n\tfmt.Println(n)\n}\n' }
describe.skipIf(!findExecutable('gopls'))('Go: gopls', { timeout: 120_000 }, () => {
  it('hovers and reports errors', async () => {
    const root = project(go)
    await hoverAndErrors('go', root, 'main.go', go['main.go'] + 'var bad int = "x"\n', { line: 13, character: 7 }, 'total')
  })
})
describe.skipIf(!findExecutable('dlv') || !findExecutable('go'))('Go: Delve', { timeout: 120_000 }, () => {
  it('stops at a breakpoint and shows variables', async () => { await debugTo('delve', 'go', project(go), 'main.go', 10, 's', '21') })
})

const rust = { 'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2021"\n', 'src/main.rs': 'fn total(xs: &[i32]) -> i32 {\n    let s: i32 = xs.iter().sum();\n    s * 2\n}\n\nfn main() {\n    let n = total(&[20, 1]);\n    println!("{}", n);\n}\n' }
describe.skipIf(!findExecutable('rust-analyzer') || !findExecutable('cargo'))('Rust: rust-analyzer', { timeout: 180_000 }, () => {
  it('hovers and reports errors', async () => {
    const root = project({ ...rust, 'src/main.rs': rust['src/main.rs'] + 'fn bad() -> i32 { "x" }\n' })
    await hoverAndErrors('rust', root, 'src/main.rs', rust['src/main.rs'] + 'fn bad() -> i32 { "x" }\n', { line: 6, character: 13 }, 'total')
  })
})
describe.skipIf(!findExecutable('lldb-dap') || !findExecutable('cargo'))('Rust: LLDB', { timeout: 180_000 }, () => {
  it('stops at a breakpoint and shows variables', async () => { await debugTo('lldb', 'rust', project(rust), 'src/main.rs', 3, 's', '21') })
})

const c = { 'main.c': '#include <stdio.h>\n\nint total(int a, int b) {\n    int s = a + b;\n    return s * 2;\n}\n\nint main(void) {\n    printf("%d\\n", total(20, 1));\n    return 0;\n}\n' }
describe.skipIf(!findExecutable('clangd'))('C: clangd', { timeout: 120_000 }, () => {
  it('hovers and reports errors', async () => {
    const root = project(c)
    await hoverAndErrors('c', root, 'main.c', c['main.c'] + 'int bad(void) { return undefined_thing; }\n', { line: 8, character: 22 }, 'total')
  })
})
describe.skipIf(!findExecutable('lldb-dap') || !findExecutable('gcc'))('C: LLDB', { timeout: 120_000 }, () => {
  it('stops at a breakpoint and shows variables', async () => { await debugTo('lldb', 'c', project(c), 'main.c', 5, 's', '21') })
})

describe.skipIf(process.platform !== 'win32')('PATH saved after the app started', () => {
  it('is picked up without a restart', () => {
    const before = process.env.PATH!
    const wbem = (d: string) => d.toLowerCase().endsWith('system32\\wbem')
    try {
      process.env.PATH = before.split(';').filter((d) => !wbem(d)).join(';')
      refreshPath(true)
      expect(process.env.PATH!.split(';').some(wbem)).toBe(true)
    } finally { process.env.PATH = before }
  })
})

describe.skipIf(!findExecutable('go'))('go test results', { timeout: 120_000 }, () => {
  it('parses a real run', () => {
    const root = project({ ...go, 'main_test.go': 'package main\n\nimport "testing"\n\nfunc TestTotal(t *testing.T) { if total([]int{1}) != 1 { t.Fail() } }\n\nfunc TestBroken(t *testing.T) { t.Fatal("nope") }\n' })
    let out = ''
    try { execFileSync('go', ['test', '-json', './...'], { cwd: root, encoding: 'utf8' }) } catch (e) { out = (e as { stdout: string }).stdout }
    const results = parseGoJson(out)
    expect(results.find((r) => r.name === 'TestTotal')?.status).toBe('passed')
    expect(results.find((r) => r.name === 'TestBroken')?.status).toBe('failed')
  })
})

describe.skipIf(!findExecutable('cargo'))('cargo test results', { timeout: 300_000 }, () => {
  it('parses a real run', () => {
    const root = project({ ...rust, 'src/main.rs': rust['src/main.rs'] + '\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn adds() { assert_eq!(super::total(&[1]), 2); }\n    #[test]\n    fn breaks() { panic!("nope"); }\n}\n' })
    let out = ''
    try { out = execFileSync('cargo', ['test'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) } catch (e) { out = (e as { stdout: string }).stdout }
    const results = parseCargoText(out)
    expect(results.find((r) => r.name.endsWith('adds'))?.status).toBe('passed')
    expect(results.find((r) => r.name.endsWith('breaks'))?.status).toBe('failed')
  })
})
