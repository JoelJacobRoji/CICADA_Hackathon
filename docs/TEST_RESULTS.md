# AEGIS — Test Results

| Phase | Test | Result | Evidence |
|---|---|---|---|
| 1 | All 43 guide requirement IDs present in matrix | PASSED | static script |
| 1 | Outbound schema has no sensitive fields | PASSED | static script |
| 1 | Pass criteria defined for S1–S8 | PASSED | SCOPE_MVP.md §5 |
| 1→2 | Mermaid diagrams (6 blocks) parse with the Mermaid 11 parser | PASSED in Phase 2, after fixing 2 real syntax errors (reserved word `Box`, `;` in a message) | `apps/web/src/docs-mermaid.test.ts` |
| 2 | ruff lint + format | PASSED | `scripts/check.ps1` |
| 2 | pytest: 44 tests (26 contracts, 7 SaaS incl. 2 Postgres integration, 8 collector, 3 boundary) | PASSED (44/44) | `scripts/check.ps1` |
| 2 | RLS: aegis_app sees 0 rows without tenant context; sees only its own tenant with context; not superuser, no BYPASSRLS; cannot insert | PASSED | `test_migration_and_rls_isolation` |
| 2 | Outbound contract rejects message/attributes/tenant_id/source_id/hostname | PASSED | `test_outbound_rejects_unknown_or_sensitive_fields` |
| 2 | web: tsc, ESLint, Vitest (8), production build | PASSED | `scripts/check.ps1` |
| 2 | Services run as separate processes: saas /healthz 200, /readyz 200 (both regions ok), collector /healthz 200 (WAL), web 200 | PASSED | manual curl, 2026-11-20 |
| 2 | All listeners bound to 127.0.0.1 (9001, 9100, 5180, 55432) | PASSED | netstat |
| 2 | No generated secret values in service logs | PASSED | grep of logs |
| 2 | No .env/.db/.pem/.key would be tracked by git | PASSED | `git add --dry-run`, check-ignore |
| 2 | Supabase connectivity + migrations (ap-south Mumbai, eu-west Frankfurt; session pooler, sslmode=require) | PASSED: alembic 0001 applied to both projects, `/readyz` 200 with both regions ok | verification script, 2026-11-20 |
| 2 | Supabase: aegis_app not superuser, no BYPASSRLS; RLS on; 0 rows without tenant context; A sees only A, B sees only B; app-role INSERT denied | PASSED in both regions (test rows cleaned up) | verification script |
| 2 | Supabase: anon/authenticated have no USAGE on `aegis` and no SELECT on tenants; Data API exposes default schemas only | PASSED in both regions | verification script |
| 2 | Supabase warm query RTT from laptop over hotspot | MEASURED: ap-south median 84 ms (max 119), eu-west median 232 ms (max 319), n=10 each | verification script |
| 2 | Visual browser check of web page | NOT RUN (connected Chrome cannot reach laptop localhost); covered by component test only | — |
| 3 | pytest total: 99 (contracts 26, SaaS 7, collector 52, simulator 3, boundary 3; +8 web) | PASSED (99/99) | `scripts/check.ps1` |
| 3 | Scrubber masks password/kv creds, API keys, JWT, bearer, AWS keys, GitHub tokens, private keys, emails, IPv4; leaves timestamps/versions intact | PASSED | `test_privacy_units.py` |
| 3 | Canary pattern layer blocks recognisable secrets in outbound JSON; no false positive on legitimate payloads | PASSED | `test_privacy_units.py` |
| 3 | Bare password (no context) is NOT caught by patterns (honest limitation) but IS blocked by the local secret-fingerprint layer once seen in a raw record | PASSED | `test_bare_password_needs_fingerprint_layer` |
| 3 | Ledger hash chain verifies; payload edit detected at exact seq; deleted entry detected; canary-blocked item writes nothing and leaves no seq gap; duplicate payload_id not requeued; seq persists across restart | PASSED | `test_egress_ledger.py` |
| 3 | Aggregator stats/window boundaries; late event goes to a separate `#late1` partial (no collision, no drop) | PASSED | `test_pipeline_units.py` |
| 3 | Auth detector: 4 fails none; 25 fails -> burst medium then high (once each); spray; success-after-failures; expiry outside 60 s | PASSED | `test_pipeline_units.py` |
| 3 | **S1 e2e (HTTP)**: secrets present in raw (admin reveal), absent from masked view, absent from ledger+outbox (also SRV_001, svc_billing, TENANT_01), absent from collector stdout/stderr; payloads validate as IngestBatch; chain ok | PASSED | `test_s1_secret_stays_local` |
| 3 | **S3 e2e (HTTP)**: AUTH_FAILURE_BURST high, failure_count >= 20, distinct_user_count = 1; no 'admin', IP, message text or SRV_002 in egress | PASSED | `test_s3_failed_logins_counts_only` |
| 3 | Same input -> identical payload IDs in two fresh DBs | PASSED | `test_same_input_gives_same_payload_ids` |
| 3 | Token separation (ingest token cannot open console; admin token cannot ingest; none/wrong -> 401); 1001 records -> 413; >1 MiB -> 413; bad JSON -> 400; invalid records counted as rejected | PASSED | `test_scenarios_e2e.py` |
| 3 | **Live run (SIMULATED)**: 60 s @100 ev/s + 10 s @500 ev/s burst + S1/S3/S5: 11,054 sent, 11,054 accepted, 0 rejected, 0 HTTP errors; 1,056 payloads queued (1,044 metric, 2 security, 10 topology); 0 blocked; chain ok; 0 seq gaps; local latency first event -> queued p50 3.13 s / p95 3.39 s / max 3.49 s (n=1,044; includes 2 s window + 1 s grace) | MEASURED | `docs/judging/evidence/phase3_collector_report.json` |
| 3 | Live run leak check: 0 occurrences of any S1 fake secret in egress tables and in the collector log (668 lines) | PASSED | report + grep |
| 3 | Real system agent on this laptop (psutil + TCP connect probes): 7 metrics accepted, summaries queued, hostname absent from egress | PASSED (manual) | ad-hoc run |
| 3 | Full 10-minute sustained run | NOT RUN (Phase 9) | n/a |
| 3+ | CI parity: full suite with all .env loading disabled (env vars only, as on GitHub Actions) | PASSED 99/99 after fixture fix; old fixture reproduced the CI failure (2 integration errors) | scratchpad pytest plugin `ci_sim` |
| 4 | pytest total 124 (Phase 4 adds 25: ingest 13, tenancy/auth/WS 8, e2e 4) | PASSED 124/124 normal AND 124/124 CI parity (no .env) | `scripts/check.ps1` |
| 4 | Ingest: valid batch accepted; tenant bound from TOKEN; SaaS sha256 == collector canonical sha256; replay -> all duplicate, row count unchanged, receipts (5,0),(0,5) | PASSED | `test_ingest.py` |
| 4 | Ingest rejects: no/bad/Basic/revoked token 401; unknown region 404; COLLECTOR_MISMATCH; extra field / raw-log-shaped / unknown kind -> SCHEMA_INVALID (and smuggled secret not stored); bad JSON 422; >1 MiB 413; 501 items 422 | PASSED | `test_ingest.py` |
| 4 | Late arrival stored in event-time position with late=true | PASSED | `test_late_flag_and_event_time_order` |
| 4 | No SaaS route accepts raw inbound records (route inventory) | PASSED | `test_no_route_accepts_raw_inbound_records` |
| 4 | Cross-tenant: API (metrics, collectors, security events, receipts -> 404), DB level (RLS read 0 rows; WITH CHECK blocks foreign-tenant insert), token hashes never returned | PASSED | `test_tenancy.py` |
| 4 | WebSocket: each tenant receives only its own events; unauthenticated and foreign-Origin connections refused | PASSED | `test_tenancy.py` |
| 4 | Operator auth: login/logout/me; httpOnly + SameSite=Strict cookie; identical response for wrong password vs unknown user; forged-signature and alg=none JWTs rejected; rate limit 3 -> 429 | PASSED | `test_tenancy.py` |
| 4 | Residency (local): EU collector 401 at ap-south; data and tenant exist only in eu-west DB | PASSED | `test_residency_...` |
| 4 | E2E in-process: simulator -> pipeline -> ledger -> sender -> SaaS: all stored once, 0 hash mismatches, 0 leaks (per table), full-outbox replay -> 0 new rows; auth failure keeps everything pending; network failure backs off then recovers; heartbeat appears in fleet view | PASSED | `test_e2e_flow.py` |
| 4 | Sender bug found by test: backoff was computed from send START time; on Windows a refused connect takes ~2 s so retries were immediately due. Fixed: backoff from failure time | FIXED + PASSED | `test_network_failure_backs_off_and_recovers` |
| 4 | Supabase (both regions): migrations 0002 + 0003 applied; 9 RLS policies; identity functions SECURITY DEFINER; anon/authenticated: no table SELECT, no function EXECUTE; aegis_app: no DELETE anywhere | PASSED | verification queries, 2026-11-20 |
| 4 | **Live E2E on Supabase (SIMULATED data)**: 40 s @100 ev/s + S1 + S3 -> 621 ledgered, 621 stored in Supabase ap-south, 0 missing, 0 sha256 mismatches, 0 leaks in any SaaS table; delivery latency ledger->Supabase p50 0.61 s / p95 1.13 s / max 2.56 s (n=621); acme operator sees 609 metrics + 2 S3 findings; initech operator sees 0 | MEASURED | `docs/judging/evidence/phase4_e2e_supabase.json` |
| 4 | **Live residency on Supabase**: globex collector token -> Mumbai 401, Frankfurt 204; globex tenant + heartbeat only in eu-west | PASSED | live curl + queries |
| 4 | Live service logs (SaaS 76 lines, collector 387): 0 collector tokens, operator passwords or S1 secrets | PASSED | grep |
| 4b | GitHub CI on Phase 4 commit ee93a35 (python incl. pytest, web, secrets-guard) | PASSED | Actions run 44748914173 |
| 4b | VPS baseline before change: existing app https 200 / http 301, cert SHA-256 5E:5F:BF:...:C0:70 | RECORDED | baseline |
| 4b | Existing app after BOTH nginx reloads: https 200 / http 301, identical cert fingerprint; `nginx -t` clean | PASSED | post-checks |
| 4b | Service: systemd active, listens 127.0.0.1:9001 only, /readyz 200 (both Supabase regions), /docs + /openapi.json 404 (prod), 67 MB RSS | PASSED | VPS checks |
| 4b | External: `https://aegis.162-35-42-114.sslip.io/readyz` 200; TLS 1.3 TLS_AES_256_GCM_SHA384; Let's Encrypt (YE2) cert for exact hostname, valid to 2027-02-18, hostname verified; HTTP -> 301 HTTPS; TLS 1.1 refused; HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy present; /docs, /openapi.json, /redoc 404; port 9001 unreachable from internet; POST /api/v1/telemetry -> 404 | PASSED | laptop over internet |
| 4b | **Live E2E over HTTPS (SIMULATED data)**: laptop collector -> internet -> VPS nginx -> API -> Supabase ap-south; 40 s @100 ev/s + S1 + S3: 621/621 ledger IDs stored, 0 missing, 0 sha256 mismatches, 0 leaks in any SaaS table; acme sees 609 metrics, initech 0 via the public URL | PASSED | `docs/judging/evidence/phase4b_e2e_vps_https.json` |
| 4b | **Delivery latency ledger -> SaaS over VPS: p50 10.3 s / p95 17.0 s / max 19.0 s (n=621)** vs 0.61 / 1.13 s with the SaaS on the laptop | MEASURED - **threatens T1 (P95 <= 10 s)**, see K22 | evidence json |
| 4b | Latency breakdown: laptop->VPS /healthz 279 ms; ingest batch of 1 / 30 / 300 items = 3.0 / 3.3 / 4.5 s (fixed per-request cost); VPS (US) -> Supabase ap-south 242 ms/round trip, eu-west 89 ms | MEASURED | profiling |
| 4b | VPS journal (158 lines): 0 errors, 0 tokens/passwords/S1 secrets/raw identifiers | PASSED | grep |
