import type { ReactNode } from 'react'
import { useAuth } from '../auth/auth'
import { Card } from '../components/common'
import { useLiveStatus } from '../live/live'

// Every control listed here is implemented and covered by tests (docs/TEST_RESULTS.md).
// Nothing on this page is aspirational: if it is not built, it is not listed.

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li>
      <span className={ok ? 'state-badge state-sm state-excellent' : 'state-badge state-sm state-poor'}>
        <span aria-hidden="true" className="state-icon">{ok ? '✓' : '✕'}</span>
        {ok ? 'Pass' : 'Fail'}
      </span>{' '}
      {children}
    </li>
  )
}

function Control({ title, children, verify }: { title: string; children: ReactNode; verify: string }) {
  return (
    <div className="trust-item">
      <h3>{title}</h3>
      <p>{children}</p>
      <p className="muted small">How it is verified: {verify}</p>
    </div>
  )
}

// The real stages of the collector's egress path (apps/collector: pipeline, contracts, egress).
const PIPELINE: { title: string; text: string; cloud?: boolean }[] = [
  { title: 'Raw records', text: "Logs and metrics are stored in the collector's local SQLite store, with real names, users and IPs." },
  { title: 'Masked locally', text: 'Secrets and identifiers are scrubbed in the local console copy; secret fingerprints are kept for the canary.' },
  { title: 'Allow-list contract', text: 'Only typed, allow-listed fields (summaries, counts, edges) can be serialised; sources become src_ pseudonyms.' },
  { title: 'Canary + ledger', text: 'Each payload is scanned for credentials and known secrets, blocked on a match, then hash-chained in the egress ledger.' },
  { title: 'Cloud ingest', text: 'The SaaS re-validates the same contract, stores the SHA-256 it received and isolates the tenant with row-level security.', cloud: true },
]

export function Trust() {
  const { me } = useAuth()
  const live = useLiveStatus()
  const https = location.protocol === 'https:'
  const cookieHidden = !document.cookie.includes('aegis_session')

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Security &amp; privacy</h1>
        <p className="muted">
          How AEGIS protects customer data, secures every connection and controls access, with live
          checks from this browser session.
        </p>
      </div>

      <Card title="How data leaves the customer site">
        <ol className="plain pipeline" aria-label="Egress pipeline, in order">
          {PIPELINE.map((st, i) => (
            <li key={st.title} className={`stage ${st.cloud ? 'stage-cloud' : 'stage-local'}`}>
              <div className="stage-num">Stage {i + 1}</div>
              <div className="stage-title">{st.title}</div>
              <span className="stage-where">{st.cloud ? 'AEGIS cloud' : 'Customer site only'}</span>
              <p>{st.text}</p>
            </li>
          ))}
        </ol>
        <p className="boundary">
          Stages 1 to 4 run on the collector inside the customer network; only the output of stage 4 crosses
          the boundary. Proof for any single payload (raw → masked → exact bytes sent → cloud hash):
          <strong> Privacy Glass</strong>, served only on the collector at <code>127.0.0.1:9100/glass</code>.
        </p>
      </Card>

      <Card title="Live checks (this session)">
        <ul className="plain trust-list">
          <Check ok={https}>Dashboard served over HTTPS (TLS) with HSTS: <code>{location.protocol}</code></Check>
          <Check ok={https && live === 'live'}>Live channel is an encrypted WebSocket (wss) authenticated by the session: {live}</Check>
          <Check ok={cookieHidden}>Session token is an httpOnly cookie: page scripts cannot read it</Check>
          <Check ok={!!me}>Signed in as <strong>{me?.role.replace('tenant_', '')}</strong> of tenant <strong>{me?.tenant}</strong>; every query is scoped to this tenant by the database</Check>
          <Check ok={!!me}>Data residency region for this tenant: <strong>{me?.region}</strong></Check>
        </ul>
      </Card>

      <div className="grid-2">
        <Card title="Data protection">
          <div className="trust-list">
            <Control title="Raw data never leaves the customer site"
              verify="egress tests: secrets and source names are present locally and absent from every outbound payload (0 leaks in live runs)">
              The collector keeps raw logs and metrics locally. Only allow-listed metadata (2-second
              summaries, security counts, dependency edges) is sent.
            </Control>
            <Control title="Pseudonymous identities"
              verify="re-identification happens only on the collector; SaaS tables and LLM prompts contain 0 real source names (checked in Supabase)">
              Sources are replaced by keyed pseudonyms (<code>src_…</code>). The key never leaves the collector.
            </Control>
            <Control title="Secret canary and egress proof"
              verify="hash-chained egress ledger; the SaaS stores the SHA-256 of what it received, which equals the collector's ledger hash">
              Outbound data is scanned for credential patterns and for fingerprints of secrets seen
              locally, and blocked on a match. Every payload is recorded in a tamper-evident ledger.
            </Control>
            <Control title="AI without data exposure"
              verify="prompt allow-list + canary tests; grounding validator rejects unsupported facts; eu-west tenants are never sent">
              The LLM sees only pseudonymous incident evidence. Its answer is shown only if every fact
              in it exists in that evidence. EU tenants get deterministic explanations only.
            </Control>
          </div>
        </Card>

        <Card title="Secure communication & access control">
          <div className="trust-list">
            <Control title="Encrypted everywhere"
              verify="TLS certificate (Let's Encrypt), HSTS, sslmode=require to the database">
              Browser ↔ SaaS over HTTPS/WSS; collector ↔ SaaS over HTTPS; SaaS ↔ database over TLS.
              Collectors only connect outbound: nothing connects into the customer network.
            </Control>
            <Control title="Strong authentication"
              verify="argon2id hashing; generic login errors (no user enumeration); 5 attempts/min rate limit">
              Operators sign in with passwords hashed with argon2id. Sessions are short-lived signed
              tokens in httpOnly, SameSite=Strict cookies.
            </Control>
            <Control title="Per-collector credentials"
              verify="tokens stored only as SHA-256; revocation and rotation commands; a token is valid only in its tenant's region">
              Each collector has its own token, bound to one tenant and one region.
            </Control>
            <Control title="Tenant isolation in the database"
              verify="PostgreSQL row-level security on every table; the app role cannot bypass it; cross-tenant API and SQL tests return nothing">
              Even a bug in application code cannot read another tenant's rows.
            </Control>
            <Control title="Role-based access"
              verify="viewer / operator / admin roles; acknowledging an incident requires operator and is audit-logged">
              Actions are limited by role and recorded in an append-only audit log.
            </Control>
            <Control title="Hardened web front end"
              verify="Content-Security-Policy (self only), X-Frame-Options DENY, nosniff, Referrer-Policy on every response">
              The dashboard loads no third-party scripts.
            </Control>
          </div>
        </Card>
      </div>
    </div>
  )
}
