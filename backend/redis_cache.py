import hashlib
import json
import os
from typing import Any

import redis
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent / ".env")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS = int(os.getenv("ANALYSIS_CACHE_TTL", "3600"))


def _client() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


def _cache_key(repo_url: str) -> str:
    digest = hashlib.sha256(repo_url.strip().lower().encode()).hexdigest()[:16]
    return f"telemetryx:analysis:{digest}"


def get_cached_analysis(repo_url: str) -> list[dict[str, Any]] | None:
    try:
        raw = _client().get(_cache_key(repo_url))
        if not raw:
            return None
        return json.loads(raw)
    except redis.RedisError:
        return None


def set_cached_analysis(repo_url: str, metrics: list[dict[str, Any]]) -> None:
    try:
        _client().setex(
            _cache_key(repo_url),
            CACHE_TTL_SECONDS,
            json.dumps(metrics),
        )
    except redis.RedisError:
        pass
