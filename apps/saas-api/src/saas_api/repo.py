"""SQLAlchemy Core table definitions mirroring migrations (schema 'aegis')."""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    MetaData,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

# No fixed schema: every connection sets `search_path` to the configured schema
# (db.tenant_connection / db.owner_connection), so `db_schema` stays configurable.
metadata = MetaData()


def _ts(name: str, nullable: bool = False) -> Column:
    return Column(name, DateTime(timezone=True), nullable=nullable)


tenants = Table(
    "tenants",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("slug", Text),
    Column("name", Text),
    Column("region", Text),
    _ts("created_at"),
)

collectors = Table(
    "collectors",
    metadata,
    Column("id", Text, primary_key=True),
    Column("tenant_id", UUID(as_uuid=True)),
    Column("region", Text),
    Column("token_hash", Text),
    Column("status", Text),
    _ts("created_at"),
    _ts("last_seen_at", True),
    _ts("last_heartbeat_sent", True),
    Column("collector_version", Text),
    Column("uptime_s", Float),
    Column("cpu_percent", Float),
    Column("memory_mb", Float),
    Column("outbox_depth", Integer),
    Column("oldest_pending_age_s", Float),
    Column("config_hash", Text),
    Column("adapters", JSONB),
)

users = Table(
    "users",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("tenant_id", UUID(as_uuid=True)),
    Column("email", Text),
    Column("pw_hash", Text),
    Column("role", Text),
    _ts("created_at"),
    _ts("last_login_at", True),
)

metric_summaries = Table(
    "metric_summaries",
    metadata,
    Column("tenant_id", UUID(as_uuid=True), primary_key=True),
    Column("payload_id", UUID(as_uuid=True), primary_key=True),
    Column("collector_id", Text),
    Column("source_pid", Text),
    Column("source_kind", Text),
    Column("metric", Text),
    Column("unit", Text),
    Column("category", Text),
    _ts("window_start"),
    _ts("window_end"),
    Column("source_timezone", Text),
    Column("count", Integer),
    Column("min", Float),
    Column("max", Float),
    Column("mean", Float),
    Column("last", Float),
    Column("p95", Float),
    Column("severity", Text),
    Column("local_health", Text),
    Column("anomaly", JSONB),
    Column("summary_code", Text),
    _ts("first_event_ts"),
    Column("collector_seq", BigInteger),
    _ts("received_at"),
    Column("late", Boolean),
    Column("payload_sha256", Text),
)

security_summaries = Table(
    "security_summaries",
    metadata,
    Column("tenant_id", UUID(as_uuid=True), primary_key=True),
    Column("payload_id", UUID(as_uuid=True), primary_key=True),
    Column("collector_id", Text),
    Column("source_pid", Text),
    _ts("window_start"),
    _ts("window_end"),
    Column("source_timezone", Text),
    Column("summary_code", Text),
    Column("failure_count", Integer),
    Column("distinct_user_count", Integer),
    Column("distinct_src_count", Integer),
    Column("severity", Text),
    Column("local_health", Text),
    Column("risk_level", Text),
    Column("collector_seq", BigInteger),
    _ts("received_at"),
    Column("late", Boolean),
    Column("payload_sha256", Text),
)

topology_edges = Table(
    "topology_edges",
    metadata,
    Column("tenant_id", UUID(as_uuid=True), primary_key=True),
    Column("payload_id", UUID(as_uuid=True), primary_key=True),
    Column("collector_id", Text),
    Column("from_pid", Text),
    Column("to_pid", Text),
    Column("relation", Text),
    _ts("received_at"),
    Column("payload_sha256", Text),
)

heartbeats = Table(
    "heartbeats",
    metadata,
    Column("tenant_id", UUID(as_uuid=True), primary_key=True),
    Column("collector_id", Text, primary_key=True),
    _ts("sent_at"),
    _ts("received_at"),
    Column("outbox_depth", Integer),
    Column("oldest_pending_age_s", Float),
    Column("cpu_percent", Float),
    Column("memory_mb", Float),
)

ingest_receipts = Table(
    "ingest_receipts",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("tenant_id", UUID(as_uuid=True)),
    Column("collector_id", Text),
    Column("batch_id", UUID(as_uuid=True)),
    _ts("received_at"),
    Column("body_sha256", Text),
    Column("accepted", Integer),
    Column("duplicate", Integer),
    Column("rejected", Integer),
)

audit_log = Table(
    "audit_log",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("tenant_id", UUID(as_uuid=True)),
    _ts("at"),
    Column("actor", Text),
    Column("action", Text),
    Column("target", Text),
    Column("detail", JSONB),
)

KIND_TABLE = {
    "metric_summary": metric_summaries,
    "security_summary": security_summaries,
    "topology_edge": topology_edges,
}
