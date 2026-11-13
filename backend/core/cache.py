"""Reusable cache-aside helpers for read-heavy endpoints (BE-007).

Forge already had ad-hoc ``cache_get_json`` / ``cache_set_json`` call sites
scattered through ``admin.py``, ``analytics.py`` and ``marketplace.py``. This
module centralises the cache-aside pattern so new read endpoints (plans,
user profiles, etc.) get consistent TTLs, fail-open behaviour, and a single
invalidation entry point without re-implementing the boilerplate each time.
"""
from __future__ import annotations

import logging
from typing import Awaitable, Callable, TypeVar

from core.database import cache_get_json, cache_set_json, get_redis

logger = logging.getLogger(__name__)

T = TypeVar("T")

# TTLs (seconds) for the read-heavy endpoints this module serves.
PLANS_CACHE_TTL = 3600  # plan table is config-driven; safe to cache for an hour
USER_PROFILE_CACHE_TTL = 60  # profiles change (credits, plan) — short window


async def cached_read(
    key: str,
    ttl: int,
    loader: Callable[[], Awaitable[T]],
    *,
    enabled: bool = True,
) -> T:
    """Cache-aside read.

    Returns the cached JSON value when present; otherwise calls ``loader``,
    caches the (JSON-serialisable) result, and returns it. **Fail-open**: any
    Redis/cache error is swallowed so a cache outage never breaks a read — the
    loader still runs and the request succeeds.
    """
    if enabled:
        try:
            cached = await cache_get_json(key)
            if cached is not None:
                return cached  # type: ignore[return-value]
        except Exception:  # pragma: no cover - defensive; fail-open
            logger.warning("cache read error for %s; falling through to loader", key)

    value = await loader()

    if enabled:
        try:
            await cache_set_json(key, value, ttl=ttl)  # type: ignore[arg-type]
        except Exception:  # pragma: no cover - defensive; fail-open
            logger.warning("cache write error for %s; serving uncached", key)
    return value


async def invalidate_cache(key: str) -> None:
    """Best-effort cache invalidation. Safe no-op if Redis is unavailable."""
    try:
        redis = await get_redis()
        await redis.delete(key)
    except Exception:  # pragma: no cover - defensive; fail-open
        logger.warning("cache invalidation failed for %s", key)


def user_profile_cache_key(user_id: str) -> str:
    return f"cache:user:{user_id}"


# Versioned so a deploy that changes plans doesn't serve the old cached
# list for up to an hour. Bump when PLAN_DETAILS changes shape or values.
PLANS_CACHE_KEY = "cache:billing:plans:v2"
