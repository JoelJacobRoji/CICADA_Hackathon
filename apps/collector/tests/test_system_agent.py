"""Real system agent (psutil + TCP probes): output is contract-valid and probe failures are honest."""

from __future__ import annotations

import asyncio
import json
import socket
import time

from aegis_collector.adapters.system_agent import SystemAgent, tcp_probe
from aegis_contracts.inbound import MetricEvent, parse_inbound


def _closed_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()  # nothing listens here now -> connect is refused immediately
    return port


def test_samples_are_valid_inbound_metrics():
    agent = SystemAgent(targets=[])
    first = asyncio.run(agent.sample())
    time.sleep(0.05)  # bandwidth = byte-counter delta / elapsed; Windows monotonic ticks ~15 ms
    second = asyncio.run(agent.sample())
    events = [parse_inbound(e) for e in first + second]
    assert all(isinstance(e, MetricEvent) for e in events)
    metrics = {e.metric.value for e in events}
    assert {"cpu_usage", "memory_usage", "disk_usage", "bandwidth_mbps"} <= metrics
    assert all(e.source_id == agent.source_id.strip() for e in events)
    for e in events:
        if e.unit.value == "percent":
            assert 0.0 <= e.value <= 100.0


def test_unreachable_probe_target_reports_loss_not_latency():
    target = f"127.0.0.1:{_closed_port()}"
    assert asyncio.run(tcp_probe(target, timeout=1.0)) is None
    agent = SystemAgent(targets=[target], attempts_per_target=2)
    by_metric = {e["metric"]: e["value"] for e in asyncio.run(agent.sample())}
    assert by_metric["packet_loss"] == 100.0
    assert by_metric["connectivity"] == 0
    assert "latency_ms" not in by_metric  # no made-up latency when every probe failed


def test_agent_data_is_pseudonymised_on_egress(pipeline):
    agent = SystemAgent(targets=[])
    asyncio.run(agent.sample())
    time.sleep(0.05)  # see above: the second sample must be a measurable time after the first
    accepted, rejected = pipeline.process("system_agent", asyncio.run(agent.sample()))
    assert accepted >= 4 and rejected == 0
    pipeline.flush(force=True)
    rows = [r[0] for r in pipeline.conn.execute("SELECT payload_json FROM egress_ledger")]
    host_payloads = [
        json.loads(r)
        for r in rows
        if json.loads(r).get("source_pid") == pipeline.pseudo.pid(agent.source_id)
    ]
    assert host_payloads, "no metric summary built from agent data"
    assert all(p["source_kind"] == "server" for p in host_payloads)
    assert agent.source_id not in "".join(rows) and socket.gethostname() not in "".join(rows)
