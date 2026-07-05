"""Tests for the per-user LLM request-rate limiter.

Today only a daily token BUDGET exists (core/ai_usage.check_budget) --
nothing bounds request RATE, so a buggy retry loop or malicious script could
hammer LLMRouter.generate() dozens of times per second per user, exhausting
Forge's shared provider rate limits (degrading every other user's builds)
even while staying under the daily token budget.

Fixed by adding a "generate" entry to LLM_RATE_LIMITS (60/minute/user) and
calling check_llm_rate_limit from LLMRouter.generate() the same way
check_email_rate_limit is called from api/auth.py, using the exact same
Redis INCR+EXPIRE-with-in-memory-fallback pattern.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import asyncio

import pytest

import core.security as security_module
from core.llm.provider import BaseProviderAdapter, CompletionResponse
from core.llm.router import LLMRouter, ProviderError


@pytest.fixture(autouse=True)
def _reset_in_memory_rate_limit_state():
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


async def _broken_redis():
    raise ConnectionError("simulated Redis outage")


class _FakeWorkingRedis:
    """Minimal fake Redis supporting only what check_llm_rate_limit uses
    (INCR + EXPIRE), backed by a plain in-process dict -- mirrors the real
    Redis INCR-then-EXPIRE-on-first-hit pattern without a real server."""

    def __init__(self):
        self._counts: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def expire(self, key: str, ttl: int) -> bool:
        return True


class _FakeProvider(BaseProviderAdapter):
    name = "fake"

    async def chat_completion(self, *, model, messages, **kwargs):
        return CompletionResponse(
            text="ok",
            provider=self.name,
            model=model,
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        )

    async def stream_completion(self, *, model, messages, **kwargs):
        async def _iter():
            yield "ok"
        return _iter()


def _make_router_with_fake_provider() -> LLMRouter:
    router = LLMRouter()
    router.registry._providers.clear()
    router.registry._provider_priority.clear()
    router.registry._provider_models.clear()
    router.register_provider(_FakeProvider(), name="fake", priority=999)
    return router


# --- (a) Redis-backed path: allows exactly limit calls, then rejects -------


def test_check_llm_rate_limit_allows_exactly_limit_then_rejects(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    limit = security_module.LLM_RATE_LIMITS["generate"]["limit"]

    async def _drive():
        results = []
        for _ in range(limit + 1):
            results.append(await security_module.check_llm_rate_limit("user-rate-a"))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    assert allowed == [True] * limit + [False]


def test_check_llm_rate_limit_scopes_by_user_not_globally(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    limit = security_module.LLM_RATE_LIMITS["generate"]["limit"]

    async def _drive():
        for _ in range(limit):
            await security_module.check_llm_rate_limit("user-rate-b")
        return await security_module.check_llm_rate_limit("user-rate-c")

    allowed, _ = asyncio.new_event_loop().run_until_complete(_drive())
    assert allowed is True


# --- (b) In-memory fallback when Redis raises ------------------------------


def test_check_llm_rate_limit_falls_back_to_in_memory_when_redis_fails(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)
    limit = security_module.LLM_RATE_LIMITS["generate"]["limit"]

    async def _drive():
        results = []
        for _ in range(limit + 1):
            results.append(await security_module.check_llm_rate_limit("user-rate-fallback"))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    assert allowed == [True] * limit + [False]


# --- (c) LLMRouter.generate() raises when the per-user limit is exceeded --


@pytest.mark.asyncio
async def test_generate_raises_when_rate_limit_exceeded(monkeypatch):
    async def _fake_check_llm_rate_limit(user_id):
        return False, 0

    monkeypatch.setattr(
        "core.security.check_llm_rate_limit", _fake_check_llm_rate_limit
    )

    router = _make_router_with_fake_provider()

    with pytest.raises(ProviderError, match="rate limit"):
        await router.generate(
            agent_name="developer",
            messages=[{"role": "user", "content": "hi"}],
            user_id="user-rate-limited",
        )


# --- (d) No user_id means no rate limiting ---------------------------------


@pytest.mark.asyncio
async def test_generate_does_not_rate_limit_calls_without_user_id():
    router = _make_router_with_fake_provider()

    for _ in range(100):
        result = await router.generate(
            agent_name="developer",
            messages=[{"role": "user", "content": "hi"}],
            user_id=None,
        )
        assert result.text == "ok"
