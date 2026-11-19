import type { NotebookOutput } from './workspace'

export interface NotebookCell { cell_type: 'code' | 'markdown' | 'raw'; source: string | string[]; outputs?: NotebookOutput[]; execution_count?: number | null; metadata?: Record<string, unknown>; id?: string; [key: string]: unknown }
export interface Notebook { cells: NotebookCell[]; metadata?: Record<string, unknown>; nbformat?: number; nbformat_minor?: number; [key: string]: unknown }

/** nbformat stores text as a string or a list of lines. */
export const joinText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('') : v ?? '')

/** Parses an .ipynb; anything it does not use (metadata, attachments, unknown keys) is kept for saving. */
export function parseNotebook(text: string): Notebook {
  const nb = (text.trim() ? JSON.parse(text) : { cells: [] }) as Notebook
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.cells)) throw new Error('This is not a Jupyter notebook (no cells)')
  nb.nbformat ??= 4
  nb.nbformat_minor ??= 5
  nb.metadata ??= {}
  nb.cells.forEach((c, i) => { if (nb.nbformat_minor! >= 5) c.id ??= `cell-${Date.now().toString(36)}-${i}` })
  return nb
}

/** Jupyter's own layout (one-space indent, trailing newline), so diffs stay small. */
export const serializeNotebook = (nb: Notebook) => `${JSON.stringify(nb, null, 1)}\n`
