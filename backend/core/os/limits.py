"""Per-user request-rate limits for OS writes, using the same Redis counter
pattern as ``api/projects.py`` (``INCR`` + ``EXPIRE``) and the shared
in-memory fallback from ``core.security`` when Redis is unavailable.

These sit on top of the LLM router's own budgets, rate limits and concurrency
leases, which still apply to every model call a turn makes.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Optional

from core.os.common import OsHTTPError

logger = logging.getLogger(__name__)

# (limit, window_seconds)
TURN_LIMIT = (30, 60)
ACTION_LIMIT = (60, 60)
ATTACHMENT_LIMIT = (20, 60)


async def check_rate_limit(
    redis_getter: Optional[Callable[[], Awaitable[Any]]], key: str, limit: int, window: int
) -> None:
    allowed = True
    try:
        if redis_getter is None:
            raise RuntimeError("no redis")
        redis = await redis_getter()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window)
        allowed = current <= limit
    except Exception:
        from core.security import _check_in_memory_rate_limit

        # Per-process fallback, halved so N workers do not multiply the ceiling.
        allowed, _ = await _check_in_memory_rate_limit(key, limit, window, fallback_limit=max(1, limit // 2))
    if not allowed:
        raise OsHTTPError(429, "rate_limited", "Too many requests; please slow down")
