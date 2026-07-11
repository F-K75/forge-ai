"""Tests for the sliding-window RateLimiter (core/llm/rate_limiter.py),
which replaces the fixed-window core.security.check_llm_rate_limit."""

import pytest

from core.llm.config import LLMConfigLoader
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.rate_limiter import DEFAULT_LIMITS, PLAN_MULTIPLIERS, RateLimiter
from core.llm.router import LLMRouter


class _FakeRedis:
    """In-process sorted-set double supporting the four primitives the
    sliding-window limiter uses: zremrangebyscore/zadd/zcard/expire."""

    def __init__(self, *, should_fail: bool = False):
        self.sets = {}
        self.should_fail = should_fail

    async def zremrangebyscore(self, key, min_score, max_score):
        if self.should_fail:
            raise ConnectionRefusedError("redis down")
        s = self.sets.setdefault(key, {})
        for member in [m for m, score in s.items() if min_score <= score <= max_score]:
            del s[member]

    async def zadd(self, key, mapping):
        if self.should_fail:
            raise ConnectionRefusedError("redis down")
        self.sets.setdefault(key, {}).update(mapping)

    async def zcard(self, key):
        if self.should_fail:
            raise ConnectionRefusedError("redis down")
        return len(self.sets.get(key, {}))

    async def expire(self, key, ttl):
        if self.should_fail:
            raise ConnectionRefusedError("redis down")


def _patch_redis(monkeypatch, redis):
    async def _get_redis():
        return redis

    monkeypatch.setattr("core.database.get_redis", _get_redis)


@pytest.mark.asyncio
async def test_allows_exactly_limit_then_rejects(monkeypatch):
    _patch_redis(monkeypatch, _FakeRedis())
    limiter = RateLimiter()

    results = []
    for _ in range(12):
        allowed, _ = await limiter.check(user_id="u1", user_limit=10, window=60)
        results.append(allowed)

    assert results == [True] * 10 + [False] * 2


@pytest.mark.asyncio
async def test_distinct_users_do_not_share_quota(monkeypatch):
    _patch_redis(monkeypatch, _FakeRedis())
    limiter = RateLimiter()

    for _ in range(5):
        await limiter.check(user_id="u1", user_limit=5, window=60)

    allowed, _ = await limiter.check(user_id="u1", user_limit=5, window=60)
    assert allowed is False

    allowed, _ = await limiter.check(user_id="u2", user_limit=5, window=60)
    assert allowed is True


@pytest.mark.asyncio
async def test_project_dimension_rejects_independently_of_user_dimension(monkeypatch):
    _patch_redis(monkeypatch, _FakeRedis())
    limiter = RateLimiter()

    for _ in range(3):
        allowed, _ = await limiter.check(
            user_id="u1", project_id="p1", user_limit=1000, project_limit=3, window=60,
        )
        assert allowed is True

    allowed, _ = await limiter.check(
        user_id="u1", project_id="p1", user_limit=1000, project_limit=3, window=60,
    )
    assert allowed is False


@pytest.mark.asyncio
async def test_distinct_projects_do_not_share_project_quota(monkeypatch):
    _patch_redis(monkeypatch, _FakeRedis())
    limiter = RateLimiter()

    for _ in range(3):
        await limiter.check(user_id="u1", project_id="p1", user_limit=1000, project_limit=3, window=60)

    allowed, _ = await limiter.check(user_id="u1", project_id="p2", user_limit=1000, project_limit=3, window=60)
    assert allowed is True


@pytest.mark.asyncio
async def test_falls_back_to_in_memory_at_half_limit_when_redis_fails(monkeypatch):
    _patch_redis(monkeypatch, _FakeRedis(should_fail=True))
    limiter = RateLimiter()

    results = []
    for _ in range(6):
        allowed, _ = await limiter.check(user_id="u1", user_limit=10, window=60)
        results.append(allowed)

    # fallback_limit = max(1, 10 // 2) = 5
    assert results == [True] * 5 + [False]


@pytest.mark.asyncio
async def test_router_skips_check_when_no_user_id(monkeypatch):
    class FakeProvider(BaseProviderAdapter):
        name = "fake"

        async def chat_completion(self, *, model, messages, **kwargs):
            return CompletionResponse(text="ok", provider=self.name, model=model, usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2})

        async def stream_completion(self, *, model, messages, **kwargs):
            yield "ok"

    router = LLMRouter()
    router.register_provider(FakeProvider(), name="fake", priority=1)

    for _ in range(20):
        result = await router.generate(
            agent_name="developer", messages=[{"role": "user", "content": "hi"}], provider_names=["fake"],
        )
        assert result.text == "ok"


@pytest.mark.asyncio
async def test_router_raises_provider_error_when_rate_limited():
    class StubRateLimiter:
        async def check(self, **kwargs):
            return False, 0

    class FakeProvider(BaseProviderAdapter):
        name = "fake"

        async def chat_completion(self, *, model, messages, **kwargs):
            return CompletionResponse(text="ok", provider=self.name, model=model, usage={})

        async def stream_completion(self, *, model, messages, **kwargs):
            yield "ok"

    router = LLMRouter(rate_limiter=StubRateLimiter())
    router.register_provider(FakeProvider(), name="fake", priority=1)

    with pytest.raises(ProviderError, match="rate limit"):
        await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}], user_id="u1")


@pytest.mark.asyncio
async def test_router_applies_plan_multiplier_to_user_limit(monkeypatch):
    """A pro user's effective limit should be PLAN_MULTIPLIERS['pro']x a free
    user's, resolved via the small plan lookup in _check_rate_limit."""
    captured = {}

    class CapturingRateLimiter:
        async def check(self, **kwargs):
            captured.update(kwargs)
            return True, 999

    class _FakeUsers:
        def __init__(self, plan):
            self.plan = plan

        async def find_one(self, query, projection=None):
            return {"plan": self.plan}

    class _FakeDB:
        def __init__(self, plan):
            self.users = _FakeUsers(plan)

    async def _get_db():
        return _FakeDB("pro")

    monkeypatch.setattr("core.database.get_db", _get_db)

    router = LLMRouter(rate_limiter=CapturingRateLimiter())
    await router._check_rate_limit("u1", project_id=None, org_id=None)

    assert captured["user_limit"] == int(DEFAULT_LIMITS["user"][0] * PLAN_MULTIPLIERS["pro"])


@pytest.mark.asyncio
async def test_org_override_wins_over_plan_derived_limit(monkeypatch):
    captured = {}

    class CapturingRateLimiter:
        async def check(self, **kwargs):
            captured.update(kwargs)
            return True, 999

    class _FakeUsers:
        async def find_one(self, query, projection=None):
            return {"plan": "free"}

    class _FakeDB:
        def __init__(self):
            self.users = _FakeUsers()

    async def _get_db():
        return _FakeDB()

    monkeypatch.setattr("core.database.get_db", _get_db)

    config_loader = LLMConfigLoader()
    config_loader._org_policy_overrides["org-1"] = {"requests_per_minute": 500}

    router = LLMRouter(rate_limiter=CapturingRateLimiter(), config_loader=config_loader)
    await router._check_rate_limit("u1", project_id=None, org_id="org-1")

    assert captured["user_limit"] == 500
