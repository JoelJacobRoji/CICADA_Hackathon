"""Every third-party import in a deployable service must be a DECLARED runtime dependency.

Regression (Phase 6 deploy): saas_api imported httpx, which was only present in the dev
environment (via the test client). Locally everything passed; the VPS (`uv sync --no-dev`) crashed.
"""

from __future__ import annotations

import ast
import re
import sys
import tomllib
from importlib.metadata import packages_distributions
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SERVICES = {
    "saas": (ROOT / "apps/saas-api", "saas_api"),
    "collector": (ROOT / "apps/collector", "aegis_collector"),
}
FIRST_PARTY = {"saas_api", "aegis_collector", "aegis_contracts"}
# Hard (non-optional) dependencies of a declared framework: always installed with it.
PROVIDED_BY = {"pydantic": "fastapi", "starlette": "fastapi"}


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _declared(app: Path) -> set[str]:
    deps = tomllib.loads((app / "pyproject.toml").read_text(encoding="utf-8"))["project"][
        "dependencies"
    ]
    return {_norm(re.split(r"[\[<>=!~ ;]", d, maxsplit=1)[0]) for d in deps}


def _imports(pkg_dir: Path) -> set[str]:
    out: set[str] = set()
    for f in pkg_dir.rglob("*.py"):
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                out |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                out.add(node.module.split(".")[0])
    return out


@pytest.mark.parametrize("service", sorted(SERVICES))
def test_third_party_imports_are_declared(service):
    app, pkg = SERVICES[service]
    declared = _declared(app)
    dist_of = packages_distributions()
    missing = []
    for mod in sorted(_imports(app / "src" / pkg) - FIRST_PARTY):
        if mod in sys.stdlib_module_names:
            continue
        dists = {_norm(d) for d in dist_of.get(mod, [])}
        if not dists & declared and PROVIDED_BY.get(mod) not in declared:
            missing.append(f"{mod} (from {sorted(dists) or 'unknown'})")
    assert not missing, f"{service}: undeclared runtime imports: {missing}"
