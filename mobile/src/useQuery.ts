// Minimal load-on-mount hook with loading/error/data and a refetch, so every screen
// gets the same states without a data-fetching dependency.
import { useCallback, useEffect, useState } from 'react'

export interface Query<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): Query<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
    // fn is recreated per render; deps are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { void run() }, [run])

  return { data, loading, error, refetch: run }
}
