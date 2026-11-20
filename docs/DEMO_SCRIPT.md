# AEGIS live demo script (evaluation 2026-11-21 09:00)

Dashboard: **https://aegis.162-35-42-114.sslip.io**. Sign in as the `acme` operator. The credentials are in
`apps/saas-api/.demo-operators.local` on the presenting laptop (git-ignored). Never show that file on screen.

All telemetry is **SYNTHETIC**, from the AEGIS simulator. The organizers provide no dataset, so the
simulator is the official data source, and the banner on every page says so.

## 0. Before the session (T-15 min)
1. Laptop on the hotspot. Check `https://aegis.162-35-42-114.sslip.io/readyz` → `"status":"ready"`, both regions `ok`.
2. Sign in to the dashboard in a browser and open the **Overview**.
3. Run `./scripts/demo.ps1` at **T-2 min** so baselines have learned (they need 60 s or more) before you
   reach the AI part. Three windows open: device webhook, collector, simulator.

Timeline after `demo.ps1` starts (verified end-to-end in the simulated harness: 3 separate incidents):

| t | Scenario | What appears |
|---|---|---|
| 0–60 s | normal traffic | sources turn Excellent; baselines learn |
| +75 s | **S3** 25 failed SSH logins on SRV_002 | P2 "Repeated failed logins" incident (counts only) |
| +240 s | **S5** CPU on SRV_002 → ~80 % (static threshold is 85 %) | P2 "Baseline deviation": caught only by the AI baseline |
| +500 s | **S6** NET_001 loss + latency, APP_001/APP_002 degrade 20 s later | **18 alerts → 1 P1 incident**, probable cause NET_001 |

## 1. Two-tier architecture (1 min)
- **Frontend:** this React dashboard. **Backend:** FastAPI on the VPS. **Database:** Supabase PostgreSQL,
  one project per region (Mumbai ap-south, Frankfurt eu-west).
- Plus the **local collector** on the customer site (this laptop). Raw data stays there.
- Show the **Overview**: tenant health and the four states (Excellent/Good/Fair/Poor), with the `Live` chip.
  Updates arrive over a WebSocket, with no reload.

## 2. AI engine (3 min), the core
1. **Incident center**: priority counts and the noise-reduction ratio.
2. Open the **S5 "Baseline deviation"** incident:
   - *Signals*: 80 % vs a baseline median of ~35 %, robust z ≈ 30, threshold 3.5. Static thresholds
     never fired (80 < 85). Only the statistical baseline caught it.
   - *Probable cause*, *Evidence strength* (rule-based, not a probability), *Priority* with its score breakdown.
3. Open the **S6 cascade** incident:
   - 18 alerts on 3 sources were grouped into **one** incident by reported dependency (C-TOPO), not by time.
   - Probable cause **NET_001**: upstream of both apps and alerted ~20 s earlier.
   - **AI explanation** (Gemini): summary, reasoning and what to verify next.
     "Grounding check passed" means every ID, number, time and code in the text exists in the evidence.
     Click **Show the exact prompt sent**: it contains only pseudonymous `src_…` IDs.
   - Recommended actions cite the alerts they are based on. Nothing is executed automatically.
4. Click **Acknowledge** (audited, operator role).

## 3. Device alert (1 min)
- Switch to the **device webhook** window. The same incident arrived on the device, **with real names**
  (NET_001, APP_001). The collector pulled it over its outbound connection and re-identified it locally.
  The SaaS only ever stored `src_…` pseudonyms (verified in the database: 0 real names).

## 4. Security (2 min)
- Open **Security & privacy**: 5 live checks pass (HTTPS/HSTS, encrypted WebSocket, httpOnly session,
  tenant scope, residency region), plus the list of controls with how each is verified.
- Talking points:
  - argon2id passwords and rate-limited login
  - per-collector tokens, stored as SHA-256 only
  - PostgreSQL row-level security per tenant
  - CSP and HSTS
  - secret canary and hash-chained egress ledger
  - EU tenants are never sent to the LLM
- Optional: **Security signals** shows S3 as counts only, with no usernames or IPs.
- Optional, as the closing beat: close the **collector** window. Within about 35 s the fleet shows the
  collector **Poor (offline)** and a "Collector offline" incident opens, with no reload.

## Fallbacks
| Problem | Do this |
|---|---|
| Hotspot drops | The collector buffers locally and delivers on reconnect: say so, then show it catching up |
| No AI explanation shown yet | Wait ~5 s (it is async). If it says *rejected*, explain the grounding guard: we never show unverified AI text |
| Gemini quota/outage | The panel says "LLM unavailable"; the deterministic explanation and recommendations are complete on their own |
| Need a fresh incident quickly | `./scripts/demo.ps1 -Minutes 5 -Scenarios 's6@90'` (after closing the old windows) |
| Dashboard down | `ssh incendium 'systemctl restart aegis-saas'`; evidence screenshots are in `docs/judging/evidence/screenshots/` |

## Honest limits (if asked)
- Single SaaS instance: in-memory WebSocket hub, health and AIOps engines (K18, K30).
- The Gemini free tier has no data-processing agreement, so it is used only for ap-south and only with pseudonymous metadata.
- Not built yet: Phase 7–8 features (reliability proof, Privacy glass, Safe Action Simulator).
