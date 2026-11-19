import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalService } from '../src/main/terminal'

const service = new TerminalService()
const dir = mkdtempSync(join(tmpdir(), 'ventriee-term-'))
afterEach(() => service.closeAll())

describe('terminal service', () => {
  it('runs commands in a real shell started in the project folder', async () => {
    let output = ''
    const id = service.open(1, dir, 80, 24, (_id, data) => { output += data }, () => {})
    const marker = process.platform === 'win32' ? 'echo "T_$((6*7))"; (Get-Location).Path\r' : 'echo T_$((6*7)); pwd\r'
    await new Promise((r) => setTimeout(r, 1500))
    service.write(1, id, marker)
    await new Promise((r) => setTimeout(r, 2500))
    expect(output).toContain('T_42')
    expect(output.toLowerCase()).toContain(dir.toLowerCase().split(/[\\/]/).pop()!)
  }, 15_000)

  it('keeps terminals private to the window that opened them', () => {
    const id = service.open(1, dir, 80, 24, () => {}, () => {})
    expect(() => service.write(2, id, 'x')).toThrow('closed')
    service.close(2, id)
    expect(() => service.write(1, id, '')).not.toThrow()
    service.closeOwner(1)
    expect(() => service.write(1, id, '')).toThrow('closed')
  })

  it('refuses a missing folder', () => {
    expect(() => service.open(1, join(dir, 'missing'), 80, 24, () => {}, () => {})).toThrow('does not exist')
  })
})
