# AEGIS — Performance Measurement Plan

Targets were confirmed by the team on 2026-11-20 (the guide lists them as organizer-suggested). Load profile (team benchmark, not organizer-prescribed): 100 ev/s normal, 3 × 60 s bursts at 500 ev/s, 10-minute runs.

## Clocks
- The simulator (event timestamps) and the browser (render timestamps) both run on the **same laptop**, so T1 needs no cross-machine clock correction.
- T2/T3 involve VPS timestamps. At start the collector and web app call `GET /api/v1/time` five times and record `offset = server_time − (t_send + t_recv)/2` using the minimum-RTT sample. Results are reported raw and offset-corrected, along with the offset and RTT.
- Both machines are assumed NTP-synced. This assumption is checked and recorded.

## T1 — Collection → dashboard (P95 ≤ 10 s)
- **Start:** `first_event_ts_utc` of the window (the earliest raw event, conservative).
- **End:** the browser timestamp after the chart update is committed (`requestAnimationFrame` after React commit), captured by a latency probe in the web app and POSTed to `/api/v1/telemetry-latency` (metadata only).
- **Sample:** every payload rendered during a 10-minute run (expected n ≳ 5,000).
- **Report:** n, P50, P95, P99, max, histogram, run conditions (network type, load).
- **Budget:** 2 s window + ≤ 1 s batch flush + hotspot RTT + processing + push ≈ 4–6 s.

## T2 — Breach → alert (≤ 15 s)
- **Start:** event_timestamp of the first injected spike event (scenario script logs it).
- **End (a):** alert `created_at_utc` on the SaaS (offset-corrected). **End (b):** browser render of the alert.
- **Sample:** ≥ 10 injections across CPU, latency and auth scenarios. Report each, plus the max.

## T3 — Offline detection (≤ 60 s)
- **Start:** `received_at` of the last heartbeat before the outage (SaaS clock).
- **End:** collector transition to Poor (`health_transitions.at_utc`, SaaS clock, so no skew).
- **Sample:** ≥ 5 outages. Expected worst case 35 s by design.

## T4 — Post-outage delivery (0 loss, 0 duplicates)
The reconciliation report in RELIABILITY.md. **Pass = missing 0 AND duplicate_rows 0.** Runs at normal and burst load.

## Resource usage
Collector and SaaS CPU% and RSS sampled every 5 s during load runs. VPS `docker stats` captured.

## Integrity rules
Unexecuted measurements are reported as NOT RUN. Failed targets are reported with their numbers and not re-tuned silently. Simulator-based results are labelled SIMULATED until repeated on the official stream.
