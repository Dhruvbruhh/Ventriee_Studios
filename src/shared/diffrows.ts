/** One row of a unified diff, with the file and line a review comment on it would attach to (GitHub's `line` + `side`). */
export interface DiffRow { text: string; kind: 'add' | 'del' | 'hunk' | 'meta' | 'context'; path?: string; line?: number; side?: 'LEFT' | 'RIGHT' }

export function diffRows(diff: string): DiffRow[] {
  let path = ''
  let oldLine = 0
  let newLine = 0
  return diff.split('\n').map((text): DiffRow => {
    if (text.startsWith('diff --git')) { path = ''; return { text, kind: 'meta' } }
    if (text.startsWith('+++ ')) { path = text.slice(4).replace(/^b\//, ''); return { text, kind: 'meta' } }
    if (text.startsWith('--- ') || !path) return { text, kind: 'meta' }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(text)
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); return { text, kind: 'hunk' } }
    if (text.startsWith('+')) return { text, kind: 'add', path, line: newLine++, side: 'RIGHT' }
    if (text.startsWith('-')) return { text, kind: 'del', path, line: oldLine++, side: 'LEFT' }
    if (text.startsWith('\\')) return { text, kind: 'meta' }
    oldLine++
    return { text, kind: 'context', path, line: newLine++, side: 'RIGHT' }
  })
}
