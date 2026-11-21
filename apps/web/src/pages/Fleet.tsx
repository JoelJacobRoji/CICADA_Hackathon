import { useCallback, useEffect } from 'react'
import type { Collector, LiveEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, Reasons, TimeAgo } from '../components/common'
import { StateBadge } from '../components/StateBadge'
import { useHealthEntities } from '../live/hooks'
import { live } from '../live/live'

// Queue bar: full at QUEUE_SCALE payloads waiting to be sent. Purely visual; the number is always shown.
const QUEUE_SCALE = 1000

function QueueBar({ depth }: { depth: number }) {
  const share = Math.min(1, depth / QUEUE_SCALE)
  return (
    <span className={`qbar${depth >= 100 ? ' qbar-high' : ''}`} aria-hidden="true"
      title={`${depth} payload(s) waiting to be sent; bar is full at ${QUEUE_SCALE}`}>
      <span style={{ width: `${Math.max(share * 100, depth > 0 ? 4 : 0)}%` }} />
    </span>
  )
}

export function Fleet() {
  const cols = useApi<Collector[]>('/api/v1/collectors', 10000)
  const health = useHealthEntities('collector')
  const reload = cols.reload
  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === 'heartbeat') reload()
  }, [reload])
  useEffect(() => live.subscribe(onEvent), [onEvent])

  if (cols.error && !cols.data) return <ErrorNote error={cols.error} onRetry={cols.reload} />
  if (!cols.data) return <Loading label="Loading collectors" />
  const byId = new Map((health.data ?? []).map((h) => [h.entity_id, h]))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Collector fleet</h1>
        <p className="muted">
          Collectors run inside each customer environment and only send allow-listed metadata.
          Offline = no heartbeat for more than 30 s.
        </p>
      </div>
      {cols.data.length === 0 ? (
        <Empty>No collectors are registered for this tenant.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Collector</th><th>Health</th><th>Last seen</th><th>Version</th>
                  <th className="num">CPU</th><th className="num">Memory</th>
                  <th className="num" title="Payloads waiting in the collector's outbox (durable local buffer)">Queue</th><th className="num">Oldest queued</th>
                  <th>Config</th><th>Adapters</th>
                </tr>
              </thead>
              <tbody>
                {cols.data.map((c) => {
                  const h = byId.get(c.id)
                  return (
                    <tr key={c.id}>
                      <td><code>{c.id}</code><div className="muted small">{c.region} · {c.status}</div></td>
                      <td>
                        <StateBadge state={h?.state ?? (c.connectivity === 'offline' ? 'Poor' : undefined)} size="sm" />
                        <div className="muted small">{c.connectivity}</div>
                      </td>
                      <td><TimeAgo iso={c.last_seen_at} /></td>
                      <td>{c.collector_version ?? '—'}</td>
                      <td className="num">{c.cpu_percent != null ? `${c.cpu_percent.toFixed(1)}%` : '—'}</td>
                      <td className="num">{c.memory_mb != null ? `${c.memory_mb.toFixed(0)} MB` : '—'}</td>
                      <td className="num">
                        {c.outbox_depth ?? '—'}
                        {c.outbox_depth != null && <QueueBar depth={c.outbox_depth} />}
                      </td>
                      <td className="num">{c.oldest_pending_age_s != null ? `${c.oldest_pending_age_s.toFixed(1)} s` : '—'}</td>
                      <td><code title={c.config_hash ?? ''}>{c.config_hash ? c.config_hash.slice(0, 10) : '—'}</code></td>
                      <td>
                        {(c.adapters ?? []).map((a) => (
                          <span key={a.name} className={`chip chip-${a.status}`}>{a.name}: {a.status}</span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {(health.data ?? []).filter((h) => h.state !== 'Excellent').map((h) => (
        <Card key={h.entity_id} title={<>Why {h.entity_id} is <StateBadge state={h.state} size="sm" /></>}>
          <Reasons reasons={h.reasons} />
        </Card>
      ))}
    </div>
  )
}
