"""Regression: WebSocket events must use the same timestamp format as the REST API (ISO-8601 'Z').

str(datetime) gave '2026-11-20 16:26:26+00:00', which broke client-side sorting and chart parsing.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta, timezone

from saas_api.health.engine import Transition
from saas_api.ws import _json_default


def test_datetimes_serialised_as_iso_utc_z():
    ist = timezone(timedelta(hours=5, minutes=30))
    out = json.loads(
        json.dumps(
            {
                "a": datetime(2026, 11, 20, 16, 26, 26, tzinfo=UTC),
                "b": datetime(2026, 11, 20, 21, 56, 26, tzinfo=ist),  # converted to UTC
                "u": uuid.UUID(int=1),
            },
            default=_json_default,
        )
    )
    assert out["a"] == "2026-11-20T16:26:26Z"
    assert out["b"] == "2026-11-20T16:26:26Z"
    assert out["u"] == "00000000-0000-0000-0000-000000000001"


def test_transition_event_timestamps_use_same_format():
    t = Transition(
        uuid.uuid4(),
        "ap-south",
        "source",
        "src_00000000000000a1",
        None,
        "Good",
        datetime(2026, 11, 20, 16, 0, tzinfo=UTC),
        None,
        [],
    )
    ev = json.loads(json.dumps(t.as_event(), default=_json_default))
    assert ev["at_utc"] == "2026-11-20T16:00:00Z" and ev["event_time"] is None
