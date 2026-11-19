import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DebugSession } from '../src/main/debugger'
import type { DebugEvent } from '../src/shared/workspace'

describe('Node.js debugger', { timeout: 30_000 }, () => {
  it('stops at a breakpoint, shows locals, evaluates, steps and runs to the end', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-debug-'))
    writeFileSync(join(root, 'app.js'), [
      'function total(items) {',
      '  const sum = items.reduce((a, b) => a + b, 0)',
      '  return sum * 2',
      '}',
      'console.log("result", total([20, 1]))'
    ].join('\n'))
    const events: DebugEvent[] = []
    const next = (type: DebugEvent['type']) => new Promise<DebugEvent>((resolve) => {
      const seen = events.length
      const timer = setInterval(() => { const e = events.slice(seen).find((x) => x.type === type); if (e) { clearInterval(timer); resolve(e) } }, 20)
    })
    const session = new DebugSession(root, (e) => events.push(e))
    const paused = next('paused')
    await session.start('app.js', { 'app.js': [3] })
    const stop = await paused
    if (stop.type !== 'paused') throw new Error('not paused')
    expect(stop.frames[0]).toMatchObject({ name: 'total', path: 'app.js', line: 3 })
    expect(stop.variables.find((v) => v.name === 'sum')?.value).toBe('21')
    expect(await session.evaluate('sum + 1')).toBe('22')
    const stepped = next('paused')
    await session.command('over')
    expect(await stepped).toMatchObject({ type: 'paused' })
    const exited = next('exited')
    await session.command('continue')
    await exited
    expect(events.filter((e) => e.type === 'output').map((e) => (e as { text: string }).text).join('')).toContain('result 42')
  })

  it('reports a missing file instead of hanging', async () => {
    const session = new DebugSession(mkdtempSync(join(tmpdir(), 'ventriee-debug-')), () => {})
    await expect(session.start('missing.js', {})).rejects.toThrow()
  })
})
