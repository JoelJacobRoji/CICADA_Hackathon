import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { AiExplanation, AlertRow, IncidentDetail as Detail, LiveEvent } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, TimeAgo } from '../components/common'
import { PriorityBadge, STRENGTH_ICON, StatusPill } from '../components/Priority'
import { fmtValue, kindLabel, metricLabel, shortId, utc } from '../lib/format'
import { useLiveEvents } from '../live/live'

const FAMILY: Record<string, string> = {
  BASELINE: 'Baseline deviation',
  TREND: 'Rising trend',
  THRESHOLD: 'Static threshold',
  SECURITY: 'Security finding',
  OFFLINE: 'Collector offline',
  NO_DATA: 'Missing data',
}
const COMPONENT: Record<string, string> = {
  severity_weight: 'Severity',
  affected_entities_x2: 'Affected sources x2',
  persistence_minutes: 'Persistence (min)',
  security_flag_x3: 'Security flag x3',
  recurrence: 'Recurrence',
}

function entityLink(id: string | null | undefined, kind?: string | null) {
  if (!id) return <span className="muted">undetermined</span>
  if (!id.startsWith('src_')) return <span>{id}</span>
  return <Link to={`/sources/${id}`}>{kind ? `${kindLabel(kind)} ` : ''}{shortId(id)}</Link>
}

function evidenceText(a: AlertRow): string {
  const e = a.evidence
  const unit = e.unit ?? ''
  switch (a.family) {
    case 'BASELINE':
      return `${fmtValue(e.observed, unit)} vs baseline median ${fmtValue(e.baseline_median, unit)} ` +
        `(robust z ${e.z}, threshold ${e.z_threshold}; ${e.history_n} windows of history)`
    case 'TREND':
      return `rose ${fmtValue(e.rise_over_span, unit)} over the last ${e.span_windows} windows; now ${fmtValue(e.observed, unit)}`
    case 'THRESHOLD':
      return `${fmtValue(e.observed, unit)} beyond the ${String(e.state ?? '').toLowerCase()} threshold ${fmtValue(e.threshold, unit)} for ${e.windows} window(s)`
    case 'SECURITY':
      return `${e.failure_count} failed logins, ${e.distinct_user_count} account(s), ${e.distinct_src_count} origin(s)`
    case 'OFFLINE':
      return `no heartbeat for ${String(e.seconds_since_heartbeat ?? '?')} s`
    default:
      return String(e.detection ?? '')
  }
}

function AiPanel({ ai }: { ai: AiExplanation | null }) {
  const [showPrompt, setShowPrompt] = useState(false)
  if (!ai) return <p className="muted" role="status">Generating explanation…</p>
  if (ai.status === 'disabled_by_policy' || ai.status === 'disabled') {
    return (
      <p className="muted">
        LLM explanation off for this tenant: {ai.grounding.note ?? 'disabled'}. The deterministic
        explanation below is complete on its own.
      </p>
    )
  }
  if (ai.status === 'blocked_by_canary') {
    return <p className="muted">Not sent: the privacy canary matched ({ai.grounding.canary?.join(', ')}). Deterministic explanation shown.</p>
  }
  if (ai.status === 'error') {
    return <p className="muted">LLM unavailable ({ai.grounding.error}). Deterministic explanation shown.</p>
  }
  if (ai.status === 'rejected_ungrounded' || !ai.response) {
    return (
      <div>
        <p className="muted">
          The LLM answer was <strong>rejected</strong> because it mentioned facts that are not in the
          evidence, so it is not shown:
        </p>
        <ul className="reasons">{(ai.grounding.violations ?? []).map((v) => <li key={v}>{v}</li>)}</ul>
      </div>
    )
  }
  const r = ai.response
  return (
    <div className="ai">
      <p className="ai-summary">{r.summary}</p>
      <div className="grid-2">
        <div>
          <h3 className="h3">Reasoning</h3>
          <ol className="steps">{r.reasoning.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
        <div>
          <h3 className="h3">Verify next</h3>
          <ul className="steps">{r.verify_next.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {r.caveats.length > 0 && (
            <>
              <h3 className="h3">Caveats</h3>
              <ul className="steps">{r.caveats.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
        </div>
      </div>
      <p className="muted small">
        <span aria-hidden="true">✓</span> Grounding check passed: every ID, number, date, time and code
        in this text exists in the evidence. Model {ai.model} · {ai.latency_ms} ms · incident v{ai.incident_version}.
        Input was pseudonymous metadata only.
      </p>
      <button className="btn btn-ghost" aria-expanded={showPrompt} onClick={() => setShowPrompt((v) => !v)}>
        {showPrompt ? 'Hide' : 'Show'} the exact prompt sent
      </button>
      {showPrompt && <pre className="prompt">{ai.prompt.user}</pre>}
    </div>
  )
}

const isMine = (e: LiveEvent) => e.type === 'incident' || e.type === 'incident_ai'

export function IncidentDetail() {
  const { id } = useParams()
  const q = useApi<Detail>(`/api/v1/incidents/${id}`, 10000)
  const [ackErr, setAckErr] = useState<string | null>(null)
  const reload = q.reload
  const onEvent = useCallback(
    (e: LiveEvent) => {
      if ((e.type === 'incident' || e.type === 'incident_ai') && e.incident_id === id) reload()
    },
    [id, reload],
  )
  useLiveEvents(onEvent, isMine)

  if (q.error && !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />
  if (!q.data) return <Loading label="Loading incident" />
  const d = q.data
  const x = d.explanation
  const pc = x.probable_cause
  const alertCode = Object.fromEntries(d.alerts.map((a) => [a.id, `${shortId(a.entity_id)} ${a.code}`]))

  const ack = async () => {
    setAckErr(null)
    try {
      await api(`/api/v1/incidents/${d.id}/ack`, { method: 'POST' })
      reload()
    } catch (e) {
      setAckErr((e as Error).message)
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <p className="muted small"><Link to="/incidents">Incident center</Link> / incident v{d.version}</p>
        <h1 className="incident-title"><PriorityBadge p={d.priority} /> {d.title}</h1>
        <div className="row">
          <StatusPill status={d.status} acked={!!d.acked_at} />
          <span className="muted">opened <TimeAgo iso={d.opened_at} /> · updated <TimeAgo iso={d.updated_at} /></span>
          {d.acked_at ? (
            <span className="muted">acknowledged <TimeAgo iso={d.acked_at} /></span>
          ) : (
            d.status === 'open' && <button className="btn btn-primary" onClick={() => void ack()}>Acknowledge</button>
          )}
          {ackErr && <span role="alert" className="risk-high">{ackErr}</span>}
        </div>
      </div>

      <div className="grid-3">
        <Card title="Probable cause">
          <p className="big">{entityLink(pc.entity, pc.entity_kind)}</p>
          <p className="muted">{pc.status === 'determined' ? pc.basis : `Undetermined: ${pc.basis}`}</p>
        </Card>
        <Card title="Evidence strength">
          <p className="big"><span aria-hidden="true">{STRENGTH_ICON[x.evidence_strength.level]}</span> {x.evidence_strength.level}</p>
          <ul className="muted small plain">{x.evidence_strength.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Card>
        <Card title={`Priority ${x.priority.label} · score ${x.priority.score}`}>
          <table className="table compact" aria-label="Priority score components">
            <tbody>
              {Object.entries(x.priority.components).map(([k, v]) => (
                <tr key={k}><td>{COMPONENT[k] ?? k}</td><td className="num">{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{x.priority.note}</p>
        </Card>
      </div>

      <Card title={<>AI explanation <span className="chip">LLM, grounded</span></>}>
        <AiPanel ai={d.ai} />
      </Card>

      <Card title="Recommended actions" actions={<span className="muted small">deterministic playbook; nothing is executed automatically</span>}>
        {x.recommendations.length === 0 ? (
          <Empty>No playbook entry for these signals.</Empty>
        ) : (
          <ol className="recs">
            {x.recommendations.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong>
                <ul className="steps">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                <p className="muted small">Why: {r.rationale}</p>
                <p className="muted small">Evidence: {r.evidence.map((e) => alertCode[e] ?? e).join(', ')}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title={`Signals (${d.alerts.length})`} actions={<span className="muted small">onset in UTC, earliest first</span>}>
        <div className="table-wrap">
          <table className="table" aria-label="Alerts in this incident">
            <thead>
              <tr><th>Onset</th><th>Source</th><th>Signal</th><th>Detection</th><th>Evidence</th>
                <th className="num">Seen</th><th>Status</th></tr>
            </thead>
            <tbody>
              {d.alerts.map((a) => (
                <tr key={a.id}>
                  <td>{utc(a.onset).slice(11, 19)}</td>
                  <td>{entityLink(a.entity_id)}</td>
                  <td>{a.metric in { heartbeat: 1, data: 1, security: 1 } ? a.code : `${metricLabel(a.metric)} · ${a.code}`}</td>
                  <td>{FAMILY[a.family] ?? a.family}</td>
                  <td className="small">{evidenceText(a)}</td>
                  <td className="num" title="occurrences (repeats are deduplicated into this alert)">{a.occurrences}</td>
                  <td>{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <Card title="How the signals were grouped">
          <ol className="timeline plain">
            {x.correlation.map((c, i) => (
              <li key={i}><span className="reason-code">{c.rule}</span> <span>{c.detail}</span></li>
            ))}
          </ol>
          <p className="muted small">
            C-SRC same source · C-TOPO reported dependency path · C-SITE several network alerts from one
            collector · NEW opened a new incident. Methods used: {x.detection_methods.join(', ')}.
          </p>
        </Card>
        <Card title="Uncertainty">
          {x.uncertainty.length === 0 ? <Empty>No open uncertainties recorded.</Empty> : (
            <ul className="reasons">{x.uncertainty.map((u) => <li key={u}>{u}</li>)}</ul>
          )}
        </Card>
      </div>

      <Card title="Device alerts" actions={<span className="muted small">pulled by the collector over its outbound connection; names re-identified locally</span>}>
        {d.notifications.length === 0 ? <Empty>No device notifications yet.</Empty> : (
          <div className="table-wrap">
            <table className="table" aria-label="Device notifications">
              <thead><tr><th>Collector</th><th>Kind</th><th className="num">Version</th><th>Created</th><th>Delivered</th><th>Acked by collector</th></tr></thead>
              <tbody>
                {d.notifications.map((n, i) => (
                  <tr key={i}>
                    <td>{n.collector_id}</td>
                    <td>{n.kind === 'ai_explanation' ? 'AI explanation' : 'Incident'}</td>
                    <td className="num">v{n.incident_version}</td>
                    <td><TimeAgo iso={n.created_at} /></td>
                    <td>{n.delivered_at ? <TimeAgo iso={n.delivered_at} /> : <span className="muted">pending</span>}</td>
                    <td>{n.acked_at ? <TimeAgo iso={n.acked_at} /> : <span className="muted">no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
