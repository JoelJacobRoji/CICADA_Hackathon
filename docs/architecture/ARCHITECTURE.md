# AEGIS — Architecture

## 1. Trust boundary and components

```mermaid
flowchart LR
  subgraph T1["TIER 1 - Customer environment (team laptop)"]
    direction TB
    SIM["Dev simulator / JSONL replay<br/>(SIMULATED)"]
    AG["System agent<br/>psutil + ping probe"]
    API1["HTTP ingest<br/>POST /api/v1/telemetry"]
    subgraph COL["AEGIS Collector :9100"]
      N["Normalise + validate"]
      R["Scrub + redact"]
      A["Aggregate 2s windows"]
      D["Local detectors<br/>auth bursts, thresholds, MAD"]
      P["Policy + allow-list<br/>Pydantic extra=forbid"]
      E["Egress ledger<br/>SHA-256 per payload"]
      O["Outbox<br/>SQLite WAL"]
      S["Sender<br/>retry, backoff, jitter"]
    end
    RAW[("collector.db<br/>raw_events, pseudonym map")]
    LC["Collector console<br/>localhost only"]
  end

  subgraph T2["TIER 2 - Central SaaS (VPS, Docker Compose)"]
    direction TB
    CAD["Caddy :443<br/>TLS termination"]
    ING["Ingest API<br/>token auth, revalidate, dedup"]
    AIO["AIOps engine<br/>health, anomaly, correlation"]
    WS["WebSocket hub<br/>tenant-scoped"]
    UI["Operator API + web app"]
    PGA[("Postgres db aegis_ap_south<br/>RLS")]
    PGE[("Postgres db aegis_eu_west<br/>RLS")]
  end

  SIM --> API1
  API1 --> N
  AG --> N
  N --> R --> A --> D --> P --> E --> O --> S
  N -.raw.-> RAW
  LC -.reads.-> RAW
  LC -.reads.-> E
  S == "HTTPS + Bearer token<br/>metadata only" ==> CAD
  CAD --> ING
  ING --> PGA
  ING --> PGE
  ING --> AIO
  AIO --> WS
  WS --> UI
```

**The boundary is the arrow `S ⇒ CAD`.** It is the only path out of Tier 1 and accepts only `IngestBatch` JSON. The SaaS exposes no endpoint that accepts raw records, and no SaaS component can read `collector.db`.

## 2. Network diagram (every hop labelled)

```mermaid
flowchart LR
  B["Operator browser<br/>laptop"]
  C["Collector :9100<br/>127.0.0.1 only, laptop"]
  HS["Mobile hotspot<br/>NAT, public internet"]
  V["VPS 162.35.42.114 :443 US<br/>nginx, Let's Encrypt"]
  API["saas-api :9001<br/>127.0.0.1 only, systemd"]
  SA["Supabase ap-south<br/>Mumbai, session pooler"]
  SE["Supabase eu-west<br/>Frankfurt, session pooler"]

  C -- "H1: HTTPS TLS1.3, Bearer collector token, JSON batch" --> HS
  HS -- "H2: TCP 443" --> V
  V -- "H3: HTTP loopback" --> API
  API -- "H4a: TLS sslmode=require, aegis_app role, RLS" --> SA
  API -- "H4b: TLS sslmode=require, aegis_app role, RLS" --> SE
  B -- "H5: HTTPS + WSS, httpOnly session cookie" --> V
  B -- "H6: HTTP localhost, local admin token" --> C
```

| Hop | From → To | Protocol | Auth | Data | Measured (2026-11-20) |
|---|---|---|---|---|---|
| H1/H2 | Collector → VPS nginx | HTTPS, TLS 1.3 (LE cert) | per-collector bearer token (SHA-256 stored server-side) | allow-listed metadata batches, heartbeats | ~279 ms RTT over hotspot |
| H3 | nginx → saas-api | HTTP on loopback | none (not exposed; :9001 unreachable externally) | same | — |
| H4a/b | saas-api → Supabase (regional) | Postgres over TLS via session pooler | `aegis_app` (no BYPASSRLS), RLS per tenant | tenant-scoped rows, region-pinned | 242 ms (Mumbai) / 89 ms (Frankfurt) per round trip |
| H5 | Browser → SaaS | HTTPS + WSS | operator JWT in httpOnly Secure SameSite=Strict cookie | tenant metadata | — |
| H6 | Browser → Collector | HTTP loopback only | local admin token | raw + masked records, ledger (Privacy Glass left pane) | — |

**Deployed (Phase 4b):** `https://aegis.162-35-42-114.sslip.io`. See `docs/runbooks/VPS_DEPLOY.md`.
**Fallback topology (venue network failure):** run the SaaS on the laptop (`scripts/dev.ps1 -NoDb`, still Supabase) or fully local (Docker Postgres). Documented as a weaker trust boundary (same host).
**Known limitation (K22):** one SaaS node in the US serves both regional databases. Production regional ingest nodes would sit next to each regional DB.

## 3. Data flow

```mermaid
flowchart TB
  s1["1 Telemetry source"] --> s2["2 Collect via adapter"]
  s2 --> s3["3 Normalise + validate, UTC"]
  s3 --> s3b["3b Persist raw locally"]
  s3 --> s4["4 Scrub secrets, drop message and attributes"]
  s4 --> s5["5 Aggregate 2s window per source and metric"]
  s5 --> s6["6 Local analysis: thresholds, MAD, auth bursts"]
  s6 --> s7["7 Pseudonymise source_id to source_pid"]
  s7 --> s8["8 Build allow-listed model, canary scan"]
  s8 --> s9["9 Egress ledger: exact JSON + SHA-256"]
  s9 --> s10["10 Outbox insert, same transaction"]
  s10 --> s11["11 Batch send over HTTPS with token"]
  s11 --> s12["12 SaaS: auth, bind tenant, region check"]
  s12 --> s13["13 Revalidate schema, size limit"]
  s13 --> s14["14 Insert ON CONFLICT payload_id DO NOTHING"]
  s14 --> s15["15 Health + anomaly + correlation"]
  s15 --> s16["16 Incident upsert + recommendation"]
  s16 --> s17["17 WebSocket push to tenant subscribers"]
  s17 --> s18["18 Dashboard render, latency probe"]
```

## 4. Sequence: normal operation

```mermaid
sequenceDiagram
  autonumber
  participant Src as Source / Simulator
  participant Col as Collector
  participant OB as Outbox SQLite
  participant API as SaaS Ingest
  participant DB as Postgres RLS
  participant AI as AIOps
  participant UI as Dashboard
  Src->>Col: POST /api/v1/telemetry raw events
  Col->>Col: validate, store raw, scrub, aggregate
  Col->>OB: one transaction - ledger row and outbox row
  Col->>API: POST /api/v1/ingest/ap-south batch, Bearer token
  API->>API: verify token, bind tenant, revalidate
  API->>DB: INSERT ON CONFLICT DO NOTHING
  API-->>Col: 200 accepted / duplicate / rejected
  Col->>OB: mark delivered
  API->>AI: new summaries
  AI->>DB: health transitions, alerts, incidents
  AI-->>UI: WebSocket event, tenant channel
  UI->>UI: render + record render timestamp
```

## 5. Sequence: SaaS outage and recovery

```mermaid
sequenceDiagram
  autonumber
  participant Col as Collector
  participant OB as Outbox
  participant API as SaaS
  participant Mon as Offline monitor
  participant UI as Dashboard
  Col->>API: batch N
  API--xCol: connection refused / timeout
  Col->>OB: keep pending, attempts++
  Note over Col: backoff 1s, 2s, 4s ... max 30s, +/-20% jitter
  loop every window
    Col->>OB: new summaries enqueued
  end
  Note over Mon: if SaaS stays up but collector link is down, heartbeat age exceeds 30s
  Mon->>UI: collector state Poor, reason HEARTBEAT_MISSING
  API-->>Col: reachable again
  Col->>API: drain oldest first, 500 per batch
  API-->>Col: accepted + duplicate lists
  Col->>OB: mark delivered
  Col->>API: reconciliation report: sent ID count + hash
  API-->>UI: recovery event, missing 0, duplicates 0
```

## 6. Component ownership

| Component | Path | Owner role |
|---|---|---|
| Contracts | `packages/contracts` | A + B |
| Collector | `apps/collector` | A |
| Simulator + scenarios | `simulator/`, `scripts/scenarios` | D |
| SaaS API, ingest, tenancy | `apps/saas-api` | B |
| AIOps engine | `apps/saas-api/aiops` | D |
| Web app | `apps/web` | C |
| Deploy (Compose, Caddy) | `infra/` | B |

## 7. Scalability story (J2)
- **Collectors:** stateless senders with local durable state. Ingest is horizontally scalable behind Caddy/LB because dedup lives in the database (unique `(tenant_id, payload_id)`).
- **Volume:** 2 s aggregation turns 100–500 raw ev/s into about one payload per source-metric per window, and batching reduces that to roughly 1 request/s per collector.
- **Tenants:** RLS plus a tenant_id-leading composite index on every table. Per-region databases shard naturally by residency.
- **Next step (production):** a message queue between ingest and AIOps, partitioned tables by time, a read replica for dashboards. Out of scope for 24 h.
