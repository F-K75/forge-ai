"""Regression test for a real bug in core/security.py's check_email_rate_limit.

The per-email rate limiter that guards /auth/register and /auth/forgot-password
(3-5 attempts/email/hour — see EMAIL_RATE_LIMITS) explicitly "failed open" any
time Redis raised an exception: `except Exception: return True, 0`. That meant
any Redis blip (or an attacker able to trigger Redis errors) let an attacker
send unlimited registration or password-reset-token requests for a specific
target email with zero rate limiting. The per-IP /auth limiter (10 req/60s) is
not an effective backstop: it's scoped per-IP, not per-email, is looser than
the 3-5/hour this protects, and is trivially split across source IPs.

The fix reuses rate_limit_middleware's existing in-memory fallback instead of
failing open, matching how the rest of the app already treats a Redis outage.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

import core.security as security_module


@pytest.fixture(autouse=True)
def _reset_in_memory_rate_limit_state():
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


async def _broken_redis():
    raise ConnectionError("simulated Redis outage")


def test_email_rate_limit_blocks_once_in_memory_limit_exhausted(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)

    import asyncio

    async def _drive():
        # forgot_password allows 3/hour via Redis. The in-memory fallback
        # enforces the conservative half: 3 // 2 = 1, so only the first
        # request passes.
        results = []
        for _ in range(4):
            results.append(await security_module.check_email_rate_limit(
                "victim@example.com", "forgot_password", db=None
            ))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())

    allowed = [ok for ok, _ in results]
    # With the conservative fallback, only 1 request is allowed (3 // 2 = 1).
    assert allowed == [True, False, False, False]


def test_email_rate_limit_scopes_by_email_not_globally(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)

    import asyncio

    async def _drive():
        for _ in range(3):
            await security_module.check_email_rate_limit(
                "victim@example.com", "forgot_password", db=None
            )
        # A different email must not be affected by victim@example.com's usage.
        return await security_module.check_email_rate_limit(
            "someone-else@example.com", "forgot_password", db=None
        )

    allowed, _ = asyncio.new_event_loop().run_until_complete(_drive())
    assert allowed is True


def test_email_rate_limit_uses_conservative_half_limit_in_fallback(monkeypatch):
    """SEC-004 residual: with Redis down, the per-email limiter must enforce
    half the normal limit (3/hour → 1/hour) so a multi-replica outage doesn't
    silently multiply the effective ceiling."""
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)

    import asyncio

    async def _drive():
        results = []
        for _ in range(3):
            results.append(await security_module.check_email_rate_limit(
                "victim@example.com", "forgot_password", db=None
            ))
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    # forgot_password is 3/hour via Redis. In-memory fallback uses 3 // 2 = 1,
    # so only the first request should pass.
    assert allowed == [True, False, False]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
