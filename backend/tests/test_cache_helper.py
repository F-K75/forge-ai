"""Unit tests for the reusable cache-aside helper (BE-007).

Uses an in-memory fake Redis so the cache read/write/invalidation paths are
exercised deterministically without a live Redis.
"""
import json

import pytest

import core.cache as cache_module
from core.cache import (
    cached_read,
    invalidate_cache,
    user_profile_cache_key,
    PLANS_CACHE_KEY,
)


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


async def test_cache_miss_calls_loader_and_stores(fake_cache):
    calls = []

    async def loader():
        calls.append(1)
        return {"value": 42}

    result = await cached_read("k1", 300, loader)
    assert result == {"value": 42}
    assert calls == [1]
    assert "k1" in fake_cache.data


async def test_cache_hit_returns_cached_without_calling_loader(fake_cache):
    # Seed the cache exactly as cache_set_json would: a JSON string.
    fake_cache.data["k2"] = json.dumps({"value": 7})
    calls = []

    async def loader():
        calls.append(1)
        return {"value": 99}

    result = await cached_read("k2", 300, loader)
    assert result == {"value": 7}
    assert calls == []


async def test_fail_open_when_cache_read_errors(fake_cache, monkeypatch):
    async def _boom(key):
        raise RuntimeError("redis down")

    monkeypatch.setattr(cache_module, "cache_get_json", _boom)
    calls = []

    async def loader():
        calls.append(1)
        return {"ok": True}

    result = await cached_read("k3", 300, loader)
    assert result == {"ok": True}
    assert calls == [1]


async def test_invalidate_cache_deletes_key(fake_cache):
    await fake_cache.setex("k4", 300, "x")
    await invalidate_cache("k4")
    assert "k4" not in fake_cache.data


def test_user_profile_cache_key_format():
    assert user_profile_cache_key("u1") == "cache:user:u1"


def test_plans_cache_key_constant():
    assert PLANS_CACHE_KEY == "cache:billing:plans"
