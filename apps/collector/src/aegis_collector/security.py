"""Bearer-token dependencies for the collector's local endpoints (constant-time compare)."""

from __future__ import annotations

import hmac
from collections.abc import Callable

from fastapi import Header, HTTPException, status
from pydantic import SecretStr


def bearer_dependency(get_token: Callable[[], SecretStr], realm: str) -> Callable[..., None]:
    def _check(authorization: str | None = Header(default=None)) -> None:
        expected = get_token().get_secret_value()
        supplied = ""
        if authorization and authorization.lower().startswith("bearer "):
            supplied = authorization[7:].strip()
        if not supplied or not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="unauthorized",
                headers={"WWW-Authenticate": f'Bearer realm="{realm}"'},
            )

    return _check
