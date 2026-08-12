"""Tests for AI-006: graceful degradation when the LLM circuit breaker is open.

Covers the async `LLMCircuitBreaker` (core/llm/circuit_breaker.py) state machine
-- exercising its process-local fallback (Redis is unavailable in tests, so
`_load`/`_store` degrade to `self._local`) -- and BaseAgent's
`_ensure_global_circuit_allows_call` gate, which is what `_call_llm`, `stream`,
and `_call_structured` use instead of the removed sync CircuitBreaker.
"""

import time

import pytest

from core.llm.provider import CircuitBreakerOpen
from core.llm.circuit_breaker import LLMCircuitBreaker
from agents.base import _ensure_global_circuit_allows_call


@pytest.mark.asyncio
async def test_circuit_breaker_open_after_failures():
    cb = LLMCircuitBreaker(global_failure_threshold=2, recovery_timeout=60)

    await cb.record_failure("global")
    assert not await cb.is_open("global")
    await cb.record_failure("global")
    assert await cb.is_open("global")
    assert not await cb.can_call("global")
    assert await cb.retry_after("global") > 0


@pytest.mark.asyncio
async def test_circuit_breaker_half_open_after_timeout():
    cb = LLMCircuitBreaker(global_failure_threshold=1, recovery_timeout=1)
    await cb.record_failure("global")
    assert await cb.is_open("global")

    # Simulate recovery elapsing on the process-local state, then confirm the
    # breaker can be claimed half-open (the Redis claim falls back to
    # process-local when Redis is unavailable, as in tests).
    state = cb._local_state("global")
    state["opened_at"] = time.time() - 5
    assert await cb.try_half_open_claim("global") is True
    assert await cb.can_call("global")


@pytest.mark.asyncio
async def test_base_agent_ensure_global_circuit_raises_when_open(monkeypatch):
    """When the global breaker is open and can't be claimed, `_ensure_global_circuit_allows_call`
    must raise CircuitBreakerOpen so callers can distinguish a transient LLM outage
    from a real code bug."""
    cb = LLMCircuitBreaker()

    async def fake_load(scope):
        return {"state": "open", "failure_count": 5, "opened_at": time.time() - 1}

    async def fake_try_claim(scope):
        return False

    monkeypatch.setattr(cb, "_load", fake_load)
    monkeypatch.setattr(cb, "try_half_open_claim", fake_try_claim)
    monkeypatch.setattr("agents.base.get_circuit_breaker", lambda: cb)

    with pytest.raises(CircuitBreakerOpen):
        await _ensure_global_circuit_allows_call()


@pytest.mark.asyncio
async def test_base_agent_ensure_global_circuit_passes_when_closed(monkeypatch):
    cb = LLMCircuitBreaker()

    async def fake_load(scope):
        return {"state": "closed", "failure_count": 0, "opened_at": None}

    monkeypatch.setattr(cb, "_load", fake_load)
    monkeypatch.setattr("agents.base.get_circuit_breaker", lambda: cb)

    # Should not raise.
    await _ensure_global_circuit_allows_call()


def test_call_llm_and_stream_do_not_reference_removed_circuit_breaker():
    """Guards against regressing to the removed sync CircuitBreaker: the agent
    path must use `_ensure_global_circuit_allows_call`, and only the global
    breaker may be consulted at the BaseAgent boundary."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "agents" / "base.py").read_text()
    assert "_llm_circuit_breaker" not in src
    assert src.count("await _ensure_global_circuit_allows_call()") >= 3