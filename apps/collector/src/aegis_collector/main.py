"""AEGIS collector (Tier 1). Raw data stays here; only allow-listed metadata is queued."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from . import __version__
from .adapters import http_ingest
from .config import get_settings
from .local_api import build_router as build_local_router
from .pipeline.localconfig import load_inventory, load_thresholds
from .pipeline.runner import Pipeline
from .store import init_db, journal_mode


def _configure_logging(level: str) -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
    )


async def _every(seconds: float, fn, *args) -> None:  # noqa: ANN001
    log = structlog.get_logger("collector.task")
    while True:
        await asyncio.sleep(seconds)
        try:
            await run_in_threadpool(fn, *args)
        except Exception as exc:  # noqa: BLE001 - background tasks must survive
            log.error(
                "background_task_failed",
                task=getattr(fn, "__name__", "?"),
                error=type(exc).__name__,
            )


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging(settings.log_level)
    log = structlog.get_logger("collector")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        conn = init_db(settings.db_path)
        pipeline = Pipeline(
            conn=conn,
            collector_id=settings.collector_id,
            pseudonym_secret=settings.pseudonym_secret.get_secret_value(),
            thresholds=load_thresholds(settings.config_dir / "health_thresholds.yaml"),
            inventory=load_inventory(settings.config_dir / "inventory.yaml"),
            window_seconds=settings.window_seconds,
            grace_seconds=settings.window_grace_seconds,
        )
        app.state.db = conn
        app.state.pipeline = pipeline
        pipeline.emit_topology()
        tasks = [
            asyncio.create_task(_every(settings.flush_interval_seconds, pipeline.flush)),
            asyncio.create_task(_every(3600, pipeline.purge_raw, settings.raw_retention_hours)),
        ]
        if settings.system_agent_enabled:
            from .adapters.system_agent import SystemAgent

            agent = SystemAgent(settings.probe_targets)

            async def _agent_loop() -> None:
                while True:
                    await asyncio.sleep(settings.system_agent_interval_seconds)
                    try:
                        await run_in_threadpool(
                            pipeline.process, "system_agent", await agent.sample()
                        )
                    except Exception as exc:  # noqa: BLE001
                        log.error("system_agent_failed", error=type(exc).__name__)

            tasks.append(asyncio.create_task(_agent_loop()))

        app.state.sender = None
        http_client = None
        if settings.collector_token is not None:
            import httpx

            from .egress import heartbeat as hb
            from .egress.sender import Sender

            http_client = httpx.Client(base_url=settings.saas_base_url, timeout=10)
            token = settings.collector_token.get_secret_value()
            sender = Sender(
                conn=conn,
                lock=pipeline.lock,
                client=http_client,
                region=settings.region,
                token=token,
                batch_size=settings.send_batch_size,
            )
            app.state.sender = sender
            cfg_hash = hb.config_hash(
                settings.config_dir, f"{settings.window_seconds}|{settings.window_grace_seconds}"
            )

            def _heartbeat() -> None:
                depth, age = hb.outbox_stats(conn, pipeline.lock)
                adapters = {
                    "http_ingest": hb.AdapterStatus.OK,
                    "sender": {
                        "ok": hb.AdapterStatus.OK,
                        "network_error": hb.AdapterStatus.DEGRADED,
                        "server_error": hb.AdapterStatus.DEGRADED,
                        "auth_error": hb.AdapterStatus.AUTH_ERROR,
                    }.get(sender.state, hb.AdapterStatus.DEGRADED),
                    "system_agent": hb.AdapterStatus.OK
                    if settings.system_agent_enabled
                    else hb.AdapterStatus.DISABLED,
                }
                beat = hb.build(
                    collector_id=settings.collector_id,
                    region=settings.region,
                    cfg_hash=cfg_hash,
                    depth=depth,
                    oldest_age=age,
                    adapters=adapters,
                )
                try:
                    hb.send(http_client, token, beat)
                except Exception as exc:  # noqa: BLE001 - SaaS may be down; that's the point
                    log.warning("heartbeat_failed", error=type(exc).__name__)

            tasks.append(asyncio.create_task(_every(settings.send_interval_seconds, sender.drain)))
            tasks.append(
                asyncio.create_task(_every(settings.heartbeat_interval_seconds, _heartbeat))
            )
        log.info(
            "collector_started",
            collector_id=settings.collector_id,
            region=settings.region,
            system_agent=settings.system_agent_enabled,
            sender=settings.collector_token is not None,
        )
        try:
            yield
        finally:
            for t in tasks:
                t.cancel()
            for t in tasks:
                with contextlib.suppress(asyncio.CancelledError):
                    await t
            # Clean shutdown: stop the sender and wait for in-flight batches, then flush and
            # close the DB while HOLDING the pipeline lock, so no other thread can be inside
            # a SQLite call when the connection closes (use-after-close crashed on Windows).
            if app.state.sender is not None:
                await run_in_threadpool(app.state.sender.stop)
            with pipeline.lock:
                pipeline.flush(force=True)  # don't lose open windows on shutdown
                pipeline.closed = True
                conn.close()
            if http_client is not None:
                http_client.close()

    app = FastAPI(
        title="AEGIS Collector (local)",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.web_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )
    app.include_router(http_ingest.build_router())
    app.include_router(build_local_router())

    @app.get("/healthz", tags=["ops"])
    def healthz() -> dict[str, str]:
        mode = journal_mode(app.state.db)
        return {
            "status": "ok" if mode == "wal" else "degraded",
            "service": "collector",
            "version": __version__,
            "collector_id": settings.collector_id,
            "journal_mode": mode,
        }

    return app


app = create_app()
