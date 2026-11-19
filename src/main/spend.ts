/** Midnight today, local time: daily limits reset then. */
export const startOfToday = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() }

/** Why new paid work must wait, or null. A cap of 0 is off. Only spend the engines report is counted. */
export function spendBlock(spentToday: (projectId?: string) => number, caps: { dailyBudgetUsd: number; projectBudgetUsd: number }, projectId: string): string | null {
  const money = (n: number) => `$${n.toFixed(2)}`
  if (caps.dailyBudgetUsd > 0) {
    const spent = spentToday()
    if (spent >= caps.dailyBudgetUsd) return `Daily spending limit reached: ${money(spent)} of ${money(caps.dailyBudgetUsd)} today. Raise it in Settings, or wait until tomorrow.`
  }
  if (caps.projectBudgetUsd > 0) {
    const spent = spentToday(projectId)
    if (spent >= caps.projectBudgetUsd) return `This project's daily limit is reached: ${money(spent)} of ${money(caps.projectBudgetUsd)} today. Raise it in Settings, or wait until tomorrow.`
  }
  return null
}
