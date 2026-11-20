# AEGIS — Known Issues and Risks

| ID | Issue | Impact | Mitigation | Status |
|---|---|---|---|---|
| K1 | Official organizer stream not yet supplied | M2 cannot be claimed | Simulator labelled SIMULATED; adapter interface ready for mapping | OPEN (BLOCKED on input) |
| K2 | Workspace inside OneDrive (sync paused) | If sync resumes, SQLite/node_modules corruption risk | Keep sync paused; DB files can be relocated via env var | OPEN (accepted) |
| K3 | Laptop free RAM ~3.4 GB at preflight | Swapping under load tests | Close apps; SaaS on VPS reduces local load | OPEN |
| K4 | Node v26 very new | Possible Vite/tooling incompatibility | `fnm use 22` fallback | OPEN |
| K5 | VPS capacity unknown, existing app co-hosted | Resource contention, port conflicts | Await VPS facts; isolated Compose project; local fallback | OPEN |
| K6 | Mobile hotspot | Variable latency affects T1/T2 | Measure and report honestly; aggregation keeps request rate low | OPEN |
| K7 | Two regions on one VPS | Residency is logical only | Documented limitation | ACCEPTED |
