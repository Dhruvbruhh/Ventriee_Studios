// Minimal data-loading hook: tracks loading/error/data and exposes reload().
// Covers the "real loading/empty/error states" the dashboard needs everywhere.
import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // fn is intentionally keyed by `deps`, not its identity.
  const run = useCallback(fn, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => { if (active) setData(d) })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [run, tick])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}
