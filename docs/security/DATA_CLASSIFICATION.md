# AEGIS — Data Classification Policy

| Class | Definition | Examples | Location | Leaves collector? |
|---|---|---|---|---|
| **L4 Secret** | credentials and key material | passwords, API keys, tokens, private keys, the pseudonymisation secret | collector raw store (raw), masked in console | **Never** |
| **L3 Sensitive raw** | content or identity of people/systems | log messages, usernames, IPs, hostnames, payload bodies, original source_id | collector raw store | **Never** |
| **L2 Operational metadata** | derived, aggregated, pseudonymised | metric aggregates, health state, severity, summary codes, source_pid, counts | collector outbox → SaaS | **Yes** (allow-listed schema only) |
| **L1 Fleet metadata** | about the collector itself | version, uptime, queue depth, config hash, region | heartbeat | **Yes** |

## What stays local
Every raw event (metric and log) in `collector.db` → `raw_events`, retained for `RAW_RETENTION_HOURS` (default 24 h, configurable, purged hourly). Also the pseudonym mapping (`source_id ↔ source_pid`), the HMAC secret, local admin credentials and the dead-letter queue.

## What is redacted or dropped
- `message`, `attributes.*`: dropped from outbound entirely. In the collector console they are shown with secrets masked (`password=••••••[redacted:password]`).
- `user`, `src_ip`: reduced to distinct counts.
- Unknown fields: dropped.

## What is pseudonymised
`source_id` → `src_` + first 16 hex chars of HMAC-SHA256(per-tenant secret, source_id). The mapping is stable (so correlation works) and not reversible by the SaaS. It is reversible locally for operators via the collector console.

## What is transmitted
Only `MetricSummary`, `SecuritySummary`, `Heartbeat` and `TopologyEdge` (see METADATA_SCHEMA.md), over HTTPS with a per-collector bearer token.

## Who can see what

| Actor | Raw (L3/L4) | Masked raw | L2/L1 own tenant | Other tenants |
|---|---|---|---|---|
| Collector local admin (customer site) | Yes (local console) | Yes | Yes (egress ledger) | No |
| Tenant operator / viewer (SaaS) | **No** | No | Yes | **No** |
| Tenant admin (SaaS) | No | No | Yes + collector registration | No |
| Platform admin (SaaS) | No | No | Fleet counts only (no tenant metrics in MVP) | No |
| SaaS database / logs | No | No | Yes (scoped by RLS) | n/a |

## Redaction examples

| Raw (local) | Outbound |
|---|---|
| `Failed password for admin from 10.20.30.40 port 52211 ssh2` ×25 | `{"kind":"security_summary","summary_code":"AUTH_FAILURE_BURST","failure_count":25,"distinct_user_count":1,"distinct_src_count":1,"source_pid":"src_9f2c…","risk_level":"high",…}` |
| `db connect ok user=svc password=FAKE_P@ss123 api_key=FAKE_sk_live_51Hx…` | nothing from the message. The window's metric summary only. |
| `{"source_id":"SRV_001","metric":"cpu_usage","value":95.0}` ×N | `{"source_pid":"src_4ab1…","metric":"cpu_usage","max":95.0,"mean":91.3,"count":10,…}` |
