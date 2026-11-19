export interface MatchedProblem { path: string; line: number; column: number; severity: 'error' | 'warning'; message: string }

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

/**
 * Compiler and linter findings in command output, in the formats of tsc, ESLint (stylish), gcc/clang, Rust and Go.
 * `toProject` turns a reported path into a project-relative one, or null for files outside the project.
 */
export function matchProblems(output: string, toProject: (path: string) => string | null): MatchedProblem[] {
  const out: MatchedProblem[] = []
  const seen = new Set<string>()
  const add = (path: string, line: string, column: string | undefined, severity: string, message: string) => {
    const rel = toProject(path.trim())
    if (!rel) return
    const p: MatchedProblem = { path: rel, line: Number(line), column: Number(column ?? 1), severity: /warn/i.test(severity) ? 'warning' : 'error', message: message.trim() }
    const key = `${p.path}:${p.line}:${p.column}:${p.message}`
    if (!seen.has(key)) { seen.add(key); out.push(p) }
  }
  let eslintFile: string | null = null
  let rustMessage: { severity: string; message: string } | null = null
  for (const raw of output.replace(ANSI, '').split(/\r?\n/)) {
    const line = raw.replace(/\r/g, '')
    let m: RegExpExecArray | null
    if ((m = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+: .+)$/.exec(line))) add(m[1], m[2], m[3], m[4], m[5])
    else if ((m = /^(.+?):(\d+):(\d+) - (error|warning) (TS\d+: .+)$/.exec(line))) add(m[1], m[2], m[3], m[4], m[5])
    else if ((m = /^(.+?):(\d+):(\d+):\s*(?:fatal )?(error|warning):\s*(.+)$/.exec(line))) add(m[1], m[2], m[3], m[4], m[5])
    else if ((m = /^(error|warning)(?:\[\w+\])?: (.+)$/.exec(line))) rustMessage = { severity: m[1], message: m[2] }
    else if (rustMessage && (m = /^\s*--> (.+?):(\d+):(\d+)$/.exec(line))) { add(m[1], m[2], m[3], rustMessage.severity, rustMessage.message); rustMessage = null }
    else if ((m = /^(\S+\.go):(\d+):(\d+): (.+)$/.exec(line))) add(m[1], m[2], m[3], 'error', m[4])
    else if (eslintFile && (m = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}(\S+))?$/.exec(line))) add(eslintFile, m[1], m[2], m[3], m[5] ? `${m[4]} (${m[5]})` : m[4])
    else if (/^(?:[A-Za-z]:)?[\\/]?[\w .@()[\]-]+(?:[\\/][\w .@()[\]-]+)*\.\w+$/.test(line.trim()) && !/\s{2}/.test(line)) eslintFile = line.trim()
    else if (!line.trim()) eslintFile = null
    if (out.length >= 1000) break
  }
  return out
}
