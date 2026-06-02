"""Environment and deployment configuration helpers."""

from __future__ import annotations

import os

_DEV_ADMIN_FALLBACK = "telemetryx_secret_admin_key"


def is_production() -> bool:
    env = os.getenv("TELEMETRYX_ENV", os.getenv("ENV", "development")).lower()
    return env in ("production", "prod")


def require_admin_key_at_startup() -> None:
    if is_production() and not os.getenv("ADMIN_KEY", "").strip():
        raise RuntimeError(
            "ADMIN_KEY must be set when TELEMETRYX_ENV=production (or ENV=production). "
            "Refusing to start with the development fallback secret."
        )


def get_expected_admin_key() -> str:
    key = os.getenv("ADMIN_KEY", "").strip()
    if key:
        return key
    if is_production():
        raise RuntimeError("ADMIN_KEY is required in production")
    return _DEV_ADMIN_FALLBACK
