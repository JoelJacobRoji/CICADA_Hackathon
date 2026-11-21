"""Privacy Glass: collector-authenticated receipt lookup (hash only, own payloads only)."""

from __future__ import annotations

import hashlib
import uuid

import pytest
from fastapi.testclient import TestClient
from saas_helpers import metric, post, security

pytestmark = pytest.mark.integration


def create_app():
    from saas_api.main import create_app as _create_app

    return _create_app()


def _url(region: str, pid: object) -> str:
    return f"/api/v1/ingest/{region}/receipts/{pid}"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_collector_gets_own_receipt_with_matching_hash(regions, seeded):
    acme = seeded["acme"]
    api = TestClient(create_app())
    m, s = metric(acme["collector_id"], 0), security(acme["collector_id"])
    assert post(api, acme["region"], acme["token"], [m, s]).status_code == 200

    for item, kind in ((m, "metric_summary"), (s, "security_summary")):
        r = api.get(_url(acme["region"], item.payload_id), headers=_auth(acme["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["kind"] == kind
        assert body["payload_id"] == str(item.payload_id)
        # Same canonical hash the collector ledgers (sha256 of the contract's JSON).
        expected = hashlib.sha256(item.model_dump_json().encode("utf-8")).hexdigest()
        assert body["payload_sha256"] == expected
        # Receipt only: no stored metadata fields are echoed back.
        assert set(body) == {"payload_id", "kind", "payload_sha256", "received_at", "region"}


def test_receipt_requires_token_and_is_scoped(regions, seeded):
    acme, initech, globex = seeded["acme"], seeded["initech"], seeded["globex"]
    api = TestClient(create_app())
    m = metric(acme["collector_id"], 1)
    assert post(api, acme["region"], acme["token"], [m]).status_code == 200
    url = _url("ap-south", m.payload_id)

    assert api.get(url).status_code == 401
    assert api.get(url, headers=_auth("not-a-token")).status_code == 401
    # Another tenant's collector cannot see Acme's payload, even with its exact ID.
    assert api.get(url, headers=_auth(initech["token"])).status_code == 404
    # An EU token is not valid in the Mumbai region.
    assert api.get(url, headers=_auth(globex["token"])).status_code == 401
    # Unknown ID -> 404; malformed ID -> 422.
    assert api.get(_url("ap-south", uuid.uuid4()), headers=_auth(acme["token"])).status_code == 404
    assert api.get(_url("ap-south", "nope"), headers=_auth(acme["token"])).status_code == 422
