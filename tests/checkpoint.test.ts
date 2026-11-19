import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CheckpointService } from '../src/main/checkpoint'

describe('run checkpoints', { timeout: 60_000 }, () => {
  it('undoes everything a run changed, added and deleted, leaving dependencies alone', async () => {
    const data = mkdtempSync(join(tmpdir(), 'ventriee-cpdata-'))
    const root = mkdtempSync(join(tmpdir(), 'ventriee-cproot-'))
    mkdirSync(join(root, 'src')); mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'src', 'app [1].ts'), 'v1\r\n')
    writeFileSync(join(root, 'README.md'), 'keep me')
    writeFileSync(join(root, 'node_modules', 'dep.js'), 'dep')
    const service = new CheckpointService(data)
    await service.create('prj_1', root, 'job_1', 'Before run')
    expect(await service.has('prj_1', root, 'job_1')).toBe(true)

    writeFileSync(join(root, 'src', 'app [1].ts'), 'v2 by agent')
    rmSync(join(root, 'README.md'))
    writeFileSync(join(root, 'src', 'new.ts'), 'added by agent')
    writeFileSync(join(root, 'node_modules', 'dep.js'), 'dep changed by install')
    const changes = await service.changes('prj_1', root, 'job_1')
    expect(changes.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: 'README.md', status: 'deleted' }, { path: 'src/app [1].ts', status: 'modified' }, { path: 'src/new.ts', status: 'added' }])

    await service.restore('prj_1', root, 'job_1')
    expect(readFileSync(join(root, 'src', 'app [1].ts'), 'utf8')).toBe('v1\r\n')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('keep me')
    expect(existsSync(join(root, 'src', 'new.ts'))).toBe(false)
    expect(readFileSync(join(root, 'node_modules', 'dep.js'), 'utf8')).toBe('dep changed by install')
    expect(existsSync(join(root, '.git'))).toBe(false)
    expect(await service.changes('prj_1', root, 'job_1')).toEqual([])
    expect(await service.has('prj_1', root, 'job_missing')).toBe(false)
  })
})
