import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LspService, findExecutable } from '../src/main/lsp'
import { DapSession } from '../src/main/dap'
import { javaLaunch } from '../src/main/launch'
import { baseCatalog, type Catalog } from '../src/shared/catalog'
import { fileUrl } from '../src/shared/fileurl'
import type { DebugEvent } from '../src/shared/workspace'

// Runs where jdtls is on PATH and JAVA_DEBUG_JAR points at java-debug's plugin jar (from vscjava.vscode-java-debug).
const jar = process.env.JAVA_DEBUG_JAR ?? ''
describe.skipIf(!findExecutable('jdtls') || !findExecutable('java') || !existsSync(jar))('Java debugging through jdtls + java-debug', { timeout: 300_000 }, () => {
  it('finds the main class, stops at a breakpoint and shows variables', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-java-'))
    const text = 'public class Main {\n  static int total(int a, int b) {\n    int s = a + b;\n    return s * 2;\n  }\n  public static void main(String[] args) {\n    System.out.println(total(20, 1));\n  }\n}\n'
    writeFileSync(join(root, 'Main.java'), text)
    const catalog: Catalog = { ...baseCatalog, languages: baseCatalog.languages.map((l) => (l.id === 'java' ? { ...l, servers: l.servers.map((s) => ({ ...s, initializationOptions: { bundles: [jar] } })) } : l)) }
    const lsp = new LspService(() => catalog)
    try {
      expect((await lsp.ensure(1, root, 'java', () => {})).state).toBe('ready')
      lsp.notify(1, root, 'java', 'textDocument/didOpen', { textDocument: { uri: fileUrl(root, 'Main.java'), languageId: 'java', version: 1, text } })
      const spec = catalog.debuggers.find((d) => d.id === 'java')!
      const ask = (command: string, args: unknown[] = []) => lsp.request(1, root, 'java', 'workspace/executeCommand', { command, arguments: args }, 120_000)
      let launch: Awaited<ReturnType<typeof javaLaunch>> | null = null
      // The project is imported in the background; the main class shows up once it is.
      for (let i = 0; i < 60 && !launch; i++) launch = await javaLaunch(spec, ask, root, 'Main.java', null).catch((e: Error) => (/no main method/.test(e.message) ? null : Promise.reject(e))) ?? (await new Promise((r) => setTimeout(r, 2000)), null)
      expect(launch!.args.mainClass).toBe('Main')
      const events: DebugEvent[] = []
      const wait = (type: DebugEvent['type']) => new Promise<DebugEvent>((resolve, reject) => {
        const seen = events.length
        const timer = setInterval(() => { const e = events.slice(seen).find((x) => x.type === type); if (e) { clearInterval(timer); resolve(e) } }, 50)
        setTimeout(() => { clearInterval(timer); reject(new Error(`no ${type}: ${JSON.stringify(events.slice(-4))}`)) }, 120_000)
      })
      const session = new DapSession(root, spec, (e) => events.push(e))
      const paused = wait('paused')
      await session.start(launch!.args, { 'Main.java': [{ line: 4 }] }, launch!.port)
      const stop = await paused
      if (stop.type !== 'paused') throw new Error('not paused')
      expect(stop.frames.find((f) => !f.internal)).toMatchObject({ path: 'Main.java', line: 4 })
      expect(stop.variables.find((v) => v.name === 's')?.value).toBe('21')
      const exited = wait('exited')
      await session.command('continue')
      await exited
      expect(events.some((e) => e.type === 'output' && e.text.includes('42'))).toBe(true)
      session.stop()
    } finally { lsp.closeAll() }
    void readFileSync
  })
})
