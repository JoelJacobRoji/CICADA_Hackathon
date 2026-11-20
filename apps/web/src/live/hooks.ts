import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { HealthEntity, LiveEvent, MetricPoint, Thresholds } from '../api/types'
import { useApi } from '../api/useApi'
import { live } from './live'

const WINDOW_MS = 15 * 60 * 1000

/** All sources' windows for one metric over the last 15 min, kept live from the WebSocket. */
export function useMetricSeries(metric: string, sourcePid?: string) {
  const [byPid, setByPid] = useState<Map<string, MetricPoint[]>>(new Map())
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const q = new URLSearchParams({ metric, minutes: '15', limit: '20000' })
    if (sourcePid) q.set('source_pid', sourcePid)
    api<MetricPoint[]>(`/api/v1/metrics?${q}`)
      .then((rows) => {
        if (cancelled) return
        const m = new Map<string, MetricPoint[]>()
        for (const r of rows) m.set(r.source_pid, [...(m.get(r.source_pid) ?? []), r])
        setByPid(m)
        setError(null)
      })
      .catch((e: Error) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))

    const unsub = live.subscribe((e: LiveEvent) => {
      if (e.type !== 'metric_summary' || e.metric !== metric) return
      if (sourcePid && e.source_pid !== sourcePid) return
      const p = e as MetricPoint
      setByPid((prev) => {
        const next = new Map(prev)
        const cutoff = new Date(Date.now() - WINDOW_MS).toISOString()
        const list = (next.get(p.source_pid) ?? []).filter((x) => x.window_end >= cutoff)
        if (!list.some((x) => x.payload_id === p.payload_id)) list.push(p)
        next.set(p.source_pid, list)
        return next
      })
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [metric, sourcePid])

  return { byPid, error, loading }
}

/** Health entities, refreshed on every live health transition (debounced) and every 10 s. */
export function useHealthEntities(type?: 'source' | 'collector') {
  const path = `/api/v1/health/entities${type ? `?type=${type}` : ''}`
  const q = useApi<HealthEntity[]>(path, 10000)
  const { reload } = q
  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === 'health_transition') reload()
    },
    [reload],
  )
  useEffect(() => live.subscribe(onEvent), [onEvent])
  return q
}

let thresholdsCache: Promise<Thresholds> | null = null
export function useThresholds(): Thresholds | undefined {
  const [t, setT] = useState<Thresholds>()
  useEffect(() => {
    thresholdsCache ??= api<Thresholds>('/api/v1/settings/thresholds')
    thresholdsCache.then(setT).catch(() => {
      thresholdsCache = null
    })
  }, [])
  return t
}

export function thresholdLines(t: Thresholds | undefined, metric: string) {
  const n = t?.numeric?.[metric]
  if (!n) return []
  return [
    { label: `Good >${n.good}`, value: n.good },
    { label: `Fair >${n.fair}`, value: n.fair },
    { label: `Poor >${n.poor}`, value: n.poor },
  ]
}
