import pytest

# core.llm.router must be imported before the providers package: its module-level
# `_default_router = LLMRouter()` lazily imports providers.anthropic/openai inside
# `_register_default_providers`, and if the `providers` package is already
# mid-import (as it would be if this test imported it first) that lazy import
# hits a circular-import error because the class isn't defined on the
# partially-initialized module yet.
from core.llm.provider import CompletionResponse
from core.llm.router import LLMRouter
from core.models import PlanTier

import providers.anthropic as anthropic_module
import providers.openai as openai_module

import core.security as security_module


@pytest.fixture(autouse=True)
def _reset_in_memory_rate_limit_state():
    # Several tests below drive the real LLMRouter.generate() with the same
    # user_id="user-1" in rapid succession. Redis isn't reachable in this
    # sandbox, so the per-user LLM rate limiter (core.security.LLM_RATE_LIMITS)
    # falls back to the module-level, process-wide _in_memory_rate_limits
    # dict -- without clearing it, repeated "user-1" calls here would share
    # state with other test modules that also use "user-1" (e.g.
    # test_ai_cost_tracking_wired.py), risking spurious rate-limit failures
    # that have nothing to do with what either test is actually checking.
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


@pytest.mark.asyncio
async def test_router_byok_anthropic_bypasses_registry_and_fallback(monkeypatch):
    async def fake_chat_completion(self, *, model, messages, **kwargs):
        return CompletionResponse(text="byok-response", provider="anthropic", model=model, usage={"prompt_tokens": 1, "completion_tokens": 1})

    monkeypatch.setattr(anthropic_module.AnthropicAdapter, "chat_completion", fake_chat_completion)

    router = LLMRouter()
    result = await router.generate(
        agent_name="developer",
        messages=[{"role": "user", "content": "hi"}],
        byok={"provider": "anthropic", "api_key": "user-owned-key"},
    )

    assert result.text == "byok-response"
    assert result.provider == "byok:anthropic"


@pytest.mark.asyncio
async def test_router_byok_openai_compatible_uses_base_url_and_model(monkeypatch):
    captured = {}

    async def fake_chat_completion(self, *, model, messages, **kwargs):
        captured["base_url"] = self.base_url
        captured["model"] = model
        return CompletionResponse(text="groq-response", provider="openai", model=model, usage={})

    monkeypatch.setattr(openai_module.OpenAIAdapter, "chat_completion", fake_chat_completion)

    router = LLMRouter()
    result = await router.generate(
        agent_name="developer",
        messages=[{"role": "user", "content": "hi"}],
        byok={
            "provider": "openai_compatible",
            "api_key": "user-owned-key",
            "base_url": "https://api.groq.com/openai/v1",
            "model": "llama-3.1-70b",
        },
    )

    assert result.text == "groq-response"
    assert result.provider == "byok:openai_compatible"
    assert captured["base_url"] == "https://api.groq.com/openai/v1"
    assert captured["model"] == "llama-3.1-70b"


@pytest.mark.asyncio
async def test_router_byok_skips_daily_budget_check(monkeypatch):
    calls = []

    async def fake_check_budget(user_id, org_id=None):
        calls.append(user_id)

    import core.llm.router as router_module

    monkeypatch.setattr(router_module, "check_budget", fake_check_budget)

    async def fake_chat_completion(self, *, model, messages, **kwargs):
        return CompletionResponse(text="ok", provider="anthropic", model=model, usage={})

    monkeypatch.setattr(anthropic_module.AnthropicAdapter, "chat_completion", fake_chat_completion)

    router = LLMRouter()
    await router.generate(
        agent_name="developer",
        messages=[{"role": "user", "content": "hi"}],
        user_id="user-1",
        byok={"provider": "anthropic", "api_key": "user-owned-key"},
    )

    assert calls == []


@pytest.mark.asyncio
async def test_router_byok_requires_api_key():
    router = LLMRouter()
    with pytest.raises(Exception):
        await router.generate(
            agent_name="developer",
            messages=[{"role": "user", "content": "hi"}],
            byok={"provider": "anthropic", "api_key": None},
        )


class _FakeUsersCollection:
    def __init__(self, user_doc):
        self._user_doc = user_doc

    async def find_one(self, query, projection=None):
        return dict(self._user_doc) if self._user_doc else None


class _FakeDB:
    def __init__(self, user_doc):
        self.users = _FakeUsersCollection(user_doc)


def _patch_db(monkeypatch, user_doc):
    import agents.base as base_module

    async def _get_db():
        return _FakeDB(user_doc)

    monkeypatch.setattr(base_module, "get_db", _get_db)


def _patch_decrypt(monkeypatch):
    import agents.base as base_module

    monkeypatch.setattr(base_module, "decrypt_field", lambda value: f"decrypted:{value}")


@pytest.mark.asyncio
async def test_resolve_byok_returns_none_without_user_id():
    from agents.base import _resolve_byok

    assert await _resolve_byok(None) is None


@pytest.mark.asyncio
async def test_resolve_byok_returns_none_for_free_plan(monkeypatch):
    from agents.base import _resolve_byok

    _patch_db(monkeypatch, {"plan": PlanTier.FREE.value, "llm_api_key": "enc-key", "llm_provider": "anthropic"})
    _patch_decrypt(monkeypatch)

    assert await _resolve_byok("user-1") is None


@pytest.mark.asyncio
async def test_resolve_byok_returns_anthropic_key_for_pro_plan(monkeypatch):
    from agents.base import _resolve_byok

    _patch_db(monkeypatch, {"plan": PlanTier.PRO.value, "llm_api_key": "enc-key", "llm_provider": "anthropic"})
    _patch_decrypt(monkeypatch)

    result = await _resolve_byok("user-1")
    assert result == {"provider": "anthropic", "api_key": "decrypted:enc-key"}


@pytest.mark.asyncio
async def test_resolve_byok_returns_openai_compatible_config_for_enterprise_plan(monkeypatch):
    from agents.base import _resolve_byok

    _patch_db(monkeypatch, {
        "plan": PlanTier.ENTERPRISE.value,
        "llm_api_key": "enc-key",
        "llm_provider": "openai_compatible",
        "llm_base_url": "https://api.groq.com/openai/v1",
        "llm_model": "llama-3.1-70b",
    })
    _patch_decrypt(monkeypatch)

    result = await _resolve_byok("user-1")
    assert result == {
        "provider": "openai_compatible",
        "api_key": "decrypted:enc-key",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "llama-3.1-70b",
    }


@pytest.mark.asyncio
async def test_resolve_byok_returns_none_when_openai_compatible_missing_base_url(monkeypatch):
    from agents.base import _resolve_byok

    _patch_db(monkeypatch, {
        "plan": PlanTier.PRO.value,
        "llm_api_key": "enc-key",
        "llm_provider": "openai_compatible",
        "llm_model": "llama-3.1-70b",
    })
    _patch_decrypt(monkeypatch)

    assert await _resolve_byok("user-1") is None


# --- Integration: BaseAgent._call_llm / .stream(), not just their two halves
# in isolation. An adversarial review of an earlier wire-level verification
# pass (real anthropic/openai SDKs against a local stub server) correctly
# flagged that exercising `_resolve_byok` and `LLMRouter.generate` separately
# never proves the glue in `_call_llm`/`stream` (the `if user_id and not
# byok:` conditional and the `byok=byok` pass-through) is wired correctly --
# that's the actual code path production agents call.


def _make_test_agent():
    """A minimal concrete BaseAgent subclass, built lazily so the real
    BaseAgent class (not a mock of it) executes _call_llm/stream."""
    from agents.base import BaseAgent
    from core.models import AgentType

    class _Impl(BaseAgent):
        agent_type = AgentType.DEVELOPER
        system_prompt = "test agent"

    return _Impl()


@pytest.mark.asyncio
async def test_call_llm_end_to_end_uses_byok_and_skips_budget_check(monkeypatch):
    from core.encryption import encrypt_field

    _patch_db(monkeypatch, {
        "plan": PlanTier.PRO.value,
        "llm_api_key": encrypt_field("user-owned-key"),
        "llm_provider": "anthropic",
    })

    calls = []

    async def fake_check_budget(user_id, org_id=None):
        calls.append(user_id)
        raise AssertionError("check_budget must not be called for a BYOK request")

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    # track_usage still runs for BYOK calls (informational cost tracking) --
    # not the thing under test here (see test_ai_cost_tracking_wired.py), so
    # stub it rather than standing up a fake Mongo just to accept the insert.
    usage_records = []

    async def fake_track_usage(**kwargs):
        usage_records.append(kwargs)
        return {}

    monkeypatch.setattr("core.llm.router.track_usage", fake_track_usage)

    captured = {}

    async def fake_chat_completion(self, *, model, messages, **kwargs):
        captured["api_key"] = self.api_key
        return CompletionResponse(text="byok-glue-response", provider="anthropic", model=model, usage={"prompt_tokens": 4, "completion_tokens": 2})

    monkeypatch.setattr(anthropic_module.AnthropicAdapter, "chat_completion", fake_chat_completion)

    agent = _make_test_agent()
    text = await agent._call_llm([{"role": "user", "content": "hi"}], user_id="user-1")

    assert text == "byok-glue-response"
    assert captured["api_key"] == "user-owned-key"  # real encrypt_field/decrypt_field round trip, not a stub
    assert calls == []
    assert usage_records[0]["provider"] == "byok:anthropic"


@pytest.mark.asyncio
async def test_stream_end_to_end_uses_byok(monkeypatch):
    from core.encryption import encrypt_field

    _patch_db(monkeypatch, {
        "plan": PlanTier.ENTERPRISE.value,
        "llm_api_key": encrypt_field("user-owned-key"),
        "llm_provider": "openai_compatible",
        "llm_base_url": "https://api.groq.com/openai/v1",
        "llm_model": "llama-3.1-70b",
    })

    async def fake_check_budget(user_id, org_id=None):
        raise AssertionError("check_budget must not be called for a BYOK request")

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    captured = {}

    async def fake_chat_completion(self, *, model, messages, **kwargs):
        captured["base_url"] = self.base_url
        captured["model"] = model
        return CompletionResponse(text="byok-stream-response", provider="openai", model=model, usage={})

    monkeypatch.setattr(openai_module.OpenAIAdapter, "chat_completion", fake_chat_completion)

    agent = _make_test_agent()
    chunks = [chunk async for chunk in agent.stream([{"role": "user", "content": "hi"}], user_id="user-1")]

    assert "".join(chunks) == "byok-stream-response"
    assert captured["base_url"] == "https://api.groq.com/openai/v1"
    assert captured["model"] == "llama-3.1-70b"


@pytest.mark.asyncio
async def test_call_llm_without_byok_still_checks_budget(monkeypatch):
    """Control case: a non-BYOK user must still hit check_budget through the
    same _call_llm code path -- guards against a change that skips the
    budget check unconditionally instead of only when byok is active."""
    _patch_db(monkeypatch, None)

    calls = []

    async def fake_check_budget(user_id, org_id=None):
        calls.append(user_id)

    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    async def fake_generate(self, **kwargs):
        assert kwargs["byok"] is None
        return CompletionResponse(text="normal-response", provider="anthropic", model=kwargs.get("model") or "claude-sonnet-4-6", usage={})

    import core.llm.router as router_module

    monkeypatch.setattr(router_module.LLMRouter, "generate", fake_generate)

    agent = _make_test_agent()
    text = await agent._call_llm([{"role": "user", "content": "hi"}], user_id="user-1")

    assert text == "normal-response"
    assert calls == ["user-1"]
