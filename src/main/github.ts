import { execFile } from 'node:child_process'
import { findExecutable } from './lsp'
import type { GithubAction } from '../shared/workspace'

/** GitHub pull requests and issues through the owner's own `gh` login: no new credentials, nothing posted without a click. */

export function gh(root: string, args: string[], input?: string): Promise<string> {
  const file = findExecutable('gh')
  if (!file) return Promise.reject(new Error('The GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run "gh auth login".'))
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 60_000, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } }, (error, stdout, stderr) => {
      if (!error) { resolve(stdout); return }
      const message = (stderr || error.message).trim()
      reject(new Error(/no git remotes|not a git repository/i.test(message) ? 'This project is not connected to a GitHub repository yet. Publish it from Source Control, or add a GitHub remote.'
        : /auth login|not logged/i.test(message) ? 'Sign in to GitHub first: run "gh auth login" in a terminal.' : message.split('\n').slice(0, 3).join(' ')))
    })
    if (input !== undefined) child.stdin?.end(input)
  })
}

const number = (n: unknown) => { const v = Number(n); if (!Number.isInteger(v) || v <= 0) throw new Error('Invalid number'); return String(v) }
const text = (s: unknown, max = 65_000) => { if (typeof s !== 'string' || !s.trim() || s.length > max) throw new Error(`Write up to ${max.toLocaleString()} characters`); return s }

export async function github(root: string, action: GithubAction): Promise<unknown> {
  const json = async (args: string[], input?: string) => JSON.parse(await gh(root, args, input)) as unknown
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
    // `{owner}/{repo}` is filled in by gh from the project's GitHub remote.
    case 'lineComments': return json(['api', `repos/{owner}/{repo}/pulls/${number(action.number)}/comments`, '--paginate'])
    case 'lineComment': {
      if (typeof action.path !== 'string' || !action.path || action.path.length > 1000 || !Number.isInteger(action.line) || action.line < 1) throw new Error('Pick a line in the diff')
      const head = (await json(['pr', 'view', number(action.number), '--json', 'headRefOid'])) as { headRefOid: string }
      return json(['api', `repos/{owner}/{repo}/pulls/${number(action.number)}/comments`, '-X', 'POST', '--input', '-'],
        JSON.stringify({ body: text(action.body), commit_id: head.headRefOid, path: action.path, line: action.line, side: action.side === 'LEFT' ? 'LEFT' : 'RIGHT' }))
    }
    case 'merge': return gh(root, ['pr', 'merge', number(action.number), `--${['merge', 'squash', 'rebase'].includes(action.method) ? action.method : 'merge'}`])
    default: throw new Error('Unknown GitHub action')
  }
}
