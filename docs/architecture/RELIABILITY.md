# AEGIS — Reliability and Delivery Semantics

**Guarantee:** at-least-once delivery over the network + idempotent persistence = **effectively-once storage**. We never claim exactly-once transmission.

## Collector side
1. **Transactional outbox.** The ledger row (exact JSON + SHA-256) and the outbox row (`payload_id PK`, `status pending`, `attempts`, `next_attempt_at`) are written in **one SQLite transaction** (WAL, `synchronous=FULL`). Nothing is sent before it is durable.
2. **Deterministic payload_id.** UUIDv5(collector_id | source_pid | metric | window_start). If the collector crashes after sending but before recording the acknowledgement, the same ID is resent, and the SaaS reports it as `duplicate`, which is treated as delivered.
3. **Sender loop.** Picks up to 500 pending items in `created_at` order and POSTs one batch.
   - On 200: items in `accepted` or `duplicate` → delivered. Items in `rejected` → dead-letter.
   - On network error, 5xx or 429: `attempts++`, `next_attempt_at = now + min(30 s, 1 s·2^attempts) ± 20 % jitter`.
   - On 401/403: stop sending, set adapter status `AUTH_ERROR`, keep everything queued.
4. **Outage behaviour.** Collection, local analysis, the ledger and enqueue continue regardless of SaaS state. Outbox capacity is bounded by disk (alert at 100k pending). Older items are never dropped silently.
5. **Restart safety.** On start, any rows in `sending` revert to `pending`.

## SaaS side
- `UNIQUE (tenant_id, payload_id)` on every ingest table, with `INSERT … ON CONFLICT DO NOTHING RETURNING payload_id` to classify accepted vs duplicate.
- Every row stores `event_time_utc` (window end) **and** `received_at_utc`. Queries and charts order by event time. Rows where `received_at − event_time > 30 s` are flagged `late=true` and shown with a marker. They are inserted in their correct historical position, and their aggregates are recomputed for the affected window only.
- Health evaluation uses event time. A late payload never overrides a newer state: transitions only apply if `event_time ≥ entity.last_evaluated_event_time`. Otherwise it is recorded as historical.
- `collector_seq` gaps are tracked to surface possible loss (expected: 0 gaps after recovery).

## Offline detection
Heartbeats every 10 s, independent of the outbox. They are never queued: a stale heartbeat is meaningless. The SaaS monitor runs every 5 s: heartbeat age > 30 s → collector Poor `HEARTBEAT_MISSING`. A recovery event is emitted on the next heartbeat.

## Reconciliation (S2 / T4 evidence)
`scripts/scenarios/s2_outage` does the following:
1. Records the collector's ledger ID set for the test window.
2. Stops the SaaS (or the network).
3. Continues 100 ev/s for ≥ 60 s.
4. Restores, waits for outbox depth = 0.
5. Queries the SaaS for IDs in the window.
6. Reports `sent`, `received_unique`, `missing = sent − received`, `duplicate_rows = count(*) − count(distinct payload_id)`, `max_backlog`, `drain_seconds`.

The report is saved to `docs/judging/evidence/`.

## Failure matrix

| Failure | Behaviour | Test |
|---|---|---|
| SaaS down | queue grows, backoff, collector Poor on dashboard | S2 |
| Network flaps | partial batches retried by ID | reliability suite |
| Collector killed mid-send | resend → duplicate ack | restart test |
| Ack lost | same as above | fault-injection test |
| Duplicate replay | stored once | S7 |
| Out-of-order | placed by event time, `late` flag | S7 |
| Bad payload | 422 per item, dead-letter, no retry storm | security suite |
| Token revoked | 401, queue retained, operator alert | security suite |
