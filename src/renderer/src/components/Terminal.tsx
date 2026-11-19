import { cleanError } from '../store'
import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const SCROLLBACK_CHARS = 200_000

/** A slot ("office-1", "panel") keeps its shell and scrollback while its view is hidden or remounted. */
interface Slot { projectId: string; id: string | null; buffer: string; exited: number | null; listeners: Set<(data: string) => void> }
const slots = new Map<string, Slot>()
/** Recent output of a terminal slot (for problem matchers); empty when it is gone. */
export const terminalOutput = (projectId: string, slot: string) => slots.get(`${projectId}:${slot}`)?.buffer ?? ''
let wired = false

function wire() {
  if (wired) return
  wired = true
  window.ventriee.onTermData(({ id, data }) => {
    for (const slot of slots.values()) if (slot.id === id) {
      slot.buffer = (slot.buffer + data).slice(-SCROLLBACK_CHARS)
      for (const listener of slot.listeners) listener(data)
    }
  })
  window.ventriee.onTermExit(({ id, code }) => {
    for (const slot of slots.values()) if (slot.id === id) { slot.id = null; slot.exited = code; for (const listener of slot.listeners) listener(`\r\n[process exited with code ${code}]\r\n`) }
  })
}

/** Shells of another project keep its folder as cwd, so they close when the window switches project. */
function closeOtherProjects(projectId: string) {
  for (const [key, slot] of slots) if (slot.projectId !== projectId) { if (slot.id) void window.ventriee.termClose(slot.id).catch(() => {}); slots.delete(key) }
}

/** `closeOnUnmount` is for one-off terminals (sign-in, install): their shell ends with the view instead of living on. */
export function TerminalView({ projectId, slot: name, label, command, closeOnUnmount }: { projectId: string; slot: string; label: string; command?: string; closeOnUnmount?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [exited, setExited] = useState(false)
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    wire(); closeOtherProjects(projectId)
    const key = `${projectId}:${name}`
    const slot = slots.get(key) ?? { projectId, id: null, buffer: '', exited: null, listeners: new Set() }
    slots.set(key, slot)
    const styles = getComputedStyle(document.documentElement)
    const term = new XTerm({ cursorBlink: true, fontFamily: styles.getPropertyValue('--mono').trim() || 'Consolas, monospace', fontSize: 12, scrollback: 5000,
      theme: { background: '#0b0d10', foreground: '#e9ebee', cursor: '#a78bfa', selectionBackground: '#3b2f5c' } })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    const fitNow = () => { try { if (host.current?.offsetWidth) fit.fit() } catch { /* hidden */ } }
    fitNow()
    if (slot.buffer) term.write(slot.buffer)
    const listener = (data: string) => term.write(data, () => setExited(slot.id === null && slot.exited !== null))
    slot.listeners.add(listener)
    let alive = true
    const start = async () => {
      if (slot.id) { void window.ventriee.termResize(slot.id, term.cols, term.rows).catch(() => {}); return }
      slot.exited = null; setExited(false)
      try {
        const id = await window.ventriee.termOpen(projectId, term.cols, term.rows)
        if (!alive && closeOnUnmount) { void window.ventriee.termClose(id).catch(() => {}); return }
        slot.id = id
        if (alive) setError('')
        // Give the shell a moment to print its prompt before typing the owner-chosen command.
        if (command) setTimeout(() => { if (slot.id === id) void window.ventriee.termWrite(id, `${command}\r`).catch(() => {}) }, 900)
      }
      catch (reason) { if (alive) setError(cleanError(reason)) }
    }
    void start()
    const input = term.onData((data) => { if (slot.id) void window.ventriee.termWrite(slot.id, data).catch(() => {}) })
    const observer = new ResizeObserver(() => { fitNow(); if (slot.id) void window.ventriee.termResize(slot.id, term.cols, term.rows).catch(() => {}) })
    observer.observe(host.current!)
    return () => {
      alive = false; observer.disconnect(); input.dispose(); slot.listeners.delete(listener); term.dispose()
      if (closeOnUnmount) { if (slot.id) void window.ventriee.termClose(slot.id).catch(() => {}); slots.delete(key) }
    }
  }, [projectId, name, generation, command, closeOnUnmount])
  const restart = () => {
    const slot = slots.get(`${projectId}:${name}`)
    if (slot) { if (slot.id) void window.ventriee.termClose(slot.id).catch(() => {}); slot.id = null; slot.buffer = '' }
    setExited(false); setGeneration((g) => g + 1)
  }
  return <section className="term-pane" aria-label={label}>
    <header className="terminal-head"><span>{label}</span><button className="btn tiny" onClick={restart} title="Start a fresh shell in the project folder">{exited ? 'Start again' : 'Restart'}</button></header>
    {error ? <p className="editor-error" role="alert">{error}</p> : null}
    <div ref={host} className="terminal-host" />
  </section>
}
