"""Alerts, incidents, device notifications, LLM explanations (all tenant-scoped with RLS).

Revision ID: 0005_alerts_incidents
Revises: 0004_fast_ingest_and_health
Create Date: 2026-11-20
"""

from __future__ import annotations

from alembic import op
from saas_api.config import get_settings

revision = "0005_alerts_incidents"
down_revision = "0004_fast_ingest_and_health"
branch_labels = None
depends_on = None

TABLES = ("alerts", "incidents", "notifications", "llm_explanations")


def upgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(
        f"""
        CREATE TABLE {s}.incidents (
            tenant_id    uuid NOT NULL REFERENCES {s}.tenants (id),
            id           uuid NOT NULL,
            status       text NOT NULL CHECK (status IN ('open','resolved')),
            priority     text NOT NULL CHECK (priority IN ('P1','P2','P3')),
            score        double precision NOT NULL,
            title        text NOT NULL,
            root_entity  text,
            opened_at    timestamptz NOT NULL,
            updated_at   timestamptz NOT NULL,
            resolved_at  timestamptz,
            acked_at     timestamptz,
            acked_by     text,
            version      integer NOT NULL,
            explanation  jsonb NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE INDEX ix_incidents_open ON {s}.incidents (tenant_id, status, updated_at);

        CREATE TABLE {s}.alerts (
            tenant_id    uuid NOT NULL REFERENCES {s}.tenants (id),
            id           uuid NOT NULL,
            incident_id  uuid,
            entity_type  text NOT NULL,
            entity_id    text NOT NULL,
            collector_id text,
            metric       text NOT NULL,
            family       text NOT NULL,
            code         text NOT NULL,
            severity     text NOT NULL,
            category     text NOT NULL,
            status       text NOT NULL CHECK (status IN ('open','resolved')),
            onset        timestamptz NOT NULL,
            first_seen   timestamptz NOT NULL,
            last_seen    timestamptz NOT NULL,
            resolved_at  timestamptz,
            occurrences  integer NOT NULL,
            dedup_hits   integer NOT NULL,
            evidence     jsonb NOT NULL,
            PRIMARY KEY (tenant_id, id)
        );
        CREATE INDEX ix_alerts_incident ON {s}.alerts (tenant_id, incident_id);

        CREATE TABLE {s}.notifications (
            tenant_id        uuid NOT NULL REFERENCES {s}.tenants (id),
            id               uuid NOT NULL,
            collector_id     text NOT NULL,
            incident_id      uuid NOT NULL,
            incident_version integer NOT NULL,
            kind             text NOT NULL CHECK (kind IN ('incident','ai_explanation')),
            created_at       timestamptz NOT NULL,
            payload          jsonb NOT NULL,
            delivered_at     timestamptz,
            acked_at         timestamptz,
            PRIMARY KEY (tenant_id, id),
            UNIQUE (tenant_id, collector_id, incident_id, incident_version, kind)
        );
        CREATE INDEX ix_notifications_pending ON {s}.notifications (tenant_id, collector_id, acked_at);

        CREATE TABLE {s}.llm_explanations (
            tenant_id        uuid NOT NULL REFERENCES {s}.tenants (id),
            incident_id      uuid NOT NULL,
            incident_version integer NOT NULL,
            created_at       timestamptz NOT NULL,
            provider         text NOT NULL,
            model            text,
            status           text NOT NULL,
            prompt           jsonb NOT NULL,
            response         jsonb,
            grounding        jsonb NOT NULL,
            latency_ms       integer,
            PRIMARY KEY (tenant_id, incident_id, incident_version)
        );
        """
    )
    for t in TABLES:
        op.execute(f"ALTER TABLE {s}.{t} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {s}.{t} "
            f"USING (tenant_id = {s}.current_tenant()) WITH CHECK (tenant_id = {s}.current_tenant())"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE ON {s}.{t} TO aegis_app")
    op.execute(
        f"""
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA {s} FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    for t in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {s}.{t}")
