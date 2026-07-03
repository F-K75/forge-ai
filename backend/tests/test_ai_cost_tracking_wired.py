"""Regression tests for AI-001: LLM cost tracking must actually be wired into
the live agent call path, not just exist as unreachable code.

Real bug found 2026-07-03: agents/base.py hardcoded cost_usd=0.0 on every
call to track_usage(), and check_budget()/BudgetExceeded were never called
from anywhere in the real pipeline -- calculate_cost() and check_budget()
existed and were unit-tested in isolation (test_ai_usage.py) but neither was
ever invoked outside their own module and its tests. Every persisted AI
usage record had a fake $0.00 cost, and no user could ever actually be
budget-blocked. Fixed by calling both from BaseAgent.stream() (the method
every concrete agent's run() goes through) and its unused twin _call_llm().
"""
from types import SimpleNamespace

import pytest

from agents.base import BaseAgent, _llm_circuit_breaker
from core.ai_usage import BudgetExceeded


class _FakeStreamCtx:
    def __init__(self, usage):
        self._usage = usage

    async def __aenter__(self):
        async def _text_stream():
            yield "hello "
            yield "world"

        self.text_stream = _text_stream()
        self.response = SimpleNamespace(usage=self._usage)
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeAgent(BaseAgent):
    system_prompt = "You are a test agent."

    def __init__(self, usage=None):
        # Deliberately skip BaseAgent.__init__ -- it builds a real
        # anthropic.AsyncAnthropic() client, which these tests don't need.
        self.model = "claude-sonnet-4-6"
        self._usage = usage or SimpleNamespace(
            input_tokens=1000, output_tokens=500, cache_read_input_tokens=0
        )
        self.client = SimpleNamespace(
            messages=SimpleNamespace(stream=lambda **kw: _FakeStreamCtx(self._usage))
        )


@pytest.fixture(autouse=True)
def _reset_circuit_breaker():
    _llm_circuit_breaker.record_success()
    yield
    _llm_circuit_breaker.record_success()


@pytest.mark.asyncio
async def test_stream_computes_real_cost_not_hardcoded_zero(monkeypatch):
    captured = {}

    async def fake_track_usage(**kwargs):
        captured.update(kwargs)
        return {"budget_remaining": 999}

    async def fake_check_budget(user_id, org_id=None, estimated_tokens=0):
        return None

    monkeypatch.setattr("agents.base.track_usage", fake_track_usage)
    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    agent = _FakeAgent()
    result = await agent.run(
        [{"role": "user", "content": "build me an app"}],
        user_id="user-1",
        build_id="build-1",
    )

    assert result == "hello world"
    assert captured["prompt_tokens"] == 1000
    assert captured["completion_tokens"] == 500
    # The actual regression: this used to always be 0.0 regardless of tokens.
    assert captured["cost_usd"] > 0
    assert captured["cost_usd"] == pytest.approx((1000 * 0.003 + 500 * 0.015) / 1000)


@pytest.mark.asyncio
async def test_stream_calls_check_budget_before_llm_call(monkeypatch):
    calls = []

    async def fake_check_budget(user_id, org_id=None, estimated_tokens=0):
        calls.append(user_id)

    async def fake_track_usage(**kwargs):
        return {"budget_remaining": 999}

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)
    monkeypatch.setattr("agents.base.track_usage", fake_track_usage)

    agent = _FakeAgent()
    await agent.run([{"role": "user", "content": "build me an app"}], user_id="user-1")

    assert calls == ["user-1"]


@pytest.mark.asyncio
async def test_stream_blocks_call_when_budget_exceeded(monkeypatch):
    async def fake_check_budget(user_id, org_id=None, estimated_tokens=0):
        raise BudgetExceeded(
            "Daily token budget exceeded (10000/10000 tokens used)",
            used=10000,
            limit=10000,
        )

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    agent = _FakeAgent()
    with pytest.raises(BudgetExceeded):
        await agent.run([{"role": "user", "content": "build me an app"}], user_id="user-1")


@pytest.mark.asyncio
async def test_stream_skips_budget_check_when_no_user_id(monkeypatch):
    """Calls without a user_id (if any exist) shouldn't crash on a missing arg."""
    called = False

    async def fake_check_budget(*a, **kw):
        nonlocal called
        called = True

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    agent = _FakeAgent()
    result = await agent.run([{"role": "user", "content": "build me an app"}])  # no user_id

    assert result == "hello world"
    assert called is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
