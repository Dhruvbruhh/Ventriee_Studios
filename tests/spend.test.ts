import { describe, expect, it } from 'vitest'
import { spendBlock, startOfToday } from '../src/main/spend'

describe('spending limits', () => {
  const spent = (all: number, project: number) => (id?: string) => (id ? project : all)
  it('is off at 0 and blocks at or over a cap', () => {
    expect(spendBlock(spent(99, 99), { dailyBudgetUsd: 0, projectBudgetUsd: 0 }, 'p')).toBeNull()
    expect(spendBlock(spent(4.99, 1), { dailyBudgetUsd: 5, projectBudgetUsd: 0 }, 'p')).toBeNull()
    expect(spendBlock(spent(5, 1), { dailyBudgetUsd: 5, projectBudgetUsd: 0 }, 'p')).toMatch(/Daily spending limit reached: \$5\.00 of \$5\.00/)
    expect(spendBlock(spent(1, 2), { dailyBudgetUsd: 5, projectBudgetUsd: 2 }, 'p')).toMatch(/project's daily limit/)
  })
  it('resets at local midnight', () => {
    const noon = new Date(2026, 10, 20, 12).getTime()
    expect(startOfToday(noon)).toBe(new Date(2026, 10, 20).getTime())
  })
})
