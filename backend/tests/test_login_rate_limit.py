"""Regression test for SEC-011: /auth/login had no per-account rate limit.

Found 2026-07-03 while auditing SEC-011: register and forgot-password both
had a per-email limit (via EMAIL_RATE_LIMITS/check_email_rate_limit) on top
of the generic per-IP /auth/* limiter, but login had only the generic
per-IP limiter (10 req/60s). That's trivially bypassed for credential
stuffing against one specific account by spreading attempts across source
IPs -- the per-IP limiter never sees more than a handful of requests from
any single IP no matter how many total guesses hit that one account.

Fixed by adding a "login" entry to EMAIL_RATE_LIMITS (10/hour) and calling
check_email_rate_limit in api/auth.py's login() the same way register()
and forgot_password() already do.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import asyncio

import pytest

import core.security as security_module


@pytest.fixture(autouse=True)
def _reset_in_memory_rate_limit_state():
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


async def _broken_redis():
    raise ConnectionError("simulated Redis outage")


def test_login_has_a_per_email_rate_limit_entry():
    assert "login" in security_module.EMAIL_RATE_LIMITS
    assert security_module.EMAIL_RATE_LIMITS["login"]["limit"] == 10
    assert security_module.EMAIL_RATE_LIMITS["login"]["window"] == 3600


def test_login_blocks_after_limit_regardless_of_source_ip(monkeypatch):
    """The whole point: a distributed-IP attacker still gets capped per account."""
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)

    async def _drive():
        results = []
        for _ in range(11):
            results.append(
                await security_module.check_email_rate_limit(
                    "victim@example.com", "login", db=None
                )
            )
        return results

    results = asyncio.new_event_loop().run_until_complete(_drive())
    allowed = [ok for ok, _ in results]
    assert allowed == [True] * 10 + [False]


def test_login_rate_limit_scopes_by_email_not_globally(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)

    async def _drive():
        for _ in range(10):
            await security_module.check_email_rate_limit(
                "victim@example.com", "login", db=None
            )
        return await security_module.check_email_rate_limit(
            "someone-else@example.com", "login", db=None
        )

    allowed, _ = asyncio.new_event_loop().run_until_complete(_drive())
    assert allowed is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
