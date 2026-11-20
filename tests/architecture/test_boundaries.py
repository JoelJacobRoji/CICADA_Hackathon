"""Tier-boundary checks: collector and SaaS must never import each other's code."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COLLECTOR = ROOT / "apps" / "collector" / "src"
SAAS = ROOT / "apps" / "saas-api" / "src"


def _imports(src: Path) -> set[str]:
    found: set[str] = set()
    pat = re.compile(r"^\s*(?:from|import)\s+([a-zA-Z_][\w]*)", re.M)
    for f in src.rglob("*.py"):
        found.update(pat.findall(f.read_text(encoding="utf-8")))
    return found


def test_collector_does_not_import_saas():
    assert "saas_api" not in _imports(COLLECTOR)


def test_saas_does_not_import_collector():
    assert "aegis_collector" not in _imports(SAAS)


def test_saas_has_no_raw_inbound_dependency():
    # The SaaS must never parse raw (inbound) records - it only knows outbound contracts.
    for f in SAAS.rglob("*.py"):
        assert "aegis_contracts.inbound" not in f.read_text(encoding="utf-8"), f
