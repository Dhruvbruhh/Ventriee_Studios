import { withRules } from './rules'
import { attachmentPaths } from './attachments'
import type { Credentials } from './credentials'
import { runEngine, modelFor, defaultEndpoint, isCliEngine } from './engines'
import { redact } from './redact'
import type { AppSettings, Project } from '../shared/types'
import type { CodeAskInput, CodeAskResult, CodeChangeInput, CodeChangeResult, CodeCompleteInput } from '../shared/workspace'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseFileBlocks } from './deliver'
import { workspacePath, type FileService } from './files'

const MAX_CODE = 60_000
const SYSTEM = `You are a senior engineer helping the owner inside their code editor. Answer precisely and briefly. Never claim you ran, tested or saved anything: you only read the code you are given.`

/** The last fenced block in a reply is the proposed replacement. */
export function replacementFrom(reply: string): string | null {
  const blocks = [...reply.matchAll(/```[^\n`]*\r?\n([\s\S]*?)```/g)]
  return blocks.length ? blocks[blocks.length - 1][1].replace(/\r?\n$/, '') : null
}

/** One question about a file or selection, answered by the planner engine set in Settings. Nothing is written to disk. */
export async function askCode(project: Project, input: CodeAskInput, settings: AppSettings, creds: Credentials): Promise<CodeAskResult> {
  if (typeof input?.question !== 'string' || !input.question.trim() || input.question.length > 4000) throw new Error('Write a question of up to 4,000 characters')
  if (typeof input.code !== 'string' || input.code.length > MAX_CODE) throw new Error(`Select less code: up to ${MAX_CODE.toLocaleString()} characters can be sent`)
  const scope = input.startLine && input.endLine ? `lines ${input.startLine}-${input.endLine} of ${input.path}` : `the whole file ${input.path}`
  const edit = input.mode === 'edit'
  const prompt = `Project: ${project.name}\nCode (${scope}):\n\`\`\`\n${input.code}\n\`\`\`\n\nOwner's request: ${input.question.trim()}\n\n${edit
    ? 'First explain the change in at most three sentences. Then give the complete replacement for exactly the code shown above, in a single fenced code block, with nothing after it. Keep the surrounding indentation.'
    : 'Answer the request. Do not rewrite the code unless asked.'}`
  const engine = settings.plannerEngine
  const result = await runEngine({ engine, model: settings.plannerModel, endpoint: settings.plannerEndpoint || defaultEndpoint(engine), system: withRules(SYSTEM, project.path), prompt,
    cwd: project.path, maxTokens: edit ? 8000 : 3000, timeoutMs: 5 * 60_000, stallMs: 120_000, images: attachmentPaths(project.path, input.images) }, creds)
  if (!result.ok || !result.text.trim()) throw new Error(`The agent did not answer: ${result.error ?? 'empty reply'}`)
  const text = redact(result.text, creds.secretValues())
  const replacement = edit ? replacementFrom(text) : null
  if (edit && replacement === null) throw new Error('The agent answered without a code block, so there is no edit to review. Ask again or rephrase.')
  return { answer: replacement !== null ? text.slice(0, text.lastIndexOf('```', text.lastIndexOf('```') - 1)).trim() : text.trim(), replacement, model: modelFor(engine, settings.plannerModel) }
}

const MAX_CONTEXT = 120_000

/**
 * A change across several files. The agent sees the files the owner has open plus the
 * project's file list, and answers with whole-file blocks. Nothing is written here:
 * the editor shows each file as a diff and the owner accepts it into a tab.
 */
export async function changeFiles(project: Project, input: CodeChangeInput, settings: AppSettings, creds: Credentials, files: FileService): Promise<CodeChangeResult> {
  if (typeof input?.request !== 'string' || !input.request.trim() || input.request.length > 4000) throw new Error('Describe the change in up to 4,000 characters')
  const paths = Array.isArray(input.paths) ? [...new Set(input.paths.filter((p): p is string => typeof p === 'string'))].slice(0, 20) : []
  let budget = MAX_CONTEXT
  const context: string[] = []
  for (const path of paths) {
    let text: string
    try { text = files.read(project.path, path).text } catch { continue }
    if (text.length > budget) break
    budget -= text.length
    context.push(`=== FILE: ${path} ===\n${text}\n=== END FILE ===`)
  }
  const tree = files.find(project.path, '', 400).map((f) => f.path)
  const prompt = `Project: ${project.name}\nProject files (first ${tree.length}):\n${tree.join('\n')}\n\nOpen files:\n${context.join('\n\n') || '(none)'}\n\nOwner's request: ${input.request.trim()}\n\n` +
    'First explain the change in at most four sentences. Then give the COMPLETE new content of every file you change or create, each in this exact form and nothing else inside the block:\n=== FILE: path/relative/to/project ===\n<complete file content>\n=== END FILE ===\nOnly include files that change. Use relative paths inside the project. Never touch .git or node_modules.'
  const engine = settings.plannerEngine
  const result = await runEngine({ engine, model: settings.plannerModel, endpoint: settings.plannerEndpoint || defaultEndpoint(engine), system: withRules(SYSTEM, project.path), prompt,
    cwd: project.path, maxTokens: 16000, timeoutMs: 8 * 60_000, stallMs: 150_000, images: attachmentPaths(project.path, input.images) }, creds)
  if (!result.ok || !result.text.trim()) throw new Error(`The agent did not answer: ${result.error ?? 'empty reply'}`)
  const text = redact(result.text, creds.secretValues())
  const changes: CodeChangeResult['changes'] = []
  for (const block of parseFileBlocks(text).slice(0, 30)) {
    try { workspacePath(project.path, block.path) } catch { continue }
    let original = ''
    let exists = true
    try { original = files.read(project.path, block.path).text } catch { exists = existsSync(join(project.path, block.path)); if (exists) continue }
    if (original === block.text) continue
    changes.push({ path: block.path, original, text: block.text, created: !exists })
  }
  if (!changes.length) throw new Error('The agent answered without any file changes. Ask again or say which files to change.')
  const marker = text.search(/^=+\s*FILE:/m)
  return { answer: (marker > 0 ? text.slice(0, marker) : '').trim(), changes, model: modelFor(engine, settings.plannerModel) }
}

/** The text to insert: no fences, no echo of the line already typed, at most 40 lines. */
export function cleanCompletion(raw: string, prefix: string): string {
  let text = raw.replace(/^\s*```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
  const lastLine = prefix.slice(prefix.lastIndexOf('\n') + 1)
  if (lastLine.trim() && text.startsWith(lastLine)) text = text.slice(lastLine.length)
  return text.split('\n').slice(0, 40).join('\n').trimEnd()
}

const inflight = new Map<number, AbortController>()

/** One inline completion for the cursor; a newer request from the same window cancels this one. */
export async function completeCode(owner: number, input: CodeCompleteInput, settings: AppSettings, creds: Credentials): Promise<string> {
  if (!settings.completionModel) return ''
  if (isCliEngine(settings.completionEngine)) throw new Error('Inline completions need an API or local model; command-line agents are too slow to answer each keystroke.')
  if (typeof input?.prefix !== 'string' || typeof input.suffix !== 'string') return ''
  inflight.get(owner)?.abort()
  const controller = new AbortController()
  inflight.set(owner, controller)
  const prefix = input.prefix.slice(-4000)
  const suffix = input.suffix.slice(0, 1500)
  const result = await runEngine({ engine: settings.completionEngine, model: settings.completionModel,
    endpoint: settings.completionEndpoint || defaultEndpoint(settings.completionEngine),
    system: 'You complete code. Reply with only the exact text to insert at <CURSOR>: no explanation, no code fences, no repetition of text before or after the cursor.',
    prompt: `File: ${String(input.path).slice(0, 300)} (${String(input.language).slice(0, 40)})\n${prefix}<CURSOR>${suffix}`,
    cwd: process.cwd(), maxTokens: 160, timeoutMs: 15_000, signal: controller.signal, reasoning: 'none' }, creds)
  if (inflight.get(owner) === controller) inflight.delete(owner)
  if (!result.ok || controller.signal.aborted) return ''
  return cleanCompletion(redact(result.text, creds.secretValues()), prefix)
}
