import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { redact } from './redact'

const MAX_BYTES = 400_000

/** A local, opt-in log of crashes and errors. Nothing leaves the machine unless the owner sends a report themselves. */
export class ErrorLog {
  constructor(private file: string, private enabled: () => boolean, private secrets: () => string[]) {}

  record(kind: string, message: string, stack = '') {
    if (!this.enabled()) return
    const line = `${new Date().toISOString()} [${kind}] ${redact(`${message}\n${stack}`.trim(), this.secrets()).slice(0, 4000)}\n`
    try {
      if ((statSync(this.file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) writeFileSync(this.file, readFileSync(this.file, 'utf8').slice(-MAX_BYTES / 2))
      appendFileSync(this.file, line)
    } catch { /* logging must never break the app */ }
  }

  recent(maxChars = 5000): string {
    try { return readFileSync(this.file, 'utf8').slice(-maxChars) } catch { return '' }
  }

  clear() { try { writeFileSync(this.file, '') } catch { /* nothing to clear */ } }
}

/** A prefilled GitHub "new issue" page; the owner reads and edits it in the browser before anything is posted. */
export function issueUrl(repo: string, version: string, platform: string, log: string): string {
  const body = `**What happened?**\n\n\n**Steps to reproduce**\n\n\n---\nVentriee Studios ${version} on ${platform}\n\n<details><summary>Recent errors (secrets removed)</summary>\n\n\`\`\`\n${log.slice(-5000)}\n\`\`\`\n</details>\n`
  return `https://github.com/${repo}/issues/new?${new URLSearchParams({ title: 'Problem report', body })}`
}
