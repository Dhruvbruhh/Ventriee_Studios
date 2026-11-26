import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execCapture } from './exec'
import {
  parseAudit, scanCodePatterns, scanSecrets, summarize,
  type ScannedFile, type SecurityFinding, type SecurityReport, type SecurityToolRun
} from '../shared/security'

/** Directories that never contain first-party source. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.next', '.vite',
  '.turbo', '.cache', 'vendor', '.venv', '__pycache__', '.idea', '.vscode'
])

/** Text files are scanned only up to this size; a bigger file is a data blob, not source. */
const MAX_FILE_BYTES = 256 * 1024
/** Hard cap so a huge tree cannot freeze the scan; the report says it is partial. */
const MAX_FILES = 800

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2',
  '.ttf', '.otf', '.eot', '.mp4', '.mp3', '.wav', '.db', '.sqlite', '.wasm', '.exe', '.dll',
  '.node', '.lock', '.map', '.svgz', '.avif', '.bin'
])

function looksTextual(name: string): boolean {
  if (SKIP_EXTENSIONS.has(name.slice(name.lastIndexOf('.')).toLowerCase())) return false
  return true
}

/** Walk first-party files, newest relevance unknown, deterministic order. */
export function collectFiles(root: string): { files: ScannedFile[]; truncated: boolean } {
  const files: ScannedFile[] = []
  let truncated = false
  const walk = (dir: string, rel: string) => {
    if (files.length >= MAX_FILES) { truncated = true; return }
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries.sort()) {
      if (files.length >= MAX_FILES) { truncated = true; return }
      if (SKIP_DIRS.has(entry)) continue
      const abs = join(dir, entry)
      const relPath = rel ? `${rel}/${entry}` : entry
      let stats
      try {
        stats = statSync(abs)
      } catch {
        continue
      }
      if (stats.isDirectory()) {
        walk(abs, relPath)
      } else if (stats.isFile() && stats.size <= MAX_FILE_BYTES && looksTextual(entry)) {
        try {
          files.push({ path: relPath, text: readFileSync(abs, 'utf8') })
        } catch {
          /* unreadable files are skipped; a binary is not a finding */
        }
      }
    }
  }
  walk(root, '')
  return { files, truncated }
}

/** .env hygiene: real values in .env without a .gitignore entry is a finding. */
function scanEnvHygiene(root: string): SecurityFinding[] {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return []
  let text = ''
  try {
    text = readFileSync(envPath, 'utf8')
  } catch {
    return []
  }
  const filled = text.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S+/.test(line) && !/=\s*(?:your|changeme|example|xxx|<)/i.test(line))
  if (!filled.length) return []
  const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : ''
  const ignored = gitignore.split(/\r?\n/).some((line) => line.trim().replace(/^\//, '') === '.env')
  if (ignored) return []
  return [{
    id: 'config:env-not-ignored',
    tool: 'config',
    severity: 'high',
    title: '.env with real values is not ignored by Git',
    file: '.env',
    evidence: `${filled.length} variable(s) hold values (names only shown): ${filled.map((l) => l.split('=')[0].trim()).slice(0, 5).join(', ')}${filled.length > 5 ? ', …' : ''}`,
    impact: 'The next commit can publish credentials to everyone with repository access.',
    fix: 'Add ".env" to .gitignore and move the values into a secrets manager or your deploy platform.'
  }]
}

/** Run every read-only check over a project. Never writes to the project. */
export async function scanProject(root: string): Promise<SecurityReport> {
  const { files, truncated } = collectFiles(root)
  const findings: SecurityFinding[] = [...scanSecrets(files), ...scanCodePatterns(files), ...scanEnvHygiene(root)]

  const tools: SecurityToolRun[] = [
    { tool: 'secrets', status: 'ran', detail: `${files.length} files, 9 credential patterns` },
    { tool: 'code', status: 'ran', detail: '5 dangerous-pattern rules' }
  ]

  const pkg = existsSync(join(root, 'package.json'))
  if (pkg) {
    const audit = await execCapture('npm', ['audit', '--json'], root, 120_000)
    const jsonStart = audit.out.indexOf('{')
    if (audit.ok || jsonStart >= 0) {
      try {
        findings.push(...parseAudit(JSON.parse(audit.out.slice(jsonStart))))
        tools.push({ tool: 'deps', status: 'ran', detail: 'npm audit --json' })
      } catch (error) {
        tools.push({ tool: 'deps', status: 'failed', detail: (error as Error).message })
      }
    } else {
      tools.push({ tool: 'deps', status: 'failed', detail: audit.out.slice(0, 120) || 'npm audit produced no report (npm missing?)' })
    }
  } else {
    tools.push({ tool: 'deps', status: 'skipped', detail: 'no package.json' })
  }

  const limits = [
    'This scan is pattern-based and read-only: it is evidence that these checks found nothing, not proof the project is secure.',
    ...(truncated ? [`File cap (${MAX_FILES}) reached: the report covers only the first ${files.length} files.`] : []),
    ...(!pkg ? ['No package.json: dependency audit skipped.'] : [])
  ]

  return {
    generatedAt: Date.now(),
    root,
    files: files.length,
    truncated,
    summary: summarize(findings),
    tools,
    findings,
    limits
  }
}
