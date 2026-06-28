"""JWT creation and verification for TelemetryX session tokens."""

from __future__ import annotations

import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7
COOKIE_NAME = "telemetryx_jwt"


def get_secret_key() -> str:
    key = os.getenv("JWT_SECRET_KEY", "").strip()
    if not key:
        warnings.warn(
            "JWT_SECRET_KEY is not set — using insecure dev fallback. "
            "Set JWT_SECRET_KEY in backend/.env before going to production.",
            stacklevel=2,
        )
        return "dev-insecure-telemetryx-secret-do-not-use-in-prod"
    return key


def create_access_token(data: dict[str, Any]) -> str:
    """Mint a signed JWT with a 7-day expiry."""
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload["exp"] = expire
    payload["iat"] = datetime.now(timezone.utc)
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and verify a JWT. Returns None if invalid or expired."""
    try:
        return jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    except JWTError:
        return None


def token_payload_from_github_user(gh_user: dict) -> dict[str, Any]:
    """Build the JWT payload from a GitHub user profile dict."""
    return {
        "sub": str(gh_user.get("id", "")),
        "login": gh_user.get("login", ""),
        "name": gh_user.get("name") or gh_user.get("login", ""),
        "avatar_url": gh_user.get("avatar_url", ""),
        "email": gh_user.get("email") or "",
        "provider": "github",
    }
