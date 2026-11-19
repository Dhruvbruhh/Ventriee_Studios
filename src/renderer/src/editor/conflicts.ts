/** A Git merge conflict in a file, by 1-based line numbers of its three markers. */
export interface Conflict { start: number; middle: number; end: number; base?: number }

/** Every complete <<<<<<< / ======= / >>>>>>> block (a ||||||| base section is allowed). */
export function findConflicts(text: string): Conflict[] {
  const lines = text.split(/\r?\n/)
  const out: Conflict[] = []
  let open: Partial<Conflict> | null = null
  lines.forEach((line, i) => {
    const n = i + 1
    if (line.startsWith('<<<<<<<')) open = { start: n }
    else if (open && line.startsWith('|||||||') && !open.middle) open.base = n
    else if (open && line.startsWith('=======') && !open.middle) open.middle = n
    else if (open && line.startsWith('>>>>>>>') && open.middle) { out.push({ ...open, end: n } as Conflict); open = null }
  })
  return out
}

/** The text that replaces a conflict block (markers included) for each choice. */
export function resolveConflict(text: string, conflict: Conflict, choice: 'current' | 'incoming' | 'both'): string {
  const lines = text.split(/\r?\n/)
  const current = lines.slice(conflict.start, (conflict.base ?? conflict.middle) - 1)
  const incoming = lines.slice(conflict.middle, conflict.end - 1)
  return (choice === 'current' ? current : choice === 'incoming' ? incoming : [...current, ...incoming]).join('\n')
}
