import type { CostPreference, Difficulty, ModelOption } from '../shared/types'

/**
 * Deterministic model routing. It only ever chooses from models the app has
 * actually discovered, and it explains its choice so the UI can show it.
 *
 * This is a heuristic, not a capability benchmark: it maps role shape and the
 * owner's cost preference onto model-name signals. `shortcut: name-pattern
 * scoring, replace with measured success rates once sessions carry outcomes.`
 */

/** Roles whose work is reasoning-heavy and worth a stronger model. */
const DEEP_ROLES = new Set(['architect', 'reviewer', 'integration', 'deployment'])

/** Roles where speed and volume matter more than depth. */
const FAST_ROLES = new Set(['seo', 'aeo', 'monitoring', 'qa', 'researcher'])

const STRONG = /(opus|sonnet|large|pro|ultra|max|reasoner|\b(gpt-?5|o3|o4)\b|\d{3,}b)/i
const FAST = /(flash|mini|haiku|small|nano|lite|fast|1\.5b|3b|7b|8b)/i
const CHEAP_FREE = /(:free|free)/i

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
}

export function routeModel(input: RouteInput): RouteChoice | null {
  const candidates = input.models.filter((m) => m.configured && m.model.trim())
  if (!candidates.length) return null

  const wantsStrength = input.difficulty === 'high' || (!input.difficulty && DEEP_ROLES.has(input.role))
  const wantsSpeed = input.difficulty === 'low' || (!input.difficulty && FAST_ROLES.has(input.role))

  const score = (option: ModelOption): number => {
    let value = 0
    const name = option.model
    if (STRONG.test(name)) value += wantsStrength ? 6 : wantsSpeed && input.difficulty === 'low' ? -3 : 2
    if (FAST.test(name)) value += wantsSpeed ? 5 : 1
    // An easy task should not spend a premium model when a free one exists.
    if (input.difficulty === 'low' && option.free === true) value += 3
    if (option.free === true) value += input.costPreference === 'cheap' ? 6 : 1
    if (option.free === false) value += input.costPreference === 'quality' ? 3 : 0
    if (input.costPreference === 'cheap' && CHEAP_FREE.test(name)) value += 3
    // Keep a team on different models instead of piling onto one provider.
    if (input.inUse?.includes(`${option.provider}::${option.model}`)) value -= 4
    return value
  }

  const ranked = [...candidates].sort((a, b) => score(b) - score(a))
  const best = ranked[0]!
  const runnerUp = ranked[1]
  const margin = score(best) - (runnerUp ? score(runnerUp) : 0)
  const shape = input.difficulty ? `${input.difficulty}-difficulty task` : wantsStrength ? 'reasoning-heavy' : wantsSpeed ? 'high-volume' : 'balanced'
  const cost = input.costPreference === 'cheap' ? 'cost-first' : input.costPreference === 'quality' ? 'quality-first' : 'balanced cost'
  return {
    option: best,
    reason: `${shape} role, ${cost}, ${best.providerLabel}${margin === 0 ? ' (tied score, first by name)' : ''}`
  }
}
