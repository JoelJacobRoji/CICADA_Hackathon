# AEGIS — Threat Model (STRIDE, prototype scope)

## 1. Assets
Raw telemetry and secrets (L3/L4, collector only) · pseudonym secret · collector tokens · operator sessions · tenant metadata (L2) · egress ledger integrity · audit logs.

## 2. Roles

| Role | Scope | Can |
|---|---|---|
| `collector_local_admin` | one collector (local) | view raw/masked records, ledger, pseudonym lookup, retention config |
| `tenant_admin` | one tenant (SaaS) | register/revoke collectors, edit thresholds, approve simulated actions |
| `tenant_operator` | one tenant | view, acknowledge alerts, propose/approve simulated actions |
| `tenant_viewer` | one tenant | read-only |
| `platform_admin` | platform | create tenants, view fleet counts; **no tenant metric access in MVP** |
| `collector` (machine) | one collector → one tenant, one region | POST ingest/heartbeat only |

## 3. STRIDE

| Threat | Component | Mitigation | Test |
|---|---|---|---|
| **S**poofed collector | ingest | 256-bit random token per collector, stored as SHA-256 on the SaaS, bound to tenant + region; revocable | wrong/revoked token → 401 |
| Spoofed tenant in body | ingest | tenant taken **only** from the token. `tenant_id` in raw input is ignored, and outbound models have no tenant field. | send other tenant's ID → stored under token's tenant / rejected |
| Spoofed operator | web | argon2id passwords, 30 min JWT in httpOnly + Secure + SameSite=Strict cookie, login rate-limit | auth tests |
| **T**ampered payload in transit | H1 | TLS (Caddy, Let's Encrypt) | TLS check |
| Tampered egress ledger | collector | SHA-256 per entry + hash chain (`prev_hash`) so edits are detectable | chain verification test |
| **R**epudiation of actions | SaaS | append-only `audit_log` (actor, action, target, at_utc); simulated actions require an approver ≠ proposer | audit test |
| **I**nfo disclosure: secrets leave | collector | no free-text outbound fields, scrubber, canary scan fail-closed | S1 + grep of SaaS DB/logs |
| Info disclosure: cross-tenant | SaaS | Postgres RLS (`tenant_id = current_setting('app.tenant_id')`), app role without BYPASSRLS, tenant set per transaction from the auth context, WebSocket channels keyed by tenant from the session | Tenant A token/session → B resources: 404; WebSocket subscription to B: refused |
| Info disclosure: logs | both | structured logging with field allow-list; request bodies never logged; tokens redacted | log grep test |
| Info disclosure: raw via SaaS | SaaS | no raw endpoint exists; Privacy Glass raw pane talks to the collector on loopback only | route inventory test |
| **D**oS: oversized/flood | ingest | 1 MiB body limit, 500 items/batch, per-collector rate limit (token bucket), Caddy timeouts | oversized → 413 |
| **E**levation: viewer → admin | SaaS | role checks per route (dependency injection), deny by default | authZ tests |
| Injection | SaaS | SQLAlchemy bound parameters; Pydantic enums; React escaping | injection test strings |
| Local console exposure | collector | binds 127.0.0.1 only; local admin token; CORS = web origin only | bind test |

## 4. Tenant isolation approach (judge Q)
Defence in depth across three layers:
1. **Identity:** tenant derived from the collector token or operator session, never from request data.
2. **Application:** every repository function requires a `TenantContext`. Queries filter by `tenant_id`.
3. **Database:** RLS policies on every tenant table. The app connects as `aegis_app` (no BYPASSRLS) and executes `SET LOCAL app.tenant_id = …` per transaction. A missing setting → zero rows.

**Residency:** each tenant is pinned to a region. Its rows live only in that region's database. The ingest endpoint rejects collectors whose region doesn't match (403 `REGION_MISMATCH`).

## 5. Known limitations (stated honestly)
- Both regional databases sit on one VPS. That demonstrates logical residency enforcement, not physical/jurisdictional isolation.
- Bearer token, not mTLS. A stolen token works until revoked (mitigations: rotation, short TTL in production, mTLS).
- If the venue fallback (local SaaS) is used, the tiers share one machine.
- Laptop hotspot latency is outside our control and is measured as is.
- No HSM/KMS. Secrets live in git-ignored `.env` files.
