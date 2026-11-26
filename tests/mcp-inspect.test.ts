import { describe, expect, it } from 'vitest'
import { inspectMcp } from '../src/main/mcpInspect'

const FAKE_SERVER = `
const rl = require('readline').createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const m = JSON.parse(line)
  const reply = (result) => console.log(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }))
  if (m.method === 'initialize') reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1.2.3' } })
  if (m.method === 'tools/list') reply(m.params.cursor ? { tools: [{ name: 'second' }] } : { tools: [{ name: 'first', description: 'Does one thing' }], nextCursor: 'p2' })
})`

describe('inspectMcp', () => {
  it('runs the handshake and lists every page of tools', async () => {
    const r = await inspectMcp({ name: 'x', command: process.execPath, args: ['-e', FAKE_SERVER] })
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.serverName).toBe('fake')
    expect(r.serverVersion).toBe('1.2.3')
    expect(r.tools).toEqual([{ name: 'first', description: 'Does one thing' }, { name: 'second', description: '' }])
  })

  it('reports a server that exits', async () => {
    const r = await inspectMcp({ name: 'x', command: process.execPath, args: ['-e', 'console.error("bad config"); process.exit(3)'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/code 3.*bad config/)
  })

  it('reports a missing program', async () => {
    const r = await inspectMcp({ name: 'x', command: 'definitely-not-a-real-mcp-server', args: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('gives up on a server that never answers', async () => {
    const r = await inspectMcp({ name: 'x', command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] }, 400)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/No answer/)
  })
})
