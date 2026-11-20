from __future__ import annotations

from datetime import UTC, datetime, timedelta

from aegis_contracts.inbound import parse_inbound

from simulator.generator import Generator
from simulator.scenarios import SCENARIOS, s5_cpu_step

START = datetime(2026, 11, 20, 9, 0, tzinfo=UTC)


def test_rate_and_schema_compatibility():
    gen = Generator(seed=1)
    records = [r for b in gen.run_offline(START, 10, 100) for r in b]
    assert 990 <= len(records) <= 1000
    for r in records:
        parse_inbound(r)  # every record valid against the input schema
        assert r["simulated"] is True


def test_all_scenarios_build_and_produce_valid_records():
    for name, factory in SCENARIOS.items():
        gen = Generator(seed=2)
        gen.add_scenario(factory(), START)
        for b in gen.run_offline(START, 30, 50):
            for r in b:
                parse_inbound(r)
        assert name


def test_s5_raises_cpu_on_target_only():
    gen = Generator(seed=3)
    gen.add_scenario(s5_cpu_step(), START + timedelta(seconds=10))
    recs = [r for b in gen.run_offline(START, 40, 200) for r in b if r.get("metric") == "cpu_usage"]

    def mean(src, after):
        vals = [
            r["value"]
            for r in recs
            if r["source_id"] == src
            and (datetime.fromisoformat(r["event_timestamp"]) >= START + timedelta(seconds=10))
            == after
        ]
        return sum(vals) / len(vals)

    assert mean("SRV_002", True) - mean("SRV_002", False) > 35
    assert abs(mean("SRV_001", True) - mean("SRV_001", False)) < 5
