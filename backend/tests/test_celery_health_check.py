"""Regression test for BE-011: neither /health nor /health/detailed checked
Celery worker liveness at all. Found 2026-07-03. Fixed by adding a
control.inspect().ping() check to /health/detailed (not /health -- that one
is a Kubernetes liveness probe and should stay a cheap, dependency-free
"is the process responsive" check; conflating it with a readiness check
would make Kubernetes kill+restart the backend pod over a Celery outage it
can't fix by restarting, which is a correctness regression, not a fix).
"""

import pytest

import main


class _FakeDB:
    async def command(self, name):
        return {"ok": 1}


class _FakeRedis:
    async def ping(self):
        return True


@pytest.fixture
def _healthy_external_deps(monkeypatch):
    async def _fake_get_db():
        return _FakeDB()

    async def _fake_get_redis():
        return _FakeRedis()

    monkeypatch.setattr("core.database.get_db", _fake_get_db)
    monkeypatch.setattr("core.database.get_redis", _fake_get_redis)


@pytest.mark.asyncio
async def test_health_detailed_reports_ok_when_workers_respond(monkeypatch, _healthy_external_deps):
    class _FakeInspect:
        def ping(self):
            return {"celery@worker1": {"ok": "pong"}}

    monkeypatch.setattr(
        "celery_app.celery_app.control.inspect", lambda timeout=1.0: _FakeInspect()
    )

    result = await main.health_detailed()

    assert result["checks"]["celery"] == "ok (1 worker(s))"
    assert result["checks"]["database"] == "ok"
    assert result["checks"]["redis"] == "ok"
    assert result["status"] == "ok"


@pytest.mark.asyncio
async def test_health_detailed_degrades_when_no_workers_respond(monkeypatch, _healthy_external_deps):
    class _FakeInspect:
        def ping(self):
            return None

    monkeypatch.setattr(
        "celery_app.celery_app.control.inspect", lambda timeout=1.0: _FakeInspect()
    )

    result = await main.health_detailed()

    assert "no workers responded" in result["checks"]["celery"]
    assert result["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_detailed_degrades_on_celery_error(monkeypatch, _healthy_external_deps):
    def _raise(timeout=1.0):
        raise ConnectionError("broker unreachable")

    monkeypatch.setattr("celery_app.celery_app.control.inspect", _raise)

    result = await main.health_detailed()

    assert "error" in result["checks"]["celery"]
    assert result["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_detailed_reports_db_error(monkeypatch):
    class _FailingDB:
        async def command(self, name):
            raise ConnectionError("mongo down")

    async def _fake_get_db():
        return _FailingDB()

    async def _fake_get_redis():
        return _FakeRedis()

    monkeypatch.setattr("core.database.get_db", _fake_get_db)
    monkeypatch.setattr("core.database.get_redis", _fake_get_redis)

    class _FakeInspect:
        def ping(self):
            return {"celery@worker1": {"ok": "pong"}}

    monkeypatch.setattr(
        "celery_app.celery_app.control.inspect", lambda timeout=1.0: _FakeInspect()
    )

    result = await main.health_detailed()

    assert "error" in result["checks"]["database"]
    assert result["status"] == "degraded"


@pytest.mark.asyncio
async def test_health_detailed_reports_redis_error(monkeypatch):
    class _FailingRedis:
        async def ping(self):
            raise ConnectionError("redis down")

    async def _fake_get_db():
        return _FakeDB()

    async def _fake_get_redis():
        return _FailingRedis()

    monkeypatch.setattr("core.database.get_db", _fake_get_db)
    monkeypatch.setattr("core.database.get_redis", _fake_get_redis)

    class _FakeInspect:
        def ping(self):
            return {"celery@worker1": {"ok": "pong"}}

    monkeypatch.setattr(
        "celery_app.celery_app.control.inspect", lambda timeout=1.0: _FakeInspect()
    )

    result = await main.health_detailed()

    assert "error" in result["checks"]["redis"]
    assert result["status"] == "degraded"


def test_plain_health_endpoint_stays_a_cheap_liveness_check():
    """Confirm /health intentionally wasn't turned into a dependency check --
    that's what /health/detailed (the k8s readinessProbe target) is for."""
    import inspect

    source = inspect.getsource(main.health)
    assert "get_db" not in source
    assert "get_redis" not in source
    assert "celery" not in source.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
