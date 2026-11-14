"""Tests for CSRF exclusion coverage (SEC: CSRF audit).

Drives csrf_protection_middleware directly with a fake Request to assert which
state-changing paths are exempt vs. required, catching over-exclusion
(admin /api/llm mutations) and under-exclusion (Stripe payment webhook).
"""
import pytest

from core.security import csrf_protection_middleware, _CSRF_EXCLUDED_PATHS


class FakeRequest:
    def __init__(self, method, path, *, cookie=None, header=None):
        self.method = method
        self.url = type("U", (), {"path": path})()
        self.cookies = cookie or {}
        self.headers = header or {}


class FakeResponse:
    def __init__(self):
        self.headers = {}


async def _call_next(_request):
    return FakeResponse()


@pytest.mark.asyncio
async def test_safe_methods_skip_csrf():
    req = FakeRequest("GET", "/api/llm/agent/x")
    resp = await csrf_protection_middleware(req, _call_next)
    assert isinstance(resp, FakeResponse)  # reached call_next, no 403


@pytest.mark.asyncio
async def test_login_remains_excluded():
    req = FakeRequest("POST", "/auth/login")
    resp = await csrf_protection_middleware(req, _call_next)
    assert isinstance(resp, FakeResponse)


@pytest.mark.asyncio
async def test_stripe_payment_webhook_is_excluded():
    # Signature-authenticated server-to-server call with no session cookie.
    req = FakeRequest("POST", "/billing/webhook/payment")
    resp = await csrf_protection_middleware(req, _call_next)
    assert isinstance(resp, FakeResponse)


@pytest.mark.asyncio
async def test_api_llm_mutations_are_not_excluded_and_require_token():
    # These admin routes were previously wrongly exempted; a cross-site
    # browser request (no X-CSRF-Token, but with the session cookie) must be
    # rejected, not passed through.
    for path in ("/api/llm/agent/pro", "/api/llm/reload", "/api/llm/test"):
        req = FakeRequest("POST", path, cookie={"access_token": "tok"})
        resp = await csrf_protection_middleware(req, _call_next)
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_arbitrary_mutating_route_requires_token():
    req = FakeRequest("PUT", "/auth/me", cookie={"access_token": "tok"})
    resp = await csrf_protection_middleware(req, _call_next)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_excluded_list_no_longer_contains_api_llm():
    assert "/api/llm" not in _CSRF_EXCLUDED_PATHS
    assert "/billing/webhook/payment" in _CSRF_EXCLUDED_PATHS
    assert "/billing/webhook" in _CSRF_EXCLUDED_PATHS
    for expected in (
        "/auth/refresh",
        "/v1/auth/refresh",
        "/razorpay/webhook",
        "/v1/razorpay/webhook",
        "/cashfree/webhook",
        "/v1/cashfree/webhook",
        "/tasks/github/webhook",
        "/v1/tasks/github/webhook",
    ):
        assert expected in _CSRF_EXCLUDED_PATHS


@pytest.mark.asyncio
async def test_monitoring_webhook_findings_exempt_from_csrf():
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from core.security import csrf_protection_middleware

    async def _ok_next(req):
        return JSONResponse({"ok": True})

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/projects/proj-123/monitoring/webhook/findings",
        "headers": [(b"x-api-key", b"secret-key")],
    }
    resp = await csrf_protection_middleware(Request(scope), _ok_next)
    assert resp.status_code == 200

    # Other monitoring POST endpoints still require CSRF session cookie
    scope_other = {
        "type": "http",
        "method": "POST",
        "path": "/v1/projects/proj-123/monitoring/findings/f1/resolve",
        "headers": [],
    }
    resp_other = await csrf_protection_middleware(Request(scope_other), _ok_next)
    assert resp_other.status_code == 403
