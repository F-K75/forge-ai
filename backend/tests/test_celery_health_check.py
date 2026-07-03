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


@pytest.mark.asyncio
async def test_health_detailed_reports_ok_when_workers_respond(monkeypatch):
    class _FakeInspect:
        def ping(self):
            return {"celery@worker1": {"ok": "pong"}}

    monkeypatch.setattr(
        "celery_app.celery_app.control.inspect", lambda timeout=1.0: _FakeInspect()
    )

    result = await main.health_detailed()

    # Only assert the Celery-specific check here -- database/redis are
    # separately-tested concerns and their outcome in a given test harness
    # shouldn't gate whether the Celery check itself is correct.
    assert result["checks"]["celery"] == "ok (1 worker(s))"


@pytest.mark.asyncio
async def test_health_detailed_degrades_when_no_workers_respond(monkeypatch):
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
async def test_health_detailed_degrades_on_celery_error(monkeypatch):
    def _raise(timeout=1.0):
        raise ConnectionError("broker unreachable")

    monkeypatch.setattr("celery_app.celery_app.control.inspect", _raise)

    result = await main.health_detailed()

    assert "error" in result["checks"]["celery"]
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
