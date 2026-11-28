import type { CostPreference, Difficulty, ModelOption, ModelOutcomeStat, ModelProfile } from './types'

/**
 * Deterministic, capability-based model routing. It chooses only from models the
 * app has actually discovered, scores them on a capability profile (not a name
 * regex), and explains the choice so the UI can show it. `routeModels` returns the
 * ranked list so the runner can fall back to the next candidate when one fails.
 *
 * Profiles are derived from the model id and the provider's pricing flag; the owner
 * overrides any field per model in Settings. The old name patterns survive only as
 * the derivation's fallback signal, never as the primary routing input.
 */

/** Roles whose work is reasoning-heavy and worth a stronger model. */
const DEEP_ROLES = new Set(['architect', 'reviewer', 'integration', 'deployment'])

/** Roles where speed and volume matter more than depth. */
const FAST_ROLES = new Set(['seo', 'aeo', 'monitoring', 'qa', 'researcher'])

/** Roles whose deliverable is code, so coding fit outweighs reasoning. */
const CODE_ROLES = new Set(['frontend', 'backend', 'integration', 'deployment', 'mobile'])

const STRONG = /(opus|sonnet|large|pro|ultra|max|reasoner|\b(gpt-?5|o3|o4)\b|\d{3,}b)/i
const FAST = /(flash|mini|haiku|small|nano|lite|fast|1\.5b|3b|7b|8b)/i
const THINKS = /(reasoner|thinking|-r1\b|\bo[134]\b|opus)/i
const CODER = /(cod(e|er)|deepseek|qwen.*coder|devstral|codestral)/i
const MULTIMODAL = /(vision|-vl\b|llava|pixtral|gpt-4o|gpt-5|gemini|claude|sonnet|opus|haiku)/i
/** Model kinds that can never act as a chat worker, whatever else their name says. */
const NON_CHAT = /(guard|embed|rerank|whisper|tts|transcrib|moderation|search-api|image|dall-e|realtime|audio)/i
/** Vision-first families; only a big one of these can carry code work. */
const VISION_ONLY = /(vision|moondream|smolvlm|-vl\b|vl-)/i
/** Smallest parameter count trusted with hard or code work. */
export const CODING_FLOOR_B = 7
/** Shown (and failed with) when only tiny models remain for a hard task. */
export const NO_MODEL_ERROR = 'No model strong enough: add an API key or pull a larger model (e.g. ollama pull qwen2.5-coder:14b)'

/** Parameter count parsed from the model name (2b, 14b, 500m, 22m); null when the name does not say. */
export function paramsFromName(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*([bm])\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? (m[2].toLowerCase() === 'm' ? n / 1000 : n) : null
}

/** Capability profile inferred from the model id when nothing better is known. */
export function deriveProfile(option: ModelOption): ModelProfile {
  const name = option.model
  // A CLI engine on its provider default is a full coding agent; never score it mid.
  if (!name.trim()) {
    return { contextWindow: 128_000, toolCalling: true, vision: false, codingScore: 80, reasoningScore: 78, costTier: 'medium', latencyTier: 'medium', availability: 'available' }
  }
  const strong = STRONG.test(name)
  const fast = FAST.test(name)
  // A reported parameter size outranks the name; the name's own size token (2b, 500m) comes next.
  const params = option.paramsB ?? paramsFromName(name) ?? undefined
  const real = params != null && Number.isFinite(params) && params > 0
  // Small vision-first models (granite-vision:2b, SmolVLM-500M) describe images; they do not write code.
  const smallVision = real && VISION_ONLY.test(name) && params! <= 4
  const strongTier = real ? params >= 70 : strong
  const fastTier = real ? params <= 8 : fast
  return {
    contextWindow: option.contextLength ?? contextWindow(name),
    toolCalling: !/embed|base\b/i.test(name),
    vision: MULTIMODAL.test(name),
    codingScore: smallVision ? 10 : CODER.test(name) ? 85 : strongTier ? 80 : fastTier ? 50 : 65,
    reasoningScore: smallVision ? 20 : THINKS.test(name) ? 90 : strongTier ? 80 : fastTier ? 45 : 60,
    costTier: option.free === true ? 'free' : fastTier ? 'low' : strongTier && option.free === false ? 'high' : strongTier ? 'high' : 'medium',
    latencyTier: fastTier ? 'fast' : strongTier ? 'slow' : 'medium',
    availability: 'available'
  }
}

function contextWindow(name: string): number {
  const k = name.match(/(\d{2,4})\s*k\b/i)
  if (k) return Number(k[1]) * 1000
  if (/\b1m\b|-1m\b|1048576/i.test(name)) return 1_000_000
  if (/gemini/i.test(name)) return 1_000_000
  if (/claude|sonnet|opus|haiku/i.test(name)) return 200_000
  if (/\b(gpt-?5|gpt-?4o|o[134])\b/i.test(name)) return 128_000
  return 32_768
}

/** The derived profile with the owner's per-model override applied on top. */
export function effectiveProfile(option: ModelOption, overrides?: Record<string, Partial<ModelProfile>>): ModelProfile {
  const base = deriveProfile(option)
  const patch = overrides?.[`${option.provider}::${option.model}`]
  return patch ? { ...base, ...patch } : base
}

export interface RouteChoice {
  option: ModelOption
  reason: string
}

export interface RouteInput {
  role: string
  /** Candidate models, already restricted to configured providers. */
  models: ModelOption[]
  costPreference: CostPreference
  /** Models already in use by the rest of the team, to spread load. */
  inUse?: string[]
  /** The task's difficulty, when known; it outranks the role's default shape. */
  difficulty?: Difficulty | null
  /** Owner overrides for capability profiles, keyed by `${provider}::${model}`. */
  profiles?: Record<string, Partial<ModelProfile>>
  /** Measured outcomes of finished tasks, per model × role × difficulty. */
  outcomes?: ModelOutcomeStat[]
}

/** Below this many finished tasks in a model × role × difficulty bucket, measurements are ignored. */
export const MIN_OUTCOME_SAMPLES = 5
/** Most the measured term can move a score; capability fit alone spans ~10 points. */
const MEASURED_WEIGHT = 10

/**
 * The measured success term for one model on this task's bucket, or null below the
 * threshold. The pass rate is shrunk toward 50% by 4 phantom samples (2 pass, 2 fail),
 * so 5/5 passes gives +2.8, not the full +5, and only many samples approach the cap.
 */
export function measuredTerm(model: string, role: string, difficulty: Difficulty | null | undefined, outcomes?: ModelOutcomeStat[]) {
  const stat = outcomes?.find((o) => o.model === model && o.role === role && o.difficulty === (difficulty ?? 'unrated'))
  if (!stat) return null
  if (stat.samples < MIN_OUTCOME_SAMPLES) return { stat, value: 0, used: false }
  const rate = (stat.passed + 2) / (stat.samples + 4)
  return { stat, value: (rate - 0.5) * MEASURED_WEIGHT, used: true }
}

const COST_RANK: Record<ModelProfile['costTier'], number> = { free: 0, low: 1, medium: 2, high: 3 }
const LATENCY_RANK: Record<ModelProfile['latencyTier'], number> = { fast: 0, medium: 1, slow: 2 }

function scoreModel(option: ModelOption, p: ModelProfile, input: RouteInput, wantsStrength: boolean, wantsSpeed: boolean): number {
  let value = 0
  // Capability fit: strong tasks reward depth, fast tasks reward low latency.
  if (wantsStrength) value += (p.reasoningScore + (CODE_ROLES.has(input.role) ? p.codingScore : p.reasoningScore)) / 20
  if (CODE_ROLES.has(input.role)) value += p.codingScore / 25
  if (wantsSpeed) value += (2 - LATENCY_RANK[p.latencyTier]) * 3 - COST_RANK[p.costTier]
  // Cost preference weighs the cost tier; quality rewards the strong scores instead.
  if (input.costPreference === 'cheap') value += (3 - COST_RANK[p.costTier]) * 2
  if (input.costPreference === 'quality') value += (p.reasoningScore + p.codingScore) / 40
  // Tool-using roles need tool calling; a model without it is a poor integration pick.
  if ((input.role === 'integration' || input.role === 'deployment') && !p.toolCalling) value -= 5
  // Spread a team across providers instead of piling onto one.
  if (input.inUse?.includes(`${option.provider}::${option.model}`)) value -= 4
  if (p.availability === 'degraded') value -= 6
  return value
}

/**
 * The ranked candidate chain, best first; unavailable models are excluded.
 * `hard` marks a task where a too-small model would waste retries; when every
 * candidate is below the coding floor (or non-chat), the chain is empty and the
 * caller should fail fast instead of burning attempts.
 */
export function routeModels(input: RouteInput): RouteChoice[] {
  const hard = input.difficulty === 'high' || CODE_ROLES.has(input.role)
  const candidates = input.models
    .filter((m) => m.configured && (m.model.trim() || m.provider.startsWith('cli-')))
    .filter((m) => !NON_CHAT.test(m.model))
    .map((m) => ({ option: m, profile: effectiveProfile(m, input.profiles) }))
    .filter((c) => c.profile.availability !== 'unavailable')
  const wantsStrength = input.difficulty === 'high' || (!input.difficulty && DEEP_ROLES.has(input.role))
  const wantsSpeed = input.difficulty === 'low' || (!input.difficulty && FAST_ROLES.has(input.role))
  // Hard floor: on demanding work, tiny models lose to any bigger or unknown-size option.
  // A vision-first family with no parseable size (moondream2) is not "unknown, assume strong":
  // it counts as sub-floor so it can never win code work.
  const strongEnough = candidates.filter((c) => {
    const params = c.option.paramsB ?? paramsFromName(c.option.model) ?? undefined
    if (params == null) return !VISION_ONLY.test(c.option.model)
    return params >= CODING_FLOOR_B
  })
  const pool = hard && strongEnough.length ? strongEnough : candidates
  const scored = pool
    .map((c) => {
      const measured = measuredTerm(c.option.model, input.role, input.difficulty, input.outcomes)
      return { ...c, measured, score: scoreModel(c.option, c.profile, input, wantsStrength, wantsSpeed) + (measured?.value ?? 0) }
    })
    // Deterministic order: score, then model name as a stable tie-break.
    .sort((a, b) => b.score - a.score || a.option.model.localeCompare(b.option.model))
  // Only tiny models remain: burning retries on a 2B vision model helps nobody.
  if (hard && candidates.length && !strongEnough.length) throw new Error(NO_MODEL_ERROR)

  const shape = input.difficulty ? `${input.difficulty}-difficulty task` : wantsStrength ? 'reasoning-heavy' : wantsSpeed ? 'high-volume' : 'balanced'
  const cost = input.costPreference === 'cheap' ? 'cost-first' : input.costPreference === 'quality' ? 'quality-first' : 'balanced cost'
  return scored.map((c, i) => {
    const m = c.measured
    const measured = !m ? '' : m.used
      ? `, measured ${m.stat.passed}/${m.stat.samples} passed (${m.value >= 0 ? '+' : ''}${m.value.toFixed(1)})`
      : `, ${m.stat.samples} measured (<${MIN_OUTCOME_SAMPLES}, ignored)`
    return {
      option: c.option,
      reason: i === 0
        ? `${shape} role, ${cost}, ${c.option.providerLabel}${measured}`
        : `fallback #${i} (${shape} role, ${cost}, ${c.option.providerLabel}${measured})`
    }
  })
}

export function routeModel(input: RouteInput): RouteChoice | null {
  return routeModels(input)[0] ?? null
}
