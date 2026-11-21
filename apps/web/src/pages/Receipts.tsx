import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PayloadReceipt, ReceiptsPage } from '../api/types'
import { useApi } from '../api/useApi'
import { Card, Empty, ErrorNote, Loading, TimeAgo } from '../components/common'
import { metricLabel, shortId, utc } from '../lib/format'

const KIND: Record<string, string> = {
  metric_summary: 'Metric summary',
  security_summary: 'Security counts',
  topology_edge: 'Dependency edge',
}

function Src({ id }: { id: string | null }) {
  if (!id) return <span className="muted">—</span>
  return id.startsWith('src_') ? <Link to={`/sources/${id}`}>{shortId(id)}</Link> : <span>{id}</span>
}

function detailText(p: PayloadReceipt) {
  if (p.kind === 'metric_summary') return metricLabel(p.detail ?? '')
  if (p.kind === 'topology_edge') return <>depends on <Src id={p.detail} /></>
  return p.detail ?? ''
}

function Hash({ sha }: { sha: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!sha) return <span className="muted">—</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the full hash is in the tooltip */
    }
  }
  return (
    <span className="hash">
      <code title={sha}>{sha.slice(0, 16)}…</code>
      <button type="button" className="btn btn-ghost btn-pill btn-sm" onClick={() => void copy()}
        aria-label={`Copy SHA-256 ${sha.slice(0, 8)}`}>{copied ? 'Copied' : 'Copy'}</button>
    </span>
  )
}

function Lookup() {
  const [id, setId] = useState('')
  const [res, setRes] = useState<Record<string, unknown> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setRes(null)
    const v = id.trim()
    if (!/^[0-9a-f-]{36}$/i.test(v)) {
      setErr('Enter a payload ID (UUID), e.g. from Privacy Glass on the collector.')
      return
    }
    try {
      setRes(await api<Record<string, unknown>>(`/api/v1/receipts/${v}`))
    } catch (x) {
      setErr((x as Error).message.includes('404') ? 'No receipt for that ID in your tenant.' : (x as Error).message)
    }
  }
  return (
    <form className="lookup" onSubmit={(e) => void submit(e)}>
      <label htmlFor="pid" className="sr-only">Payload ID</label>
      <input id="pid" value={id} onChange={(e) => setId(e.target.value)} placeholder="payload ID (UUID)"
        autoComplete="off" spellCheck={false} />
      <button className="btn btn-primary" type="submit">Look up receipt</button>
      {err && <span role="alert" className="risk-high small">{err}</span>}
      {res && (
        <div className="lookup-result">
          <span>{KIND[String(res.kind)] ?? String(res.kind)}</span>
          <span className="muted">received {utc(String(res.received_at))}</span>
          <Hash sha={String(res.payload_sha256 ?? '')} />
        </div>
      )}
    </form>
  )
}

export function Receipts() {
  const q = useApi<ReceiptsPage>('/api/v1/receipts?limit=50&batches=20', 20000)
  if (q.error && !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />
  if (!q.data) return <Loading label="Loading receipts" />
  const { payloads, batches } = q.data
  const sum = (k: 'accepted' | 'duplicate' | 'rejected') => batches.reduce((a, b) => a + (b[k] ?? 0), 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Egress receipts</h1>
        <p className="muted">
          Every payload a collector sends is stored with the SHA-256 the cloud computed from the bytes it
          received. The collector keeps the same hash in its tamper-evident ledger, so the two can be
          compared for any payload (Privacy Glass on the collector shows both side by side).
        </p>
      </div>

      <section className="kpis" aria-label="Recent ingest">
        <div className="kpi"><div>
          <div className="kpi-label">Latest payload receipts</div>
          <div className="kpi-value">{payloads.length}</div>
          <div className="kpi-sub">newest first, each with its SHA-256</div>
        </div></div>
        <div className="kpi"><div>
          <div className="kpi-label">Accepted in last {batches.length} batches</div>
          <div className="kpi-value">{sum('accepted')}</div>
          <div className="kpi-sub">stored exactly once</div>
        </div></div>
        <div className="kpi"><div>
          <div className="kpi-label">Duplicates acknowledged</div>
          <div className="kpi-value">{sum('duplicate')}</div>
          <div className="kpi-sub">re-sent after a retry; not stored twice</div>
        </div></div>
        <div className={`kpi${sum('rejected') ? ' kpi-alert' : ''}`}><div>
          <div className="kpi-label">Rejected by the contract</div>
          <div className="kpi-value">{sum('rejected')}</div>
          <div className="kpi-sub">fields outside the allow-list are refused</div>
        </div></div>
      </section>

      <Card title="Find the receipt for a payload">
        <Lookup />
      </Card>

      <Card title="Payload receipts" actions={<span className="muted small">times in UTC</span>}>
        {payloads.length === 0 ? <Empty>No payloads received yet.</Empty> : (
          <div className="table-wrap">
            <table className="table" aria-label="Payload receipts">
              <thead>
                <tr><th>Received</th><th>Kind</th><th>Source</th><th>Content</th><th>Collector</th>
                  <th>Payload ID</th><th>SHA-256 on arrival</th></tr>
              </thead>
              <tbody>
                {payloads.map((p) => (
                  <tr key={p.payload_id}>
                    <td title={utc(p.received_at)}><TimeAgo iso={p.received_at} />{p.late && <span className="chip">late</span>}</td>
                    <td>{KIND[p.kind] ?? p.kind}</td>
                    <td><Src id={p.source_pid} /></td>
                    <td>{detailText(p)}</td>
                    <td><code>{p.collector_id}</code></td>
                    <td><code title={p.payload_id}>{p.payload_id.slice(0, 8)}…</code></td>
                    <td><Hash sha={p.payload_sha256} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Ingest batches" actions={<span className="muted small">one row per HTTPS request from a collector</span>}>
        {batches.length === 0 ? <Empty>No batches yet.</Empty> : (
          <div className="table-wrap">
            <table className="table" aria-label="Ingest batches">
              <thead>
                <tr><th>Received</th><th>Collector</th><th className="num">Accepted</th><th className="num">Duplicate</th>
                  <th className="num">Rejected</th><th>Body SHA-256</th></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id}>
                    <td title={utc(b.received_at)}><TimeAgo iso={b.received_at} /></td>
                    <td><code>{b.collector_id}</code></td>
                    <td className="num">{b.accepted}</td>
                    <td className="num">{b.duplicate}</td>
                    <td className="num">{b.rejected}</td>
                    <td><Hash sha={b.body_sha256} /></td>
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
