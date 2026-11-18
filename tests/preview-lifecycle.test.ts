import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/shared/types'

const children = vi.hoisted(() => [] as any[])
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => {
  const child = new EventEmitter() as any
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  children.push(child)
  return child
}) }))
import { PreviewService } from '../src/main/preview'

let root: string
let service: PreviewService
afterEach(() => {
  service?.unwatch('p')
  if (root) rmSync(root, { recursive: true, force: true })
  children.length = 0
})
function setup() {
  root = mkdtempSync(join(tmpdir(), 'ventriee-lifecycle-'))
  const project = { id: 'p', path: root } as Project
  service = new PreviewService(() => {})
  return project
}

describe('preview lifecycle', () => {
  it('allows a failed dependency install to be retried', async () => {
    const project = setup()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, dependencies: { vite: '*' } }))
    const first = service.install(project)
    children[0].emit('close', 1)
    expect((await first).status).toBe('error')
    const second = service.install(project)
    expect(children).toHaveLength(2)
    children[1].emit('close', 1)
    await second
  })

  it('ignores a stopped process exiting after its replacement started', async () => {
    const project = setup()
    writeFileSync(join(root, 'main.py'), 'print("hello")')
    await service.start(project)
    const old = children[0]
    service.stop(project.id)
    await service.start(project)
    old.emit('close', 1)
    expect(service.get(project.id).status).toBe('starting')
    children[1].emit('close', 0)
    expect(service.get(project.id).status).toBe('ready')
  })
})
