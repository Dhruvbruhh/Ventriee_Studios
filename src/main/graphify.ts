import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execCapture, which } from './exec'

/**
 * Thin wrapper around the locally installed graphify CLI (pip package
 * `graphifyy`). Code-only graphs need no API key; queries run fully local.
 */
export class GraphifyService {
  private python: string | null = null

  private async cmd(): Promise<string | null> {
    if (this.python === null) this.python = await which('python')
    return this.python
  }

  async status(root: string): Promise<{ installed: boolean; indexed: boolean; nodes: number }> {
    const graph = join(root, 'graphify-out', 'graph.json')
    const indexed = existsSync(graph)
    let nodes = 0
    if (indexed) {
      try {
        const parsed = JSON.parse(readFileSync(graph, 'utf8'))
        nodes = Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0
      } catch {
        nodes = 0
      }
    }
    const cmd = await this.cmd()
    // Python alone is not enough: the graphify module must import.
    return { installed: cmd !== null && (await execCapture(cmd, ['-c', 'import graphify'], root)).ok, indexed, nodes }
  }

  /** Build a code-only graph. Long-running: minutes on big repos. */
  async build(root: string): Promise<{ ok: boolean; out: string }> {
    const cmd = await this.cmd()
    if (!cmd) return { ok: false, out: 'python was not found on PATH. Install Python 3.11+ and pip install graphifyy.' }
    return execCapture(cmd, ['-m', 'graphify', 'extract', '.', '--code-only', '--no-viz'], root, 15 * 60 * 1000)
  }

  async query(root: string, question: string): Promise<{ ok: boolean; out: string }> {
    const q = question.trim().slice(0, 500)
    if (!q) return { ok: false, out: 'Empty question' }
    const cmd = await this.cmd()
    if (!cmd) return { ok: false, out: 'python was not found on PATH' }
    return execCapture(cmd, ['-m', 'graphify', 'query', q, '--graph', join(root, 'graphify-out', 'graph.json')], root, 60 * 1000)
  }
}
