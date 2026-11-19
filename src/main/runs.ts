import type { Agent, Job, RunSummary, SessionRecord } from '../shared/types'

/**
 * Per-run usage. Sessions carry no run id, so each session belongs to the run whose
 * time window it started in (from that run's start to the next run's start).
 * Cost is only what the engine reported; engines that report none show as unreported.
 */
export function summarizeRuns(jobs: Job[], sessions: SessionRecord[], agents: Agent[]): RunSummary[] {
  const ordered = [...jobs].sort((a, b) => a.createdAt - b.createdAt)
  return ordered.map((job, i) => {
    const end = ordered[i + 1]?.createdAt ?? Infinity
    const own = sessions.filter((s) => s.startedAt >= job.createdAt && s.startedAt < end)
    const group = (key: (s: SessionRecord) => string) => [...own.reduce((map, s) => {
      const k = key(s)
      const row = map.get(k) ?? { name: k, sessions: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, seconds: 0 }
      row.sessions++; row.inputTokens += s.inputTokens; row.outputTokens += s.outputTokens; row.costUsd += s.costUsd
      row.seconds += Math.max(0, ((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)
      return map.set(k, row)
    }, new Map<string, RunSummary['byModel'][number]>()).values()].sort((a, b) => b.costUsd - a.costUsd || b.seconds - a.seconds)
    return {
      jobId: job.id,
      instruction: job.instruction,
      status: job.status,
      startedAt: job.createdAt,
      endedAt: job.status === 'running' ? null : job.updatedAt,
      sessions: own.length,
      inputTokens: own.reduce((n, s) => n + s.inputTokens, 0),
      outputTokens: own.reduce((n, s) => n + s.outputTokens, 0),
      costUsd: own.reduce((n, s) => n + s.costUsd, 0),
      costReported: own.some((s) => s.costUsd > 0),
      byModel: group((s) => `${s.engine}${s.model ? ` · ${s.model}` : ''}`),
      byAgent: group((s) => agents.find((a) => a.id === s.agentId)?.name ?? 'Unknown worker'),
      checkpoint: false
    }
  }).reverse()
}
