import { Link } from 'react-router-dom'
import type { SecurityEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, StatTile, TimeAgo } from '../components/common'
import { shortId, utc } from '../lib/format'

const RISK_ICON: Record<string, string> = { low: '●', medium: '▲', high: '✕' }

export function Security() {
  const q = useApi<SecurityEvent[]>('/api/v1/security-events?limit=200', 5000)
  if (q.error && !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />
  if (!q.data) return <Loading label="Loading security signals" />
  const high = q.data.filter((e) => e.risk_level === 'high').length
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Security signals</h1>
        <p className="muted">
          Detected <strong>locally</strong> by each collector. Only counts and codes leave the customer
          environment: no usernames, IP addresses or raw log lines are ever stored here.
        </p>
      </div>
      <div className="tiles">
        <StatTile label="Findings" value={q.data.length} sub="most recent 200" />
        <StatTile label="High risk" value={high} sub="source shown as Poor for 5 min" />
      </div>
      {q.data.length === 0 ? (
        <Empty>No security findings.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>When</th><th>Finding</th><th>Risk</th><th>Source</th>
                  <th className="num">Failed logins</th><th className="num">Accounts</th>
                  <th className="num">Origins</th><th>Window (UTC)</th></tr>
              </thead>
              <tbody>
                {q.data.map((e) => (
                  <tr key={e.payload_id}>
                    <td><TimeAgo iso={e.window_end} /></td>
                    <td><code>{e.summary_code}</code></td>
                    <td><span className={`risk risk-${e.risk_level}`}>
                      <span aria-hidden="true">{RISK_ICON[e.risk_level]}</span> {e.risk_level}</span></td>
                    <td><Link to={`/sources/${e.source_pid}`}>{shortId(e.source_pid)}</Link></td>
                    <td className="num">{e.failure_count}</td>
                    <td className="num">{e.distinct_user_count}</td>
                    <td className="num">{e.distinct_src_count}</td>
                    <td className="small">{utc(e.window_start)} → {utc(e.window_end).slice(11)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
