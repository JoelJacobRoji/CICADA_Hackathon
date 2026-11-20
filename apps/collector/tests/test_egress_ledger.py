"""Ledger + outbox: hash chain, tamper evidence, atomicity, 1:1 ledger/outbox."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from aegis_collector.egress.ledger import Egress, sha256_hex, verify_chain
from aegis_collector.store import init_db
from aegis_contracts.outbound import MetricSummary

T0 = datetime(2026, 11, 20, 9, 30, tzinfo=UTC)


def builder(i: int, smuggle: bool = False):
    def build(seq: int) -> MetricSummary:
        m = MetricSummary(
            payload_id=uuid.uuid5(uuid.NAMESPACE_URL, f"t{i}"),
            collector_id="col_test_01",
            source_pid="src_0123456789abcdef",
            source_kind="server",
            metric="cpu_usage",
            unit="percent",
            category="infrastructure",
            window_start_utc=T0 + timedelta(seconds=2 * i),
            window_end_utc=T0 + timedelta(seconds=2 * i + 2),
            source_timezone="Asia/Kolkata",
            count=1,
            min=1.0,
            max=1.0,
            mean=1.0,
            last=1.0,
            p95=1.0,
            severity="info",
            local_health="Excellent",
            summary_code="OK",
            first_event_ts_utc=T0,
            collector_seq=seq,
        )
        if smuggle:  # simulate a future bug that lets a secret into a valid-looking payload
            object.__setattr__(m, "source_timezone", "UTC password=FAKE_P@ss123")
        return m

    return build


def test_chain_ok_and_one_outbox_row_per_ledger_entry(tmp_path):
    conn = init_db(tmp_path / "c.db")
    res = Egress(conn).emit([builder(i) for i in range(5)])
    assert res.queued == 5
    assert verify_chain(conn).ok and verify_chain(conn).entries == 5
    rows = conn.execute(
        "SELECT l.payload_json, l.sha256, o.status FROM egress_ledger l JOIN outbox o USING (payload_id)"
    ).fetchall()
    assert len(rows) == 5
    assert all(sha256_hex(r[0]) == r[1] and r[2] == "pending" for r in rows)
    seqs = [
        int(r[0])
        for r in conn.execute(
            "SELECT json_extract(payload_json,'$.collector_seq') FROM egress_ledger ORDER BY seq"
        )
    ]
    assert seqs == [1, 2, 3, 4, 5]


def test_tamper_detected(tmp_path):
    conn = init_db(tmp_path / "c.db")
    Egress(conn).emit([builder(i) for i in range(4)])
    conn.execute(
        "UPDATE egress_ledger SET payload_json = replace(payload_json, '\"max\":1.0', '\"max\":9.0') WHERE seq = 3"
    )
    rep = verify_chain(conn)
    assert not rep.ok and rep.first_bad_seq == 3


def test_deleted_entry_detected(tmp_path):
    conn = init_db(tmp_path / "c.db")
    Egress(conn).emit([builder(i) for i in range(4)])
    conn.execute(
        "DELETE FROM outbox WHERE payload_id = (SELECT payload_id FROM egress_ledger WHERE seq = 2)"
    )
    conn.execute("DELETE FROM egress_ledger WHERE seq = 2")
    rep = verify_chain(conn)
    assert not rep.ok and rep.first_bad_seq == 3


def test_canary_blocks_and_nothing_is_written_for_that_item(tmp_path):
    conn = init_db(tmp_path / "c.db")
    res = Egress(conn).emit([builder(0), builder(1, smuggle=True), builder(2)])
    assert (res.queued, res.blocked) == (2, 1)
    assert "FAKE_P@ss123" not in "".join(
        r[0] for r in conn.execute("SELECT payload_json FROM egress_ledger")
    )
    # No sequence gap is created by the blocked item.
    seqs = [
        int(r[0])
        for r in conn.execute(
            "SELECT json_extract(payload_json,'$.collector_seq') FROM egress_ledger ORDER BY seq"
        )
    ]
    assert seqs == [1, 2]


def test_duplicate_payload_id_not_requeued_and_seq_persists_across_restart(tmp_path):
    db = tmp_path / "c.db"
    conn = init_db(db)
    Egress(conn).emit([builder(0), builder(1)])
    conn.close()
    conn = init_db(db)
    res = Egress(conn).emit([builder(1), builder(2)])
    assert (res.queued, res.duplicates) == (1, 1)
    last = conn.execute(
        "SELECT json_extract(payload_json,'$.collector_seq') FROM egress_ledger ORDER BY seq DESC LIMIT 1"
    ).fetchone()[0]
    assert last == 3
    assert verify_chain(conn).ok
