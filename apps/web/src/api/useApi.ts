import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './client'

export interface Query<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  reload: () => void
}

/** Fetch on mount (and when `path` changes); optional polling. Keeps last good data on error. */
export function useApi<T>(path: string | null, pollMs?: number): Query<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const seq = useRef(0)

  const load = useCallback(() => {
    if (!path) return
    const mine = ++seq.current
    api<T>(path)
      .then((d) => {
        if (mine === seq.current) {
          setData(d)
          setError(null)
        }
      })
      .catch((e: Error) => mine === seq.current && setError(e))
      .finally(() => mine === seq.current && setLoading(false))
  }, [path])

  useEffect(() => {
    setLoading(path !== null)
    load()
    if (!pollMs) return
    const t = setInterval(load, pollMs)
    return () => clearInterval(t)
  }, [load, path, pollMs])

  return { data, error, loading, reload: load }
}
