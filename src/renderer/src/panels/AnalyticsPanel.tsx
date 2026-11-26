import { useEffect, useState } from 'react'
import { Modal } from '../shell'
import { guard } from '../store'
import type { AnalyticsOverview } from '../../../shared/types'

type Range = '7d' | '30d' | '90d' | 'all'
const RANGES: Array<{ id: Range; label: string; ms: number }> = [
  { id: '7d', label: '7 days', ms: 7 * 86400_000 },
  { id: '30d', label: '30 days', ms: 30 * 86400_000 },
  { id: '90d', label: '90 days', ms: 90 * 86400_000 },
  { id: 'all', label: 'All time', ms: 0 },
]

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
const money = (n: number) => n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(3)}` : '$0.00'

function SparkBar({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 0.001)
  return (
    <div className="spark-bar" aria-hidden>
      {values.map((v, i) => (
        <div key={i} className="spark-col" style={{ height: `${Math.round((v / max) * 100)}%`, background: color }} />
      ))}
    </div>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="analytics-tile">
      <div className="analytics-tile-value">{value}</div>
      <div className="analytics-tile-label">{label}</div>
      {sub ? <div className="analytics-tile-sub dim">{sub}</div> : null}
    </div>
  )
}

function TableSection<T>({ title, rows, cols }: { title: string; rows: T[]; cols: Array<{ key: keyof T & string; label: string; fmt?: (v: T[keyof T]) => string }> }) {
  if (!rows.length) return null
  return (
    <div className="analytics-section">
      <div className="section-label">{title}</div>
      <table className="analytics-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((c) => <td key={c.key}>{c.fmt ? c.fmt(row[c.key]) : String(row[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AnalyticsPanel({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<Range>('30d')
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const r = RANGES.find((r) => r.id === range)!
    const since = r.ms === 0 ? 0 : Date.now() - r.ms
    void guard(() => window.ventriee.analyticsOverview(since)).then((d) => {
      setData(d ?? null)
      setLoading(false)
    })
  }, [range])

  return (
    <Modal title="Usage & Analytics" subtitle="Tokens, cost, and execution stats across all projects." onClose={onClose}>
      <div className="analytics-toolbar">
        <div className="analytics-range-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r.id} className={`analytics-range-tab${range === r.id ? ' on' : ''}`} role="tab" aria-selected={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        {loading ? <span className="dim" style={{ fontSize: 'var(--fs-xs)' }}>Loading…</span> : null}
      </div>

      {data ? (
        <>
          <div className="analytics-tiles">
            <StatTile label="Total cost" value={money(data.totalCostUsd)} />
            <StatTile label="Sessions" value={fmt(data.totalSessions)} />
            <StatTile label="Tokens in" value={fmt(data.totalInputTokens)} />
            <StatTile label="Tokens out" value={fmt(data.totalOutputTokens)} />
            <StatTile label="Success rate" value={`${Math.round(data.successRate)}%`} />
          </div>

          {data.daily.length > 1 ? (
            <div className="analytics-section">
              <div className="section-label">Daily cost</div>
              <SparkBar values={data.daily.map((d) => d.costUsd)} />
              <div className="spark-labels">
                <span className="dim">{data.daily[0]?.date}</span>
                <span className="dim">{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </div>
          ) : null}

          <TableSection
            title="By model"
            rows={data.byModel}
            cols={[
              { key: 'name', label: 'Model' },
              { key: 'sessions', label: 'Sessions', fmt: (v) => fmt(v as number) },
              { key: 'inputTokens', label: 'Tokens in', fmt: (v) => fmt(v as number) },
              { key: 'outputTokens', label: 'Tokens out', fmt: (v) => fmt(v as number) },
              { key: 'costUsd', label: 'Cost', fmt: (v) => money(v as number) },
            ]}
          />

          <TableSection
            title="By project"
            rows={data.byProject}
            cols={[
              { key: 'name', label: 'Project' },
              { key: 'sessions', label: 'Sessions', fmt: (v) => fmt(v as number) },
              { key: 'costUsd', label: 'Cost', fmt: (v) => money(v as number) },
            ]}
          />

          {!data.totalSessions ? (
            <div className="dim text-sm" style={{ padding: '24px 0', textAlign: 'center' }}>
              No sessions found in this time range. Run an agent to see stats here.
            </div>
          ) : null}
        </>
      ) : !loading ? (
        <div className="dim text-sm" style={{ padding: '24px 0', textAlign: 'center' }}>No data.</div>
      ) : null}
    </Modal>
  )
}
