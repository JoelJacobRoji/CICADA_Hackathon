"""Serves the Privacy Glass page (static, no data). Data: /local/glass* with the admin token.

Strict CSP: same-origin script/style only, no inline code, no external hosts, not frameable.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

STATIC = Path(__file__).parent / "glass_static"
CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; "
    "img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
_FILES = {
    "": ("index.html", "text/html; charset=utf-8"),
    "app.js": ("app.js", "text/javascript; charset=utf-8"),
    "app.css": ("app.css", "text/css; charset=utf-8"),
}
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def build_router() -> APIRouter:
    router = APIRouter(tags=["privacy-glass"])

    def _serve(name: str) -> Response:
        if name not in _FILES:
            raise HTTPException(404, "not found")
        fname, ctype = _FILES[name]
        return Response((STATIC / fname).read_bytes(), media_type=ctype, headers=HEADERS)

    @router.get("/glass", include_in_schema=False)
    def page() -> Response:
        return _serve("")

    @router.get("/glass/{name}", include_in_schema=False)
    def asset(name: str) -> Response:
        return _serve(name)

    return router
