"""Request-owned lease concurrency limiter for LLM calls.

Bounds simultaneous in-flight LLM requests per user by plan tier. Distinct
from ``RateLimiter`` (request *frequency*); this limits *concurrency*.

Redis layout:
  ``llm:conc:{user_id}``          — SET of active ``lease_id`` members
  ``llm:conc:lease:{lease_id}``   — sentinel key with TTL (default 300s);
                                    ``renew`` extends the TTL so long-running
                                    streams keep the lease alive

Acquire uses a Lua script: if SCARD (after stale cleanup) >= limit → reject;
else SADD the lease id and SET the lease key with TTL.

When Redis is unavailable the limiter falls back to a process-local
``asyncio.Semaphore`` at ``max(1, limit // 2)``. Across N replicas that is
an N×50% degraded ceiling (same rationale as ``RateLimiter``'s in-memory
fallback) — not fleet-coordinated.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Dict, Optional, Set

from core.llm.provider import ProviderError

logger = logging.getLogger(__name__)

# Same plan ceilings historically living as ``_CONCURRENT_LIMITS`` in
# ``core.llm.router`` — kept here so the limiter owns the source of truth
# once the router wires through ``get_concurrent_limit``.
CONCURRENT_LIMITS: Dict[str, int] = {
    "free": 2,
    "standard": 5,
    "pro": 10,
    "enterprise": 25,
}

DEFAULT_LEASE_TTL = 300
DEFAULT_ACQUIRE_TIMEOUT = 30.0
_ACQUIRE_POLL_INTERVAL = 0.05

_USER_SET_PREFIX = "llm:conc:"
_LEASE_KEY_PREFIX = "llm:conc:lease:"

# KEYS[1] = user set, ARGV[1]=limit, ARGV[2]=lease_id, ARGV[3]=ttl,
# ARGV[4]=lease key (full). Stale members whose lease key expired are
# purged before the cardinality check so crashes don't permanently burn slots.
_ACQUIRE_LUA = """
local members = redis.call('SMEMBERS', KEYS[1])
local active = 0
for _, mid in ipairs(members) do
  local lkey = 'llm:conc:lease:' .. mid
  if redis.call('EXISTS', lkey) == 0 then
    redis.call('SREM', KEYS[1], mid)
  else
    active = active + 1
  end
end
if active >= tonumber(ARGV[1]) then
  return 0
end
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('SET', ARGV[4], '1', 'EX', tonumber(ARGV[3]))
return 1
"""


class ConcurrencyLimitError(ProviderError):
    """Raised when a user cannot acquire an LLM concurrency lease in time.

    Subclasses ``ProviderError`` so existing router exception handling can
    treat it like other soft-reject paths (budget / policy), or callers can
    catch this type specifically for a 429 + Retry-After response.
    """

    def __init__(
        self,
        message: str = "Concurrent LLM request limit reached",
        *,
        user_id: str = "",
        plan: str = "",
        limit: int = 0,
        retry_after: int = 1,
    ):
        self.user_id = user_id
        self.plan = plan
        self.limit = limit
        self.retry_after = retry_after
        super().__init__(message)


def get_concurrent_limit(plan: str) -> int:
    """Return the concurrency ceiling for ``plan`` (unknown → free)."""
    return CONCURRENT_LIMITS.get(plan, CONCURRENT_LIMITS["free"])


def _user_set_key(user_id: str) -> str:
    return f"{_USER_SET_PREFIX}{user_id}"


def _lease_key(lease_id: str) -> str:
    return f"{_LEASE_KEY_PREFIX}{lease_id}"


class ConcurrencyLimiter:
    """Per-user lease limiter: acquire → (renew while streaming) → release."""

    def __init__(self, *, default_ttl: int = DEFAULT_LEASE_TTL) -> None:
        self.default_ttl = default_ttl
        # Redis-down fallback: plan → Semaphore at max(1, limit//2), plus a
        # dict of locally held lease_ids so release/renew stay consistent.
        self._local_semaphores: Dict[str, asyncio.Semaphore] = {}
        self._local_leases: Dict[str, Set[str]] = {}  # user_id → lease_ids
        self._local_lease_meta: Dict[str, str] = {}  # lease_id → user_id
        self._local_lock = asyncio.Lock()

    async def _get_redis(self):
        from core.database import get_redis

        return await get_redis()

    def _local_limit(self, plan: str) -> int:
        return max(1, get_concurrent_limit(plan) // 2)

    def _local_sem(self, user_id: str, plan: str) -> asyncio.Semaphore:
        # Key by user+plan so a plan upgrade mid-process gets a new ceiling
        # on next acquire after Redis recovers; while degraded we keep the
        # first observed plan for this user in-process.
        key = f"{user_id}:{plan}"
        if key not in self._local_semaphores:
            self._local_semaphores[key] = asyncio.Semaphore(self._local_limit(plan))
        return self._local_semaphores[key]

    async def acquire(
        self,
        user_id: str,
        plan: str,
        *,
        lease_id: str | None = None,
        timeout: float = DEFAULT_ACQUIRE_TIMEOUT,
        ttl: int | None = None,
    ) -> str:
        """Acquire a concurrency lease; return ``lease_id``.

        Polls until ``timeout`` seconds elapse, then raises
        ``ConcurrencyLimitError``. Pass an existing ``lease_id`` to retry
        the same id (idempotent SADD); otherwise a UUID4 is generated.
        """
        lease_id = lease_id or str(uuid.uuid4())
        lease_ttl = ttl if ttl is not None else self.default_ttl
        limit = get_concurrent_limit(plan)
        deadline = time.monotonic() + timeout

        while True:
            try:
                acquired = await self._try_acquire_redis(user_id, lease_id, limit, lease_ttl)
                if acquired:
                    return lease_id
            except Exception as exc:
                logger.warning(
                    "Concurrency limiter Redis error for user %s, falling back to local semaphore "
                    "(N×50%% degraded mode): %s",
                    user_id,
                    exc,
                )
                return await self._acquire_local(user_id, plan, lease_id, timeout=max(0.0, deadline - time.monotonic()))

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ConcurrencyLimitError(
                    f"Concurrent LLM limit reached for plan '{plan}' (limit={limit})",
                    user_id=user_id,
                    plan=plan,
                    limit=limit,
                    retry_after=1,
                )
            await asyncio.sleep(min(_ACQUIRE_POLL_INTERVAL, remaining))

    async def _try_acquire_redis(self, user_id: str, lease_id: str, limit: int, ttl: int) -> bool:
        redis = await self._get_redis()
        result = await redis.eval(
            _ACQUIRE_LUA,
            1,
            _user_set_key(user_id),
            str(limit),
            lease_id,
            str(ttl),
            _lease_key(lease_id),
        )
        return int(result or 0) == 1

    async def _acquire_local(self, user_id: str, plan: str, lease_id: str, *, timeout: float) -> str:
        sem = self._local_sem(user_id, plan)
        try:
            await asyncio.wait_for(sem.acquire(), timeout=timeout)
        except asyncio.TimeoutError:
            limit = self._local_limit(plan)
            raise ConcurrencyLimitError(
                f"Concurrent LLM limit reached (local degraded mode, limit={limit})",
                user_id=user_id,
                plan=plan,
                limit=limit,
                retry_after=1,
            )
        async with self._local_lock:
            self._local_leases.setdefault(user_id, set()).add(lease_id)
            self._local_lease_meta[lease_id] = user_id
        return lease_id

    async def release(self, user_id: str, lease_id: str) -> None:
        """Drop the lease from the user set and delete the lease key."""
        try:
            redis = await self._get_redis()
            pipe = redis.pipeline()
            pipe.srem(_user_set_key(user_id), lease_id)
            pipe.delete(_lease_key(lease_id))
            await pipe.execute()
        except Exception as exc:
            logger.warning(
                "Concurrency limiter Redis release failed for user %s lease %s, clearing local: %s",
                user_id,
                lease_id,
                exc,
            )
        await self._release_local(user_id, lease_id)

    async def _release_local(self, user_id: str, lease_id: str) -> None:
        async with self._local_lock:
            leases = self._local_leases.get(user_id)
            if not leases or lease_id not in leases:
                return
            leases.discard(lease_id)
            self._local_lease_meta.pop(lease_id, None)
            # Release one permit on any semaphore keyed for this user.
            for key, sem in self._local_semaphores.items():
                if key.startswith(f"{user_id}:"):
                    sem.release()
                    break

    async def renew(self, user_id: str, lease_id: str, ttl: int = DEFAULT_LEASE_TTL) -> None:
        """Extend the lease TTL (no-op for process-local leases)."""
        try:
            redis = await self._get_redis()
            # Only renew if this lease still belongs to the user's set.
            is_member = await redis.sismember(_user_set_key(user_id), lease_id)
            if not is_member:
                return
            await redis.expire(_lease_key(lease_id), ttl)
        except Exception as exc:
            logger.warning(
                "Concurrency limiter Redis renew failed for user %s lease %s (local leases have no TTL): %s",
                user_id,
                lease_id,
                exc,
            )


_concurrency_limiter: Optional[ConcurrencyLimiter] = None


def get_concurrency_limiter() -> ConcurrencyLimiter:
    """Module-level singleton used by the LLM router."""
    global _concurrency_limiter
    if _concurrency_limiter is None:
        _concurrency_limiter = ConcurrencyLimiter()
    return _concurrency_limiter
