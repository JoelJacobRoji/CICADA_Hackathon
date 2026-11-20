"""Alembic environment: migrates ONE region per invocation using that region's owner URL."""

from __future__ import annotations

from alembic import context
from saas_api.config import REGIONS, get_settings
from saas_api.db import build_engine
from sqlalchemy import text

settings = get_settings()
region = context.get_x_argument(as_dictionary=True).get("region")
if region not in REGIONS:
    raise SystemExit(f"pass -x region=<{'|'.join(REGIONS)}>")

SCHEMA = settings.db_schema


def run_migrations_online() -> None:
    engine = build_engine(settings.owner_url(region))
    with engine.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        connection.commit()
        context.configure(
            connection=connection,
            version_table_schema=SCHEMA,
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations(region=region)


if context.is_offline_mode():
    raise SystemExit("offline mode is not supported")
run_migrations_online()
