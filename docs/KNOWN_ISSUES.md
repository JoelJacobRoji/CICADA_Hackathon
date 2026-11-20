# AEGIS — Known Issues and Risks

| ID | Issue | Impact | Mitigation | Status |
|---|---|---|---|---|
| K1 | Official organizer stream not yet supplied | M2 cannot be claimed | Simulator labelled SIMULATED; adapter interface ready for mapping | OPEN (BLOCKED on input) |
| K2 | Workspace inside OneDrive (sync paused) | If sync resumes, SQLite/node_modules corruption risk | Keep sync paused; DB files can be relocated via env var | OPEN (accepted) |
| K3 | Laptop free RAM ~3.4 GB at preflight | Swapping under load tests | Close apps; SaaS on VPS reduces local load | OPEN |
| K4 | Node v26 very new | Possible Vite/tooling incompatibility | `fnm use 22` fallback | OPEN |
| K5 | VPS co-hosts an existing app (nginx default_server on 80/443 → gunicorn 127.0.0.1:5000, Let's Encrypt IP cert `incendium-ip`) | Port 80/443 shared; any nginx change could affect that app | AEGIS gets its own nginx server block on a separate hostname (sslip.io) + its own cert; containers bind 127.0.0.1 only; `nginx -t` before every reload; backup of nginx config first | OPEN (needs approval) |
| K8 | Docker not installed on VPS; Docker published ports bypass ufw | Exposure risk if ports bound to 0.0.0.0 | Bind every container port to 127.0.0.1; only nginx faces the internet | OPEN |
| K6 | Mobile hotspot | Variable latency affects T1/T2 | Measure and report honestly; aggregation keeps request rate low | OPEN |
| K7 | Regional residency | With Supabase (ADR-18) each region is a separate project in a separate cloud region: physically separate. The local docker fallback is logical only. | Use the 2 Supabase projects for the demo | MITIGATED (pending Supabase setup) |
| K9 | Starlette deprecation warning: TestClient with httpx | test noise only | revisit when FastAPI/Starlette settle; pin if it breaks | OPEN (low) |
| K10 | npm 11 `allowScripts` skipped esbuild postinstall | none observed (build + tests pass) | `npm install-scripts approve esbuild` if a build ever fails | OPEN (low) |
| K11 | Connected Chrome ('Browser 1') cannot reach laptop localhost | no automated visual checks yet | try 'Browser 2' or run Playwright locally in Phase 9 | OPEN |
| K12 | Supabase free tier pauses projects after inactivity; 500 MB limit | demo outage risk | keep projects active; local Postgres fallback | OPEN |
| K13 | Secret fingerprints are in-memory: after a collector restart, previously seen secrets are no longer fingerprinted | Narrower defence in depth after restart (schema + pattern layers still apply) | Acceptable for prototype; production: persist keyed hashes (HMAC) | ACCEPTED |
| K14 | Simulator pacing bug (sent ~30% above requested rate) found and fixed during the Phase 3 live run | First run's rate was wrong; rerun reported instead | Fixed: time-metered pacing | RESOLVED |
| K15 | Scrubber is regex-based; novel secret formats may be missed in the display copy | Display only; egress protected by schema + canary | Extend patterns as needed | ACCEPTED |
| K16 | GitHub Actions `python` job failed on push of 31a2d37: integration-test fixture loaded full SaaS settings (needing DB URLs only present in local .env) before setting test URLs | CI red; product code unaffected | Fixture now sets placeholder URLs before reading the app password. Verified: old fixture reproduces CI failure (2 errors) and new fixture passes (2/2) under a CI simulation with .env loading disabled; full suite 99/99 both with and without .env | RESOLVED (uncommitted) |
