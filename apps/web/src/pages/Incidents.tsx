import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AiopsSummary, IncidentRow, LiveEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, StatTile, TimeAgo } from '../components/common'
import { PriorityBadge, STRENGTH_ICON, StatusPill } from '../components/Priority'
import { useLiveEvents } from '../live/live'

const isIncident = (e: LiveEvent) => e.type === 'incident' || e.type === 'incident_ai'

export function Incidents() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('all')
  const list = useApi<IncidentRow[]>(`/api/v1/incidents?status=${status}&limit=200`, 15000)
  const summary = useApi<AiopsSummary>('/api/v1/aiops/summary', 15000)
  const reloadL = list.reload
  const reloadS = summary.reload
  const onEvent = useCallback(() => {
    reloadL()
    reloadS()
  }, [reloadL, reloadS])
  useLiveEvents(onEvent, isIncident)

  const s = summary.data
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Incident center</h1>
        <p className="muted">
          Alerts are detected by deterministic, explainable rules (robust baselines, trends, thresholds,
          local security findings) and grouped into incidents only by shared source, reported dependency
          or site, never by time alone. Explanations can be refined by an LLM that is grounded in this
          evidence.
        </p>
      </div>

      {s && (
        <div className="tiles">
          <StatTile label={<PriorityBadge p="P1" />} value={s.open_by_priority.P1} sub="open" />
          <StatTile label={<PriorityBadge p="P2" />} value={s.open_by_priority.P2} sub="open" />
          <StatTile label={<PriorityBadge p="P3" />} value={s.open_by_priority.P3} sub="open" />
          <StatTile label="Noise reduction" value={s.noise_reduction_ratio ? `${s.noise_reduction_ratio} : 1` : '-'}
            sub={`${s.alert_signals_total} alert signals -> ${s.incidents_total} incidents`} />
        </div>
      )}

      <div className="filters" role="group" aria-label="Filter incidents by status">
        {(['all', 'open', 'resolved'] as const).map((k) => (
          <button key={k} className={`btn ${status === k ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={status === k} onClick={() => setStatus(k)}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {list.error && !list.data && <ErrorNote error={list.error} onRetry={list.reload} />}
      {!list.data ? (
        <Loading label="Loading incidents" />
      ) : list.data.length === 0 ? (
        <Empty>No incidents. Healthy sources and one-window spikes never open incidents.</Empty>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table" aria-label="Incidents">
              <thead>
                <tr>
                  <th>Priority</th><th>Incident</th><th>Status</th><th className="num">Alerts</th>
                  <th>Evidence</th><th>Opened</th><th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((i) => (
                  <tr key={i.id}>
                    <td><PriorityBadge p={i.priority} /></td>
                    <td><Link to={`/incidents/${i.id}`}>{i.title}</Link></td>
                    <td><StatusPill status={i.status} acked={!!i.acked_at} /></td>
                    <td className="num">{i.alert_count}</td>
                    <td>
                      {i.evidence_strength && (
                        <span title="Evidence strength (rule-based, not a probability)">
                          <span aria-hidden="true">{STRENGTH_ICON[i.evidence_strength] ?? ''}</span> {i.evidence_strength}
                        </span>
                      )}
                    </td>
                    <td><TimeAgo iso={i.opened_at} /></td>
                    <td><TimeAgo iso={i.updated_at} /></td>
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
