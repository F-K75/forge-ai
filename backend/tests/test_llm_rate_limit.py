"""Tests for the multi-dimensional LLM request-rate limiter.

Today only a daily token BUDGET exists (core/ai_usage.check_budget) -- nothing
bounds request RATE, so a buggy retry loop or malicious script could hammer
LLMRouter.generate() dozens of times per second, exhausting Forge's shared
provider rate limits (degrading every other user's builds) even while staying
under the daily token budget.

check_llm_rate_limit enforces three dimensions -- user, project, org -- each a
Redis INCR+EXPIRE key with an in-memory fail-closed fallback, the same pattern
as check_email_rate_limit. A request is rejected if ANY dimension is over its
limit, so a single runaway build loop (project) can't starve the user's other
projects and an org can't crowd out others.
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


def _user_limit():
    return security_module.LLM_RATE_LIMIT_DIMENSIONS["user"]["limit"]


# --- (a) Redis-backed path: allows exactly limit calls, then rejects -------


def test_check_llm_rate_limit_allows_exactly_limit_then_rejects(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    limit = _user_limit()

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
    limit = _user_limit()

    async def _drive():
        for _ in range(limit):
            await security_module.check_llm_rate_limit("user-rate-b")
        return await security_module.check_llm_rate_limit("user-rate-c")

    allowed, _ = asyncio.new_event_loop().run_until_complete(_drive())
    assert allowed is True


# --- (a2) Per-project + per-org dimensions are enforced independently -------


def test_project_dimension_rejects_when_project_over_limit(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    project_limit = security_module.LLM_RATE_LIMIT_DIMENSIONS["project"]["limit"]

    async def _drive():
        results = []
        for _ in range(project_limit + 1):
            results.append(
                await security_module.check_llm_rate_limit(
                    "user-x", project_id="proj-runaway"
                )
            )
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    # User is under their limit, but the runaway PROJECT trips first.
    assert allowed == [True] * project_limit + [False]


def test_org_dimension_rejects_when_org_over_limit(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    # Make org the binding dimension (otherwise user/project bind first).
    monkeypatch.setitem(
        security_module.LLM_RATE_LIMIT_DIMENSIONS, "user", {"limit": 1000, "window": 60}
    )
    monkeypatch.setitem(
        security_module.LLM_RATE_LIMIT_DIMENSIONS, "project", {"limit": 1000, "window": 60}
    )
    org_limit = security_module.LLM_RATE_LIMIT_DIMENSIONS["org"]["limit"]

    async def _drive():
        results = []
        for _ in range(org_limit + 1):
            results.append(
                await security_module.check_llm_rate_limit(
                    "user-y", project_id="proj-y", org_id="org-big"
                )
            )
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    assert allowed == [True] * org_limit + [False]


def test_distinct_projects_do_not_share_project_quota(monkeypatch):
    fake_redis = _FakeWorkingRedis()

    async def _get_fake_redis():
        return fake_redis

    monkeypatch.setattr(security_module, "get_redis", _get_fake_redis)
    project_limit = security_module.LLM_RATE_LIMIT_DIMENSIONS["project"]["limit"]

    async def _drive():
        for _ in range(project_limit):
            await security_module.check_llm_rate_limit("user-z", project_id="proj-1")
        return await security_module.check_llm_rate_limit("user-z", project_id="proj-2")

    allowed, _ = asyncio.new_event_loop().run_until_complete(_drive())
    assert allowed is True


# --- (b) In-memory fallback when Redis raises ------------------------------


def test_check_llm_rate_limit_falls_back_to_in_memory_when_redis_fails(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)
    limit = _user_limit()

    async def _drive():
        results = []
        for _ in range(limit + 1):
            results.append(await security_module.check_llm_rate_limit("user-rate-fallback"))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    # The conservative in-memory fallback enforces limit // 2 (e.g. 60 // 2 = 30).
    fallback = limit // 2
    assert allowed == [True] * fallback + [False] * (limit + 1 - fallback)


# --- (c) LLMRouter.generate() raises when the per-user limit is exceeded --


@pytest.mark.asyncio
async def test_generate_raises_when_rate_limit_exceeded(monkeypatch):
    async def _fake_check_llm_rate_limit(user_id, *, project_id=None, org_id=None):
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
            project_id="proj-1",
            org_id="org-1",
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


def test_check_llm_rate_limit_uses_conservative_half_limit_in_fallback(monkeypatch):
    """SEC-004 residual: with Redis down, the in-memory fallback must enforce
    half the normal limit so a multi-replica outage doesn't silently multiply
    the effective ceiling."""
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)
    limit = _user_limit()  # e.g. 60

    async def _drive():
        results = []
        for _ in range(limit + 1):
            results.append(await security_module.check_llm_rate_limit("user-rate-fallback"))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    # Redis limit is 60, but in-memory fallback uses 60 // 2 = 30.
    assert allowed == [True] * (limit // 2) + [False] * (limit - limit // 2 + 1)
