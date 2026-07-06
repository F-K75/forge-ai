"""Regression test for BE-002: no global/top-level exception handler existed
in main.py -- unhandled exceptions fell through to Starlette's default
plain-text 500 response with no centralized logging or Sentry reporting.

Found 2026-07-03 while auditing the security/observability posture of
main.py. Fixed by registering @app.exception_handler(Exception), which
FastAPI only invokes for exceptions that don't match a more specific
registered handler -- HTTPException (used throughout every other route)
keeps going through FastAPI's own built-in handler, untouched.
"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
from main import app, global_exception_handler


@app.get("/__test_unhandled_error")
async def _raise_unhandled():
    raise RuntimeError("boom - a real bug, not an HTTPException")


@app.get("/__test_http_exception")
async def _raise_http_exception():
    raise HTTPException(status_code=418, detail="I'm a teapot")


client = TestClient(app, raise_server_exceptions=False)


def test_unhandled_exception_returns_consistent_json_500():
    response = client.get("/__test_unhandled_error")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}


def test_unhandled_exception_does_not_leak_internals():
    response = client.get("/__test_unhandled_error")
    assert "boom" not in response.text
    assert "RuntimeError" not in response.text
    assert "Traceback" not in response.text


def test_http_exception_is_unaffected_by_the_global_handler():
    """FastAPI's built-in HTTPException handler must still take precedence --
    the global Exception handler should only catch truly unexpected errors,
    not routes that intentionally return a 4xx via HTTPException."""
    response = client.get("/__test_http_exception")
    assert response.status_code == 418
    assert response.json() == {"detail": "I'm a teapot"}


def test_health_endpoint_still_works():
    """Sanity check the handler doesn't interfere with normal routes."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/health/mongo-crud-verify"),
        ("get", "/health/mongo-collections"),
    ],
)
def test_temporary_database_diagnostics_are_not_public(method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_handler_logs_the_exception(monkeypatch):
    logged = {}
    monkeypatch.setattr(
        main.logger, "exception", lambda *a, **kw: logged.setdefault("called", (a, kw))
    )

    class FakeURL:
        path = "/__test"

    class FakeRequest:
        method = "GET"
        url = FakeURL()

    response = await global_exception_handler(FakeRequest(), RuntimeError("boom"))

    assert "called" in logged
    assert response.status_code == 500


@pytest.mark.asyncio
async def test_handler_reports_to_sentry_when_configured(monkeypatch):
    monkeypatch.setattr(main.settings, "sentry_dsn", "https://fake@sentry.example/1")
    captured = []
    monkeypatch.setattr("sentry_sdk.capture_exception", lambda exc: captured.append(exc))

    class FakeURL:
        path = "/__test"

    class FakeRequest:
        method = "GET"
        url = FakeURL()

    exc = RuntimeError("boom")
    await global_exception_handler(FakeRequest(), exc)

    assert captured == [exc]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
