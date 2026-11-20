"""Ingest + tenancy: collectors, users, ingest tables, heartbeats, receipts, audit; RLS everywhere.

Revision ID: 0002_ingest_tenancy
Revises: 0001_foundation
Create Date: 2026-11-20

Security notes
- Every table carries tenant_id and has RLS: USING/WITH CHECK tenant_id = aegis.current_tenant().
- aegis_app gets SELECT/INSERT/UPDATE only (no DELETE). Registration is done by the owner (admin CLI).
- Two SECURITY DEFINER functions are the ONLY way to resolve identity before a tenant is known:
  authenticate_collector(token_hash) and lookup_login(email). They return identity fields only.
"""

from __future__ import annotations

from alembic import op
from saas_api.config import get_settings

revision = "0002_ingest_tenancy"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None

TENANT_TABLES = (
    "collectors",
    "users",
    "metric_summaries",
    "security_summaries",
    "topology_edges",
    "heartbeats",
    "ingest_receipts",
    "audit_log",
)


def upgrade(region: str | None = None) -> None:
    s = get_settings().db_schema
    op.execute(
        f"""
        CREATE FUNCTION {s}.current_tenant() RETURNS uuid
        LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$
        """
    )

    op.execute(
        f"""
        CREATE TABLE {s}.collectors (
            id                   text PRIMARY KEY CHECK (id ~ '^col_[a-z0-9_-]{{3,48}}$'),
            tenant_id            uuid NOT NULL REFERENCES {s}.tenants (id),
            region               text NOT NULL,
            token_hash           text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{{64}}$'),
            status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
            created_at           timestamptz NOT NULL DEFAULT now(),
            last_seen_at         timestamptz,
            last_heartbeat_sent  timestamptz,
            collector_version    text,
            uptime_s             double precision,
            cpu_percent          double precision,
            memory_mb            double precision,
            outbox_depth         integer,
            oldest_pending_age_s double precision,
            config_hash          text,
            adapters             jsonb
        );
        CREATE INDEX ix_collectors_tenant ON {s}.collectors (tenant_id);

        CREATE TABLE {s}.users (
            id            uuid PRIMARY KEY,
            tenant_id     uuid NOT NULL REFERENCES {s}.tenants (id),
            email         text NOT NULL UNIQUE CHECK (email = lower(email)),
            pw_hash       text NOT NULL,
            role          text NOT NULL CHECK (role IN ('tenant_admin','tenant_operator','tenant_viewer')),
            created_at    timestamptz NOT NULL DEFAULT now(),
            last_login_at timestamptz
        );

        CREATE TABLE {s}.metric_summaries (
            tenant_id        uuid NOT NULL REFERENCES {s}.tenants (id),
            payload_id       uuid NOT NULL,
            collector_id     text NOT NULL,
            source_pid       text NOT NULL,
            source_kind      text NOT NULL,
            metric           text NOT NULL,
            unit             text NOT NULL,
            category         text NOT NULL,
            window_start     timestamptz NOT NULL,
            window_end       timestamptz NOT NULL,
            source_timezone  text NOT NULL,
            count            integer NOT NULL,
            min              double precision NOT NULL,
            max              double precision NOT NULL,
            mean             double precision NOT NULL,
            last             double precision NOT NULL,
            p95              double precision NOT NULL,
            severity         text NOT NULL,
            local_health     text NOT NULL,
            anomaly          jsonb,
            summary_code     text NOT NULL,
            first_event_ts   timestamptz NOT NULL,
            collector_seq    bigint NOT NULL,
            received_at      timestamptz NOT NULL DEFAULT now(),
            late             boolean NOT NULL DEFAULT false,
            payload_sha256   text NOT NULL,
            PRIMARY KEY (tenant_id, payload_id)
        );
        CREATE INDEX ix_metric_series ON {s}.metric_summaries (tenant_id, source_pid, metric, window_end);
        CREATE INDEX ix_metric_window ON {s}.metric_summaries (tenant_id, window_end);

        CREATE TABLE {s}.security_summaries (
            tenant_id           uuid NOT NULL REFERENCES {s}.tenants (id),
            payload_id          uuid NOT NULL,
            collector_id        text NOT NULL,
            source_pid          text NOT NULL,
            window_start        timestamptz NOT NULL,
            window_end          timestamptz NOT NULL,
            source_timezone     text NOT NULL,
            summary_code        text NOT NULL,
            failure_count       integer NOT NULL,
            distinct_user_count integer NOT NULL,
            distinct_src_count  integer NOT NULL,
            severity            text NOT NULL,
            local_health        text NOT NULL,
            risk_level          text NOT NULL,
            collector_seq       bigint NOT NULL,
            received_at         timestamptz NOT NULL DEFAULT now(),
            late                boolean NOT NULL DEFAULT false,
            payload_sha256      text NOT NULL,
            PRIMARY KEY (tenant_id, payload_id)
        );
        CREATE INDEX ix_security_window ON {s}.security_summaries (tenant_id, window_end);

        CREATE TABLE {s}.topology_edges (
            tenant_id      uuid NOT NULL REFERENCES {s}.tenants (id),
            payload_id     uuid NOT NULL,
            collector_id   text NOT NULL,
            from_pid       text NOT NULL,
            to_pid         text NOT NULL,
            relation       text NOT NULL,
            received_at    timestamptz NOT NULL DEFAULT now(),
            payload_sha256 text NOT NULL,
            PRIMARY KEY (tenant_id, payload_id)
        );

        CREATE TABLE {s}.heartbeats (
            tenant_id            uuid NOT NULL REFERENCES {s}.tenants (id),
            collector_id         text NOT NULL,
            sent_at              timestamptz NOT NULL,
            received_at          timestamptz NOT NULL DEFAULT now(),
            outbox_depth         integer NOT NULL,
            oldest_pending_age_s double precision NOT NULL,
            cpu_percent          double precision NOT NULL,
            memory_mb            double precision NOT NULL,
            PRIMARY KEY (tenant_id, collector_id, sent_at)
        );

        CREATE TABLE {s}.ingest_receipts (
            id           bigserial PRIMARY KEY,
            tenant_id    uuid NOT NULL REFERENCES {s}.tenants (id),
            collector_id text NOT NULL,
            batch_id     uuid NOT NULL,
            received_at  timestamptz NOT NULL DEFAULT now(),
            body_sha256  text NOT NULL,
            accepted     integer NOT NULL,
            duplicate    integer NOT NULL,
            rejected     integer NOT NULL
        );
        CREATE INDEX ix_receipts_tenant ON {s}.ingest_receipts (tenant_id, received_at);

        CREATE TABLE {s}.audit_log (
            id        bigserial PRIMARY KEY,
            tenant_id uuid NOT NULL REFERENCES {s}.tenants (id),
            at        timestamptz NOT NULL DEFAULT now(),
            actor     text NOT NULL,
            action    text NOT NULL,
            target    text,
            detail    jsonb NOT NULL DEFAULT '{{}}'::jsonb
        );
        CREATE INDEX ix_audit_tenant ON {s}.audit_log (tenant_id, at);
        """
    )

    for t in TENANT_TABLES:
        op.execute(f"ALTER TABLE {s}.{t} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {s}.{t} "
            f"USING (tenant_id = {s}.current_tenant()) "
            f"WITH CHECK (tenant_id = {s}.current_tenant())"
        )

    # Least privilege for the runtime role (no DELETE anywhere; no writes to users/tenants).
    op.execute(
        f"GRANT SELECT, INSERT ON {s}.metric_summaries, {s}.security_summaries, "
        f"{s}.topology_edges, {s}.heartbeats, {s}.ingest_receipts, {s}.audit_log TO aegis_app"
    )
    op.execute(f"GRANT SELECT, UPDATE ON {s}.collectors TO aegis_app")
    op.execute(f"GRANT SELECT, UPDATE (last_login_at) ON {s}.users TO aegis_app")
    op.execute(f"GRANT USAGE ON ALL SEQUENCES IN SCHEMA {s} TO aegis_app")
    op.execute(f"GRANT EXECUTE ON FUNCTION {s}.current_tenant() TO aegis_app")

    # Identity resolution before a tenant context exists. SECURITY DEFINER + pinned search_path.
    op.execute(
        f"""
        CREATE FUNCTION {s}.authenticate_collector(p_token_hash text)
        RETURNS TABLE (collector_id text, tenant_id uuid, region text, status text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = {s}, pg_temp AS
        $$ SELECT c.id, c.tenant_id, c.region, c.status
             FROM {s}.collectors c WHERE c.token_hash = p_token_hash $$;

        CREATE FUNCTION {s}.lookup_login(p_email text)
        RETURNS TABLE (user_id uuid, tenant_id uuid, pw_hash text, role text, region text,
                       tenant_slug text)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = {s}, pg_temp AS
        $$ SELECT u.id, u.tenant_id, u.pw_hash, u.role, t.region, t.slug
             FROM {s}.users u JOIN {s}.tenants t ON t.id = u.tenant_id
            WHERE u.email = lower(p_email) $$;

        REVOKE ALL ON FUNCTION {s}.authenticate_collector(text) FROM PUBLIC;
        REVOKE ALL ON FUNCTION {s}.lookup_login(text) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION {s}.authenticate_collector(text) TO aegis_app;
        GRANT EXECUTE ON FUNCTION {s}.lookup_login(text) TO aegis_app;
        """
    )

    # Supabase hardening: API roles get nothing in this schema (tables, sequences, functions).
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
    op.execute(f"DROP FUNCTION IF EXISTS {s}.lookup_login(text)")
    op.execute(f"DROP FUNCTION IF EXISTS {s}.authenticate_collector(text)")
    for t in reversed(TENANT_TABLES):
        op.execute(f"DROP TABLE IF EXISTS {s}.{t}")
    op.execute(f"DROP FUNCTION IF EXISTS {s}.current_tenant()")
