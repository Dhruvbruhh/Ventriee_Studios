import { describe, expect, it } from 'vitest'
import { visualQa } from '../src/main/visualQa'
import type { BrowserRunResult } from '../src/shared/types'

/** Minimal fake of the sandboxed browser automation: screenshots for screenshot steps, text for text steps. */
function fakeBrowser(consoleErrors: string[] = []) {
  const run = async (script: string) =>
    script.startsWith('text')
      ? { ok: true, results: [{ line: 1, action: 'text', ok: true, output: 'Welcome to the app — everything renders.' }] }
      : okShot('shot')
  return { run, logs: () => ({ console: consoleErrors.map((text) => ({ at: Date.now(), level: 'error' as const, text })), network: [], url: '' }) }
}

const okShot = (name: string): BrowserRunResult => ({
  ok: true,
  results: [{ line: 3, action: 'screenshot', ok: true, output: `Saved ${name}.png`, image: `data:image/png;base64,${name}` }]
})

describe('visualQa', () => {
  it('passes when both viewports render with content and no console errors', async () => {
    const result = await visualQa(fakeBrowser() as never, 'http://localhost:5173', '')
    expect(result.ran).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.shots.map((s) => s.name)).toEqual(['desktop', 'mobile'])
    expect(result.summary).toContain('no console errors')
  })

  it('reports console errors and empty bodies as problems', async () => {
    const browser = fakeBrowser(['Uncaught TypeError: x is not a function'])
    // The page renders but produces no body text.
    browser.run = async (script: string) =>
      script.startsWith('text')
        ? { ok: true, results: [{ line: 1, action: 'text', ok: true, output: '   ' }] }
        : okShot('shot')
    const result = await visualQa(browser as never, 'http://localhost:5173', 'app/index.html')
    expect(result.ok).toBe(false)
    expect(result.problems.some((p) => p.includes('Console error'))).toBe(true)
    expect(result.problems.some((p) => p.includes('nearly empty'))).toBe(true)
  })
  it('fails gracefully when the page cannot be reached', async () => {
    const browser = fakeBrowser()
    browser.run = async () => ({ ok: false, results: [], error: 'ERR_CONNECTION_REFUSED' })
    const result = await visualQa(browser as never, 'http://localhost:9999', '')
    expect(result.ran).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.problems[0]).toContain('Desktop screenshot failed')
  })

  it('never throws, whatever the browser does', async () => {
    const browser = { run: async () => { throw new Error('window gone') }, logs: () => ({ console: [], network: [], url: '' }) }
    const result = await visualQa(browser as never, 'http://localhost:5173', '')
    expect(result.ran).toBe(true)
    expect(result.ok).toBe(false)
  })
})
