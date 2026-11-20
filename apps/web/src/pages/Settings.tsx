import { Card, Loading } from '../components/common'
import { StateBadge } from '../components/StateBadge'
import { metricLabel } from '../lib/format'
import { useThresholds } from '../live/hooks'

export function Settings() {
  const t = useThresholds()
  if (!t) return <Loading label="Loading thresholds" />
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Health thresholds</h1>
        <p className="muted">
          Read-only view of <code>{t.source}</code>, shared by collectors and the SaaS. A value strictly
          above a threshold moves the metric to that state; a source takes the worst state of its metrics.
        </p>
      </div>
      <Card title="Metric thresholds (window mean)">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Metric</th>
              <th className="num"><StateBadge state="Good" size="sm" /> above</th>
              <th className="num"><StateBadge state="Fair" size="sm" /> above</th>
              <th className="num"><StateBadge state="Poor" size="sm" /> above</th></tr></thead>
            <tbody>
              {Object.entries(t.numeric).map(([m, v]) => (
                <tr key={m}><td>{metricLabel(m)}</td><td className="num">{v.good}</td>
                  <td className="num">{v.fair}</td><td className="num">{v.poor}</td></tr>
              ))}
              {Object.keys(t.binary).map((m) => (
                <tr key={m}><td>{metricLabel(m)}</td><td colSpan={3}>Down in any sample → <StateBadge state="Poor" size="sm" /> immediately</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Stability rules">
        <ul className="rules">
          <li>Degrade only after the worse reading holds for <strong>2 consecutive windows</strong> (one spike is ignored). Service down or connectivity lost degrades <strong>immediately</strong>.</li>
          <li>Recover <strong>one level at a time</strong>, after <strong>5 consecutive better windows</strong>.</li>
          <li>No new data for more than <strong>{t.staleness.fair_after_seconds} s</strong> → at least <StateBadge state="Fair" size="sm" />; more than <strong>{t.staleness.poor_after_seconds} s</strong> → <StateBadge state="Poor" size="sm" />. The last value is never shown as current.</li>
          <li>Collector with no heartbeat for more than <strong>30 s</strong> → <StateBadge state="Poor" size="sm" /> (offline).</li>
          <li>High-risk security finding → source <StateBadge state="Poor" size="sm" /> for 5 minutes; medium → <StateBadge state="Fair" size="sm" />.</li>
          <li>Late or out-of-order windows are stored at their event time but never change the current state.</li>
        </ul>
      </Card>
    </div>
  )
}
