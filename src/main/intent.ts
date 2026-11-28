/** What the owner's message is asking for, decided by the chat model with a heuristic fallback. */
export type ChatIntent = 'prototype' | 'feature' | 'fix' | 'question'

/**
 * Per-intent protocol appended to the planning chat system prompt.
 * - prototype/feature: 3-5 focused questions in ONE message when the idea is
 *   vague, then a meta-plan card the owner can approve.
 * - fix: reproduction and acceptance first; never redesign.
 * - question: just answer; no interrogation, no plan card.
 */
export function protocolFor(intent: ChatIntent): string {
  switch (intent) {
    case 'prototype':
      return `The owner wants something NEW (a prototype or product). Work in two steps:
1. If important decisions are still open, ask 3-5 focused questions — in one single message, numbered, each with a proposed default so the owner can just say "ok".
2. Once the idea is concrete enough, reply with a "Here's what I'll do" card before anything else:

**Here's what I'll do**
- **Goal:** one sentence.
- **Scope:** what this build includes (short list).
- **Out of scope:** what you will deliberately not build.
- **Done means:** how the owner will check it works.

Do not start step 2 in the same message as step 1.`
    case 'feature':
      return `The owner wants to ADD to something existing. Work in two steps:
1. If placement, data or behavior are still open, ask 3-5 focused questions — in one single message, numbered, each with a proposed default so the owner can just say "ok".
2. Once concrete, reply with a "Here's what I'll do" card before anything else:

**Here's what I'll do**
- **Goal:** one sentence.
- **Scope:** what changes (short list).
- **Out of scope:** what you will deliberately not touch.
- **Done means:** how the owner will check it works.

Do not start step 2 in the same message as step 1.`
    case 'fix':
      return `The owner is reporting something BROKEN. Do not redesign. First pin down, in one short message: what exactly happens, what should happen instead, and how to reproduce it (ask for missing pieces with proposed defaults). Then reply with a "Here's what I'll do" card: Goal, Scope (the smallest change that fixes it), Out of scope, Done means (the reproduction now passes).`
    case 'question':
      return `The owner is ASKING something, not commissioning work. Answer directly and concretely. Do not interrogate, do not produce a plan card. If answering well needs one missing fact, ask for it in the same message as your best-effort answer.`
  }
}

/** Parse a one-word model reply into an intent; anything else is a feature ask. */
export function parseIntent(reply: string): ChatIntent {
  const m = reply.toLowerCase()
  if (/\bprototype\b/.test(m)) return 'prototype'
  if (/\bfix\b|\bbug\b/.test(m)) return 'fix'
  if (/\bquestion\b/.test(m)) return 'question'
  return 'feature'
}

/** Cheap local fallback when the model call fails or the setting is off. */
export function guessIntent(text: string): ChatIntent {
  // Commissioning beats asking: "Can you build me an app?" is a prototype ask.
  if (/\b(broken|fail\w*|error\w*|crash\w*|bug|wrong|doesn'?t work|not working|fix)\b/i.test(text)) return 'fix'
  if (/\b(new app|prototype|mvp|from scratch)\b/i.test(text) || /\b(build|create|make)\s+(me\s+|us\s+)?(a|an|the|my|our|new)\b/i.test(text)) return 'prototype'
  if (/^\s*(how|what|why|when|which|can you explain|is it possible|does )/i.test(text.trim()) || text.trim().endsWith('?')) return 'question'
  return 'feature'
}

const INTENT_SYSTEM = `Classify the owner's last message. Reply with exactly one word, nothing else:
- "prototype" — they describe something new to build from scratch
- "feature" — they want to add or change part of an existing product
- "fix" — they report something broken or wrong
- "question" — they are asking, not commissioning`

/** One cheap model call; falls back to the local heuristic on any failure. */
export async function classifyIntent(
  run: (input: { system: string; prompt: string; maxTokens: number }) => Promise<string | null>,
  text: string
): Promise<ChatIntent> {
  try {
    const reply = await run({ system: INTENT_SYSTEM, prompt: text.slice(0, 4000), maxTokens: 8 })
    return reply ? parseIntent(reply) : guessIntent(text)
  } catch {
    return guessIntent(text)
  }
}

