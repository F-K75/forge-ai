"""Pytest configuration: set required env vars before any test module imports.

Without this file, every test file that imports ``core.database`` (directly or
transitively) crashes at collection time because ``Settings()`` validates
``MONGODB_URL`` and ``JWT_SECRET`` at module-import time and rejects empty
values outside ``CI_TEST_MODE``.

The env vars set here match the guards in ``core/config.py``:

- ``CI_TEST_MODE`` — allows ``mongodb_url`` to be empty (falls back to
  ``mongodb://localhost:27017/forge``).
- ``TESTING`` — allows ``jwt_secret`` to be empty (falls back to a test-only
  dummy value).
- ``MONGODB_URL`` — explicit test DB URL so tests don't depend on a local
  MongoDB being present (tests that need a real DB use ``mongomock`` or
  ``pytest-mongo``).
- ``JWT_SECRET`` — explicit test secret so JWT encoding/decoding tests work
  without relying on the fallback path.
- ``FIELD_ENCRYPTION_KEY`` — 64 hex chars for the encryption module.
- ``APP_ENV`` — set to ``development`` so production-only validators
  (replicaSet requirement, localhost guard) don't fire.
"""

import os

# Must be set before ANY module that imports core.config is loaded.
os.environ.setdefault("CI_TEST_MODE", "1")
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/forge-test")
os.environ.setdefault(
    "JWT_SECRET",
    "test-secret-key-for-ci-purposes-only-32chars",
)
os.environ.setdefault(
    "FIELD_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
)
# Tests assert provider behavior directly, so responses must not be served from
# a shared response cache. CI runs without Redis (cache always misses), but a
# local dev box with Redis up would otherwise serve stale cached responses and
# make tests pass/fail differently than CI.
os.environ.setdefault("AI_OPTIMIZER_RESPONSE_CACHE_ENABLED", "false")
os.environ.setdefault("AI_OPTIMIZER_SEMANTIC_CACHE_ENABLED", "false")

import pytest


@pytest.fixture(autouse=True)
def _reset_circuit_breaker(monkeypatch):
    """Give every test a fresh, closed global LLM circuit breaker.

    The module-level singleton in ``core.llm.circuit_breaker`` accumulates
    failure state across tests (both in its process-local mirror and in Redis
    when a local Redis is running). A test that trips the global breaker — e.g.
    an error-path router test that records provider failures — would otherwise
    make every later test in the process raise ``CircuitBreakerOpen``. Resetting
    before each test keeps the suite hermetic and matches CI (no Redis service,
    so state must not leak through process-local storage either).
    """
    import core.llm.circuit_breaker as cb_module

    try:
        import asyncio

        from core.database import get_redis

        async def _clear_redis_circuit_keys():
            try:
                redis = await get_redis()
                keys = await redis.keys("llm:cb:*")
                if keys:
                    await redis.delete(*keys)
            except Exception:
                pass

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            loop.create_task(_clear_redis_circuit_keys())
        else:
            asyncio.run(_clear_redis_circuit_keys())
    except Exception:
        pass

    monkeypatch.setattr(cb_module, "_circuit_breaker", None)
    yield
    monkeypatch.setattr(cb_module, "_circuit_breaker", None)