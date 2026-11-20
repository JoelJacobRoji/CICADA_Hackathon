"""AEGIS SaaS API entrypoint (Phase 2: foundation only - no ingest yet)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import REGIONS, get_settings
from .db import ping
from .logs import configure_logging, get_logger


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    log = get_logger()

    app = FastAPI(
        title="AEGIS SaaS API",
        version=__version__,
        docs_url="/docs" if settings.env != "prod" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.env != "prod" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )

    @app.get("/healthz", tags=["ops"])
    def healthz() -> dict[str, str]:
        return {"status": "ok", "service": "saas-api", "version": __version__}

    @app.get("/readyz", tags=["ops"])
    def readyz() -> JSONResponse:
        regions = {r: ("ok" if ping(r) else "unavailable") for r in REGIONS}
        ready = all(v == "ok" for v in regions.values())
        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ready" if ready else "not_ready", "regions": regions},
        )

    @app.get("/api/v1/time", tags=["ops"])
    def server_time() -> dict[str, str]:
        # Used for clock-offset estimation in latency measurements (MEASUREMENT_PLAN.md).
        return {"utc": datetime.now(UTC).isoformat()}

    log.info("saas_api_started", env=settings.env, regions=list(REGIONS))
    return app


app = create_app()
