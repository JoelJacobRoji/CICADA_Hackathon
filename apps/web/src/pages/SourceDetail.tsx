import { useCallback, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { EntityDetail, LiveEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, Reasons, TimeAgo } from '../components/common'
import { MetricChart } from '../components/MetricChart'
import { StateBadge, stateMeaning } from '../components/StateBadge'
import { fmtValue, kindLabel, metricLabel, shortId, utc } from '../lib/format'
import { thresholdLines, useMetricSeries, useThresholds } from '../live/hooks'
import { live } from '../live/live'

function SourceMetric({ pid, metric, unit }: { pid: string; metric: string; unit: string }) {
  const s = useMetricSeries(metric, pid)
  const t = useThresholds()
  const pts = s.byPid.get(pid) ?? []
  return (
    <Card title={metricLabel(metric)}>
      {pts.length === 0 ? <Empty>No recent windows.</Empty> : (
        <MetricChart points={pts} metric={metric} unit={unit} thresholds={thresholdLines(t, metric)} />
      )}
    </Card>
  )
}

export function SourceDetail() {
  const { pid = '' } = useParams()
  const q = useApi<EntityDetail>(`/api/v1/health/source/${encodeURIComponent(pid)}`, 10000)
  const reload = q.reload
  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === 'health_transition' && e.entity_id === pid) reload()
  }, [pid, reload])
  useEffect(() => live.subscribe(onEvent), [onEvent])

  if (q.error && !q.data) {
    return q.error.message === 'not found'
      ? <Empty>No health record for {shortId(pid)} in your tenant. <Link to="/">Back to overview</Link></Empty>
      : <ErrorNote error={q.error} onRetry={q.reload} />
  }
  if (!q.data) return <Loading label="Loading source" />
  const d = q.data

  return (
    <div className="stack">
      <div className="page-head">
        <p className="eyebrow"><Link to="/">Overview</Link> / source</p>
        <h1>{kindLabel(d.meta?.source_kind)} <code>{d.entity_id}</code></h1>
        <p className="muted">
          Pseudonymous ID: the real hostname is known only inside the customer environment.
        </p>
      </div>
      <section className="hero card">
        <div>
          <div className="eyebrow">Current health</div>
          <div className="hero-state"><StateBadge state={d.state} size="lg" /></div>
          <p className="muted">{stateMeaning(d.state)} · since <TimeAgo iso={d.since} /> · last data <TimeAgo iso={d.last_received} /></p>
        </div>
        <div className="why">
          <div className="eyebrow">Why</div>
          <Reasons reasons={d.reasons} />
        </div>
      </section>

      <Card title="Factors (latest window per metric)">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Metric</th><th>State</th><th className="num">Observed</th>
              <th className="num">Threshold crossed</th><th>Window end (UTC)</th></tr></thead>
            <tbody>
              {d.factors.map((f) => (
                <tr key={f.metric}>
                  <td>{metricLabel(f.metric)}</td>
                  <td><StateBadge state={f.state} size="sm" /></td>
                  <td className="num">{fmtValue(f.observed, f.unit)}</td>
                  <td className="num">{f.state === 'Excellent' ? '—' : fmtValue(f.threshold, f.unit)}</td>
                  <td>{utc(f.window_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="multiples">
        {d.factors.map((f) => <SourceMetric key={f.metric} pid={pid} metric={f.metric} unit={f.unit} />)}
      </div>

      <Card title="State history" actions={<span className="muted small">UTC, newest first</span>}>
        {d.history.length === 0 ? <Empty>No transitions recorded.</Empty> : (
          <ol className="timeline">
            {d.history.map((t) => (
              <li key={t.id ?? t.at_utc}>
                <span title={utc(t.at_utc)}>{utc(t.at_utc).slice(11)}</span>
                <span className="transition">
                  {t.from_state ? <StateBadge state={t.from_state} size="sm" /> : <span className="muted">new</span>}
                  <span aria-hidden="true">→</span>
                  <StateBadge state={t.to_state} size="sm" />
                </span>
                <Reasons reasons={t.reasons} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
