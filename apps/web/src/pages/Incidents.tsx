import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AiopsSummary, AlertRow, IncidentDetail, IncidentRow, LiveEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, StatTile, TimeAgo } from '../components/common'
import { PriorityBadge, STRENGTH_ICON, StatusPill } from '../components/Priority'
import { fmtValue, metricLabel, shortId } from '../lib/format'
import { useLiveEvents } from '../live/live'

const isIncident = (e: LiveEvent) => e.type === 'incident' || e.type === 'incident_ai'
type Filter = 'all' | 'open' | 'resolved'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
]

/** One-line evidence for a signal: what was observed against what it was compared with. */
export function signalLine(a: AlertRow): string {
  const e = a.evidence
  const unit = e.unit ?? ''
  if (a.family === 'BASELINE') return `${fmtValue(e.observed, unit)} vs median ${fmtValue(e.baseline_median, unit)} (z ${e.z})`
  if (a.family === 'THRESHOLD') return `${fmtValue(e.observed, unit)} beyond ${fmtValue(e.threshold, unit)}`
  if (a.family === 'TREND') return `rose ${fmtValue(e.rise_over_span, unit)} over ${e.span_windows} windows`
  if (a.family === 'SECURITY') return `${e.failure_count} failed logins, ${e.distinct_user_count} account(s)`
  return a.code
}

function Preview({ id }: { id: string }) {
  const q = useApi<IncidentDetail>(`/api/v1/incidents/${id}`, 15000)
  if (q.error && !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />
  if (!q.data || q.data.id !== id) return <Loading label="Loading incident" />
  const d = q.data
  const x = d.explanation
  const pc = x.probable_cause
  const affected = Array.from(new Set(d.alerts.map((a) => a.entity_id)))
  return (
    <div className="stack">
      <div>
        <div className="row">
          <PriorityBadge p={d.priority} />
          <StatusPill status={d.status} acked={!!d.acked_at} />
          <span className="muted small">opened <TimeAgo iso={d.opened_at} /> · v{d.version}</span>
        </div>
        <h2 className="preview-title">{d.title}</h2>
      </div>

      <div className="preview-grid">
        <div className="panel">
          <div className="eyebrow">Probable cause</div>
          <p className="big">
            {pc.entity ? (pc.entity.startsWith('src_') ? <Link to={`/sources/${pc.entity}`}>{shortId(pc.entity)}</Link> : pc.entity)
              : <span className="muted">undetermined</span>}
          </p>
          <p className="muted small">{pc.basis}</p>
        </div>
        <div className="panel">
          <div className="eyebrow">Evidence strength</div>
          <p className="big"><span aria-hidden="true">{STRENGTH_ICON[x.evidence_strength.level]}</span> {x.evidence_strength.level}</p>
          <p className="muted small">{x.evidence_strength.reasons[0] ?? ''} · rule-based, not a probability</p>
        </div>
      </div>

      <div>
        <div className="eyebrow">Blast radius · {affected.length} source{affected.length === 1 ? '' : 's'}</div>
        <div className="chips">
          {affected.map((e) => (
            <span key={e} className={`chip chip-entity${e === pc.entity ? ' chip-root' : ''}`}>
              {e === pc.entity && <span aria-hidden="true">◎ </span>}
              {e.startsWith('src_') ? shortId(e) : e}
              {e === pc.entity && <span className="sr-only"> (probable cause)</span>}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow">Correlated signals · {d.alerts.length}</div>
        <ul className="signals">
          {d.alerts.slice(0, 6).map((a) => (
            <li key={a.id}>
              <span className="mono small">{shortId(a.entity_id)}</span>
              <span>{a.metric in { heartbeat: 1, data: 1, security: 1 } ? a.code : metricLabel(a.metric)}</span>
              <span className="muted small">{signalLine(a)}</span>
              <span className="muted small num" title="occurrences (repeats deduplicated)">×{a.occurrences}</span>
            </li>
          ))}
        </ul>
        {d.alerts.length > 6 && <p className="muted small">+ {d.alerts.length - 6} more in the full investigation</p>}
      </div>

      <p><Link className="btn btn-primary" to={`/incidents/${d.id}`}>Full investigation →</Link></p>
    </div>
  )
}

export function Incidents() {
  const [status, setStatus] = useState<Filter>('all')
  const [picked, setPicked] = useState<string | null>(null)
  const list = useApi<IncidentRow[]>('/api/v1/incidents?status=all&limit=200', 15000)
  const summary = useApi<AiopsSummary>('/api/v1/aiops/summary', 15000)
  const reloadL = list.reload
  const reloadS = summary.reload
  const onEvent = useCallback(() => {
    reloadL()
    reloadS()
  }, [reloadL, reloadS])
  useLiveEvents(onEvent, isIncident)

  const all = list.data ?? []
  const counts = { all: all.length, open: all.filter((i) => i.status === 'open').length,
    resolved: all.filter((i) => i.status === 'resolved').length }
  const rows = status === 'all' ? all : all.filter((i) => i.status === status)
  const selected = rows.find((i) => i.id === picked)?.id ?? rows[0]?.id ?? null
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

      {list.error && !list.data && <ErrorNote error={list.error} onRetry={list.reload} />}
      {!list.data ? (
        <Loading label="Loading incidents" />
      ) : (
        <div className="split">
          <Card className="split-list">
            <div className="filters tabs" role="group" aria-label="Filter incidents by status">
              {FILTERS.map((f) => (
                <button key={f.key} className={`tab${status === f.key ? ' tab-active' : ''}`}
                  aria-pressed={status === f.key} aria-label={f.label} title={`${counts[f.key]} incident(s)`}
                  onClick={() => setStatus(f.key)}>
                  {f.label} <span className="tab-count" aria-hidden="true">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <Empty>No incidents. Healthy sources and one-window spikes never open incidents.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table queue" aria-label="Incidents">
                  <thead>
                    <tr><th>Priority</th><th>Incident</th><th>Status</th><th className="num">Alerts</th><th>Evidence</th><th>Updated</th><th><span className="sr-only">Preview</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => (
                      <tr key={i.id} className={i.id === selected ? 'row-selected' : undefined}
                        onClick={() => setPicked(i.id)}>
                        <td><PriorityBadge p={i.priority} /></td>
                        <td><Link to={`/incidents/${i.id}`} onClick={(e) => e.stopPropagation()}>{i.title}</Link></td>
                        <td><StatusPill status={i.status} acked={!!i.acked_at} /></td>
                        <td className="num">{i.alert_count}</td>
                        <td>
                          {i.evidence_strength && (
                            <span title="Evidence strength (rule-based, not a probability)">
                              <span aria-hidden="true">{STRENGTH_ICON[i.evidence_strength] ?? ''}</span> {i.evidence_strength}
                            </span>
                          )}
                        </td>
                        <td><TimeAgo iso={i.updated_at} /></td>
                        <td>
                          <button className="btn btn-ghost btn-pill btn-sm" aria-pressed={i.id === selected}
                            onClick={(e) => { e.stopPropagation(); setPicked(i.id) }}>
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card className="split-detail">
            {selected ? <Preview id={selected} /> : <Empty>Select an incident to see its summary.</Empty>}
          </Card>
        </div>
      )}
    </div>
  )
}
