"""Real local agent: host metrics via psutil + network probes via timed TCP connects.

Latency here is *TCP connect latency* to configured targets (ICMP needs admin on Windows).
Packet loss = failed connect attempts / total attempts in the interval (an approximation).
"""

from __future__ import annotations

import asyncio
import socket
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import psutil


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _local_tz() -> str:
    return "UTC"  # host-local zone detection is unreliable on Windows; UTC is always correct


async def tcp_probe(target: str, timeout: float = 2.0) -> float | None:
    host, _, port = target.rpartition(":")
    t0 = time.perf_counter()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, int(port)), timeout)
        writer.close()
        await writer.wait_closed()
        return (time.perf_counter() - t0) * 1000
    except (TimeoutError, OSError):
        return None


class SystemAgent:
    def __init__(self, targets: list[str], attempts_per_target: int = 2):
        self.source_id = f"HOST_{socket.gethostname()}"  # local only; pseudonymised on egress
        self.targets = targets
        self.attempts = attempts_per_target
        self._last_net: tuple[float, int] | None = None
        psutil.cpu_percent(None)  # prime

    def _ev(self, metric: str, value: float, unit: str, category: str) -> dict[str, Any]:
        return {
            "event_id": f"AGT_{uuid.uuid4().hex[:16]}",
            "source_id": self.source_id,
            "event_timestamp": _now(),
            "source_timezone": _local_tz(),
            "metric": metric,
            "value": round(float(value), 3),
            "unit": unit,
            "category": category,
        }

    async def sample(self) -> list[dict[str, Any]]:
        out = [
            self._ev("cpu_usage", psutil.cpu_percent(None), "percent", "infrastructure"),
            self._ev("memory_usage", psutil.virtual_memory().percent, "percent", "infrastructure"),
            self._ev("disk_usage", psutil.disk_usage("/").percent, "percent", "infrastructure"),
        ]
        io = psutil.net_io_counters()
        now = time.monotonic()
        total = io.bytes_sent + io.bytes_recv
        if self._last_net:
            dt = now - self._last_net[0]
            if dt > 0:
                mbps = (total - self._last_net[1]) * 8 / dt / 1_000_000
                out.append(self._ev("bandwidth_mbps", max(mbps, 0.0), "mbps", "network"))
        self._last_net = (now, total)

        if self.targets:
            results = await asyncio.gather(
                *(tcp_probe(t) for t in self.targets for _ in range(self.attempts))
            )
            ok = [r for r in results if r is not None]
            loss = 100.0 * (len(results) - len(ok)) / len(results)
            out.append(self._ev("packet_loss", loss, "percent", "network"))
            out.append(self._ev("connectivity", 1 if ok else 0, "bool", "network"))
            if ok:
                out.append(self._ev("latency_ms", sum(ok) / len(ok), "ms", "network"))
        return out
