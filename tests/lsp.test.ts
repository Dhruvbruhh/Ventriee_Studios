import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FrameReader, LspServer, encodeMessage, findExecutable } from '../src/main/lsp'
import { fileUrl, relativePath } from '../src/shared/fileurl'

// A tiny language server: answers initialize and hover, asks the client for configuration, publishes diagnostics on open.
const FAKE_SERVER = String.raw`
let buf = Buffer.alloc(0)
const send = (m) => { const b = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...m })); process.stdout.write('Content-Length: ' + b.length + '\r\n\r\n'); process.stdout.write(b) }
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d])
  for (;;) {
    const end = buf.indexOf('\r\n\r\n'); if (end < 0) return
    const len = Number(/Content-Length: (\d+)/.exec(buf.subarray(0, end).toString())[1])
    if (buf.length < end + 4 + len) return
    const m = JSON.parse(buf.subarray(end + 4, end + 4 + len).toString()); buf = buf.subarray(end + 4 + len)
    if (m.method === 'initialize') send({ id: m.id, result: { capabilities: { hoverProvider: true } } })
    else if (m.method === 'initialized') send({ id: 99, method: 'workspace/configuration', params: { items: [{}, {}] } })
    else if (m.id === 99) send({ method: 'test/configAnswer', params: m.result })
    else if (m.method === 'textDocument/hover') send({ id: m.id, result: { contents: 'hover at ' + m.params.position.line } })
    else if (m.method === 'textDocument/didOpen') send({ method: 'textDocument/publishDiagnostics', params: { uri: m.params.textDocument.uri, diagnostics: [{ message: 'bad' }] } })
    else if (m.method === 'shutdown') send({ id: m.id, result: null })
    else if (m.method === 'exit') process.exit(0)
  }
})`

describe('language server client', () => {
  it('splits framed messages, across chunk boundaries and several per chunk', () => {
    const reader = new FrameReader()
    const a = encodeMessage({ id: 1, result: 'é' })
    const b = encodeMessage({ method: 'x', params: { n: 2 } })
    const all = Buffer.concat([a, b])
    expect(reader.push(all.subarray(0, 10))).toEqual([])
    expect(reader.push(all.subarray(10))).toEqual([{ jsonrpc: '2.0', id: 1, result: 'é' }, { jsonrpc: '2.0', method: 'x', params: { n: 2 } }])
  })

  it('initializes, answers server requests, forwards notifications and handles requests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-lsp-'))
    const script = join(root, 'server.js')
    writeFileSync(script, FAKE_SERVER)
    const events: Array<[string, unknown]> = []
    let exited = -1
    const server = new LspServer(process.execPath, { name: 'fake', command: 'node', args: [script] }, root, (m, p) => events.push([m, p]), (code) => { exited = code })
    await server.start()
    expect(server.capabilities).toEqual({ hoverProvider: true })
    expect(await server.request('textDocument/hover', { position: { line: 4, character: 0 } })).toEqual({ contents: 'hover at 4' })
    server.notify('textDocument/didOpen', { textDocument: { uri: fileUrl(root, 'a.py') } })
    await new Promise((r) => setTimeout(r, 300))
    expect(events).toContainEqual(['test/configAnswer', [null, null]])
    expect(events.find(([m]) => m === 'textDocument/publishDiagnostics')?.[1]).toMatchObject({ diagnostics: [{ message: 'bad' }] })
    await server.stop()
    await new Promise((r) => setTimeout(r, 300))
    expect(exited).toBe(0)
    await expect(server.request('textDocument/hover', {})).rejects.toThrow('not running')
  })

  it('maps project files to file URLs and back, whatever form the server uses', () => {
    expect(fileUrl('D:\\My Proj', 'src/a b.py')).toBe('file:///D:/My%20Proj/src/a%20b.py')
    expect(relativePath('D:\\My Proj', 'file:///d%3A/My%20Proj/src/a%20b.py')).toBe('src/a b.py')
    expect(relativePath('/home/u/p', 'file:///home/u/p/x.go')).toBe('x.go')
    expect(relativePath('/home/u/p', 'file:///usr/lib/go/src/fmt/print.go')).toBeNull()
    expect(relativePath('/home/u/p', 'file:///home/u/pp/x.go')).toBeNull()
  })

  it('finds programs on PATH only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventriee-bin-'))
    const name = process.platform === 'win32' ? 'fake-ls.cmd' : 'fake-ls'
    writeFileSync(join(dir, name), '')
    expect(findExecutable('fake-ls', { PATH: dir })).toBe(join(dir, name))
    expect(findExecutable('fake-ls', { PATH: '' })).toBeNull()
  })
})
