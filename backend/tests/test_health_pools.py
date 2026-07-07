"""Regression tests for INF-008: connection-pool monitoring.

The pool is already capped (Mongo maxPoolSize/minPoolSize + timeouts, Redis
max_connections + socket timeouts in core/database.py). This adds live pool
utilization surfaced via GET /health/pools using stable public APIs
(MongoDB serverStatus.connections, Redis INFO clients). The endpoint must
report utilization on the happy path and degrade gracefully (error key, not a
500) if a backend is unavailable.
"""
import os

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest

from core import database as db_module
from main import health_pools


class _FakeClient:
    def __init__(self):
        self.options = type("O", (), {"max_pool_size": 50, "min_pool_size": 10})()


class _FakeMongo:
    def __init__(self):
        self.client = _FakeClient()

    async def command(self, cmd):
        if cmd == "serverStatus":
            return {"connections": {"current": 7, "available": 43, "totalCreated": 250}}
        if cmd == "ping":
            return {}
        raise ValueError(f"unexpected command {cmd}")


class _FakeRedis:
    def __init__(self):
        self.connection_pool = type("P", (), {"max_connections": 50})()

    async def info(self, section):
        return {"connected_clients": 3, "blocked_clients": 0}


@pytest.mark.asyncio
async def test_health_pools_reports_utilization(monkeypatch):
    async def _fake_mongo():
        return _FakeMongo()

    async def _fake_redis():
        return _FakeRedis()

    monkeypatch.setattr(db_module, "get_db", _fake_mongo)
    monkeypatch.setattr(db_module, "get_redis", _fake_redis)

    result = await health_pools()

    assert result["mongo"]["current"] == 7
    assert result["mongo"]["available"] == 43
    assert result["mongo"]["total_created"] == 250
    assert result["mongo"]["max_pool_size"] == 50
    assert result["mongo"]["min_pool_size"] == 10
    assert result["redis"]["connected_clients"] == 3
    assert result["redis"]["blocked_clients"] == 0
    assert result["redis"]["max_connections"] == 50


@pytest.mark.asyncio
async def test_health_pools_degrades_when_mongo_down(monkeypatch):
    async def _boom_db():
        raise RuntimeError("mongo unreachable")

    async def _fake_redis():
        return _FakeRedis()

    monkeypatch.setattr(db_module, "get_db", _boom_db)
    monkeypatch.setattr(db_module, "get_redis", _fake_redis)

    result = await health_pools()
    assert "error" in result["mongo"]
    # Redis half still works.
    assert result["redis"]["connected_clients"] == 3


@pytest.mark.asyncio
async def test_health_pools_degrades_when_redis_down(monkeypatch):
    async def _boom_redis():
        raise RuntimeError("redis unreachable")

    async def _fake_mongo():
        return _FakeMongo()

    monkeypatch.setattr(db_module, "get_db", _fake_mongo)
    monkeypatch.setattr(db_module, "get_redis", _boom_redis)

    result = await health_pools()
    assert result["mongo"]["current"] == 7
    assert "error" in result["redis"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
