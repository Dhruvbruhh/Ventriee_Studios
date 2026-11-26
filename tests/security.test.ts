import { describe, expect, it } from 'vitest'
import {
  maskSecret, parseAudit, scanCodePatterns, scanSecrets, securityDigest, summarize,
  type ScannedFile, type SecurityFinding
} from '../src/shared/security'

const file = (path: string, text: string): ScannedFile => ({ path, text })

describe('scanSecrets', () => {
  it('finds each credential class once per file with masked evidence', () => {
    const findings = scanSecrets([
      file('config.ts', 'const key = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";\nconst k2 = "AKIAIOSFODNN7EXAMPLE";\nconst k3 = "AKIAIOSFODNN7EXAMPLE";')
    ])
    const titles = findings.map((f) => f.title)
    expect(titles).toContain('OpenAI-style API key')
    expect(titles).toContain('AWS access key ID')
    // once per pattern per file, not once per occurrence
    expect(findings.filter((f) => f.title === 'AWS access key ID')).toHaveLength(1)
    expect(findings.every((f) => f.severity === 'high')).toBe(true)
    for (const finding of findings) {
      expect(finding.evidence).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz012345')
      expect(finding.evidence).not.toContain('AKIAIOSFODNN7EXAMPLE')
      expect(finding.line).toBeGreaterThan(0)
    }
  })

  it('does not flag ordinary code', () => {
    expect(scanSecrets([file('app.ts', 'export const greet = (name: string) => `hello ${name}`\n')])).toEqual([])
  })

  it('reports a private key at critical severity', () => {
    const findings = scanSecrets([file('id_rsa', '-----BEGIN OPENSSH PRIVATE KEY-----')])!
    expect(findings[0].severity).toBe('critical')
  })
})

describe('scanCodePatterns', () => {
  it('flags disabled TLS verification and eval with impact and fix', () => {
    const findings = scanCodePatterns([
      file('agent.ts', 'https.get(url, { rejectUnauthorized: false }, cb)\nconst total = eval(userInput)')
    ])
    expect(findings.map((f) => f.title)).toContain('TLS certificate verification disabled')
    expect(findings.map((f) => f.title)).toContain('Dynamic code execution (eval)')
    for (const finding of findings) {
      expect(finding.impact).toBeTruthy()
      expect(finding.fix).toBeTruthy()
    }
  })

  it('does not flag safe code', () => {
    expect(scanCodePatterns([file('app.ts', 'const safe = JSON.parse(input); element.textContent = safe')])).toEqual([])
  })
})

describe('maskSecret', () => {
  it('keeps locating information but hides the value', () => {
    expect(maskSecret('sk-proj-abcdefghijklmnopqrstuvwx')).toBe('sk-p…wx')
    expect(maskSecret('short')).toBe('[redacted]')
    expect(maskSecret('')).toBe('[redacted]')
  })
})

describe('scanProject', () => {
  it('walks a real project folder, finds planted issues, and runs read-only', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { scanProject } = await import('../src/main/securityScan')
    const root = mkdtempSync(join(tmpdir(), 'ventriee-secscan-'))
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'evil.js'), 'const k = "sk-proj-abcdefghijklmnopqrstuvwx"') // must be skipped
    writeFileSync(join(root, 'config.ts'), 'export const opts = { rejectUnauthorized: false }')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }))
    writeFileSync(join(root, '.env'), 'STRIPE_SECRET_KEY=sk_live_realvalue123')

    const report = await scanProject(root)
    const paths = report.findings.map((f) => f.file)
    expect(paths).toContain('config.ts') // code pattern found in first-party file
    expect(paths).not.toContain('node_modules/evil.js') // dependencies are not first-party
    expect(report.tools.map((t) => t.tool)).toContain('deps') // npm audit ran (no lockfile: likely no findings)
    expect(report.limits.some((l) => l.includes('not proof'))).toBe(true)
  })
})

describe('summarize', () => {
  const finding = (severity: SecurityFinding['severity']): SecurityFinding => ({
    id: `x-${severity}`, tool: 'secrets', severity, title: 't', evidence: 'e', impact: 'i', fix: 'f'
  })
  it('counts by severity', () => {
    const summary = summarize([finding('critical'), finding('high'), finding('high'), finding('low')])
    expect(summary).toEqual({ critical: 1, high: 2, medium: 0, low: 1, total: 4 })
  })
})

describe('parseAudit', () => {
  it('parses npm audit --json output into findings', () => {
    const findings = parseAudit({
      vulnerabilities: {
        lodash: { severity: 'critical', range: '>=4.17.20 <4.17.21', via: [{ title: 'Prototype Pollution' }], fixAvailable: true },
        request: { severity: 'moderate', via: ['lodash'] }
      }
    })
    expect(findings).toHaveLength(2)
    const lodash = findings.find((f) => f.id === 'deps:lodash')!
    expect(lodash.severity).toBe('critical')
    expect(lodash.title).toContain('Prototype Pollution')
    expect(lodash.fix).toContain('npm audit fix')
    expect(findings.find((f) => f.id === 'deps:request')!.severity).toBe('medium')
  })

  it('rejects non-JSON input', () => {
    expect(() => parseAudit('npm ERR! enoent')).toThrow()
    expect(() => parseAudit(null)).toThrow()
  })

  it('returns nothing when npm reports no vulnerabilities', () => {
    expect(parseAudit({ vulnerabilities: {} })).toEqual([])
  })
})

describe('securityDigest', () => {
  it('includes counts, top findings and limits', () => {
    const finding: SecurityFinding = { id: 'x', tool: 'secrets', severity: 'critical', title: 'Private key material', file: 'a.pem', line: 1, evidence: 'e', impact: 'i', fix: 'f' }
    const digest = securityDigest({
      generatedAt: 0, root: '/p', files: 12, truncated: false,
      summary: summarize([finding]),
      tools: [{ tool: 'secrets', status: 'ran', detail: '12 files' }],
      findings: [finding],
      limits: ['This scan is pattern-based and read-only.']
    })
    expect(digest).toContain('1 finding(s) (1 critical')
    expect(digest).toContain('[critical] a.pem:1 Private key material')
    expect(digest).toContain('pattern-based')
  })
})
