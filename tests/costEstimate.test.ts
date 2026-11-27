import { describe, expect, it } from 'vitest'
import { estimatePlanCost, type RoleCostStat } from '../src/main/costEstimate'
import type { PlannedTask } from '../src/main/planner'

function task(role: string): PlannedTask {
  return { key: 't1', title: 'T', description: 'D', acceptance: 'A', role, phase: 'build', dependsOnKeys: [] }
}

const stats: RoleCostStat[] = [
  { role: 'frontend', avgCostUsd: 0.4, samples: 6 },
  { role: 'reviewer', avgCostUsd: 0.1, samples: 3 }
]

describe('estimatePlanCost', () => {
  it('sums the recorded averages of roles with history', () => {
    const est = estimatePlanCost([task('frontend'), task('frontend'), task('reviewer')], stats)
    expect(est.estimatedUsd).toBeCloseTo(0.9)
    expect(est.text).toContain('~$0.90')
    expect(est.text).toContain('9 past tasks')
    expect(est.unknownRoles).toEqual([])
  })

  it('names roles with no recorded cost instead of pricing them', () => {
    const est = estimatePlanCost([task('frontend'), task('designer')], stats)
    expect(est.estimatedUsd).toBeCloseTo(0.4)
    expect(est.unknownRoles).toEqual(['designer'])
    expect(est.text).toContain('designer have no recorded cost yet')
  })

  it('returns no estimate when nothing has been measured', () => {
    const est = estimatePlanCost([task('frontend')], [])
    expect(est.text).toBe('')
    expect(est.estimatedUsd).toBeNull()
    expect(est.samples).toBe(0)
  })
})
