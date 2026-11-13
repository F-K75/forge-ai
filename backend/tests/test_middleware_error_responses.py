"""Security middlewares must return their intended status codes.

Function middlewares run outside FastAPI's exception handling, so raising
HTTPException from them used to reach clients as a 500. These tests go through
the real ``main.app`` stack, where that bug showed up.
"""

from collections import OrderedDict

import pytest
from fastapi.testclient import TestClient

import core.security as security_module
from main import app

ALLOWED = security_module.cors_allowed_origins()[0]
EVIL = "https://evil.example"


@pytest.fixture
def client(monkeypatch):
    # Force the in-memory rate limiter with a fresh counter per test.
    monkeypatch.setattr(security_module, "get_redis", lambda: None)
    monkeypatch.setattr(security_module, "_in_memory_rate_limits", OrderedDict())
    return TestClient(app, raise_server_exceptions=False)


def test_csrf_rejection_is_403_not_500(client):
    resp = client.post("/v1/projects", json={}, cookies={"access_token": "not-a-jwt"})
    assert resp.status_code == 403
    assert "CSRF" in resp.json()["detail"]


def test_csrf_without_session_is_403(client):
    resp = client.post("/v1/projects", json={})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "CSRF: No session token"


def test_oversized_body_is_413(client, monkeypatch):
    monkeypatch.setattr(security_module.settings, "max_request_size", 10)
    resp = client.post("/v1/waitlist", content=b"x" * 100, headers={"Content-Type": "application/json"})
    assert resp.status_code == 413


def test_rate_limit_is_429_with_retry_after(client):
    codes = []
    for _ in range(80):
        resp = client.get("/no-such-path")
        codes.append(resp.status_code)
        if resp.status_code == 429:
            break
    assert codes[-1] == 429, codes
    assert 500 not in codes
    assert int(resp.headers["Retry-After"]) > 0


def test_error_has_cors_headers_for_allowed_origin_only(client):
    ok = client.post("/v1/projects", json={}, headers={"Origin": ALLOWED})
    assert ok.status_code == 403
    assert ok.headers["access-control-allow-origin"] == ALLOWED
    assert ok.headers["access-control-allow-credentials"] == "true"

    evil = client.post("/v1/projects", json={}, headers={"Origin": EVIL})
    assert evil.status_code == 403
    assert "access-control-allow-origin" not in evil.headers
