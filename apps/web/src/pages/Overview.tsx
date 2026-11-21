import { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { STATES, type AiopsSummary, type HealthSummary, type IncidentRow, type LiveEvent, type Transition } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, Reasons, StatTile, TimeAgo } from '../components/common'
import { Kpi, Ring, pct } from '../components/Kpi'
import { PriorityBadge } from '../components/Priority'
import { StateBadge, stateMeaning } from '../components/StateBadge'
import { describeReason, kindLabel, shortId } from '../lib/format'
import { live } from '../live/live'

export function Overview() {
  const summary = useApi<HealthSummary>('/api/v1/health/summary', 10000)
  const transitions = useApi<Transition[]>('/api/v1/health/transitions?limit=15', 15000)
  const aiops = useApi<AiopsSummary>('/api/v1/aiops/summary', 15000)
  const openInc = useApi<IncidentRow[]>('/api/v1/incidents?status=open&limit=5', 15000)
  const reloadS = summary.reload
  const reloadT = transitions.reload
  const reloadA = aiops.reload
  const reloadI = openInc.reload
  const onEvent = useCallback(
    (e: LiveEvent) => {
      if (e.type === 'health_transition') {
        reloadS()
        reloadT()
      }
      if (e.type === 'incident') {
        reloadA()
        reloadI()
      }
    },
    [reloadS, reloadT, reloadA, reloadI],
  )
  useEffect(() => live.subscribe(onEvent), [onEvent])

  if (summary.error && !summary.data) return <ErrorNote error={summary.error} onRetry={summary.reload} />
  if (!summary.data) return <Loading label="Loading health" />
  const s = summary.data
  const src = s.counts.source
  const col = s.counts.collector
  const totalSrc = STATES.reduce((a, k) => a + src[k], 0)
  const totalCol = STATES.reduce((a, k) => a + col[k], 0)
  const healthySrc = src.Excellent + src.Good
  const srcShare = totalSrc ? healthySrc / totalSrc : null
  const colUp = totalCol - col.Poor
  const colShare = totalCol ? colUp / totalCol : null
  const a = aiops.data
  const openTotal = a ? a.open_by_priority.P1 + a.open_by_priority.P2 + a.open_by_priority.P3 : null

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Operational overview</h1>
        <p className="muted">Health of every monitored source and collector in your tenant, updated live.</p>
      </div>

      <section className="kpis" aria-label="Key figures">
        <Kpi visual={<Ring share={srcShare} label={pct(srcShare)} />} label="Healthy sources"
          value={totalSrc ? `${healthySrc}/${totalSrc}` : '—'} sub="Excellent or Good right now" to="/infrastructure" />
        <Kpi visual={<Ring share={colShare} label={pct(colShare)} />} label="Collectors online"
          value={`${colUp}/${totalCol}`}
          sub={col.Poor ? `${col.Poor} offline or failing` : 'all reporting'} to="/fleet" alert={col.Poor > 0} />
        <Kpi
          visual={<span className={`kpi-badge${a?.open_by_priority.P1 ? ' kpi-badge-critical' : ''}`} aria-hidden="true">
            {openTotal == null ? '…' : openTotal === 0 ? '✓' : '!'}</span>}
          label="Active incidents" value={openTotal ?? '—'}
          sub={a ? `P1 ${a.open_by_priority.P1} · P2 ${a.open_by_priority.P2} · P3 ${a.open_by_priority.P3}` : 'loading'}
          to="/incidents" alert={!!a?.open_by_priority.P1} />
        <Kpi visual={<span className="kpi-badge" aria-hidden="true">÷</span>} label="Alert noise reduction"
          value={a?.noise_reduction_ratio ? `${a.noise_reduction_ratio} : 1` : '—'}
          sub={a ? `${a.alert_signals_total} alert signals → ${a.incidents_total} incidents` : 'loading'} />
      </section>

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
        </div>
      </section>

      {totalSrc === 0 && totalCol === 0 && (
        <Empty>No telemetry yet. Start a collector (and the simulator) to see live health here.</Empty>
      )}

      <Card title="Open incidents" actions={<Link to="/incidents">Incident center →</Link>}>
        {!openInc.data ? <Loading /> : openInc.data.length === 0 ? (
          <Empty>No open incidents.</Empty>
        ) : (
          <ul className="attention">
            {openInc.data.map((i) => (
              <li key={i.id}>
                <PriorityBadge p={i.priority} />
                <Link to={`/incidents/${i.id}`}>{i.title}</Link>
                <span className="muted">{i.alert_count} signals · <TimeAgo iso={i.updated_at} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
