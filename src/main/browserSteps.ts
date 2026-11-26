/** One line of a browser script, e.g. `click #submit` or `type input[name=q] => hello`. */
export type BrowserStep =
  | { action: 'goto'; url: string }
  | { action: 'click'; selector: string }
  | { action: 'type'; selector: string; text: string }
  | { action: 'press'; key: string }
  | { action: 'wait'; ms: number }
  | { action: 'waitfor'; selector: string }
  | { action: 'scroll'; to: 'top' | 'bottom' | number }
  | { action: 'screenshot'; name: string }
  | { action: 'text'; selector: string }
  | { action: 'viewport'; width: number; height: number }
  | { action: 'expect'; selector: string; text: string }
  | { action: 'inspect' }

export const STEP_HELP = [
  'goto <url>', 'click <css selector>', 'type <css selector> => <text>', 'press <key, e.g. Enter>', 'wait <milliseconds>',
  'waitfor <css selector>', 'scroll top|bottom|<pixels>', 'screenshot [name]', 'text [css selector]',
  'viewport <width>x<height>', 'expect <css selector> contains <text>', 'inspect'
]

const KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Space'])

/** Parse a script; `{{input}}` in typed or expected text becomes the previous workflow step's output. */
export function parseSteps(script: string, input = ''): { steps: Array<BrowserStep & { line: number }>; errors: string[] } {
  const steps: Array<BrowserStep & { line: number }> = []
  const errors: string[] = []
  script.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const text = raw.trim()
    if (!text || text.startsWith('#')) return
    const word = text.split(/\s+/)[0]
    const rest = text.slice(word.length).trim()
    const fail = (why: string) => errors.push(`Line ${line}: ${why}`)
    switch (word.toLowerCase()) {
      case 'goto': {
        try {
          const url = new URL(rest)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('only http(s) addresses can be opened')
          steps.push({ action: 'goto', url: url.toString(), line })
        } catch { fail('goto needs a full address like https://example.com') }
        return
      }
      case 'click': return rest ? void steps.push({ action: 'click', selector: rest, line }) : fail('click needs a CSS selector')
      case 'type': {
        const at = rest.indexOf('=>')
        if (at < 1) return fail('use: type <selector> => <text>')
        steps.push({ action: 'type', selector: rest.slice(0, at).trim(), text: rest.slice(at + 2).trim().replaceAll('{{input}}', input), line })
        return
      }
      case 'press': {
        const key = rest.length === 1 ? rest : rest.charAt(0).toUpperCase() + rest.slice(1)
        return KEYS.has(key) || key.length === 1 ? void steps.push({ action: 'press', key, line }) : fail(`unknown key "${rest}"`)
      }
      case 'wait': {
        const ms = Number(rest)
        return Number.isFinite(ms) && ms >= 0 && ms <= 60_000 ? void steps.push({ action: 'wait', ms, line }) : fail('wait takes 0 to 60000 milliseconds')
      }
      case 'waitfor': return rest ? void steps.push({ action: 'waitfor', selector: rest, line }) : fail('waitfor needs a CSS selector')
      case 'scroll': {
        if (rest === 'top' || rest === 'bottom') return void steps.push({ action: 'scroll', to: rest, line })
        const px = Number(rest)
        return Number.isFinite(px) ? void steps.push({ action: 'scroll', to: px, line }) : fail('scroll takes top, bottom or a number of pixels')
      }
      case 'screenshot': return void steps.push({ action: 'screenshot', name: (rest || `step-${line}`).replace(/[^\w-]+/g, '-').slice(0, 60), line })
      case 'text': return void steps.push({ action: 'text', selector: rest || 'body', line })
      case 'viewport': {
        const m = /^(\d{3,4})\s*x\s*(\d{3,4})$/i.exec(rest)
        return m ? void steps.push({ action: 'viewport', width: Number(m[1]), height: Number(m[2]), line }) : fail('use: viewport 390x844')
      }
      case 'expect': {
        const at = rest.indexOf(' contains ')
        if (at < 1) return fail('use: expect <selector> contains <text>')
        steps.push({ action: 'expect', selector: rest.slice(0, at).trim(), text: rest.slice(at + 10).trim().replaceAll('{{input}}', input), line })
        return
      }
      case 'inspect': return void steps.push({ action: 'inspect', line })
      default: fail(`unknown step "${word}". Steps: ${STEP_HELP.map((h) => h.split(' ')[0]).join(', ')}`)
    }
  })
  return { steps, errors }
}

/** Local addresses the owner is building; everything else needs approval before clicking or typing. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost')
}
