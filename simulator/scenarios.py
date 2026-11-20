"""Scenario injectors for the live scenarios in the evaluation guide §8 (SIMULATED)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from .generator import Effect, Scenario, Scheduled

# Obviously fake secrets used to prove they never leave the collector (S1).
FAKE_SECRETS = {
    "password": "FAKE_P@ss123",
    "api_key": "FAKE_sk_live_51HxAEGISDEMO00000000",
    "jwt": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGQUtFLWRlbW8tdXNlciJ9.FAKEsignatureAEGIS0000",
    "aws_key": "AKIAFAKEAEGIS0000000",
    "email": "jane.doe@example.com",
    "ip": "10.20.30.40",
}


def _log(
    source_id: str, ts: datetime, kind: str, category: str, message: str, **attrs: Any
) -> dict[str, Any]:
    return {
        "event_id": f"SIM_{uuid.uuid4().hex[:20]}",
        "tenant_id": "TENANT_01",
        "source_id": source_id,
        "event_timestamp": ts.isoformat(),
        "source_timezone": "Asia/Kolkata",
        "record_type": "log",
        "category": category,
        "log_kind": kind,
        "message": message,
        "attributes": attrs,
        "simulated": True,
    }


def s1_secret_log() -> Scenario:
    fs = FAKE_SECRETS
    msg = (
        f"db connect failed user=svc_billing password={fs['password']} "
        f"api_key={fs['api_key']} Authorization: Bearer {fs['jwt']} "
        f"aws={fs['aws_key']} notify={fs['email']} from {fs['ip']}"
    )
    return Scenario(
        "s1",
        "Raw application log containing (fake) secrets on SRV_001",
        scheduled=[
            Scheduled(
                0,
                lambda ts: _log(
                    "SRV_001",
                    ts,
                    "app",
                    "application",
                    msg,
                    user="svc_billing",
                    src_ip=fs["ip"],
                    password=fs["password"],
                    outcome="error",
                ),
            )
        ],
    )


def s3_failed_logins(n: int = 25, span: float = 20.0) -> Scenario:
    return Scenario(
        "s3",
        f"{n} failed SSH logins for 'admin' on SRV_002 within {span:.0f}s",
        scheduled=[
            Scheduled(
                i * span / n,
                lambda ts: _log(
                    "SRV_002",
                    ts,
                    "auth",
                    "security",
                    "Failed password for admin from 10.20.30.40 port 52211 ssh2",
                    user="admin",
                    src_ip="10.20.30.40",
                    outcome="failure",
                ),
            )
            for i in range(n)
        ],
    )


def s4_latency_ramp(ramp: float = 60.0, hold: float = 60.0) -> Scenario:
    def fn(v: float, t: float) -> float:
        frac = min(1.0, t / ramp)
        return v + (400.0 - 20.0) * frac

    return Scenario(
        "s4",
        "Latency on NET_001 ramps 20 -> 400 ms over 60 s, then holds",
        effects=[Effect("NET_001", "latency_ms", 0, ramp + hold, fn)],
    )


def s5_cpu_step(duration: float = 120.0) -> Scenario:
    return Scenario(
        "s5",
        "CPU on SRV_002 steps from ~35% to ~80% (below the 85% Fair threshold)",
        effects=[Effect("SRV_002", "cpu_usage", 0, duration, lambda v, t: v + 45.0)],
    )


def s6_cascade(duration: float = 120.0) -> Scenario:
    return Scenario(
        "s6",
        "NET_001 packet loss + latency; dependent APP_001/APP_002 degrade ~20 s later",
        effects=[
            Effect("NET_001", "packet_loss", 0, duration, lambda v, t: v + 8.0),
            Effect("NET_001", "latency_ms", 0, duration, lambda v, t: v + 280.0),
            Effect("APP_001", "latency_ms", 20, duration, lambda v, t: v + 320.0),
            Effect("APP_002", "latency_ms", 20, duration, lambda v, t: v + 300.0),
            Effect("APP_001", "error_rate", 25, duration, lambda v, t: v + 9.0),
            Effect("APP_002", "error_rate", 25, duration, lambda v, t: v + 7.0),
        ],
    )


SCENARIOS = {
    "s1": s1_secret_log,
    "s3": s3_failed_logins,
    "s4": s4_latency_ramp,
    "s5": s5_cpu_step,
    "s6": s6_cascade,
}
