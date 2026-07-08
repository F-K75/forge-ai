"""Regression tests for INF-007: the general rate limiter was keyed only by
client IP (``rl:{zone}:{client_ip}``), so an authenticated user could bypass the
limit by rotating source IPs. Authenticated requests are now keyed by the
account id taken from the ``access_token`` cookie's ``sub`` claim
(``rl:{zone}:user:{sub}``), so the limit is enforced per-account regardless of
IP. Unauthenticated requests stay IP-keyed.
"""
import os

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest

from auth import create_access_token
from core import security as security_module
from core.security import rate_limit_middleware


class _FakeRequest:
    def __init__(self, path="/api/foo", client_host="1.2.3.4", cookies=None):
        self.url = type("U", (), {"path": path})()
        self.client = type("C", (), {"host": client_host})()
        self.cookies = cookies or {}

    @property
    def headers(self):
        class _H:
            def get(self, _k, default=None):
                return default

        return _H()


class _FakeResponse:
    def __init__(self):
        self.headers = {}


def _call_next_factory():
    async def call_next(request):
        return _FakeResponse()

    return call_next


def _token(sub: str) -> str:
    return create_access_token({"sub": sub, "email": f"{sub}@example.com"})


@pytest.fixture
def patched(monkeypatch):
    # Force the in-memory fail-closed path (no real Redis in tests).
    async def _boom():
        raise RuntimeError("no redis in test")

    monkeypatch.setattr(security_module, "get_redis", _boom)
    # Use an even limit so the conservative 50 % fallback is predictable.
    # Configured limit 4 → in-memory fallback limit 2.
    monkeypatch.setattr(
        security_module,
        "_get_limit_config",
        lambda path: ("api", {"limit": 4, "window": 60}),
    )
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


@pytest.mark.asyncio
async def test_authenticated_requests_keyed_per_user_not_per_ip(patched):
    """Two different IPs for the SAME user share one counter and hit the limit
    together; a different user has an independent counter.

    The patched fixture sets the Redis limit to 4, which makes the conservative
    in-memory fallback limit 2 (4 // 2), so we assert against that ceiling.
    """
    user_a = _token("user-a")
    user_b = _token("user-b")

    # user-a from IP 1.2.3.4: 2 allowed (fallback 4//2=2), 3rd blocked.
    for _ in range(2):
        await rate_limit_middleware(
            _FakeRequest(client_host="1.2.3.4", cookies={"access_token": user_a}),
            _call_next_factory(),
        )
    with pytest.raises(Exception) as exc:
        await rate_limit_middleware(
            _FakeRequest(client_host="9.9.9.9", cookies={"access_token": user_a}),
            _call_next_factory(),
        )
    assert "429" in str(exc.value) or "Rate limit" in str(exc.value)

    # user-a is now blocked even from a third IP (limit is per-account, not IP).
    with pytest.raises(Exception):
        await rate_limit_middleware(
            _FakeRequest(client_host="5.5.5.5", cookies={"access_token": user_a}),
            _call_next_factory(),
        )

    # user-b (different account) still has a fresh counter and is allowed
    # up to the same fallback limit of 2.
    for _ in range(2):
        await rate_limit_middleware(
            _FakeRequest(client_host="1.2.3.4", cookies={"access_token": user_b}),
            _call_next_factory(),
        )
    with pytest.raises(Exception):
        await rate_limit_middleware(
            _FakeRequest(client_host="1.2.3.4", cookies={"access_token": user_b}),
            _call_next_factory(),
        )


@pytest.mark.asyncio
async def test_unauthenticated_requests_still_keyed_by_ip(patched):
    """Without a token, the limit is enforced per source IP.

    The patched fixture uses Redis limit 4, making the conservative in-memory
    fallback limit 2, so we assert against that ceiling.
    """
    ip = "1.2.3.4"
    for _ in range(2):
        await rate_limit_middleware(
            _FakeRequest(client_host=ip), _call_next_factory()
        )
    with pytest.raises(Exception):
        await rate_limit_middleware(
            _FakeRequest(client_host=ip), _call_next_factory()
        )

    # A different IP is not blocked by the first IP's counter.
    await rate_limit_middleware(
        _FakeRequest(client_host="8.8.8.8"), _call_next_factory()
    )


@pytest.mark.asyncio
async def test_invalid_token_falls_back_to_ip_keying(patched):
    """A present-but-undecodable token must not crash and stays IP-keyed."""
    ip = "1.2.3.4"
    for _ in range(2):
        await rate_limit_middleware(
            _FakeRequest(client_host=ip, cookies={"access_token": "not-a-jwt"}),
            _call_next_factory(),
        )
    with pytest.raises(Exception):
        await rate_limit_middleware(
            _FakeRequest(client_host=ip, cookies={"access_token": "not-a-jwt"}),
            _call_next_factory(),
        )


@pytest.mark.asyncio
async def test_in_memory_fallback_uses_conservative_half_limit(patched):
    """SEC-004 residual: when Redis is down, the in-memory fallback must apply
    a 50 % ceiling so the per-process limit doesn't silently multiply across
    workers/replicas."""
    user_a = _token("user-a")

    # The patched fixture sets the Redis limit to 4, making the conservative
    # in-memory fallback limit 2 (4 // 2). Allow exactly 2 requests, then
    # block the 3rd.
    await rate_limit_middleware(
        _FakeRequest(client_host="1.2.3.4", cookies={"access_token": user_a}),
        _call_next_factory(),
    )
    await rate_limit_middleware(
        _FakeRequest(client_host="1.2.3.4", cookies={"access_token": user_a}),
        _call_next_factory(),
    )
    # The 3rd request must be blocked because the fallback limit is 2.
    with pytest.raises(Exception):
        await rate_limit_middleware(
            _FakeRequest(client_host="9.9.9.9", cookies={"access_token": user_a}),
            _call_next_factory(),
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
