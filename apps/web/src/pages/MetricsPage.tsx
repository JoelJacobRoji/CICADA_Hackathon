import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Empty, ErrorNote, Loading } from '../components/common'
import { MetricChart } from '../components/MetricChart'
import { StateBadge } from '../components/StateBadge'
import { fmtValue, kindLabel, metricLabel, shortId } from '../lib/format'
import { thresholdLines, useHealthEntities, useMetricSeries, useThresholds } from '../live/hooks'

/** Small multiples: one chart per source for the selected metric (shared y-scale per metric). */
export function MetricsPage({ title, intro, metrics }: { title: string; intro: string; metrics: string[] }) {
  const [metric, setMetric] = useState(metrics[0]!)
  const series = useMetricSeries(metric)
  const health = useHealthEntities('source')
  const thresholds = useThresholds()
  const stateOf = new Map((health.data ?? []).map((h) => [h.entity_id, h]))
  const pids = [...series.byPid.keys()].sort()

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{title}</h1>
        <p className="muted">{intro}</p>
      </div>
      <div className="filters" role="tablist" aria-label="Metric">
        {metrics.map((m) => (
          <button key={m} role="tab" aria-selected={m === metric}
            className={`btn ${m === metric ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric(m)}>
            {metricLabel(m)}
          </button>
        ))}
        <span className="muted small">Last 15 min · event time (UTC) · 2 s windows (mean)</span>
      </div>
      {series.error && <ErrorNote error={series.error} />}
      {series.loading && pids.length === 0 ? (
        <Loading />
      ) : pids.length === 0 ? (
        <Empty>No {metricLabel(metric).toLowerCase()} data in the last 15 minutes.</Empty>
      ) : (
        <div className="multiples">
          {pids.map((pid) => {
            const pts = series.byPid.get(pid)!
            const latest = pts.reduce((a, b) => (a.window_end > b.window_end ? a : b))
            const h = stateOf.get(pid)
            return (
              <Card key={pid} className="multiple" title={
                <Link to={`/sources/${pid}`}>{kindLabel(latest.source_kind)} {shortId(pid)}</Link>
              } actions={<StateBadge state={h?.state} size="sm" />}>
                <div className="latest">
                  {fmtValue(latest.unit === 'bool' ? latest.min : latest.mean, latest.unit)}
                  <span className="muted small"> latest</span>
                </div>
                <MetricChart points={pts} metric={metric} unit={latest.unit}
                  title={`${metricLabel(metric)} · ${shortId(pid)}`}
                  thresholds={thresholdLines(thresholds, metric)} />
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Infrastructure() {
  return (
    <MetricsPage title="Infrastructure health"
      intro="CPU, memory and disk per server. Dashed lines are the configured health thresholds."
      metrics={['cpu_usage', 'memory_usage', 'disk_usage']} />
  )
}

export function Network() {
  return (
    <MetricsPage title="Network intelligence"
      intro="Latency, packet loss, bandwidth and connectivity per network device and application."
      metrics={['latency_ms', 'packet_loss', 'bandwidth_mbps', 'connectivity', 'error_rate', 'service_up']} />
  )
}
