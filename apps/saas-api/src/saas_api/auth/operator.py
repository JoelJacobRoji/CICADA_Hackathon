"""Operator authentication: argon2id passwords, short-lived JWT in an httpOnly cookie."""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text

from ..config import REGIONS, get_settings
from ..db import identity_connection

_ph = PasswordHasher()  # argon2id, library defaults (memory-hard)
ALGO = "HS256"
ROLES = ("tenant_viewer", "tenant_operator", "tenant_admin")
# A real hash so unknown-user logins cost the same as known-user logins (no user enumeration).
_DUMMY_HASH = _ph.hash("not-a-real-password-" + uuid.uuid4().hex)


@dataclass(frozen=True)
class Operator:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_slug: str
    role: str
    region: str

    def at_least(self, role: str) -> bool:
        return ROLES.index(self.role) >= ROLES.index(role)


def hash_password(pw: str) -> str:
    if len(pw) < 12:
        raise ValueError("password must be at least 12 characters")
    return _ph.hash(pw)


def _verify(pw_hash: str, pw: str) -> bool:
    try:
        return _ph.verify(pw_hash, pw)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def authenticate(email: str, password: str) -> Operator | None:
    """Look up the user in each region (users live in their tenant's region)."""
    for region in REGIONS:
        with identity_connection(region) as conn:
            row = conn.execute(text("SELECT * FROM lookup_login(:e)"), {"e": email.lower()}).first()
        if row is not None:
            if not _verify(row.pw_hash, password):
                return None
            return Operator(row.user_id, row.tenant_id, row.tenant_slug, row.role, row.region)
    _verify(_DUMMY_HASH, password)  # equalise timing for unknown users
    return None


def issue_token(op: Operator) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": str(op.user_id),
        "tid": str(op.tenant_id),
        "tsl": op.tenant_slug,
        "role": op.role,
        "reg": op.region,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=s.session_ttl_minutes)).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(claims, s.jwt_signing_key.get_secret_value(), algorithm=ALGO)


def decode_token(token: str) -> Operator | None:
    s = get_settings()
    try:
        c = jwt.decode(
            token,
            s.jwt_signing_key.get_secret_value(),
            algorithms=[ALGO],
            options={"require": ["exp", "iat", "sub", "tid", "role", "reg"]},
        )
        if c["role"] not in ROLES or c["reg"] not in REGIONS:
            return None
        return Operator(
            uuid.UUID(c["sub"]), uuid.UUID(c["tid"]), c.get("tsl", ""), c["role"], c["reg"]
        )
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def current_operator(request: Request) -> Operator:
    token = request.cookies.get(get_settings().session_cookie_name)
    op = decode_token(token) if token else None
    if op is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    return op


def require_role(role: str):
    def _dep(op: Operator = Depends(current_operator)) -> Operator:
        if not op.at_least(role):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return op

    return _dep


class LoginRateLimiter:
    """In-memory sliding window per key (email + client IP). Single-instance prototype."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] < now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


login_limiter = LoginRateLimiter()
