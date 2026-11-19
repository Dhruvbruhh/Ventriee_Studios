import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Mailbox, parseMessageBlocks } from '../src/main/mailbox'

describe('worker mailbox', () => {
  it('mirrors lines a running teammate appends, once, and not the studio\'s own deliveries', () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-mail-'))
    const box = new Mailbox(root)
    box.deliver({ to: 'Kai', from: 'Owner', text: 'use the API contract in docs/api.md' })
    expect(box.collect()).toEqual([])
    expect(readFileSync(join(root, '.ventriee', '.gitignore'), 'utf8')).toBe('*\n')
    appendFileSync(join(root, box.pathFor('Kai')), '- from Soren: endpoint renamed to /api/orders\n- half a li')
    expect(box.collect()).toEqual([{ to: 'Kai', from: 'Soren', text: 'endpoint renamed to /api/orders' }])
    appendFileSync(join(root, box.pathFor('Kai')), 'ne\n')
    expect(box.collect()).toEqual([])
    expect(box.collect()).toEqual([])
  })

  it('reads MESSAGE TO blocks from a reply', () => {
    const reply = 'Done.\n=== MESSAGE TO: Kai ===\nThe schema has a new column.\n=== END MESSAGE ===\n=== MESSAGE TO: Juno ===\n=== END MESSAGE ==='
    expect(parseMessageBlocks(reply)).toEqual([{ to: 'Kai', text: 'The schema has a new column.' }])
  })
})
