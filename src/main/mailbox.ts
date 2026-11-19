import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Live mail between workers. CLI agents can read and write files while they run,
 * so each worker gets `.ventriee/mail/<Name>.md` in the project: a teammate appends
 * a line there and the running worker sees it on its next look. The studio mirrors
 * new lines into the Mail tab. API models cannot touch disk, so they use MESSAGE TO
 * blocks in their reply instead (parseMessageBlocks), delivered when they finish.
 */
export const MAIL_DIR = join('.ventriee', 'mail')
const LINE = /^- from ([^:\n]{1,60}?)(?: \([^)]*\))?: (.+)$/

export interface Mail { to: string; from: string; text: string }

const fileName = (name: string) => `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.md`

export class Mailbox {
  /** Bytes already read per mailbox file, so each line is mirrored once. */
  private seen = new Map<string, number>()

  constructor(private root: string) {}

  private dir() {
    const dir = join(this.root, MAIL_DIR)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      // Keep studio mail out of the owner's Git history.
      writeFileSync(join(this.root, '.ventriee', '.gitignore'), '*\n')
    }
    return dir
  }

  pathFor(name: string) {
    return join(MAIL_DIR, fileName(name)).replace(/\\/g, '/')
  }

  /** Write a message into a worker's mailbox. The studio's own lines are not mirrored back. */
  deliver(mail: Mail) {
    const file = join(this.dir(), fileName(mail.to))
    const before = existsSync(file) ? statSync(file).size : 0
    const line = `- from ${mail.from} (${new Date().toISOString().slice(11, 19)}): ${mail.text.replace(/\s+/g, ' ').trim().slice(0, 2000)}\n`
    appendFileSync(file, line)
    if ((this.seen.get(file) ?? 0) >= before) this.seen.set(file, before + Buffer.byteLength(line))
  }

  /** New lines teammates appended since the last call. */
  collect(): Mail[] {
    const dir = join(this.root, MAIL_DIR)
    if (!existsSync(dir)) return []
    const found: Mail[] = []
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue
      const file = join(dir, entry)
      let size: number
      try { size = statSync(file).size } catch { continue }
      const from = this.seen.get(file) ?? 0
      if (size <= from) { if (size < from) this.seen.set(file, size); continue }
      const chunk = readFileSync(file).subarray(from, Math.min(size, from + 64_000)).toString('utf8')
      const complete = chunk.lastIndexOf('\n') + 1
      if (!complete) continue
      this.seen.set(file, from + Buffer.byteLength(chunk.slice(0, complete)))
      for (const raw of chunk.slice(0, complete).split(/\r?\n/)) {
        const match = LINE.exec(raw.trim())
        if (match) found.push({ to: entry.slice(0, -3), from: match[1].trim(), text: match[2].trim() })
      }
    }
    return found
  }
}

/** `=== MESSAGE TO: Name ===` ... `=== END MESSAGE ===` blocks in a worker's reply. */
export function parseMessageBlocks(text: string): Array<{ to: string; text: string }> {
  return [...text.matchAll(/=== MESSAGE TO: ([^=\n]{1,60}?) ===\r?\n([\s\S]*?)=== END MESSAGE ===/g)]
    .map((m) => ({ to: m[1].trim(), text: m[2].trim() })).filter((m) => m.text).slice(0, 10)
}
