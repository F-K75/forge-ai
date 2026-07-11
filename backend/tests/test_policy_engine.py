import pytest

from core.llm.config import LLMConfigLoader
from core.llm.policy import PolicyEngine, PolicyViolation, get_policy_engine
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.router import LLMRouter


class FakeProvider(BaseProviderAdapter):
    def __init__(self, *, name: str = "fake", text: str = "ok"):
        self.name = name
        self.text = text
        self.calls = 0

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        self.calls += 1
        return CompletionResponse(text=self.text, provider=self.name, model=model, usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5})

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        self.calls += 1
        yield self.text


def test_approved_providers_filters_and_no_op_when_unset():
    engine = PolicyEngine()

    providers, models = engine.enforce(
        policy_config={}, providers_to_try=["a", "b"], model_chain=["m1"],
        max_tokens=100, cost_estimate_usd=0.01,
    )
    assert providers == ["a", "b"]
    assert models == ["m1"]

    providers, models = engine.enforce(
        policy_config={"approved_providers": ["b"]}, providers_to_try=["a", "b"], model_chain=["m1"],
        max_tokens=100, cost_estimate_usd=0.01,
    )
    assert providers == ["b"]


def test_approved_providers_raises_when_none_allowed():
    engine = PolicyEngine()
    with pytest.raises(PolicyViolation):
        engine.enforce(
            policy_config={"approved_providers": ["c"]}, providers_to_try=["a", "b"], model_chain=["m1"],
            max_tokens=100, cost_estimate_usd=0.01,
        )


def test_approved_models_filters_and_raises_when_none_allowed():
    engine = PolicyEngine()
    providers, models = engine.enforce(
        policy_config={"approved_models": ["m2"]}, providers_to_try=["a"], model_chain=["m1", "m2"],
        max_tokens=100, cost_estimate_usd=0.01,
    )
    assert models == ["m2"]

    with pytest.raises(PolicyViolation):
        engine.enforce(
            policy_config={"approved_models": ["m3"]}, providers_to_try=["a"], model_chain=["m1", "m2"],
            max_tokens=100, cost_estimate_usd=0.01,
        )


def test_max_tokens_per_request_rejects_over_limit():
    engine = PolicyEngine()
    with pytest.raises(PolicyViolation):
        engine.enforce(
            policy_config={"max_tokens_per_request": 100}, providers_to_try=["a"], model_chain=["m1"],
            max_tokens=200, cost_estimate_usd=0.01,
        )
    # at or under the limit is fine
    engine.enforce(
        policy_config={"max_tokens_per_request": 100}, providers_to_try=["a"], model_chain=["m1"],
        max_tokens=100, cost_estimate_usd=0.01,
    )


def test_max_cost_per_request_rejects_over_limit():
    engine = PolicyEngine()
    with pytest.raises(PolicyViolation):
        engine.enforce(
            policy_config={"max_cost_per_request_usd": 0.05}, providers_to_try=["a"], model_chain=["m1"],
            max_tokens=100, cost_estimate_usd=0.10,
        )


def test_get_policy_engine_is_a_singleton():
    assert get_policy_engine() is get_policy_engine()


@pytest.mark.asyncio
async def test_router_only_calls_approved_provider(tmp_path):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: primary
fallback_chain:
  - primary
  - secondary
agent_overrides:
  developer:
    policy:
      approved_providers:
        - secondary
"""
    )
    router = LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    primary = FakeProvider(name="primary", text="from-primary")
    secondary = FakeProvider(name="secondary", text="from-secondary")
    router.register_provider(primary, name="primary", priority=100)
    router.register_provider(secondary, name="secondary", priority=1)

    result = await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}])

    assert result.text == "from-secondary"
    assert result.provider == "secondary"
    assert primary.calls == 0


@pytest.mark.asyncio
async def test_router_raises_policy_violation_for_disallowed_max_tokens(tmp_path):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: fake
fallback_chain:
  - fake
agent_overrides:
  developer:
    policy:
      max_tokens_per_request: 10
"""
    )
    router = LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    router.register_provider(FakeProvider(), name="fake", priority=1)

    with pytest.raises(ProviderError):
        await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}], max_tokens=1000)


@pytest.mark.asyncio
async def test_router_applies_org_level_approved_providers(tmp_path):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: primary
fallback_chain:
  - primary
  - secondary
"""
    )
    config_loader = LLMConfigLoader(config_path=config_path)
    # Set the in-memory cache directly rather than via set_org_policy_override
    # -- that method also writes through to Mongo, which isn't available in
    # this unit test; the router-level behavior under test only depends on
    # the in-memory cache load() reads from.
    config_loader._org_policy_overrides["org-1"] = {"approved_providers": ["secondary"]}

    router = LLMRouter(config_loader=config_loader)
    primary = FakeProvider(name="primary", text="from-primary")
    secondary = FakeProvider(name="secondary", text="from-secondary")
    router.register_provider(primary, name="primary", priority=100)
    router.register_provider(secondary, name="secondary", priority=1)

    result = await router.generate(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}], org_id="org-1",
    )

    assert result.text == "from-secondary"
    assert result.provider == "secondary"
    assert primary.calls == 0

    # A request with no org_id is unaffected by the org-1 policy.
    other_result = await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}])
    assert other_result.provider == "primary"
