"""API key authentication and per-key rate limiting."""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

import database

logger = logging.getLogger(__name__)

PUBLIC_PATHS = frozenset(
    {
        "/health",
        "/analyzer/languages",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/oauth/github",
        "/oauth/github/callback",
        "/auth/me",
        "/auth/logout",
    }
)

DEFAULT_RATE_LIMIT_PER_HOUR = int(os.getenv("DEFAULT_API_RATE_LIMIT", "100"))


def auth_disabled() -> bool:
    if os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes"):
        return True
    from config import is_production

    if is_production():
        return False
    return not bool(os.getenv("TELEMETRYX_API_KEYS", "").strip())


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.strip().encode()).hexdigest()


def generate_api_key() -> str:
    return f"tx_{secrets.token_urlsafe(32)}"


def key_prefix(plaintext: str) -> str:
    return plaintext[:8]


def lookup_api_key(plaintext: str) -> dict[str, Any] | None:
    if not plaintext or not plaintext.strip():
        return None

    normalized = plaintext.strip()
    key_hash = hash_api_key(normalized)

    for bootstrap in os.getenv("TELEMETRYX_API_KEYS", "").split(","):
        bootstrap = bootstrap.strip()
        if bootstrap and secrets.compare_digest(bootstrap, normalized):
            return {
                "id": 0,
                "name": "bootstrap",
                "team": "env",
                "key_hash": key_hash,
                "rate_limit_per_hour": DEFAULT_RATE_LIMIT_PER_HOUR,
            }

    return _lookup_db_key(key_hash)


def _lookup_db_key(key_hash: str) -> dict[str, Any] | None:
    try:
        return database.get_active_api_key_by_hash(key_hash)
    except Exception as exc:
        logger.warning("API key DB lookup failed: %s", exc)
        return None


def check_rate_limit(record: dict[str, Any]) -> None:
    limit = int(record.get("rate_limit_per_hour") or DEFAULT_RATE_LIMIT_PER_HOUR)
    key_hash = record["key_hash"]
    hour_bucket = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    redis_key = f"telemetryx:ratelimit:{key_hash}:{hour_bucket}"

    try:
        import redis

        client = redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
        count = client.incr(redis_key)
        if count == 1:
            client.expire(redis_key, 3600)
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({limit} requests/hour)",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Rate limit check skipped (Redis unavailable): %s", exc)


def authenticate_request(request: Request) -> dict[str, Any] | None:
    if auth_disabled():
        return None

    path = request.url.path.rstrip("/") or "/"
    if path in PUBLIC_PATHS or path.startswith("/docs"):
        return None

    api_key = request.headers.get("X-API-Key", "").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    record = lookup_api_key(api_key)
    if not record:
        raise HTTPException(status_code=401, detail="Invalid API key")

    check_rate_limit(record)

    request.state.api_key_record = record
    return record


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            authenticate_request(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)
