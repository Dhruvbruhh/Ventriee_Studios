import { monaco } from './monaco'

/** Key chords in VS Code's form ("ctrl+shift+k", "ctrl+k ctrl+c") for Monaco and for the studio's own commands. */

const NAMED: Record<string, string> = {
  enter: 'Enter', escape: 'Escape', esc: 'Escape', space: 'Space', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', insert: 'Insert',
  up: 'UpArrow', down: 'DownArrow', left: 'LeftArrow', right: 'RightArrow', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
  '/': 'Slash', '\\': 'Backslash', '[': 'BracketLeft', ']': 'BracketRight', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '`': 'Backquote', '-': 'Minus', '=': 'Equal'
}

function keyCode(name: string): number | null {
  const k = name.toLowerCase()
  const id = /^[a-z]$/.test(k) ? `Key${k.toUpperCase()}` : /^[0-9]$/.test(k) ? `Digit${k}` : /^f([1-9]|1[0-9])$/.test(k) ? k.toUpperCase() : NAMED[k]
  const code = id ? (monaco.KeyCode as unknown as Record<string, number>)[id] : undefined
  return typeof code === 'number' ? code : null
}

function part(chord: string): number | null {
  const tokens = chord.toLowerCase().split('+').filter(Boolean)
  // "ctrl++" means Ctrl and the plus key
  if (chord.endsWith('++')) tokens.push('=')
  let mods = 0
  let key: number | null = null
  for (const t of tokens) {
    if (t === 'ctrl' || t === 'cmd' || t === 'meta' || t === 'win') mods |= monaco.KeyMod.CtrlCmd
    else if (t === 'shift') mods |= monaco.KeyMod.Shift
    else if (t === 'alt' || t === 'option') mods |= monaco.KeyMod.Alt
    else if (key === null) key = keyCode(t)
    else return null
  }
  return key === null ? null : mods | key
}

/** Monaco's number for a chord, or null when it cannot be read. */
export function parseChord(text: string): number | null {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return part(parts[0])
  if (parts.length === 2) { const a = part(parts[0]); const b = part(parts[1]); return a !== null && b !== null ? monaco.KeyMod.chord(a, b) : null }
  return null
}

/** The chord a key press makes, in the same form ("ctrl+shift+k"); null for a lone modifier. */
export function chordOf(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const key = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase().replace(/^arrow/, '')
  return [e.ctrlKey || e.metaKey ? 'ctrl' : '', e.shiftKey ? 'shift' : '', e.altKey ? 'alt' : '', key].filter(Boolean).join('+')
}

/** VS Code's keybindings.json (an array of { key, command }), comments allowed. */
export function importVsCode(text: string): Array<{ key: string; command: string }> {
  const json = text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, s: string | undefined) => s ?? '').replace(/,(\s*[\]}])/g, '$1')
  const list = JSON.parse(json) as Array<{ key?: unknown; command?: unknown }>
  if (!Array.isArray(list)) throw new Error('Expected a list of key bindings')
  return list.filter((b) => typeof b.key === 'string' && typeof b.command === 'string').map((b) => ({ key: String(b.key).toLowerCase(), command: String(b.command) })).slice(0, 500)
}

/** Owner overrides of Monaco's key bindings; studio commands (prefixed "studio:") are matched by the workspace itself. */
export function applyKeybindings(list: Array<{ key: string; command: string }>): monaco.IDisposable {
  const rules = list.filter((b) => !b.command.replace(/^-/, '').startsWith('studio:')).flatMap((b) => { const keybinding = parseChord(b.key); return keybinding === null ? [] : [{ keybinding, command: b.command }] })
  return monaco.editor.addKeybindingRules(rules)
}
