export type VoiceAction =
  | { type: 'open_project'; name: string }
  | { type: 'show'; view: string }
  | { type: 'run'; instruction: string }
  | { type: 'stop_run' }
  | { type: 'new_session' }

const ACTION = /\bACTION\s*\{/
const BOUNDARY = /[.!?।]+["')\]]?(\s+|$)|\n+/g
/** Past this many characters without a full stop, speak up to the last comma or space so audio starts sooner. */
const SOFT_LIMIT = 140

/** Turns a streamed reply into speakable sentences as soon as each one is complete, holding back the ACTION line. */
export class SentenceStream {
  private full = ''
  private emitted = 0

  private speakable(): string {
    const at = this.full.search(ACTION)
    return at >= 0 ? this.full.slice(0, at) : this.full
  }

  push(chunk: string): string[] {
    this.full += chunk
    const text = this.speakable()
    const out: string[] = []
    let rest = text.slice(this.emitted)
    for (;;) {
      BOUNDARY.lastIndex = 0
      const m = BOUNDARY.exec(rest)
      // A full stop at the very end of what has arrived may be the "3." of "3.5": wait for the next character.
      let cut = m && (m.index + m[0].length < rest.length || /\s/.test(m[0])) ? m.index + m[0].length : -1
      if (cut < 0 && rest.length > SOFT_LIMIT) {
        const comma = rest.lastIndexOf(', ', SOFT_LIMIT)
        const soft = comma > 20 ? comma : rest.lastIndexOf(' ', SOFT_LIMIT)
        if (soft > 20) cut = soft + 1
      }
      if (cut < 0) break
      const sentence = rest.slice(0, cut).trim()
      this.emitted += cut
      rest = rest.slice(cut)
      if (sentence) out.push(sentence)
    }
    return out
  }

  /** Whatever is left once the reply is complete. */
  flush(): string[] {
    const rest = this.speakable().slice(this.emitted).trim()
    this.emitted = this.speakable().length
    return rest ? [rest] : []
  }

  get text(): string {
    return this.full
  }
}

export function stripAction(reply: string): string {
  const at = reply.search(ACTION)
  return (at >= 0 ? reply.slice(0, at) : reply).trim()
}

export function parseAction(reply: string): VoiceAction | null {
  const at = reply.search(ACTION)
  if (at < 0) return null
  const start = reply.indexOf('{', at)
  const end = reply.indexOf('}', start)
  if (end < 0) return null
  let raw: Record<string, unknown>
  try { raw = JSON.parse(reply.slice(start, end + 1)) } catch { return null }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  switch (raw.type) {
    case 'open_project': return str(raw.name) ? { type: 'open_project', name: str(raw.name) } : null
    case 'show': return str(raw.view) ? { type: 'show', view: str(raw.view).toLowerCase() } : null
    case 'run': return str(raw.instruction) ? { type: 'run', instruction: str(raw.instruction) } : null
    case 'stop_run': return { type: 'stop_run' }
    case 'new_session': return { type: 'new_session' }
    default: return null
  }
}

const HINGLISH = /\b(kar|karo|karna|kya|hai|hain|nahi|nahin|mein|haan|acha|accha|yaar|bhai|kaise|kyun|kab|abhi|chal|dekh|bata|batao|iska|uska|mujhe|tum|aap)\b/i

/** How the owner is speaking, so canned lines (progress, errors) can follow it. */
export function speechStyle(text: string): 'hi' | 'hinglish' | 'en' {
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length
  if (devanagari > text.replace(/\s/g, '').length * 0.3) return 'hi'
  return HINGLISH.test(text) ? 'hinglish' : 'en'
}

export function ttsLang(text: string): string {
  return speechStyle(text) === 'hi' ? 'hi-IN' : 'en-IN'
}

const WAKE = /^\s*(hey|hi|ok|okay|hello)?[\s,]*(ventriee|ventri|ventry|ventree|ventrie|वेंट्री)\b[\s,.!?]*/i

/** For wake-word mode: the request after the wake word, '' when only the wake word was said, null when it was not said. */
export function afterWakeWord(text: string): string | null {
  const m = WAKE.exec(text)
  return m ? text.slice(m[0].length).trim() : null
}
