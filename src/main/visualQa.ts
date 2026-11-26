import { join } from 'node:path'

/**
 * Visual QA loop (§10): after a frontend worker delivers, actually render the
 * app in the sandboxed browser, screenshot it at desktop and phone widths, and
 * report page errors. The orchestrator attaches the digest to the task so the
 * reviewer judges rendered output, not just source text.
 *
 * This is evidence, not a verdict: a screenshot nobody looks at is theatre, so
 * the caller must surface the results (and the reviewer must receive them).
 */

/** The slice of BrowserAutomation the loop needs (structural, so tests can fake it). */
export interface VisualQaBrowser {
  run: (script: string) => Promise<{ ok: boolean; results: Array<{ ok: boolean; output: string; image?: string }>; error?: string }>
  logs: () => { console: Array<{ at: number; level: string; text: string }>; url: string }
}

export interface VisualQaResult {
  ran: boolean
  ok: boolean
  /** One line per finding the owner can act on. */
  problems: string[]
  /** Data-URL thumbnails of what was captured, for the run log. */
  shots: Array<{ name: string; image?: string }>
  summary: string
}

const WAIT_MS = 2500

/**
 * Screenshot the preview at two viewports and collect console errors.
 * Never throws: any failure becomes a problem line.
 */
export async function visualQa(browser: VisualQaBrowser, previewUrl: string, page: string): Promise<VisualQaResult> {
  const problems: string[] = []
  const shots: Array<{ name: string; image?: string }> = []
  const target = page ? join(page, '/').replace(/\\/g, '/') : '/'
  const url = previewUrl.replace(/\/$/, '') + (target === '/' ? '/' : target)

  /** Run one browser script; a failed step becomes a problem line, never a throw. */
  const step = async (script: string): Promise<{ ok: boolean; error?: string; image?: string; output: string }> => {
    try {
      const run = await browser.run(script)
      if (!run.ok) return { ok: false, error: run.error ?? 'browser run failed', output: '' }
      // The script's last step is its outcome (goto/wait feed it, screenshot/text report it).
      const last = run.results[run.results.length - 1]
      return { ok: last?.ok ?? false, error: last?.ok ? undefined : last?.output, image: last?.image, output: last?.output ?? '' }
    } catch (error) {
      return { ok: false, error: (error as Error).message, output: '' }
    }
  }

  try {
    // Console errors from the page itself (loader crashes, 404 assets, hydration failures).
    await step(`goto ${url}\nwait ${WAIT_MS}`)
    for (const e of browser.logs().console.filter((l) => l.level === 'error').slice(-5)) {
      problems.push(`Console error: ${e.text.slice(0, 160)}`)
    }

    const desktop = await step(`goto ${url}\nwait ${WAIT_MS}\nscreenshot desktop`)
    if (!desktop.ok) {
      return { ran: true, ok: false, problems: [...problems, `Desktop screenshot failed: ${desktop.error ?? 'unknown'}`], shots, summary: 'Rendered check failed' }
    }
    shots.push({ name: 'desktop', image: desktop.image })

    const mobile = await step(`viewport 390x844\ngoto ${url}\nwait ${WAIT_MS}\nscreenshot mobile`)
    if (!mobile.ok) problems.push(`Mobile screenshot failed: ${mobile.error ?? 'unknown'}`)
    else shots.push({ name: 'mobile', image: mobile.image })

    // A blank page renders as a screenshot but is still broken.
    const body = await step(`text body`)
    // Empty or near-empty body text means the page rendered nothing real, even
    // though the screenshot step succeeded.
    if (body.ok && body.output.trim().length < 20) problems.push('Page body is nearly empty — the app likely failed to render')
  } catch (error) {
    problems.push(`Visual QA aborted: ${(error as Error).message}`)
  }

  return {
    ran: true,
    ok: problems.length === 0,
    problems,
    shots,
    summary: problems.length
      ? `${problems.length} visual problem(s): ${problems[0].slice(0, 120)}`
      : `Rendered at desktop and 390px mobile widths, no console errors (${shots.length} screenshots)`
  }
}
