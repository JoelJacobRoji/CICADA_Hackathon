# AEGIS — Data Contracts

All schemas are **team-defined** (not organizer-provided). They will be mapped onto the official stream when it is supplied. Every contract is implemented once in `packages/contracts` as Pydantic v2 models with `extra="forbid"`. The same models validate on the collector (before enqueue) and the SaaS (on ingest).

## 1. Input schema (collector side, never leaves)

### 1.1 Metric event (team-supplied schema, adopted as-is)
```json
{
  "event_id": "EVT_001",
  "tenant_id": "TENANT_01",
  "source_id": "SRV_001",
  "event_timestamp": "2026-11-20T09:30:00Z",
  "source_timezone": "Asia/Kolkata",
  "metric": "cpu_usage",
  "value": 95.0,
  "unit": "percent",
  "category": "infrastructure",
  "severity": "high"
}
```
Validation: `event_timestamp` must carry a timezone and is normalised to UTC. `source_timezone` must be a valid IANA zone. `metric`/`unit` must be a known pair (table 1.3). Unknown extra fields are **kept locally** (raw store) and never propagated.

### 1.2 Log event (AEGIS extension, needed for S1 and S3)
```json
{
  "event_id": "EVT_9001",
  "tenant_id": "TENANT_01",
  "source_id": "SRV_001",
  "event_timestamp": "2026-11-20T09:31:12Z",
  "source_timezone": "Asia/Kolkata",
  "record_type": "log",
  "category": "security",
  "log_kind": "auth",
  "message": "Failed password for admin from 10.20.30.40 port 52211 ssh2",
  "attributes": { "user": "admin", "src_ip": "10.20.30.40", "outcome": "failure" }
}
```
`record_type` defaults to `"metric"` when absent, so the supplied schema stays valid unchanged. `message` and `attributes` are **local-only**. No outbound model has a field that could carry them.

### 1.3 Known metrics

| metric | unit | category | Source in MVP |
|---|---|---|---|
| cpu_usage | percent | infrastructure | agent, simulator |
| memory_usage | percent | infrastructure | agent, simulator |
| disk_usage | percent | infrastructure | agent, simulator |
| service_up | bool (0/1) | application | probe, simulator |
| error_rate | percent | application | simulator |
| latency_ms | ms | network | probe, simulator |
| packet_loss | percent | network | probe, simulator |
| bandwidth_mbps | mbps | network | agent, simulator |
| connectivity | bool (0/1) | network | probe, simulator |

## 2. Outbound schema (the ONLY things that leave)

Outbound traffic consists only of `IngestBatch` objects containing the item types below. Any other field fails validation on **both** sides.

### 2.1 `MetricSummary` (v1)

| Field | Type | Notes |
|---|---|---|
| kind | `"metric_summary"` | discriminator |
| schema_version | `1` | |
| payload_id | UUID | **deterministic** UUIDv5(collector_id, source_pid, metric, window_start) → same ID on every retry or regeneration |
| collector_id | string | must equal the token's collector, otherwise rejected |
| source_pid | `src_[0-9a-f]{16}` | HMAC-SHA256(tenant secret, source_id), truncated. The secret never leaves the collector. |
| source_kind | enum server / network_device / application | from local inventory |
| metric | enum (table 1.3) | |
| unit | enum | |
| category | enum infrastructure / network / application / security | |
| window_start_utc, window_end_utc | ISO-8601 UTC | 2 s tumbling windows (configurable) |
| source_timezone | IANA string | validated |
| count, min, max, mean, last, p95 | number | aggregates only |
| severity | enum info / low / medium / high / critical | |
| local_health | enum Excellent / Good / Fair / Poor | collector's local view |
| anomaly | object or null | `{method:"robust_z", score, baseline_median, baseline_mad, history_n, direction}` |
| summary_code | enum (e.g. `CPU_HIGH`, `LATENCY_RISING`, `BASELINE_DEVIATION`, `OK`) | fixed vocabulary, **no free text** |
| first_event_ts_utc | ISO-8601 | earliest raw event_timestamp in the window (latency measurement) |
| collector_seq | int | monotonic per collector, for gap detection |

### 2.2 `SecuritySummary` (v1)

| Field | Notes |
|---|---|
| kind `"security_summary"`, schema_version, payload_id, collector_id, source_pid, window_start_utc, window_end_utc, source_timezone, collector_seq | as above |
| summary_code | enum `AUTH_FAILURE_BURST`, `AUTH_FAILURE_SPRAY`, `AUTH_SUCCESS_AFTER_FAILURES` |
| failure_count | int |
| distinct_user_count, distinct_src_count | int (counts only, never values) |
| severity, local_health | enums |
| risk_level | enum low / medium / high (rule table in HEALTH_AND_AIOPS.md, not a probability) |

### 2.3 `Heartbeat` (v1)
`kind:"heartbeat"`, `collector_id`, `sent_at_utc`, `collector_version`, `uptime_s`, `cpu_percent`, `memory_mb`, `outbox_depth`, `oldest_pending_age_s`, `config_hash` (SHA-256 of active policy), `adapters: [{name, status enum}]`, `region`.

### 2.4 `TopologyEdge` (v1)
`kind:"topology_edge"`, `payload_id`, `collector_id`, `from_pid`, `to_pid`, `relation` enum `depends_on` / `routes_through`. Declared in local inventory config and pseudonymised, so the SaaS can correlate without learning hostnames.

### 2.5 Envelope and acknowledgement
```json
// POST https://<saas>/api/v1/ingest/{region}   Authorization: Bearer <collector token>
{ "batch_id": "uuid", "sent_at_utc": "…", "items": [ /* 1..500 items, body ≤ 1 MiB */ ] }
```
```json
// 200 OK
{ "batch_id": "uuid",
  "accepted":  ["payload_id", …],
  "duplicate": ["payload_id", …],
  "rejected":  [{"payload_id": "…", "reason": "SCHEMA_INVALID"}] }
```
The collector marks an item delivered when it is listed in `accepted` **or** `duplicate`. `rejected` items move to a local dead-letter table (never retried blindly).

## 3. Field fate table (input → outbound)

| Input field | Fate | Outbound representation |
|---|---|---|
| event_id | stays local | mapped into ledger only; payload_id is window-level |
| tenant_id | **ignored for trust** | SaaS derives tenant from token |
| source_id | **pseudonymised** | source_pid |
| event_timestamp | aggregated | window_start/end, first_event_ts |
| source_timezone | sent | source_timezone |
| metric, unit, category | sent (enum-checked) | same |
| value | aggregated | count/min/max/mean/last/p95 |
| severity | recomputed locally | severity |
| message | **dropped** (local only) | none |
| attributes.user / src_ip | **dropped**; counted | distinct_*_count |
| any unknown field | **dropped** (local only) | none |

## 4. Allow-list mechanism
1. Outbound models are the allow-list. No `dict`/`Any`/free `str` fields exist except constrained patterns (`source_pid`, IDs, IANA zone).
2. `summary_code` is an enum, so it cannot carry text.
3. The **secret scrubber** runs on raw records before local analytics (defence in depth). It masks matches (passwords, API keys, bearer/JWT tokens, private keys, AWS-style keys, emails, IPv4/6) in a *display copy* used by the collector console.
4. Before enqueue, `canary_scan(payload_json)` checks for known secret patterns and refuses to enqueue on a hit (fail closed, logged locally as `EGRESS_BLOCKED`).
5. The SaaS revalidates with the same models plus a size limit and the tenant binding.
