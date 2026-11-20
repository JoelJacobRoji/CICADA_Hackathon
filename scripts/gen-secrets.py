"""Generate local, git-ignored .env files with random secrets. Never prints secret values.

Usage:  uv run python scripts/gen-secrets.py [--force]
Existing files are left untouched unless --force is given.
"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def tok(n: int = 32) -> str:
    return secrets.token_urlsafe(n).replace("-", "_")


def write(path: Path, content: str, force: bool) -> None:
    if path.exists() and not force:
        print(f"kept     {path.relative_to(ROOT)} (exists)")
        return
    path.write_text(content, encoding="utf-8", newline="\n")
    print(f"written  {path.relative_to(ROOT)}")


def ensure_keys(path: Path, keys: dict[str, str]) -> None:
    """Append missing keys to an existing .env without touching existing values."""
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    present = {line.split("=", 1)[0] for line in text.splitlines() if "=" in line}
    missing = {k: v for k, v in keys.items() if k not in present}
    if missing:
        add = "".join(f"{k}={v}\n" for k, v in missing.items())
        sep = "" if text.endswith("\n") else "\n"
        path.write_text(text + sep + add, encoding="utf-8", newline="\n")
        print(f"added    {', '.join(missing)} to {path.relative_to(ROOT)}")


def main() -> None:
    force = "--force" in sys.argv
    root_env = ROOT / ".env"
    pg_pw = tok()
    app_pw = tok()
    if root_env.exists() and not force:
        # Reuse existing values so the three files stay consistent.
        vals = dict(
            line.split("=", 1)
            for line in root_env.read_text(encoding="utf-8").splitlines()
            if "=" in line and not line.startswith("#")
        )
        pg_pw = vals.get("POSTGRES_PASSWORD", pg_pw)
        app_pw = vals.get("AEGIS_DB_APP_PASSWORD", app_pw)

    write(
        root_env,
        "# Local docker Postgres (docker-compose.dev.yml). Git-ignored.\n"
        f"POSTGRES_PASSWORD={pg_pw}\n"
        f"AEGIS_DB_APP_PASSWORD={app_pw}\n"
        f"AEGIS_TEST_DB_ADMIN_URL=postgresql://postgres:{pg_pw}@127.0.0.1:55432/postgres\n",
        force,
    )

    local = "postgresql://{user}:{pw}@127.0.0.1:55432/{db}"
    owner_ap = local.format(user="postgres", pw=pg_pw, db="aegis_ap_south")
    owner_eu = local.format(user="postgres", pw=pg_pw, db="aegis_eu_west")
    app_ap = local.format(user="aegis_app", pw=app_pw, db="aegis_ap_south")
    app_eu = local.format(user="aegis_app", pw=app_pw, db="aegis_eu_west")
    write(
        ROOT / "apps" / "saas-api" / ".env",
        "# AEGIS SaaS - LOCAL docker Postgres.\n"
        "# For Supabase, replace the four URLs (see .env.example).\n"
        "AEGIS_SAAS_ENV=dev\n"
        f"AEGIS_SAAS_DB_APP_PASSWORD={app_pw}\n"
        f"AEGIS_SAAS_DB_OWNER_URL_AP_SOUTH={owner_ap}\n"
        f"AEGIS_SAAS_DB_OWNER_URL_EU_WEST={owner_eu}\n"
        f"AEGIS_SAAS_DB_APP_URL_AP_SOUTH={app_ap}\n"
        f"AEGIS_SAAS_DB_APP_URL_EU_WEST={app_eu}\n"
        f"AEGIS_SAAS_JWT_SIGNING_KEY={tok(48)}\n",
        force,
    )

    write(
        ROOT / "apps" / "collector" / ".env",
        "# AEGIS collector (local tier). Git-ignored.\n"
        "AEGIS_COL_COLLECTOR_ID=col_dev_01\n"
        "AEGIS_COL_REGION=ap-south\n"
        "AEGIS_COL_SAAS_BASE_URL=http://127.0.0.1:9001\n"
        f"AEGIS_COL_LOCAL_ADMIN_TOKEN={tok()}\n"
        f"AEGIS_COL_PSEUDONYM_SECRET={tok()}\n"
        f"AEGIS_COL_INGEST_TOKEN={tok()}\n",
        force,
    )
    ensure_keys(ROOT / "apps" / "collector" / ".env", {"AEGIS_COL_INGEST_TOKEN": tok()})


if __name__ == "__main__":
    main()
