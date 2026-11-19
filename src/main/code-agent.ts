import type { Credentials } from './credentials'
import { runEngine, modelFor, defaultEndpoint } from './engines'
import { redact } from './redact'
import type { AppSettings, Project } from '../shared/types'
import type { CodeAskInput, CodeAskResult } from '../shared/workspace'

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
  const result = await runEngine({ engine, model: settings.plannerModel, endpoint: settings.plannerEndpoint || defaultEndpoint(engine), system: SYSTEM, prompt,
    cwd: project.path, maxTokens: edit ? 8000 : 3000, timeoutMs: 5 * 60_000, stallMs: 120_000 }, creds)
  if (!result.ok || !result.text.trim()) throw new Error(`The agent did not answer: ${result.error ?? 'empty reply'}`)
  const text = redact(result.text, creds.secretValues())
  const replacement = edit ? replacementFrom(text) : null
  if (edit && replacement === null) throw new Error('The agent answered without a code block, so there is no edit to review. Ask again or rephrase.')
  return { answer: replacement !== null ? text.slice(0, text.lastIndexOf('```', text.lastIndexOf('```') - 1)).trim() : text.trim(), replacement, model: modelFor(engine, settings.plannerModel) }
}
