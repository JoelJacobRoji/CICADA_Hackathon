"""Tighten function grants: no PUBLIC EXECUTE on any aegis function.

Revision ID: 0003_tighten_function_grants
Revises: 0002_ingest_tenancy
Create Date: 2026-11-20

Found during Phase 4 Supabase verification: current_tenant() kept PostgreSQL's default PUBLIC
EXECUTE grant (so Supabase's anon/authenticated roles technically held EXECUTE). It was not
reachable (those roles have no USAGE on the schema) and not SECURITY DEFINER, but least
privilege says only the roles that need it get it.
"""

from __future__ import annotations

from alembic import op
from saas_api.config import get_settings

revision = "0003_tighten_function_grants"
down_revision = "0002_ingest_tenancy"
branch_labels = None
depends_on = None


def upgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(f"REVOKE ALL ON FUNCTION {s}.current_tenant() FROM PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION {s}.current_tenant() TO aegis_app")
    # Future functions created by the owner in this schema: no implicit PUBLIC EXECUTE.
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {s} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC")


def downgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA {s} GRANT EXECUTE ON FUNCTIONS TO PUBLIC")
    op.execute(f"GRANT EXECUTE ON FUNCTION {s}.current_tenant() TO PUBLIC")
