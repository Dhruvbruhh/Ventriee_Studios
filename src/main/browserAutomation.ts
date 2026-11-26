import { BrowserWindow, dialog, session } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLocalHost, parseSteps, type BrowserStep } from './browserSteps'
import type { BrowserLog, BrowserRunResult, BrowserStepResult } from '../shared/types'

const PARTITION = 'persist:ventriee-automation'
const LOG_LIMIT = 300

/** A separate, sandboxed browser window that scripts drive while the owner watches. */
export class BrowserAutomation {
  private win: BrowserWindow | null = null
  private consoleLog: BrowserLog[] = []
  private networkLog: BrowserLog[] = []
  private hooked = false
  private busy = false

  constructor(private shotDir: () => string, private downloadDir: () => string, private onEvent: (r: BrowserStepResult) => void) {}

  logs() {
    return { console: this.consoleLog.slice(-LOG_LIMIT), network: this.networkLog.slice(-LOG_LIMIT), url: this.win && !this.win.isDestroyed() ? this.win.webContents.getURL() : '' }
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.close()
    this.win = null
  }

  private push(list: BrowserLog[], entry: BrowserLog) {
    list.push(entry)
    if (list.length > LOG_LIMIT * 2) list.splice(0, list.length - LOG_LIMIT)
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    const ses = session.fromPartition(PARTITION)
    if (!this.hooked) {
      this.hooked = true
      ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
      ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => this.push(this.networkLog, { at: Date.now(), level: d.statusCode >= 400 ? 'error' : 'info', text: `${d.method} ${d.statusCode} ${d.url}` }))
      ses.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => this.push(this.networkLog, { at: Date.now(), level: 'error', text: `${d.method} ${d.error} ${d.url}` }))
      ses.on('will-download', (_e, item) => {
        mkdirSync(this.downloadDir(), { recursive: true })
        const target = join(this.downloadDir(), item.getFilename().replace(/[\\/:*?"<>|]+/g, '_'))
        item.setSavePath(target)
        item.once('done', (_ev, state) => this.push(this.consoleLog, { at: Date.now(), level: state === 'completed' ? 'info' : 'error', text: `Download ${state}: ${target}` }))
      })
    }
    const win = new BrowserWindow({
      width: 1280, height: 820, title: 'Ventriee browser', autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false }
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void win.loadURL(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => { if (!/^https?:/i.test(url)) e.preventDefault() })
    win.webContents.on('console-message', (e) => !e.message.startsWith('Electron Security Warning') && this.push(this.consoleLog, { at: Date.now(), level: e.level === 'error' ? 'error' : e.level === 'warning' ? 'warn' : 'info', text: e.message.slice(0, 2000) }))
    win.on('closed', () => { if (this.win === win) this.win = null })
    this.win = win
    return win
  }

  private js<T>(code: string): Promise<T> {
    return this.window().webContents.executeJavaScript(code, true) as Promise<T>
  }

  private async approve(host: string, approved: Set<string>, action: string) {
    if (isLocalHost(host) || approved.has(host)) return
    const win = this.window()
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Allow on this site', 'Stop'], defaultId: 1, cancelId: 1,
      message: `Let the automated browser ${action} on ${host}?`,
      detail: 'Clicking and typing on a real website can submit forms, buy things or change an account. Local addresses never ask.'
    })
    if (response !== 0) throw new Error(`Stopped: not allowed to ${action} on ${host}`)
    approved.add(host)
  }

  private async step(s: BrowserStep, approved: Set<string>): Promise<{ output: string; image?: string }> {
    const win = this.window()
    const wc = win.webContents
    const host = () => { try { return new URL(wc.getURL()).hostname } catch { return '' } }
    const sel = (selector: string) => JSON.stringify(selector)
    switch (s.action) {
      case 'goto': {
        let status = 0
        const onNavigate = (_e: unknown, _url: string, code: number) => { status = code }
        wc.on('did-navigate', onNavigate)
        try {
          await wc.loadURL(s.url).catch((e: Error) => { if (!/ERR_ABORTED/.test(e.message)) throw new Error(`Could not open ${s.url}: ${e.message}`) })
        } finally {
          wc.off('did-navigate', onNavigate)
        }
        if (status >= 400) throw new Error(`${wc.getURL()} answered HTTP ${status}`)
        return { output: `Opened ${wc.getURL()} — "${wc.getTitle()}"${status ? ` (HTTP ${status})` : ''}` }
      }
      case 'click': {
        await this.approve(host(), approved, 'click')
        const ok = await this.js<boolean>(`(() => { const el = document.querySelector(${sel(s.selector)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true })()`)
        if (!ok) throw new Error(`Nothing matches ${s.selector}`)
        await new Promise((r) => setTimeout(r, 300))
        return { output: `Clicked ${s.selector}` }
      }
      case 'type': {
        await this.approve(host(), approved, 'type')
        const ok = await this.js<boolean>(`(() => { const el = document.querySelector(${sel(s.selector)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); if (el.select) el.select(); else document.execCommand('selectAll'); return true })()`)
        if (!ok) throw new Error(`Nothing matches ${s.selector}`)
        await wc.insertText(s.text)
        return { output: `Typed ${s.text.length} characters into ${s.selector}` }
      }
      case 'press': {
        await this.approve(host(), approved, 'press keys')
        const keyCode = s.key === 'Space' ? ' ' : s.key
        wc.sendInputEvent({ type: 'keyDown', keyCode })
        if (keyCode.length === 1 || keyCode === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: keyCode === 'Enter' ? '\r' : keyCode })
        wc.sendInputEvent({ type: 'keyUp', keyCode })
        await new Promise((r) => setTimeout(r, 300))
        return { output: `Pressed ${s.key}` }
      }
      case 'wait':
        await new Promise((r) => setTimeout(r, s.ms))
        return { output: `Waited ${s.ms} ms` }
      case 'waitfor': {
        const until = Date.now() + 10_000
        while (Date.now() < until) {
          if (await this.js<boolean>(`!!document.querySelector(${sel(s.selector)})`)) return { output: `Found ${s.selector}` }
          await new Promise((r) => setTimeout(r, 200))
        }
        throw new Error(`${s.selector} did not appear within 10 s`)
      }
      case 'scroll':
        await this.js(`window.scrollTo(0, ${s.to === 'top' ? 0 : s.to === 'bottom' ? 'document.documentElement.scrollHeight' : Number(s.to)})`)
        return { output: `Scrolled to ${s.to}` }
      case 'screenshot': {
        const image = await wc.capturePage()
        mkdirSync(this.shotDir(), { recursive: true })
        const file = join(this.shotDir(), `${Date.now()}-${s.name}.png`)
        writeFileSync(file, image.toPNG())
        const preview = image.resize({ width: Math.min(640, image.getSize().width) }).toDataURL()
        return { output: `Saved ${file}`, image: preview }
      }
      case 'text': {
        const text = await this.js<string | null>(`(() => { const el = document.querySelector(${sel(s.selector)}); return el ? el.innerText : null })()`)
        if (text === null) throw new Error(`Nothing matches ${s.selector}`)
        return { output: text.trim().slice(0, 5000) }
      }
      case 'viewport':
        win.setContentSize(s.width, s.height)
        await new Promise((r) => setTimeout(r, 300))
        return { output: `Viewport ${s.width}×${s.height}` }
      case 'expect': {
        const text = await this.js<string | null>(`(() => { const el = document.querySelector(${sel(s.selector)}); return el ? el.innerText : null })()`)
        if (text === null) throw new Error(`Expected ${s.selector} to exist, but nothing matches`)
        if (!text.toLowerCase().includes(s.text.toLowerCase())) throw new Error(`Expected ${s.selector} to contain "${s.text}", found "${text.trim().slice(0, 200)}"`)
        return { output: `${s.selector} contains "${s.text}"` }
      }
      case 'inspect': {
        const items = await this.js<string[]>(`(() => {
          const pick = (el) => el.id ? '#' + CSS.escape(el.id) : el.getAttribute('name') ? el.tagName.toLowerCase() + '[name="' + el.getAttribute('name') + '"]' : el.getAttribute('aria-label') ? el.tagName.toLowerCase() + '[aria-label="' + el.getAttribute('aria-label') + '"]' : el.tagName.toLowerCase()
          return [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button]')].filter((el) => el.offsetParent !== null).slice(0, 60)
            .map((el) => pick(el) + '  ' + (el.innerText || el.value || el.placeholder || el.getAttribute('href') || '').trim().replace(/\\s+/g, ' ').slice(0, 60))
        })()`)
        return { output: items.join('\n') || 'No interactive elements found' }
      }
    }
  }

  /** Run a script; each step reports through onEvent as it finishes. */
  async run(script: string, input = ''): Promise<BrowserRunResult> {
    const { steps, errors } = parseSteps(script, input)
    if (errors.length) return { ok: false, results: [], error: errors.join('\n') }
    if (!steps.length) return { ok: false, results: [], error: 'No steps to run' }
    if (this.busy) return { ok: false, results: [], error: 'The browser is already running a script' }
    this.busy = true
    const approved = new Set<string>()
    const results: BrowserStepResult[] = []
    try {
      this.window().show()
      for (const s of steps) {
        const started = Date.now()
        try {
          const { output, image } = await this.step(s, approved)
          const r: BrowserStepResult = { line: s.line, action: s.action, ok: true, output, image, ms: Date.now() - started }
          results.push(r)
          this.onEvent(r)
        } catch (e) {
          const r: BrowserStepResult = { line: s.line, action: s.action, ok: false, output: e instanceof Error ? e.message : String(e), ms: Date.now() - started }
          results.push(r)
          this.onEvent(r)
          return { ok: false, results, error: `Line ${s.line} failed: ${r.output}` }
        }
      }
      return { ok: true, results }
    } finally {
      this.busy = false
    }
  }
}
