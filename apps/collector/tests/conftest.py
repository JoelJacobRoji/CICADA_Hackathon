from __future__ import annotations

from pathlib import Path

import pytest
from aegis_collector.config import REPO_CONFIG, get_settings
from aegis_collector.pipeline.localconfig import load_inventory, load_thresholds
from aegis_collector.pipeline.runner import Pipeline
from aegis_collector.store import init_db

TOKENS = {
    "AEGIS_COL_LOCAL_ADMIN_TOKEN": "a" * 40,
    "AEGIS_COL_PSEUDONYM_SECRET": "b" * 40,
    "AEGIS_COL_INGEST_TOKEN": "c" * 40,
}


@pytest.fixture
def col_env(monkeypatch, tmp_path):
    for k, v in TOKENS.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("AEGIS_COL_DB_PATH", str(tmp_path / "collector.db"))
    monkeypatch.setenv("AEGIS_COL_FLUSH_INTERVAL_SECONDS", "5")  # tests flush explicitly
    # ISOLATION: never let a collector under test reach a real SaaS, whatever the local .env says.
    monkeypatch.setenv("AEGIS_COL_COLLECTOR_TOKEN", "")  # empty -> sender disabled
    monkeypatch.setenv("AEGIS_COL_SAAS_BASE_URL", "http://127.0.0.1:9")  # discard port
    monkeypatch.setenv("AEGIS_COL_COLLECTOR_ID", "col_test_01")
    get_settings.cache_clear()
    s = get_settings()
    assert s.collector_token is None and s.saas_base_url.startswith("http://127.0.0.1")
    yield tmp_path
    get_settings.cache_clear()


def make_pipeline(db: Path, secret: str = "b" * 40) -> Pipeline:
    return Pipeline(
        conn=init_db(db),
        collector_id="col_test_01",
        pseudonym_secret=secret,
        thresholds=load_thresholds(REPO_CONFIG / "health_thresholds.yaml"),
        inventory=load_inventory(REPO_CONFIG / "inventory.yaml"),
        window_seconds=2.0,
        grace_seconds=1.0,
    )


@pytest.fixture
def pipeline(tmp_path) -> Pipeline:
    return make_pipeline(tmp_path / "c.db")


@pytest.fixture
def pipeline_factory():
    return make_pipeline
