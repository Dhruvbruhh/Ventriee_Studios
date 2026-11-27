import type { PlannedTask } from './planner'

/**
 * §8 cost estimate: after planning, predict the run's cost from what this
 * studio's past tasks actually cost per role. Nothing is invented: roles with
 * no recorded history are named as unknown instead of priced, and with no
 * history at all there is no estimate.
 */

export interface RoleCostStat {
  role: string
  avgCostUsd: number
  samples: number
}

export interface CostEstimate {
  /** One-line text for the plan note and run log; '' when there is no basis. */
  text: string
  estimatedUsd: number | null
  samples: number
  unknownRoles: string[]
}

export function estimatePlanCost(tasks: PlannedTask[], stats: RoleCostStat[]): CostEstimate {
  const totalSamples = stats.reduce((n, s) => n + s.samples, 0)
  const byRole = new Map(stats.map((s) => [s.role, s]))
  let estimatedUsd = 0
  const unknownRoles: string[] = []
  for (const task of tasks) {
    const stat = byRole.get(task.role)
    if (stat && stat.samples > 0) estimatedUsd += stat.avgCostUsd
    else if (!unknownRoles.includes(task.role)) unknownRoles.push(task.role)
  }
  if (!totalSamples) return { text: '', estimatedUsd: null, samples: 0, unknownRoles: [] }
  const unknown = unknownRoles.length ? `; ${unknownRoles.join(', ')} have no recorded cost yet` : ''
  return {
    text: `Cost estimate from ${totalSamples} past task${totalSamples === 1 ? '' : 's'}: ~$${estimatedUsd.toFixed(2)}${unknown}. Real spend appears in Analytics when the run finishes.`,
    estimatedUsd,
    samples: totalSamples,
    unknownRoles
  }
}
