"""Redis-backed LLM circuit breaker (fleet-wide).

State machine (per scope — global or per-provider)::

    closed ──(failures >= threshold)──► open
      ▲                                  │
      │                                  │ recovery_timeout elapsed
      │                                  ▼
      └────────(probe success)──── half_open ──(probe failure)──► open

Keys:
  ``llm:cb:global``
  ``llm:cb:provider:{name}``

Value (JSON): ``{state, failure_count, opened_at}`` with ``opened_at`` from
``time.time()``.

When Redis is unavailable the breaker falls back to **process-local** state
starting ``closed``. That mode is degraded: each replica trips independently
and does **not** coordinate fleet-wide open/half-open claims.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Defaults match agents.base.CircuitBreaker for global; providers trip sooner
# so a single bad upstream does not wait for the global threshold.
DEFAULT_GLOBAL_FAILURE_THRESHOLD = 5
DEFAULT_PROVIDER_FAILURE_THRESHOLD = 3
DEFAULT_RECOVERY_TIMEOUT = 60

_GLOBAL_KEY = "llm:cb:global"
_PROVIDER_KEY_PREFIX = "llm:cb:provider:"

# Atomic half-open claim: only one worker may transition open → half_open
# once recovery_timeout has elapsed. Compare-and-set inside Lua so concurrent
# probes cannot all enter half_open.
_HALF_OPEN_CLAIM_LUA = """
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local ok, data = pcall(cjson.decode, raw)
if not ok or type(data) ~= 'table' then
  return 0
end
if data['state'] ~= 'open' then
  return 0
end
local opened_at = tonumber(data['opened_at']) or 0
local now = tonumber(ARGV[1])
local recovery = tonumber(ARGV[2])
if (now - opened_at) <= recovery then
  return 0
end
data['state'] = 'half_open'
redis.call('SET', KEYS[1], cjson.encode(data))
return 1
"""


def _redis_key(scope: str) -> str:
    """Map scope ``global`` / ``provider:{name}`` to the Redis key."""
    if scope == "global":
        return _GLOBAL_KEY
    if scope.startswith("provider:"):
        return f"llm:cb:{scope}"
    raise ValueError(f"Invalid circuit-breaker scope: {scope!r} (expected 'global' or 'provider:{{name}}')")


def _empty_state() -> Dict[str, Any]:
    return {"state": "closed", "failure_count": 0, "opened_at": None}


class LLMCircuitBreaker:
    """Fleet-wide LLM circuit breaker backed by Redis, with local fallback.

    Scope strings are ``\"global\"`` or ``\"provider:{name}\"``. Callers
    typically check ``is_open`` / ``can_call``, then ``try_half_open_claim``
    when the breaker is open but recovery has elapsed, then
    ``record_success`` / ``record_failure`` around the LLM call.
    """

    def __init__(
        self,
        *,
        global_failure_threshold: int = DEFAULT_GLOBAL_FAILURE_THRESHOLD,
        provider_failure_threshold: int = DEFAULT_PROVIDER_FAILURE_THRESHOLD,
        recovery_timeout: int = DEFAULT_RECOVERY_TIMEOUT,
    ) -> None:
        self.global_failure_threshold = global_failure_threshold
        self.provider_failure_threshold = provider_failure_threshold
        self.recovery_timeout = recovery_timeout
        # Process-local fallback when Redis is down. Starts closed (degraded,
        # not fleet-wide — each process has its own counters).
        self._local: Dict[str, Dict[str, Any]] = {}

    def _threshold_for(self, scope: str) -> int:
        if scope == "global":
            return self.global_failure_threshold
        return self.provider_failure_threshold

    # ------------------------------------------------------------------
    # Redis helpers
    # ------------------------------------------------------------------

    async def _get_redis(self):
        from core.database import get_redis

        return await get_redis()

    async def _load(self, scope: str) -> Dict[str, Any]:
        key = _redis_key(scope)
        try:
            redis = await self._get_redis()
            raw = await redis.get(key)
            if not raw:
                return _empty_state()
            data = json.loads(raw)
            if not isinstance(data, dict) or "state" not in data:
                return _empty_state()
            return {
                "state": data.get("state", "closed"),
                "failure_count": int(data.get("failure_count") or 0),
                "opened_at": data.get("opened_at"),
            }
        except Exception as exc:
            logger.warning(
                "Circuit breaker Redis read failed for %s, using process-local state: %s",
                scope,
                exc,
            )
            return dict(self._local.get(scope, _empty_state()))

    async def _store(self, scope: str, state: Dict[str, Any]) -> None:
        key = _redis_key(scope)
        payload = json.dumps(state)
        try:
            redis = await self._get_redis()
            await redis.set(key, payload)
            # Keep local mirror in sync so a later Redis outage starts from
            # a reasonable snapshot rather than a cold closed state.
            self._local[scope] = dict(state)
        except Exception as exc:
            logger.warning(
                "Circuit breaker Redis write failed for %s, persisting process-local only: %s",
                scope,
                exc,
            )
            self._local[scope] = dict(state)

    def _local_state(self, scope: str) -> Dict[str, Any]:
        if scope not in self._local:
            self._local[scope] = _empty_state()
        return self._local[scope]

    def _recovery_elapsed(self, state: Dict[str, Any], *, now: Optional[float] = None) -> bool:
        opened_at = state.get("opened_at")
        if opened_at is None:
            return False
        return ((now if now is not None else time.time()) - float(opened_at)) > self.recovery_timeout

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def can_call(self, scope: str) -> bool:
        """Return True if a call may proceed without a half-open claim.

        Closed and half_open allow traffic. Open always returns False —
        callers that see open should use ``try_half_open_claim`` once
        recovery has elapsed (see ``is_open``).
        """
        state = await self._load(scope)
        return state["state"] in ("closed", "half_open")

    async def is_open(self, scope: str) -> bool:
        """True when the breaker is open and not yet claimable for half-open.

        When open *and* recovery has elapsed this returns False so the
        caller can attempt ``try_half_open_claim``.
        """
        state = await self._load(scope)
        if state["state"] != "open":
            return False
        return not self._recovery_elapsed(state)

    async def try_half_open_claim(self, scope: str) -> bool:
        """Atomically claim the half-open probe slot for ``scope``.

        Returns True only for the single worker that transitions
        ``open → half_open`` after ``recovery_timeout``. Other workers
        (or a still-cooling breaker) get False.
        """
        key = _redis_key(scope)
        now = time.time()
        try:
            redis = await self._get_redis()
            result = await redis.eval(
                _HALF_OPEN_CLAIM_LUA,
                1,
                key,
                str(now),
                str(self.recovery_timeout),
            )
            claimed = int(result or 0) == 1
            if claimed:
                # Refresh local mirror after a successful claim.
                local = self._local_state(scope)
                local["state"] = "half_open"
            return claimed
        except Exception as exc:
            logger.warning(
                "Circuit breaker half-open claim Redis error for %s, using process-local: %s",
                scope,
                exc,
            )
            return self._try_half_open_claim_local(scope, now=now)

    def _try_half_open_claim_local(self, scope: str, *, now: float) -> bool:
        state = self._local_state(scope)
        if state["state"] != "open":
            return False
        if not self._recovery_elapsed(state, now=now):
            return False
        # Process-local "atomic" claim — only meaningful within this process.
        state["state"] = "half_open"
        return True

    async def record_success(self, scope: str) -> None:
        """Reset the breaker to closed after a successful call/probe."""
        await self._store(
            scope,
            {"state": "closed", "failure_count": 0, "opened_at": None},
        )

    async def record_failure(self, scope: str) -> None:
        """Increment failures; open the breaker when the threshold is hit."""
        state = await self._load(scope)
        state["failure_count"] = int(state.get("failure_count") or 0) + 1
        threshold = self._threshold_for(scope)
        # Half-open probe failure re-opens immediately; closed trips at threshold.
        if state["state"] == "half_open" or state["failure_count"] >= threshold:
            state["state"] = "open"
            state["opened_at"] = time.time()
        await self._store(scope, state)

    async def retry_after(self, scope: str) -> int:
        """Seconds until the open breaker may accept a half-open claim."""
        state = await self._load(scope)
        if state["state"] != "open" or state.get("opened_at") is None:
            return 0
        elapsed = time.time() - float(state["opened_at"])
        remaining = self.recovery_timeout - int(elapsed)
        return max(0, remaining)

    async def filter_providers(self, providers: List[str]) -> List[str]:
        """Exclude fully-open providers; put degraded (half_open) last.

        Providers whose breaker is open and not yet claimable are dropped.
        Half-open providers stay eligible but are sorted to the end so
        healthy closed providers are preferred.
        """
        healthy: List[str] = []
        degraded: List[str] = []
        for name in providers:
            scope = f"provider:{name}"
            state = await self._load(scope)
            status = state["state"]
            if status == "open" and not self._recovery_elapsed(state):
                continue
            if status == "half_open":
                degraded.append(name)
            else:
                # closed, or open-but-claimable (treat as degraded probe candidate)
                if status == "open":
                    degraded.append(name)
                else:
                    healthy.append(name)
        return healthy + degraded

    def reorder_providers(
        self,
        providers: List[str],
        *,
        open_check: Dict[str, bool],
    ) -> List[str]:
        """Sync helper: drop providers marked open; preserve relative order.

        ``open_check`` maps provider name → True if that provider's breaker
        is open (and not claimable). Prefer ``filter_providers`` when async
        Redis state is available.
        """
        return [p for p in providers if not open_check.get(p, False)]


_circuit_breaker: Optional[LLMCircuitBreaker] = None


def get_circuit_breaker() -> LLMCircuitBreaker:
    """Module-level singleton used by the LLM router / agents."""
    global _circuit_breaker
    if _circuit_breaker is None:
        _circuit_breaker = LLMCircuitBreaker()
    return _circuit_breaker
