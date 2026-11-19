import { useSyncExternalStore } from 'react'
import { languageFor } from './monaco'
import type { FileIconTheme } from '../../../shared/workspace'

let theme: FileIconTheme | null = null
const listeners = new Set<() => void>()

/** Loads the chosen icon theme ('' for none) and redraws everything that shows file icons. */
export async function loadIconTheme(id: string) {
  theme = id ? await window.ventriee.extIconTheme(id).catch(() => null) : null
  listeners.forEach((f) => f())
}

export const useIconTheme = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f) } }, () => theme)

/** VS Code's lookup order: exact name, then the longest extension (`test.ts` before `ts`), then language, then the default. */
export function iconFor(t: FileIconTheme | null, name: string, directory: boolean, expanded = false): string | undefined {
  if (!t) return undefined
  const n = name.toLowerCase()
  const id = directory
    ? (expanded ? t.folderNamesExpanded[n] ?? t.folderExpanded ?? t.folderNames[n] : undefined) ?? t.folderNames[n] ?? t.folder
    : t.fileNames[n] ?? n.split('.').slice(1).map((_, i, parts) => t.fileExtensions[parts.slice(i).join('.')]).find(Boolean) ?? t.languageIds[languageFor(n)] ?? t.file
  return id ? t.icons[id] : undefined
}
