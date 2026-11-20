import { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { STATES, type HealthSummary, type LiveEvent, type Transition } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, Reasons, StatTile, TimeAgo } from '../components/common'
import { StateBadge, stateMeaning } from '../components/StateBadge'
import { describeReason, kindLabel, shortId } from '../lib/format'
import { live } from '../live/live'

export function Overview() {
  const summary = useApi<HealthSummary>('/api/v1/health/summary', 10000)
  const transitions = useApi<Transition[]>('/api/v1/health/transitions?limit=15', 15000)
  const reloadS = summary.reload
  const reloadT = transitions.reload
  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === 'health_transition') {
        reloadS()
        reloadT()
      }
    },
    [reloadS, reloadT],
  )
  useEffect(() => live.subscribe(onEvent), [onEvent])

  if (summary.error && !summary.data) return <ErrorNote error={summary.error} onRetry={summary.reload} />
  if (!summary.data) return <Loading label="Loading health" />
  const s = summary.data
  const src = s.counts.source
  const col = s.counts.collector
  const totalSrc = STATES.reduce((a, k) => a + src[k], 0)
  const totalCol = STATES.reduce((a, k) => a + col[k], 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Operational overview</h1>
        <p className="muted">Health of every monitored source and collector in your tenant, updated live.</p>
      </div>

      <section className="hero card">
        <div>
          <div className="eyebrow">Tenant health</div>
          <div className="hero-state">
            <StateBadge state={s.tenant?.state} size="lg" />
          </div>
          {s.tenant && <p className="muted">{stateMeaning(s.tenant.state)} · since <TimeAgo iso={s.tenant.since} /></p>}
        </div>
        <div className="tiles">
          {STATES.map((k) => (
            <StatTile key={k} label={<StateBadge state={k} size="sm" />} value={src[k]}
              sub={`of ${totalSrc} sources`} />
          ))}
          <StatTile label="Collectors online" value={`${totalCol - col.Poor}/${totalCol}`}
            sub={col.Poor ? `${col.Poor} offline or failing` : 'all reporting'} />
        </div>
      </section>

      {totalSrc === 0 && totalCol === 0 && (
        <Empty>No telemetry yet. Start a collector (and the simulator) to see live health here.</Empty>
      )}

      <div className="grid-2">
        <Card title="Needs attention">
          {s.worst.length === 0 ? (
            <Empty>Nothing needs attention right now.</Empty>
          ) : (
            <ul className="attention">
              {s.worst.map((e) => (
                <li key={`${e.entity_type}:${e.entity_id}`}>
                  <StateBadge state={e.state} size="sm" />
                  <Link to={e.entity_type === 'collector' ? '/fleet' : `/sources/${e.entity_id}`}>
                    {e.entity_type === 'collector' ? e.entity_id : `${kindLabel(e.meta?.source_kind)} ${shortId(e.entity_id)}`}
                  </Link>
                  <span className="muted">
                    {e.reasons.filter((r) => !['PENDING_DEGRADE', 'RECOVERING'].includes(r.code))
                      .map(describeReason)[0] ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent state changes" actions={<span className="muted small">UTC, newest first</span>}>
          {transitions.error && <ErrorNote error={transitions.error} />}
          {!transitions.data ? (
            <Loading />
          ) : transitions.data.length === 0 ? (
            <Empty>No state changes recorded yet.</Empty>
          ) : (
            <ol className="timeline">
              {transitions.data.map((t) => (
                <li key={t.id ?? `${t.entity_id}${t.at_utc}`}>
                  <TimeAgo iso={t.at_utc} />
                  <span>{t.entity_type === 'tenant' ? 'Tenant' : t.entity_type === 'collector' ? t.entity_id : shortId(t.entity_id)}</span>
                  <span className="transition">
                    {t.from_state ? <StateBadge state={t.from_state} size="sm" /> : <span className="muted">new</span>}
                    <span aria-hidden="true">→</span>
                    <StateBadge state={t.to_state} size="sm" />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {s.tenant && (
        <Card title="Why the tenant is in this state">
          <Reasons reasons={s.tenant.reasons} />
        </Card>
      )}
    </div>
  )
}
