import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DapSession } from '../src/main/dap'
import { logCondition } from '../src/main/debugger'
import { debuggerFor, launchConfigs, substitute } from '../src/main/launch'
import { baseCatalog } from '../src/shared/catalog'
import type { DebugEvent } from '../src/shared/workspace'

const hasDebugpy = (() => { try { execFileSync('python', ['-c', 'import debugpy'], { stdio: 'ignore' }); return true } catch { return false } })()

describe('launch configurations', () => {
  it('reads .vscode/launch.json with comments and fills in VS Code variables', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-launch-'))
    mkdirSync(join(root, '.vscode'))
    writeFileSync(join(root, '.vscode', 'launch.json'), '{\n // comment\n "configurations": [{ "name": "App", "type": "python", "request": "launch", "program": "${workspaceFolder}/app.py", "args": ["${fileBasenameNoExtension}", "${env:VENTRIEE_T}"] }, { "type": "go" }]\n}')
    const configs = launchConfigs(root)
    expect(configs.map((c) => c.name)).toEqual(['App'])
    process.env.VENTRIEE_T = 'x'
    const filled = substitute(configs[0], root, 'src/main.py')
    expect(filled.program).toBe(`${root}/app.py`)
    expect(filled.args).toEqual(['main', 'x'])
    expect(debuggerFor(baseCatalog, configs[0], '')).toBe('debugpy')
    expect(debuggerFor(baseCatalog, null, 'go')).toBe('delve')
    expect(debuggerFor(baseCatalog, null, 'typescript')).toBe('node')
    expect(debuggerFor(baseCatalog, null, 'haskell')).toBeNull()
  })

  it('turns a logpoint message into a condition that logs and never stops', () => {
    // eslint-disable-next-line no-new-func
    const run = (message: string, scope: Record<string, unknown>) => { const logs: string[] = []; const result = new Function('console', ...Object.keys(scope), `return (${logCondition(message)})`)({ log: (s: string) => logs.push(s) }, ...Object.values(scope)); return { logs, result } }
    expect(run('x is {x + 1} `ok`', { x: 1 })).toEqual({ logs: ['x is 2 `ok`'], result: false })
  })
})

describe.skipIf(!hasDebugpy)('Python debugging through debugpy (DAP)', { timeout: 60_000 }, () => {
  it('stops at a breakpoint, shows and expands variables, evaluates, and runs to the end', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-dap-'))
    writeFileSync(join(root, 'app.py'), 'def total(items):\n    data = {"n": len(items)}\n    s = sum(items)\n    return s * 2\n\nprint("result", total([20, 1]))\n')
    const events: DebugEvent[] = []
    const next = (type: DebugEvent['type']) => new Promise<DebugEvent>((resolve) => {
      const seen = events.length
      const timer = setInterval(() => { const e = events.slice(seen).find((x) => x.type === type); if (e) { clearInterval(timer); resolve(e) } }, 20)
    })
    const spec = baseCatalog.debuggers.find((d) => d.id === 'debugpy')!
    const session = new DapSession(root, spec, (e) => events.push(e))
    const paused = next('paused')
    await session.start(substitute(spec.launch, root, 'app.py'), { 'app.py': [{ line: 4 }] })
    const stop = await paused
    if (stop.type !== 'paused') throw new Error('not paused')
    expect(stop.frames[0]).toMatchObject({ name: 'total', path: 'app.py', line: 4 })
    expect(stop.variables.find((v) => v.name === 's')?.value).toBe('21')
    const data = stop.variables.find((v) => v.name === 'data')!
    expect(data.ref).toBeGreaterThan(0)
    expect((await session.variables(data.ref!)).find((v) => v.name === "'n'")?.value).toBe('2')
    expect(await session.evaluate('s + 1')).toBe('22')
    const exited = next('exited')
    await session.command('continue')
    await exited
    expect(events.filter((e) => e.type === 'output').map((e) => (e as { text: string }).text).join('')).toContain('result 42')
  })

  it('explains a missing debugger', async () => {
    const session = new DapSession(tmpdir(), { id: 'x', name: 'Nope', languages: [], command: 'definitely-not-installed-dap', launch: {}, install: { command: 'get it' } }, () => {})
    await expect(session.start({}, {})).rejects.toThrow('Nope is not installed. Install it with: get it')
  })
})
