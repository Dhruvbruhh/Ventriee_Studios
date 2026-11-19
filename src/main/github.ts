import { execFile } from 'node:child_process'
import { findExecutable } from './lsp'
import type { GithubAction } from '../shared/workspace'

/** GitHub pull requests and issues through the owner's own `gh` login: no new credentials, nothing posted without a click. */

export function gh(root: string, args: string[], input?: string): Promise<string> {
  const file = findExecutable('gh')
  if (!file) return Promise.reject(new Error('The GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run "gh auth login".'))
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 60_000, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split('\n').slice(0, 3).join(' ')))
      else resolve(stdout)
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

const number = (n: unknown) => { const v = Number(n); if (!Number.isInteger(v) || v <= 0) throw new Error('Invalid number'); return String(v) }
const text = (s: unknown, max = 65_000) => { if (typeof s !== 'string' || !s.trim() || s.length > max) throw new Error(`Write up to ${max.toLocaleString()} characters`); return s }

export async function github(root: string, action: GithubAction): Promise<unknown> {
  const json = async (args: string[]) => JSON.parse(await gh(root, args)) as unknown
  switch (action.kind) {
    case 'prs': return json(['pr', 'list', '--limit', '50', '--json', 'number,title,author,headRefName,isDraft,updatedAt,url,reviewDecision'])
    case 'issues': return json(['issue', 'list', '--limit', '50', '--json', 'number,title,author,labels,updatedAt,url'])
    case 'pr': return json(['pr', 'view', number(action.number), '--json', 'number,title,body,author,headRefName,baseRefName,state,url,files,reviews,comments,statusCheckRollup,mergeable,reviewDecision,isDraft'])
    case 'issue': return json(['issue', 'view', number(action.number), '--json', 'number,title,body,author,comments,url,labels,state'])
    case 'diff': return gh(root, ['pr', 'diff', number(action.number)])
    case 'checkout': return gh(root, ['pr', 'checkout', number(action.number)])
    // Bodies go through stdin (-F -), never the command line.
    case 'review': return gh(root, ['pr', 'review', number(action.number), `--${action.event === 'approve' ? 'approve' : action.event === 'request-changes' ? 'request-changes' : 'comment'}`, '--body-file', '-'], action.event === 'approve' && !action.body?.trim() ? '' : text(action.body))
    case 'comment': return gh(root, [action.issue ? 'issue' : 'pr', 'comment', number(action.number), '--body-file', '-'], text(action.body))
    case 'merge': return gh(root, ['pr', 'merge', number(action.number), `--${['merge', 'squash', 'rebase'].includes(action.method) ? action.method : 'merge'}`])
    default: throw new Error('Unknown GitHub action')
  }
}
