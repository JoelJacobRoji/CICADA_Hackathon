"""Fast ingest (one round trip per batch) + health state tables.

Revision ID: 0004_fast_ingest_and_health
Revises: 0003_tighten_function_grants
Create Date: 2026-11-20

- aegis.ingest_batch(...): SECURITY INVOKER plpgsql. Runs AS aegis_app, so RLS still applies.
  It sets app.tenant_id (transaction-local) from the server-side authenticated tenant, inserts
  all items with ON CONFLICT DO NOTHING, writes the receipt, and returns the accepted payload IDs.
  One statement in autocommit = one atomic transaction = one network round trip (K22).
- aegis.list_tenants(): SECURITY DEFINER, returns tenant ids/slugs only, so the health sweeper can
  load state for every tenant in a region at startup (identity data only, like 0002's functions).
- health_current / health_transitions: RLS by tenant_id. Transitions are append-only for the app.
"""

from __future__ import annotations

from alembic import op
from saas_api.config import get_settings

revision = "0004_fast_ingest_and_health"
down_revision = "0003_tighten_function_grants"
branch_labels = None
depends_on = None


def upgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(
        f"""
        CREATE FUNCTION {s}.ingest_batch(
            p_tenant uuid, p_collector text, p_batch uuid, p_body_sha text, p_rejected integer,
            p_metrics jsonb, p_security jsonb, p_edges jsonb)
        RETURNS uuid[]
        LANGUAGE plpgsql SECURITY INVOKER SET search_path = {s}, pg_temp AS
        $$
        DECLARE
          acc uuid[] := '{{}}';
          ids uuid[];
          total integer;
        BEGIN
          PERFORM set_config('app.tenant_id', p_tenant::text, true);

          WITH ins AS (
            INSERT INTO metric_summaries
            SELECT * FROM jsonb_populate_recordset(NULL::metric_summaries, p_metrics)
            ON CONFLICT (tenant_id, payload_id) DO NOTHING
            RETURNING payload_id)
          SELECT coalesce(array_agg(payload_id), '{{}}') INTO ids FROM ins;
          acc := acc || ids;

          WITH ins AS (
            INSERT INTO security_summaries
            SELECT * FROM jsonb_populate_recordset(NULL::security_summaries, p_security)
            ON CONFLICT (tenant_id, payload_id) DO NOTHING
            RETURNING payload_id)
          SELECT coalesce(array_agg(payload_id), '{{}}') INTO ids FROM ins;
          acc := acc || ids;

          WITH ins AS (
            INSERT INTO topology_edges
            SELECT * FROM jsonb_populate_recordset(NULL::topology_edges, p_edges)
            ON CONFLICT (tenant_id, payload_id) DO NOTHING
            RETURNING payload_id)
          SELECT coalesce(array_agg(payload_id), '{{}}') INTO ids FROM ins;
          acc := acc || ids;

          total := jsonb_array_length(p_metrics) + jsonb_array_length(p_security)
                   + jsonb_array_length(p_edges);
          INSERT INTO ingest_receipts
                 (tenant_id, collector_id, batch_id, body_sha256, accepted, duplicate, rejected)
          VALUES (p_tenant, p_collector, p_batch, p_body_sha,
                  cardinality(acc), total - cardinality(acc), p_rejected);
          RETURN acc;
        END
        $$;
        REVOKE ALL ON FUNCTION {s}.ingest_batch(uuid, text, uuid, text, integer, jsonb, jsonb, jsonb)
          FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION {s}.ingest_batch(uuid, text, uuid, text, integer, jsonb, jsonb, jsonb)
          TO aegis_app;

        CREATE FUNCTION {s}.list_tenants()
        RETURNS TABLE (tenant_id uuid, slug text, region text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = {s}, pg_temp AS
        $$ SELECT id, slug, region FROM {s}.tenants $$;
        REVOKE ALL ON FUNCTION {s}.list_tenants() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION {s}.list_tenants() TO aegis_app;

        CREATE TABLE {s}.health_current (
            tenant_id       uuid NOT NULL REFERENCES {s}.tenants (id),
            entity_type     text NOT NULL CHECK (entity_type IN ('source','collector','tenant')),
            entity_id       text NOT NULL,
            state           text NOT NULL CHECK (state IN ('Excellent','Good','Fair','Poor')),
            reasons         jsonb NOT NULL DEFAULT '[]'::jsonb,
            since           timestamptz NOT NULL,
            updated_at      timestamptz NOT NULL,
            last_event_time timestamptz,
            PRIMARY KEY (tenant_id, entity_type, entity_id)
        );

        CREATE TABLE {s}.health_transitions (
            id          bigserial PRIMARY KEY,
            tenant_id   uuid NOT NULL REFERENCES {s}.tenants (id),
            entity_type text NOT NULL,
            entity_id   text NOT NULL,
            from_state  text,
            to_state    text NOT NULL,
            at_utc      timestamptz NOT NULL,
            event_time  timestamptz,
            reasons     jsonb NOT NULL DEFAULT '[]'::jsonb
        );
        CREATE INDEX ix_ht_entity ON {s}.health_transitions (tenant_id, entity_type, entity_id, at_utc);
        CREATE INDEX ix_ht_time ON {s}.health_transitions (tenant_id, at_utc);
        """
    )
    for t in ("health_current", "health_transitions"):
        op.execute(f"ALTER TABLE {s}.{t} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {s}.{t} "
            f"USING (tenant_id = {s}.current_tenant()) "
            f"WITH CHECK (tenant_id = {s}.current_tenant())"
        )
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON {s}.health_current TO aegis_app")
    op.execute(f"GRANT SELECT, INSERT ON {s}.health_transitions TO aegis_app")
    op.execute(f"GRANT USAGE ON ALL SEQUENCES IN SCHEMA {s} TO aegis_app")
    op.execute(
        f"""
        DO $$
        DECLARE r text;
        BEGIN
          FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
              EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA {s} FROM %I', r);
              EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA {s} FROM %I', r);
              EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA {s} FROM %I', r);
            END IF;
          END LOOP;
        END $$;
        """
    )


def downgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(f"DROP TABLE IF EXISTS {s}.health_transitions")
    op.execute(f"DROP TABLE IF EXISTS {s}.health_current")
    op.execute(f"DROP FUNCTION IF EXISTS {s}.list_tenants()")
    op.execute(
        f"DROP FUNCTION IF EXISTS {s}.ingest_batch(uuid, text, uuid, text, integer, jsonb, jsonb, jsonb)"
    )
