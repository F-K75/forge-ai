"""Integration test: GET /billing/plans serves through the BE-007 cache-aside
layer. Verifies the plans list is cached after the first read and that a
subsequent read is served from the cache (and that a Redis outage degrades
gracefully to the uncached loader path).
"""
import json
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

import core.cache as cache_module
from api.billing import list_plans


class FakeRedis:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        raw = self.data.get(key)
        return json.loads(raw) if raw is not None else None

    async def setex(self, key, ttl, value):
        self.data[key] = json.dumps(value, default=str)

    async def delete(self, key):
        self.data.pop(key, None)


@pytest.fixture
def fake_cache(monkeypatch):
    store = FakeRedis()

    async def fake_get(key):
        return await store.get(key)

    async def fake_set(key, value, ttl=300):
        await store.setex(key, ttl, value)

    async def fake_redis():
        return store

    monkeypatch.setattr(cache_module, "cache_get_json", fake_get)
    monkeypatch.setattr(cache_module, "cache_set_json", fake_set)
    monkeypatch.setattr(cache_module, "get_redis", fake_redis)
    return store


async def test_plans_are_cached_after_first_read(fake_cache):
    plans = await list_plans()
    assert isinstance(plans, list)
    assert len(plans) >= 1
    assert cache_module.PLANS_CACHE_KEY in fake_cache.data


async def test_second_plans_read_is_served_from_cache(fake_cache):
    await list_plans()
    # Overwrite the cached entry with a sentinel; if the next call returns it
    # verbatim, the read path served the cache instead of rebuilding.
    fake_cache.data[cache_module.PLANS_CACHE_KEY] = json.dumps(["CACHED_SENTINEL"])
    result = await list_plans()
    assert result == ["CACHED_SENTINEL"]


async def test_plans_fail_open_without_redis(monkeypatch):
    async def _boom():
        raise ConnectionError("redis unavailable")

    monkeypatch.setattr(cache_module, "cache_get_json", lambda key: _boom())
    monkeypatch.setattr(cache_module, "cache_set_json", lambda *a, **k: _boom())
    # get_redis isn't reached on the read path because cache_get_json raises
    # first and cached_read is fail-open; just confirm plans still build.
    plans = await list_plans()
    assert isinstance(plans, list)
    assert len(plans) >= 1
