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


def require_api_keys_at_startup() -> None:
    if not is_production():
        return
    if os.getenv("AUTH_DISABLED", "").lower() in ("1", "true", "yes"):
        raise RuntimeError(
            "AUTH_DISABLED must not be set in production. Configure TELEMETRYX_API_KEYS "
            "or create keys via POST /admin/api-keys."
        )
    if os.getenv("TELEMETRYX_API_KEYS", "").strip():
        return
    import database

    active = [k for k in database.list_api_keys() if not k.get("revoked_at")]
    if not active:
        raise RuntimeError(
            "Production requires API keys. Set TELEMETRYX_API_KEYS or create keys "
            "via POST /admin/api-keys before deployment."
        )
