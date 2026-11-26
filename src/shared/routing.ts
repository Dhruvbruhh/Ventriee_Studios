import type { CostPreference, Difficulty, ModelOption, ModelProfile } from './types'

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

/** Capability profile inferred from the model id when nothing better is known. */
export function deriveProfile(option: ModelOption): ModelProfile {
  const name = option.model
  const strong = STRONG.test(name)
  const fast = FAST.test(name)
  return {
    contextWindow: contextWindow(name),
    toolCalling: !/embed|base\b/i.test(name),
    vision: MULTIMODAL.test(name),
    codingScore: CODER.test(name) ? 85 : strong ? 80 : fast ? 50 : 65,
    reasoningScore: THINKS.test(name) ? 90 : strong ? 80 : fast ? 45 : 60,
    costTier: option.free === true ? 'free' : fast ? 'low' : strong && option.free === false ? 'high' : strong ? 'high' : 'medium',
    latencyTier: fast ? 'fast' : strong ? 'slow' : 'medium',
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

/** The ranked candidate chain, best first; unavailable models are excluded. */
export function routeModels(input: RouteInput): RouteChoice[] {
  const candidates = input.models.filter((m) => m.configured && m.model.trim())
  const wantsStrength = input.difficulty === 'high' || (!input.difficulty && DEEP_ROLES.has(input.role))
  const wantsSpeed = input.difficulty === 'low' || (!input.difficulty && FAST_ROLES.has(input.role))
  const scored = candidates
    .map((option) => ({ option, profile: effectiveProfile(option, input.profiles) }))
    .filter((c) => c.profile.availability !== 'unavailable')
    .map((c) => ({ ...c, score: scoreModel(c.option, c.profile, input, wantsStrength, wantsSpeed) }))
    // Deterministic order: score, then model name as a stable tie-break.
    .sort((a, b) => b.score - a.score || a.option.model.localeCompare(b.option.model))

  const shape = input.difficulty ? `${input.difficulty}-difficulty task` : wantsStrength ? 'reasoning-heavy' : wantsSpeed ? 'high-volume' : 'balanced'
  const cost = input.costPreference === 'cheap' ? 'cost-first' : input.costPreference === 'quality' ? 'quality-first' : 'balanced cost'
  return scored.map((c, i) => ({
    option: c.option,
    reason: i === 0
      ? `${shape} role, ${cost}, ${c.option.providerLabel}`
      : `fallback #${i} (${shape} role, ${cost}, ${c.option.providerLabel})`
  }))
}

export function routeModel(input: RouteInput): RouteChoice | null {
  return routeModels(input)[0] ?? null
}
