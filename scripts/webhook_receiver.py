"""Demo 'device' webhook: receives AEGIS device alerts from the local collector.

Binds to 127.0.0.1 only. Prints each alert readably and appends it to a JSONL file so the demo
has a durable record. Standard library only (no extra packages).

    uv run python scripts/webhook_receiver.py            # listens on 127.0.0.1:9200
    # collector: AEGIS_COL_NOTIFY_WEBHOOK_URL=http://127.0.0.1:9200/
"""

from __future__ import annotations

import argparse
import contextlib
import json
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 1_048_576


def render(p: dict) -> str:
    meta = p.get("aegis_notification", {})
    lines = [
        f"\n=== AEGIS device alert ({meta.get('kind')}) "
        f"{datetime.now(UTC).strftime('%H:%M:%S')}Z ==="
    ]
    if meta.get("kind") == "ai_explanation":
        lines.append(f"AI explanation (grounded, model {p.get('model')}):")
        lines.append(f"  {p.get('summary')}")
        for k in ("reasoning", "verify_next"):
            for s in p.get(k) or []:
                lines.append(f"  - {s}")
        return "\n".join(lines)
    lines.append(
        f"[{p.get('priority')}] {p.get('title')}   status={p.get('status')} v{p.get('version')}"
    )
    pc = p.get("probable_cause") or {}
    lines.append(
        f"Probable cause: {pc.get('entity') or 'undetermined'} "
        f"({pc.get('status')}) - {pc.get('basis')}"
    )
    lines.append(f"Evidence strength: {p.get('evidence_strength')}")
    for s in p.get("signals", []):
        lines.append(
            f"  * {s.get('entity')}: {s.get('code')} observed={s.get('observed')} "
            f"{s.get('unit') or ''}"
        )
    for r in p.get("recommendations", [])[:3]:
        lines.append(f"  -> {r.get('title')}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9200)
    ap.add_argument("--out", default="data/webhook_received.jsonl")
    args = ap.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - stdlib API
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                self.send_response(413)
                self.end_headers()
                return
            try:
                payload = json.loads(self.rfile.read(n))
            except ValueError:
                self.send_response(400)
                self.end_headers()
                return
            with out.open("a", encoding="utf-8") as f:
                f.write(
                    json.dumps({"received_at": datetime.now(UTC).isoformat(), "payload": payload})
                    + "\n"
                )
            print(render(payload), flush=True)
            self.send_response(204)
            self.end_headers()

        def log_message(self, *a) -> None:  # quiet default access log
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"AEGIS demo webhook listening on http://127.0.0.1:{args.port}/ -> {out}", flush=True)
    with contextlib.suppress(KeyboardInterrupt):
        srv.serve_forever()


if __name__ == "__main__":
    main()
