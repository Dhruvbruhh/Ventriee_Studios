/**
 * Read-only security checks (§11). These are real, deterministic tools so a
 * security worker reasons about findings instead of inventing them: secret
 * patterns, dangerous-code patterns, `npm audit` results, and .env hygiene.
 *
 * A clean report is evidence that these checks found nothing. It is not proof
 * that the project is secure, and the report says so.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type SecurityTool = 'secrets' | 'code' | 'deps' | 'config'

export interface SecurityFinding {
  id: string
  tool: SecurityTool
  severity: Severity
  title: string
  file?: string
  line?: number
  /** Masked where it could contain a secret. */
  evidence: string
  impact: string
  fix: string
}

export interface SecurityToolRun {
  tool: SecurityTool
  status: 'ran' | 'skipped' | 'failed'
  detail: string
}

export interface SecurityReport {
  generatedAt: number
  root: string
  /** Files handed to the text scanners. */
  files: number
  /** True when the walker stopped at its cap; the report is partial. */
  truncated: boolean
  summary: Record<Severity, number> & { total: number }
  tools: SecurityToolRun[]
  findings: SecurityFinding[]
  limits: string[]
}

export interface ScannedFile {
  path: string
  text: string
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']

export function summarize(findings: SecurityFinding[]): SecurityReport['summary'] {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length }
  for (const finding of findings) summary[finding.severity] += 1
  return summary
}

/** Never surface a full secret: 4 leading and 2 trailing characters are enough to locate it. */
export function maskSecret(value: string): string {
  const clean = value.trim()
  return clean.length <= 8 ? '[redacted]' : `${clean.slice(0, 4)}\u2026${clean.slice(-2)}`
}

interface SecretPattern {
  id: string
  title: string
  re: RegExp
  severity: Severity
}

const SECRET_PATTERNS: SecretPattern[] = [
  { id: 'secret:private-key', title: 'Private key material', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, severity: 'critical' },
  { id: 'secret:aws', title: 'AWS access key ID', re: /\bAKIA[0-9A-Z]{16}\b/, severity: 'high' },
  { id: 'secret:github-token', title: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: 'high' },
  { id: 'secret:github-pat', title: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/, severity: 'high' },
  { id: 'secret:stripe-live', title: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{20,}\b/, severity: 'critical' },
  { id: 'secret:openai', title: 'OpenAI-style API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, severity: 'high' },
  { id: 'secret:google', title: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: 'medium' },
  { id: 'secret:slack', title: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: 'high' },
  { id: 'secret:supabase', title: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/, severity: 'critical' }
]

const SECRET_IMPACT = 'Anyone with repository access, a backup, or a screenshot can use this credential until it is rotated.'
const SECRET_FIX = 'Move the value into an environment variable, remove it from the file, rotate the credential, and purge it from Git history if it was committed.'

/** One finding per pattern per file, at the first matching line. */
export function scanSecrets(files: ScannedFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  for (const file of files) {
    const seen = new Set<string>()
    const lines = file.text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      for (const pattern of SECRET_PATTERNS) {
        if (seen.has(pattern.id)) continue
        const match = pattern.re.exec(lines[i])
        if (!match) continue
        seen.add(pattern.id)
        findings.push({
          id: `${pattern.id}:${file.path}`,
          tool: 'secrets',
          severity: pattern.severity,
          title: pattern.title,
          file: file.path,
          line: i + 1,
          evidence: lines[i].replace(match[0], maskSecret(match[0])).trim().slice(0, 160),
          impact: SECRET_IMPACT,
          fix: SECRET_FIX
        })
      }
    }
  }
  return findings
}

interface CodePattern {
  id: string
  title: string
  re: RegExp
  severity: Severity
  impact: string
  fix: string
}

const CODE_PATTERNS: CodePattern[] = [
  {
    id: 'code:tls-verification',
    title: 'TLS certificate verification disabled',
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
    severity: 'high',
    impact: 'Traffic can be intercepted and modified by anyone on the network path, including credentials and session tokens.',
    fix: 'Remove the override and trust the correct CA bundle instead.'
  },
  {
    id: 'code:eval',
    title: 'Dynamic code execution (eval)',
    re: /\beval\s*\(/,
    severity: 'medium',
    impact: 'If any part of the evaluated string is user-controlled, it becomes arbitrary code execution.',
    fix: 'Parse the input as data (JSON.parse or an explicit schema) and call a known function instead.'
  },
  {
    id: 'code:new-function',
    title: 'Dynamic code execution (new Function)',
    re: /\bnew Function\s*\(/,
    severity: 'medium',
    impact: 'Constructed functions bypass static analysis and can execute injected source.',
    fix: 'Use a dispatch table or a parser with a fixed grammar.'
  },
  {
    id: 'code:dangerous-html',
    title: 'Raw HTML injection sink',
    re: /dangerouslySetInnerHTML/,
    severity: 'low',
    impact: 'Rendered HTML can execute script if the content is not sanitized.',
    fix: 'Render text nodes, or sanitize with a maintained library before injecting HTML.'
  },
  {
    id: 'code:cors-wildcard',
    title: 'Wildcard CORS origin',
    re: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]/,
    severity: 'low',
    impact: 'Any website can read authenticated responses from this endpoint in a victim browser if credentials are allowed.',
    fix: 'Allow only known origins and avoid credentialed wildcard CORS.'
  }
]

export function scanCodePatterns(files: ScannedFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  for (const file of files) {
    const seen = new Set<string>()
    const lines = file.text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      for (const pattern of CODE_PATTERNS) {
        if (seen.has(pattern.id)) continue
        if (!pattern.re.test(lines[i])) continue
        seen.add(pattern.id)
        findings.push({
          id: `${pattern.id}:${file.path}`,
          tool: 'code',
          severity: pattern.severity,
          title: pattern.title,
          file: file.path,
          line: i + 1,
          evidence: lines[i].trim().slice(0, 160),
          impact: pattern.impact,
          fix: pattern.fix
        })
      }
    }
  }
  return findings
}

const AUDIT_SEVERITY: Record<string, Severity> = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  medium: 'medium',
  low: 'low',
  info: 'low'
}

/**
 * Parse `npm audit --json`. npm exits non-zero when it finds something, so the
 * caller passes whatever JSON it captured, not the exit code.
 */
export function parseAudit(raw: unknown): SecurityFinding[] {
  if (!raw || typeof raw !== 'object') throw new Error('npm audit did not return a JSON report')
  const vulnerabilities = (raw as { vulnerabilities?: unknown }).vulnerabilities
  if (!vulnerabilities || typeof vulnerabilities !== 'object') return []
  const findings: SecurityFinding[] = []
  for (const [name, value] of Object.entries(vulnerabilities as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as { severity?: unknown; range?: unknown; via?: unknown; fixAvailable?: unknown }
    const severity = AUDIT_SEVERITY[String(entry.severity)] ?? 'low'
    const via = Array.isArray(entry.via) ? entry.via.find((v) => v && typeof v === 'object') as { title?: unknown } | undefined : undefined
    const advisory = typeof via?.title === 'string' ? via.title : 'Known vulnerability'
    const range = typeof entry.range === 'string' ? entry.range : ''
    const fix = entry.fixAvailable === true ? 'Fix available: run npm audit fix.'
      : entry.fixAvailable && typeof entry.fixAvailable === 'object' ? `Upgrade ${name} to the fixed version shown by npm audit.`
      : 'No automatic fix: upgrade or replace the package.'
    findings.push({
      id: `deps:${name}`,
      tool: 'deps',
      severity,
      title: `${name}: ${advisory}`,
      file: 'package-lock.json',
      evidence: `${name}${range ? `@${range}` : ''} (${String(entry.severity ?? 'unknown')})`.slice(0, 160),
      impact: 'A vulnerable dependency is reachable by the deployed application unless the affected code path is unused.',
      fix
    })
  }
  return findings
}

/** Compact text for the security worker's prompt. Masked evidence only. */
export function securityDigest(report: SecurityReport): string {
  const top = [...report.findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)).slice(0, 12)
  const lines = top.map((f) => `- [${f.severity}] ${f.file ?? ''}${f.line ? `:${f.line}` : ''} ${f.title}`)
  const tools = report.tools.map((t) => `${t.tool}: ${t.status}${t.detail ? ` (${t.detail})` : ''}`).join('; ')
  return [
    `Read-only security scan: ${report.summary.total} finding(s) (${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low) across ${report.files} files.`,
    ...lines,
    `Tools: ${tools}.`,
    ...report.limits
  ].join('\n')
}
