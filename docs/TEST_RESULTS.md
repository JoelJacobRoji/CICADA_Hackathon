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
