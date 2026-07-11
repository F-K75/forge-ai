from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Same three dimensions and defaults as the fixed-window limiter this
# replaces: a request is rejected if ANY dimension is over its limit, so a
# single runaway build loop (project) can't starve the user's other
# projects, and an org can't crowd out others at the org level.
# (limit, window_seconds)
DEFAULT_LIMITS: Dict[str, Tuple[int, int]] = {
    "user": (60, 60),
    "project": (30, 60),
    "org": (300, 60),
}

# Multiplies the base "user" dimension limit by plan tier. Distinct from
# `_CONCURRENT_LIMITS` in core/llm/router.py, which bounds simultaneous
# in-flight requests, not request frequency.
PLAN_MULTIPLIERS: Dict[str, float] = {
    "free": 1.0,
    "standard": 2.0,
    "pro": 5.0,
    "enterprise": 20.0,
}

_IN_MEMORY_MAX_KEYS = 10000


class RateLimiter:
    """Sliding-window (Redis sorted-set log) request-frequency limiter,
    composed into LLMRouter like AIOptimizer/PolicyEngine. Replaces the
    fixed-window core.security.check_llm_rate_limit: a fixed window lets a
    burst straddling the window boundary admit up to 2x the limit, whereas
    a sliding log bounds it to exactly the limit at any point in time.

    Pure w.r.t. plan/org resolution -- callers pass already-resolved limits
    (matching PolicyEngine.enforce's style), this class only touches Redis
    (or the in-memory fallback)."""

    def __init__(self) -> None:
        self._in_memory: Dict[str, List[float]] = {}

    async def check(
        self,
        *,
        user_id: str,
        project_id: Optional[str] = None,
        org_id: Optional[str] = None,
        user_limit: int = 60,
        project_limit: int = 30,
        org_limit: int = 300,
        window: int = 60,
    ) -> Tuple[bool, int]:
        dimensions = [("user", user_id, user_limit, window)]
        if project_id:
            dimensions.append(("project", project_id, project_limit, window))
        if org_id:
            dimensions.append(("org", org_id, org_limit, window))

        allowed = True
        tightest_remaining: Optional[int] = None
        for dim, identity, limit, dim_window in dimensions:
            dim_allowed, remaining = await self._check_dimension(dim, identity, limit, dim_window)
            allowed = allowed and dim_allowed
            tightest_remaining = remaining if tightest_remaining is None else min(tightest_remaining, remaining)

        return allowed, (tightest_remaining or 0)

    async def _check_dimension(self, dim: str, identity: str, limit: int, window: int) -> Tuple[bool, int]:
        key = f"rl:llm:sw:{dim}:{identity}"
        now = time.time()
        try:
            from core.database import get_redis

            redis = await get_redis()
            await redis.zremrangebyscore(key, 0, now - window)
            await redis.zadd(key, {str(now): now})
            count = await redis.zcard(key)
            await redis.expire(key, window)
            remaining = max(0, limit - count)
            return count <= limit, remaining
        except Exception as exc:
            # Redis unavailable -- fail closed within this process via the
            # in-memory limiter with a conservative 50% limit so a
            # multi-replica outage doesn't silently multiply the effective
            # ceiling (matches the rationale of the limiter being replaced).
            logger.warning("Rate limiter Redis error for %s:%s, falling back to in-memory: %s", dim, identity, exc)
            fallback_limit = max(1, limit // 2)
            return self._check_in_memory(key, fallback_limit, window)

    def _check_in_memory(self, key: str, limit: int, window: int) -> Tuple[bool, int]:
        if len(self._in_memory) > _IN_MEMORY_MAX_KEYS:
            self._in_memory.clear()
        now = time.time()
        timestamps = [t for t in self._in_memory.get(key, []) if t > now - window]
        timestamps.append(now)
        self._in_memory[key] = timestamps
        count = len(timestamps)
        remaining = max(0, limit - count)
        return count <= limit, remaining
