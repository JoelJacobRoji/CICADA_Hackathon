"""Structured JSON logging. Request bodies are never logged; sensitive keys are redacted."""

from __future__ import annotations

import logging
import re
from collections.abc import MutableMapping
from typing import Any

import structlog

SENSITIVE_KEY = re.compile(
    r"(authorization|token|password|passwd|secret|api[_-]?key|cookie|dsn|url|body|payload_json)",
    re.I,
)
REDACTED = "[REDACTED]"


def redact_sensitive(
    _logger: Any, _method: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key in list(event_dict.keys()):
        if key != "event" and SENSITIVE_KEY.search(key):
            event_dict[key] = REDACTED
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            redact_sensitive,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "saas") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
