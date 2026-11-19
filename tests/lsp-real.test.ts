import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LspService, findExecutable } from '../src/main/lsp'
import { baseCatalog } from '../src/shared/catalog'
import { fileUrl } from '../src/shared/fileurl'

// Runs only where a real Python language server is installed.
describe.skipIf(!findExecutable('basedpyright-langserver') && !findExecutable('pyright-langserver'))('a real Python language server', { timeout: 90_000 }, () => {
  it('starts, reports diagnostics and answers hover and definition', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-py-'))
    const text = 'def greet(name: str) -> str:\n    return "hi " + name\n\nx = greet("a")\ny: int = "no"\n'
    writeFileSync(join(root, 'main.py'), text)
    const events: Array<{ method: string; params: unknown }> = []
    const service = new LspService(() => baseCatalog)
    const status = await service.ensure(1, root, 'python', (e) => events.push(e))
    expect(status.state).toBe('ready')
    const uri = fileUrl(root, 'main.py')
    service.notify(1, root, 'python', 'textDocument/didOpen', { textDocument: { uri, languageId: 'python', version: 1, text } })
    const hover = await service.request(1, root, 'python', 'textDocument/hover', { textDocument: { uri }, position: { line: 3, character: 5 } }) as { contents: { value: string } }
    expect(JSON.stringify(hover.contents)).toContain('greet')
    const def = await service.request(1, root, 'python', 'textDocument/definition', { textDocument: { uri }, position: { line: 3, character: 5 } }) as Array<{ range?: { start: { line: number } }; targetRange?: { start: { line: number } } }>
    expect((def[0].range ?? def[0].targetRange)!.start.line).toBe(0)
    for (let i = 0; i < 100 && !events.some((e) => e.method === 'textDocument/publishDiagnostics' && JSON.stringify(e.params).includes('int')); i++) await new Promise((r) => setTimeout(r, 200))
    expect(events.some((e) => e.method === 'textDocument/publishDiagnostics' && JSON.stringify(e.params).includes('int'))).toBe(true)
    service.closeAll()
  })
})
