import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NotebookService } from '../src/main/notebook'
import { joinText, parseNotebook, serializeNotebook } from '../src/shared/notebook'
import type { NotebookEvent } from '../src/shared/workspace'

describe('notebook files', () => {
  it('round-trip without losing what the editor does not use', () => {
    const text = JSON.stringify({ cells: [{ cell_type: 'code', id: 'a', source: ['x = 1\n', 'x'], outputs: [], execution_count: null, metadata: { tags: ['t'] } }], metadata: { kernelspec: { name: 'python3' } }, nbformat: 4, nbformat_minor: 5, extra: true })
    const nb = parseNotebook(text)
    expect(joinText(nb.cells[0].source)).toBe('x = 1\nx')
    const again = JSON.parse(serializeNotebook(nb))
    expect(again).toEqual(JSON.parse(text))
    expect(serializeNotebook(nb).endsWith('}\n')).toBe(true)
    expect(parseNotebook('').cells).toEqual([])
    expect(() => parseNotebook('{"a":1}')).toThrow('not a Jupyter notebook')
  })
})

const hasJupyter = (() => { try { execFileSync('python', ['-c', 'import jupyter_client, ipykernel'], { stdio: 'ignore' }); return true } catch { return false } })()
describe.skipIf(!hasJupyter)('a real Jupyter kernel', { timeout: 120_000 }, () => {
  it('runs cells, returns results, plots and errors, and keeps state between cells', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ventriee-nb-'))
    writeFileSync(join(root, 'a.ipynb'), '{"cells":[]}')
    const service = new NotebookService(() => join(__dirname, '..', 'resources', 'kernel_bridge.py'))
    const events: NotebookEvent[] = []
    const done = (id: string) => new Promise<void>((resolve) => { const t = setInterval(() => { if (events.some((e) => e.type === 'done' && e.id === id)) { clearInterval(t); resolve() } }, 50) })
    try {
      await service.start(1, root, 'a.ipynb', (e) => events.push(e))
      service.execute(1, root, 'a.ipynb', 'c1', 'x = 20\nx + 1')
      await done('c1')
      service.execute(1, root, 'a.ipynb', 'c2', 'import matplotlib.pyplot as plt\nplt.plot([1, 2])\nplt.show()')
      await done('c2')
      service.execute(1, root, 'a.ipynb', 'c3', 'import os\nprint(os.path.basename(os.getcwd()))\n1/0')
      await done('c3')
      const out = (id: string) => events.flatMap((e) => (e.type === 'output' && e.id === id ? [e.output] : []))
      expect(out('c1')).toEqual([expect.objectContaining({ output_type: 'execute_result', data: { 'text/plain': '21' } })])
      expect(out('c2').some((o) => o.output_type === 'display_data' && typeof o.data['image/png'] === 'string')).toBe(true)
      expect(out('c3')).toEqual([expect.objectContaining({ output_type: 'stream', text: `${root.split(/[\\/]/).pop()}\n` }), expect.objectContaining({ output_type: 'error', ename: 'ZeroDivisionError' })])
      expect(events.find((e) => e.type === 'done' && e.id === 'c3')).toMatchObject({ status: 'error', count: 3 })
    } finally { service.closeAll() }
  })
})
