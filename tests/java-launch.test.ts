import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { javaLaunch } from '../src/main/launch'
import { DapSession } from '../src/main/dap'
import { FrameReader, encodeMessage } from '../src/main/lsp'
import { baseCatalog } from '../src/shared/catalog'
import type { DebugEvent } from '../src/shared/workspace'

const spec = baseCatalog.debuggers.find((d) => d.id === 'java')!

describe('Java debugging', () => {
  it('asks the language server for the main class, classpath and adapter port', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-jl-'))
    const asked: Array<[string, unknown[]]> = []
    const ask = async (command: string, args: unknown[] = []) => {
      asked.push([command, args])
      if (command === 'vscode.java.resolveMainClass') return [{ mainClass: 'other.App', projectName: 'p', filePath: join(root, 'src', 'App.java') }, { mainClass: 'Main', projectName: 'p', filePath: join(root, 'Main.java') }]
      if (command === 'vscode.java.resolveClasspath') return [['m'], ['c']]
      return 5005
    }
    const { port, args } = await javaLaunch(spec, ask, root, 'Main.java', null)
    expect(port).toBe(5005)
    expect(args).toMatchObject({ request: 'launch', mainClass: 'Main', projectName: 'p', modulePaths: ['m'], classPaths: ['c'], cwd: root })
    expect(asked.map((a) => a[0])).toEqual(['vscode.java.resolveMainClass', 'vscode.java.resolveClasspath', 'vscode.java.startDebugSession'])
    await expect(javaLaunch(spec, async () => [], root, 'Main.java', null)).rejects.toThrow('no main method')
  })

  it('drives an adapter that is already listening on a port', async () => {
    const seen: string[] = []
    const server = createServer((socket) => {
      const reader = new FrameReader()
      let seq = 0
      const send = (m: Record<string, unknown>) => socket.write(encodeMessage({ seq: ++seq, ...m } as never))
      socket.on('data', (chunk) => {
        for (const m of reader.push(chunk) as Array<{ seq: number; command: string }>) {
          seen.push(m.command)
          send({ type: 'response', request_seq: m.seq, command: m.command, success: true, body: m.command === 'setBreakpoints' ? { breakpoints: [] } : {} })
          if (m.command === 'initialize') send({ type: 'event', event: 'initialized' })
          if (m.command === 'configurationDone') { send({ type: 'event', event: 'output', body: { output: 'hello\n' } }); send({ type: 'event', event: 'terminated' }) }
        }
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const events: DebugEvent[] = []
    const session = new DapSession(mkdtempSync(join(tmpdir(), 'ventriee-jd-')), spec, (e) => events.push(e))
    await session.start({ request: 'launch', mainClass: 'Main' }, { 'Main.java': [{ line: 3 }] }, port)
    for (let i = 0; i < 50 && !events.some((e) => e.type === 'exited'); i++) await new Promise((r) => setTimeout(r, 50))
    expect(seen).toEqual(['initialize', 'launch', 'setBreakpoints', 'setExceptionBreakpoints', 'configurationDone'])
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['output', 'running', 'exited']))
    session.stop()
    server.close()
  })
})
