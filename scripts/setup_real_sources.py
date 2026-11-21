"""One-time setup for the diversified REAL sources on the collector machine.

1. Creates (or re-keys) a read-only role `aegis_reader` on the LOCAL PostgreSQL container with
   pg_monitor only (statistics views; no table data, no writes).
2. Appends the real-source settings to apps/collector/.env (append-only; existing lines are kept;
   a previous AEGIS_COL_POSTGRES_AGENT_DSN line is commented out, never deleted).

Refuses to run against a non-local database. Prints no secrets.
Usage: uv run python scripts/setup_real_sources.py
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
COL_ENV = ROOT / "apps" / "collector" / ".env"


def main() -> int:
    admin = next(
        (
            ln.split("=", 1)[1].strip()
            for ln in (ROOT / ".env").read_text(encoding="utf-8").splitlines()
            if ln.startswith("AEGIS_TEST_DB_ADMIN_URL=")
        ),
        None,
    )
    if not admin:
        sys.exit("AEGIS_TEST_DB_ADMIN_URL missing in .env (local docker Postgres)")
    host = urlsplit(admin).hostname
    if host not in ("127.0.0.1", "localhost", "::1"):
        sys.exit("refusing: the admin URL is not a local database")

    pw = secrets.token_urlsafe(24)
    import psycopg
    from psycopg import sql

    # DDL cannot take bound parameters: quote the password as a SQL literal (psycopg-escaped).
    try:
        with psycopg.connect(admin, autocommit=True) as c:
            exists = c.execute("SELECT 1 FROM pg_roles WHERE rolname = 'aegis_reader'").fetchone()
            verb = "ALTER" if exists else "CREATE"
            c.execute(
                sql.SQL(
                    "{} ROLE aegis_reader LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE"
                ).format(sql.SQL(verb), sql.Literal(pw))
            )
            c.execute("GRANT pg_monitor TO aegis_reader")
            c.execute("ALTER ROLE aegis_reader SET default_transaction_read_only = on")
    except psycopg.Error as exc:
        sys.exit(f"role setup failed: {type(exc).__name__} (details withheld: may contain secrets)")

    p = urlsplit(admin)
    dsn = urlunsplit(
        (p.scheme, f"aegis_reader:{pw}@{p.hostname}:{p.port or 5432}", "/postgres", "", "")
    )
    lines = COL_ENV.read_text(encoding="utf-8").splitlines() if COL_ENV.exists() else []
    lines = [
        ("# replaced by setup_real_sources.py: " + ln[:30] + "...")
        if ln.startswith("AEGIS_COL_POSTGRES_AGENT_DSN=")
        else ln
        for ln in lines
    ]
    add = {
        "AEGIS_COL_STORAGE_AGENT_ENABLED": "true",
        "AEGIS_COL_WEB_AGENT_URL": "http://127.0.0.1:9300/metrics",
    }
    keys = {ln.split("=", 1)[0] for ln in lines if "=" in ln and not ln.startswith("#")}
    out = lines + ["", "# Diversified REAL sources (scripts/setup_real_sources.py)"]
    out += [f"{k}={v}" for k, v in add.items() if k not in keys]
    out.append(f"AEGIS_COL_POSTGRES_AGENT_DSN={dsn}")
    COL_ENV.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(
        f"role aegis_reader {verb.lower()}d (pg_monitor, read-only); apps/collector/.env updated "
        "(storage + postgres + web readers enabled). No secrets printed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
