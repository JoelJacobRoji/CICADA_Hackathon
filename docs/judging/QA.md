# AEGIS: answers to the Evaluation Guide §7 questions

Short answers to say out loud, each followed by **Show:** what to open as proof. All numbers are from
`docs/VALIDATION_REPORT.md` (live production, 2026-11-20). Data: SYNTHETIC, from the AEGIS simulator.

## Security and data handling

**Exactly what data leaves the local environment, and what stays behind?**
- **Leaves:**
  - 2-second metric summaries (min/max/mean/p95, units, window times in UTC plus the source timezone)
  - health state and summary codes
  - security **counts** (failures, distinct accounts, distinct origins)
  - dependency edges
  - collector heartbeats
  - every source appears only as a keyed pseudonym (`src_…`)
- **Stays:** raw events and log lines, usernames, IPs, hostnames, real source names, the pseudonym key, and secrets.
- **Show:** **Privacy Glass** (raw next to masked next to the exact bytes that left); the Security & privacy page; the SaaS Security signals page (counts only).

**How does the collector decide which fields are allowed to be sent?**
- By an allow-list in code. Outbound payloads are built only from typed contracts (`packages/contracts/.../outbound.py`, Pydantic with `extra="forbid"`).
- A field that isn't in the contract can't be serialised. The SaaS re-validates with the same contracts and rejects unknown fields.
- **Show:** `outbound.py`; the test that rejects unknown fields.

**How do you prevent secrets or raw log content from being transmitted accidentally?**
Four layers:
1. Raw `message` and attributes are never part of an outbound type.
2. Secrets are scrubbed in the local display copy.
3. A two-layer **egress canary** runs on every payload before it's queued: credential patterns, plus fingerprints of secret values seen locally. A match blocks the payload.
4. A **hash-chained egress ledger** records every payload that left.

Live result: fake secrets and all 9 real source names were searched across every SaaS table, including incidents and LLM prompts: **0 leaks**.
- **Show:** Privacy Glass → "Run leak scan" (S1 runs at +30 s in the demo); `phase9_e2e_verify.json`.

**How are collectors authenticated and data encrypted?**
- Each collector has its own bearer token. The SaaS stores only its SHA-256, and the token is bound to one tenant and one region: a Mumbai token gets 401 in Frankfurt.
- Encryption: HTTPS with TLS from Let's Encrypt and HSTS, and the database connection uses TLS.
- The collector only connects **outbound**; nothing ever connects into the customer network.
- **Show:** `phase9_security_validation.json`, checks C1–C4 and R1–R2.

**Can you open the egress proof panel and show the last payload?**
- Yes: **Privacy Glass**, on the collector at `http://127.0.0.1:9100/glass` (local only; `./scripts/glass.ps1` opens it and puts the admin token on the clipboard without showing it).
- For one payload it shows four columns:
  1. the raw records (local only), with usernames, IPs and real host names highlighted
  2. the same records masked, with finding tags
  3. the exact ledgered outbound JSON, its SHA-256, and the hash recomputed from the stored bytes
  4. the SaaS receipt: the SHA-256 the SaaS computed on arrival, fetched live over the collector's outbound connection (hash only, own payloads only)
- Automatic **leak check**: every sensitive value from column 1 is searched for in column 3. A **leak scan** does the same across every ledgered payload, for every local record where a secret was found.
- **Show:** click "Latest security summary" (S3), then "Run leak scan" (S1 secrets). Fleet-wide proof: **3,231 / 3,231** hashes equal (`phase9_e2e_verify.json`).

## AIOps and operations

**How do you distinguish a real anomaly from a normal usage spike?**
- **Robust baseline per source and metric:** z = 0.6745·(x − median)/MAD over about 5 minutes of history. An anomaly needs |z| ≥ 3.5.
- **Persistence:** the deviation must hold for **2 consecutive windows**. A one-window spike is counted as a suppressed transient and never alerts.
- **Harmful direction only:** e.g., CPU going up alerts; CPU returning to normal does not.
- **No contamination:** the baseline **freezes** during a deviation, so an incident is never learned as normal. A new level is adopted only after it persists about 5 minutes.
- **Result:** 0 false incidents in 100 minutes of clean traffic.
- **Show:** the S5 incident (80% CPU vs a 35% median, z ≈ 30, while the static 85% threshold never fired).

**How do you correlate multiple alerts into one incident?**
- **Never by time alone.** Rules:
  - same source (C-SRC)
  - a **reported dependency path** of up to 2 hops (C-TOPO)
  - several network alerts from one site (C-SITE)
  - missing data while the collector is offline (C-COLLECTOR)
  - repeats of an open alert are deduplicated
- **Probable cause:** the most upstream affected source, by earliest event-time onset. "Undetermined" if the candidates are unrelated.
- **Show:** the S6 incident: **18 alerts → 1 incident**, root cause NET_001, which alerted ~20 s before APP_001/APP_002; "How the signals were grouped" lists each rule.

**Can you explain why the platform recommends a particular action?**
- Every recommendation comes from a deterministic playbook and **cites the alert IDs** it's based on, with a "Why:" rationale.
- The incident also shows:
  - probable cause and its basis
  - evidence strength (rule-based, **not** a probability)
  - priority score broken into its parts
  - uncertainties
- Gemini adds a plain-language explanation that must pass a **grounding check**: every ID, number, date, time and code must exist in the evidence, or the answer is rejected and never shown.
- **Show:** the incident detail → "Show the exact prompt sent".

**What safeguards are needed before automated remediation?**
- **Required before any automation:**
  - human approval for each action
  - policy bounds (which actions, on which assets, in which hours)
  - a dry run first
  - reversible actions with a rollback plan
  - a rate limit
  - an append-only audit log
  - automatic stop if health gets worse
- **Today:** AEGIS **proposes** actions only; nothing is executed. An approval-gated Safe Action Simulator is our next step (deferred).

## Architecture and reliability

**What happens when SaaS is unreachable?**
- The collector keeps collecting. Payloads queue in a durable SQLite outbox (WAL, synchronous=FULL), and the sender retries with backoff.
- The buffer survives a collector restart.
- Live test: 60 s outage plus a collector restart → **957 buffered**, drained in ~37 s after reconnect.
- **Show:** `phase9_outage_timeline.json`. Live: turn off the laptop's Wi-Fi for 30–60 s, then turn it back on.

**How do you avoid losing or duplicating metadata after reconnection?**
- **No loss:** a payload leaves the outbox only after the SaaS acknowledges it.
- **No duplicates:**
  - every payload has a deterministic **UUIDv5** ID
  - the SaaS inserts with `ON CONFLICT DO NOTHING` and acknowledges duplicates as `duplicate`
- Live: **1,837 / 1,837** stored, **0 missing, 0 duplicate IDs, 0 hash mismatches**.

**How would you scale across many collectors and customer tenants?**
- **Today:** every query is tenant-scoped by PostgreSQL row-level security. Ingest is one database round trip per batch (p95 1.3 s collector → SaaS); collectors are independent and outbound-only.
- **Next:** several SaaS instances behind the load balancer with a shared event bus (e.g., Redis or NATS) for WebSocket fan-out and engine state, time-partitioned summary tables, and per-region SaaS compute.
- **Honest limit:** today it's one SaaS instance with in-memory engines.

**How do you handle regions, tenant data residency, UTC time and out-of-order events?**
- **Regions and residency:**
  - each tenant is pinned to a regional database (Supabase Mumbai or Frankfurt)
  - collectors use a regional ingest path, and tokens only work in their region
  - EU tenants are never sent to the external LLM: 0 sent, verified live
- **Time:** all timestamps are UTC with the source's IANA timezone; contracts reject naive timestamps.
- **Out-of-order events:**
  - placed by event time; late windows are stored with a late flag and never re-scored by the AI
  - duplicates are idempotent
- **Honest limit:** SaaS compute runs on one US host. The live out-of-order replay scenario is not built yet.
