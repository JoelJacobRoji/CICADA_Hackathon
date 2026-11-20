"""Phase 9: live security validation against the DEPLOYED system (read-mostly). Prints no secrets.

Checks transport security, browser hardening, authentication, access control, tenant isolation,
residency, WebSocket origin enforcement, bundle hygiene and database policies (both regions).
The only writes: login attempts (incl. a rate-limit probe with a NON-EXISTENT email, so no real
account is ever locked) and nothing else.

Usage (from apps/saas-api): uv run python ../../scripts/validate_security.py [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

import httpx
from saas_api.db import owner_connection
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
URL = "https://aegis.162-35-42-114.sslip.io"
results: list[dict] = []


def check(cid: str, name: str, ok: bool, detail: str = "") -> None:
    results.append({"id": cid, "check": name, "pass": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {cid:6} {name}" + (f"  ({detail})" if detail else ""))


def operator(slug: str) -> tuple[str, str]:
    last = None
    for line in (
        (ROOT / "apps/saas-api/.demo-operators.local").read_text(encoding="utf-8").splitlines()
    ):
        p = line.split("\t")
        if len(p) == 4 and p[0] == slug and p[1] == "tenant_operator":
            last = (p[2], p[3])
    if last is None:
        sys.exit(f"no operator for {slug}")
    return last


def collector_token(envfile: str) -> str:
    for line in (ROOT / "apps/collector" / envfile).read_text(encoding="utf-8").splitlines():
        if line.startswith("AEGIS_COL_COLLECTOR_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"no collector token in {envfile}")


def login(c: httpx.Client, slug: str) -> httpx.Response:
    email, pw = operator(slug)
    return c.post("/api/v1/auth/login", json={"email": email, "password": pw})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()

    # ---------------------------------------------------------------- transport + browser hardening
    with httpx.Client(timeout=15) as raw:
        r = raw.get(URL.replace("https://", "http://") + "/", follow_redirects=False)
        check(
            "T1",
            "plain HTTP redirects to HTTPS",
            r.status_code in (301, 308) and r.headers.get("location", "").startswith("https://"),
            f"HTTP {r.status_code}",
        )
    with httpx.Client(base_url=URL, timeout=15) as c:
        for path in ("/", "/api/v1/health/summary"):
            h = c.get(path).headers
            hsts = h.get("strict-transport-security", "")
            check("T2", f"HSTS on {path}", "max-age=" in hsts, hsts[:40])
            check(
                "B1",
                f"CSP self-only on {path}",
                "default-src 'self'" in h.get("content-security-policy", ""),
            )
            check(
                "B2",
                f"X-Frame-Options DENY on {path}",
                h.get("x-frame-options", "").upper() == "DENY",
            )
            check("B3", f"nosniff on {path}", h.get("x-content-type-options", "") == "nosniff")
            check("B4", f"Referrer-Policy on {path}", bool(h.get("referrer-policy")))

        # ------------------------------------------------------------ authentication
        for path in (
            "/api/v1/incidents",
            "/api/v1/metrics",
            "/api/v1/health/summary",
            "/api/v1/aiops/summary",
            "/api/v1/security-events",
        ):
            check("A1", f"unauthenticated {path} -> 401", c.get(path).status_code == 401)
        email, _ = operator("initech")
        wrong = c.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-" + uuid.uuid4().hex}
        )
        unknown = c.post(
            "/api/v1/auth/login",
            json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com", "password": "x" * 12},
        )
        check(
            "A2",
            "wrong password and unknown user give identical errors (no enumeration)",
            wrong.status_code == unknown.status_code == 401 and wrong.json() == unknown.json(),
            f"{wrong.status_code}/{unknown.status_code}",
        )
        probe = f"ratelimit-probe-{uuid.uuid4().hex[:8]}@example.com"  # never a real account
        codes = [
            c.post("/api/v1/auth/login", json={"email": probe, "password": "x" * 12}).status_code
            for _ in range(7)
        ]
        check("A3", "login rate limit (5/min per email+IP) returns 429", 429 in codes, str(codes))

    with httpx.Client(base_url=URL, timeout=15) as ini:
        r = login(ini, "initech")
        check("A4", "operator login succeeds", r.status_code == 200)
        sc = r.headers.get("set-cookie", "")
        check(
            "A5",
            "session cookie is HttpOnly + Secure + SameSite=Strict",
            all(x.lower() in sc.lower() for x in ("httponly", "secure", "samesite=strict")),
        )
        check(
            "A6", "session token not returned in the response body", "token" not in r.text.lower()
        )

        # ------------------------------------------------------------ tenant isolation
        with httpx.Client(base_url=URL, timeout=15) as acme:
            login(acme, "acme")
            acme_incs = acme.get("/api/v1/incidents?limit=5").json()
            check(
                "I0",
                "acme operator sees its incidents",
                len(acme_incs) > 0,
                f"{len(acme_incs)} incidents",
            )
            ini_incs = ini.get("/api/v1/incidents?limit=500").json()
            check(
                "I1",
                "initech sees none of acme's incidents",
                not ({i["id"] for i in acme_incs} & {i["id"] for i in ini_incs}),
            )
            if acme_incs:
                iid = acme_incs[0]["id"]
                check(
                    "I2",
                    "initech GET acme incident -> 404 (no existence leak)",
                    ini.get(f"/api/v1/incidents/{iid}").status_code == 404,
                )
                check(
                    "I3",
                    "initech cannot acknowledge acme incident",
                    ini.post(f"/api/v1/incidents/{iid}/ack").status_code == 404,
                )
            check(
                "I4",
                "initech metrics contain no acme collector",
                all(
                    m.get("collector_id") != "col_acme_01"
                    for m in ini.get("/api/v1/metrics?minutes=60").json()
                ),
            )
            # WebSocket origin enforcement (cookie from a real session, hostile Origin)
            try:
                from websockets.sync.client import connect

                cookie = "; ".join(f"{k}={v}" for k, v in acme.cookies.items())
                rejected = False
                try:
                    with connect(
                        URL.replace("https", "wss") + "/api/v1/ws",
                        additional_headers={"Origin": "https://evil.example", "Cookie": cookie},
                        open_timeout=10,
                    ) as ws:
                        ws.recv(timeout=5)
                except Exception:  # noqa: BLE001 - handshake refused or closed = rejected
                    rejected = True
                check("W1", "WebSocket with a foreign Origin is rejected", rejected)
                with connect(
                    URL.replace("https", "wss") + "/api/v1/ws",
                    additional_headers={"Origin": URL, "Cookie": cookie},
                    open_timeout=10,
                ) as ws:
                    hello = json.loads(ws.recv(timeout=10))
                check(
                    "W2",
                    "WebSocket with own Origin + session works (tenant from session)",
                    hello.get("type") == "hello" and hello.get("tenant") == "acme",
                )
                noauth, how = False, "accepted"
                try:
                    with connect(
                        URL.replace("https", "wss") + "/api/v1/ws",
                        additional_headers={"Origin": URL},
                        open_timeout=10,
                    ) as ws:
                        ws.recv(timeout=5)
                except Exception as exc:  # noqa: BLE001 - refused at handshake or closed = rejected
                    noauth, how = True, type(exc).__name__
                check("W3", "WebSocket without a session is rejected", noauth, how)
            except ImportError:
                check("W0", "websockets library available", False)

    # ---------------------------------------------------------------- collector credentials + residency
    acme_tok = collector_token(".env")
    globex_tok = collector_token(".env.globex")
    with httpx.Client(base_url=URL, timeout=15) as c:
        h = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731
        check(
            "C1",
            "collector endpoint without token -> 401",
            c.get("/api/v1/notifications/ap-south").status_code == 401,
        )
        check(
            "C2",
            "collector endpoint with a forged token -> 401",
            c.get("/api/v1/notifications/ap-south", headers=h("x" * 43)).status_code == 401,
        )
        check(
            "C3",
            "acme token works in its own region",
            c.get("/api/v1/notifications/ap-south", headers=h(acme_tok)).status_code == 200,
        )
        check(
            "R1",
            "acme (Mumbai) token rejected in eu-west (residency)",
            c.get("/api/v1/notifications/eu-west", headers=h(acme_tok)).status_code == 401,
        )
        check(
            "R2",
            "globex (Frankfurt) token rejected in ap-south (residency)",
            c.get("/api/v1/notifications/ap-south", headers=h(globex_tok)).status_code == 401,
        )
        check(
            "C4",
            "collector token cannot read operator APIs",
            c.get("/api/v1/incidents", headers=h(acme_tok)).status_code == 401,
        )

        # ------------------------------------------------------------ bundle hygiene
        html = c.get("/").text
        js = "".join(c.get(src).text for src in re.findall(r'src="(/assets/[^"]+\.js)"', html))
        pats = {
            "google api key": r"AIza[0-9A-Za-z_-]{20,}",
            "jwt": r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.",
            "db url": r"postgres(ql)?://",
            "gemini": r"(?i)gemini_api_key",
            "private key": r"BEGIN [A-Z ]*PRIVATE KEY",
        }
        found = [k for k, p in pats.items() if re.search(p, html + js)]
        check(
            "S1",
            "dashboard bundle contains no keys, tokens or DB URLs",
            not found and len(js) > 1000,
            f"{len(js)} bytes scanned" + (f"; found {found}" if found else ""),
        )

    # ---------------------------------------------------------------- database policy (both regions)
    for region in ("ap-south", "eu-west"):
        with owner_connection(region) as c:
            norls = (
                c.execute(
                    text(
                        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = 'aegis' AND c.relkind = 'r' AND NOT c.relrowsecurity "
                        "AND c.relname NOT IN ('alembic_version')"
                    )
                )
                .scalars()
                .all()
            )
            check(
                "D1",
                f"{region}: row-level security on every aegis table",
                not norls,
                f"without RLS: {norls}",
            )
            bypass = c.execute(
                text("SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'aegis_app'")
            ).scalar()
            check(
                "D2", f"{region}: app role cannot bypass RLS and is not superuser", bypass is False
            )
            pub = c.execute(
                text(
                    "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'aegis' "
                    "AND grantee IN ('anon', 'authenticated', 'PUBLIC')"
                )
            ).scalar()
            check(
                "D3",
                f"{region}: no table grants to anon/authenticated/PUBLIC",
                pub == 0,
                f"{pub} grants",
            )
            dels = c.execute(
                text(
                    "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'aegis' "
                    "AND grantee = 'aegis_app' AND privilege_type IN ('DELETE', 'TRUNCATE') "
                    "AND table_name IN ('audit_log','incidents','alerts','notifications','llm_explanations')"
                )
            ).scalar()
            check("D4", f"{region}: app cannot delete audit log / incident history", dels == 0)
            plain = c.execute(
                text("SELECT count(*) FROM collectors WHERE token_hash !~ '^[0-9a-f]{64}$'")
            ).scalar()
            check("D5", f"{region}: collector tokens stored only as SHA-256", plain == 0)
            pw = c.execute(
                text("SELECT count(*) FROM users WHERE pw_hash NOT LIKE '$argon2id$%'")
            ).scalar()
            check("D6", f"{region}: passwords stored only as argon2id", pw == 0)
            if region == "eu-west":
                sent = c.execute(
                    text(
                        "SELECT count(*) FROM llm_explanations WHERE status NOT IN "
                        "('disabled_by_policy', 'disabled')"
                    )
                ).scalar()
                total = c.execute(text("SELECT count(*) FROM llm_explanations")).scalar()
                check(
                    "R3",
                    "eu-west: no incident was ever sent to the external LLM",
                    sent == 0,
                    f"{total} eu-west explanation records, {sent} sent",
                )

    n_fail = sum(not r["pass"] for r in results)
    print(f"\n{len(results) - n_fail}/{len(results)} checks passed")
    if a.json:
        a.json.write_text(
            json.dumps(
                {
                    "target": URL,
                    "label": "TESTED (live production)",
                    "passed": len(results) - n_fail,
                    "total": len(results),
                    "results": results,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    sys.exit(1 if n_fail else 0)


if __name__ == "__main__":
    main()
