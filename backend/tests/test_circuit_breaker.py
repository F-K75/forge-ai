"""Tests for AI-006: graceful degradation when the LLM circuit breaker is open."""

import asyncio

import pytest

from core.llm.provider import CircuitBreakerOpen
from agents.base import CircuitBreaker


def test_circuit_breaker_open_retry_after_defaults_to_60():
    cb = CircuitBreaker(failure_threshold=1, recovery_timeout=60)
    cb.record_failure()
    assert cb.state == "open"
    exc = CircuitBreakerOpen(retry_after=cb.retry_after())
    assert exc.retry_after == 60
    assert "temporarily unavailable" in str(exc)


def test_circuit_breaker_retry_after_counts_down():
    cb = CircuitBreaker(failure_threshold=1, recovery_timeout=10)
    cb.record_failure()
    assert cb.retry_after() == 10
    # Simulate time passing by adjusting last_failure_time.
    cb.last_failure_time = asyncio.get_event_loop().time() - 5
    assert cb.retry_after() == 5
    cb.last_failure_time = asyncio.get_event_loop().time() - 15
    assert cb.retry_after() == 0


def test_circuit_breaker_half_open_after_timeout():
    cb = CircuitBreaker(failure_threshold=1, recovery_timeout=1)
    cb.record_failure()
    assert cb.state == "open"
    assert not cb.can_call()
    # After the recovery timeout elapses, can_call should half-open.
    cb.last_failure_time = asyncio.get_event_loop().time() - 2
    assert cb.can_call()
    assert cb.state == "half_open"


@pytest.mark.asyncio
async def test_base_agent_call_llm_raises_circuit_breaker_open_when_open(monkeypatch):
    """When the circuit breaker is open, _call_llm must raise
    CircuitBreakerOpen (not a raw RuntimeError) so callers can distinguish
    a transient LLM outage from a real code bug."""
    from agents.base import BaseAgent, _llm_circuit_breaker

    class _DummyAgent(BaseAgent):
        agent_type = "developer"
        system_prompt = "You are a developer."

    agent = _DummyAgent()
    _llm_circuit_breaker.state = "open"
    _llm_circuit_breaker.last_failure_time = asyncio.get_event_loop().time()
    _llm_circuit_breaker.failure_count = 5

    try:
        with pytest.raises(CircuitBreakerOpen) as exc_info:
            await agent._call_llm([{"role": "user", "content": "hi"}])
        assert exc_info.value.retry_after >= 0
    finally:
        _llm_circuit_breaker.state = "closed"
        _llm_circuit_breaker.failure_count = 0
        _llm_circuit_breaker.last_failure_time = None
