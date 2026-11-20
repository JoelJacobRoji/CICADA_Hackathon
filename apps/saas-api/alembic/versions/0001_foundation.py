"""Foundation: aegis_app role, private schema, tenants table with row-level security.

Revision ID: 0001_foundation
Revises:
Create Date: 2026-11-20

Notes
- Tables live in a dedicated schema (default ``aegis``), NOT ``public``, so Supabase's
  auto-generated Data API does not expose them.
- ``aegis_app`` is a LOGIN role without BYPASSRLS. Runtime queries use it, so RLS applies.
- RLS policy keys on ``app.tenant_id`` set per transaction; when unset, zero rows are visible.
"""

from __future__ import annotations

import re

from alembic import op
from saas_api.config import get_settings

revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None

_PW_OK = re.compile(r"^[A-Za-z0-9_-]{24,128}$")


def upgrade(region: str | None = None) -> None:
    settings = get_settings()
    schema = settings.db_schema
    pw_secret = settings.db_app_password
    if pw_secret is None or not _PW_OK.fullmatch(pw_secret.get_secret_value()):
        raise SystemExit("AEGIS_SAAS_DB_APP_PASSWORD missing or not [A-Za-z0-9_-]{24,128}")
    pw = pw_secret.get_secret_value()  # validated charset -> safe to inline in DDL

    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aegis_app') THEN
            CREATE ROLE aegis_app LOGIN NOINHERIT NOBYPASSRLS PASSWORD '{pw}';
          ELSE
            ALTER ROLE aegis_app LOGIN NOINHERIT NOBYPASSRLS PASSWORD '{pw}';
          END IF;
        END $$;
        """
    )
    op.execute(f"GRANT USAGE ON SCHEMA {schema} TO aegis_app")

    op.execute(
        f"""
        CREATE TABLE {schema}.tenants (
            id          uuid PRIMARY KEY,
            slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{{3,48}}$'),
            name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
            region      text NOT NULL CHECK (region IN ('ap-south', 'eu-west')),
            created_at  timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(f"ALTER TABLE {schema}.tenants ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON {schema}.tenants
          USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        """
    )
    op.execute(f"GRANT SELECT ON {schema}.tenants TO aegis_app")
    # Defence in depth on Supabase: make sure API roles have no access to this schema.
    op.execute(
        f"""
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON SCHEMA {schema} FROM %I', r);
              EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA {schema} FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade(region: str | None = None) -> None:
    schema = get_settings().db_schema
    op.execute(f"DROP TABLE IF EXISTS {schema}.tenants")
    # The role is intentionally kept (it may own grants in other schemas).
