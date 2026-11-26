import type { Clarification } from '../shared/types'

/** Ask the planning model what's missing. A clear brief should get zero questions. */
export function clarifyPrompt(brief: string): string {
  return `Before planning, check this brief for missing requirements that would materially change the result (scope, audience, platform, data, integrations, must-haves).

Brief from the owner: ${brief}

Rules:
- Ask only when a wrong guess would change what gets built. Do not ask about details a sensible default covers.
- 0 to 5 short questions. If the brief is clear enough to plan, return no questions.
- Each question has a suggested default answer the owner can accept as-is.
- Reply with JSON only.

JSON shape:
{"questions":[{"question":"...","default":"..."}]}`
}

/** Parse the model's questions defensively: fenced, wrapped in prose, or junk. Junk means no questions. */
export function parseClarifyAnswer(raw: string): Clarification[] {
  const candidate = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)?.[1] ?? raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { questions?: unknown }
    if (!Array.isArray(parsed.questions)) return []
    return parsed.questions
      .map((q: { question?: unknown; default?: unknown; answer?: unknown }) => ({
        question: String(q?.question ?? '').trim().slice(0, 300),
        answer: String(q?.default ?? q?.answer ?? '').trim().slice(0, 300)
      }))
      .filter((q) => q.question)
      .slice(0, 5)
  } catch {
    return []
  }
}

/** Append the owner's answers so the planner sees them as part of the brief. */
export function foldClarifications(brief: string, answers: Clarification[] = []): string {
  const lines = answers.filter((a) => a.question.trim()).map((a) => `- Q: ${a.question.trim()}\n  A: ${a.answer.trim() || '(no preference)'}`)
  return lines.length ? `${brief}\n\nClarifications:\n${lines.join('\n')}` : brief
}
