import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/renderer/src/editor/monaco', () => ({ monaco: {
  KeyCode: { KeyK: 41, KeyC: 33, Digit1: 22, F5: 63, Slash: 90, Backslash: 93, UpArrow: 16, Equal: 86 },
  KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512, chord: (a: number, b: number) => (a | (b << 16)) >>> 0 },
  editor: { addKeybindingRules: (rules: unknown[]) => ({ rules, dispose() {} }) }
} }))
import { applyKeybindings, chordOf, importVsCode, parseChord } from '../src/renderer/src/editor/keybindings'

describe('keyboard shortcuts', () => {
  it('reads VS Code chords, including two-step ones', () => {
    expect(parseChord('ctrl+shift+k')).toBe(2048 | 1024 | 41)
    expect(parseChord('alt+up')).toBe(512 | 16)
    expect(parseChord('f5')).toBe(63)
    expect(parseChord('ctrl+\\')).toBe(2048 | 93)
    expect(parseChord('ctrl++')).toBe(2048 | 86)
    expect(parseChord('ctrl+k ctrl+c')).toBe(((2048 | 41) | ((2048 | 33) << 16)) >>> 0)
    expect(parseChord('ctrl+nosuchkey')).toBeNull()
    expect(parseChord('ctrl+k+c')).toBeNull()
  })

  it('turns a key press into the same form', () => {
    expect(chordOf({ key: 'K', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe('ctrl+shift+k')
    expect(chordOf({ key: 'ArrowUp', ctrlKey: false, metaKey: false, shiftKey: false, altKey: true })).toBe('alt+up')
    expect(chordOf({ key: 'Shift', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false })).toBeNull()
  })

  it('imports keybindings.json with comments and trailing commas', () => {
    expect(importVsCode('[\n // mine\n { "key": "Ctrl+Shift+K", "command": "editor.action.deleteLines" },\n { "key": "x" },\n]')).toEqual([{ key: 'ctrl+shift+k', command: 'editor.action.deleteLines' }])
    expect(() => importVsCode('{ "key": 1 }')).toThrow('list')
  })

  it('gives Monaco only editor commands; studio ones are matched by the workspace', () => {
    const applied = applyKeybindings([{ key: 'ctrl+k', command: 'editor.action.commentLine' }, { key: 'f5', command: 'studio:Test: Run all tests' }, { key: 'nope+', command: 'x' }]) as unknown as { rules: unknown[] }
    expect(applied.rules).toEqual([{ keybinding: 2048 | 41, command: 'editor.action.commentLine' }])
  })
})
