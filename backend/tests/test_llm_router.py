import pytest

from core.llm.router import LLMRouter, ProviderError, CompletionResponse
from core.llm.provider import BaseProviderAdapter
from core.llm.config import LLMConfigLoader


class FakeProvider(BaseProviderAdapter):
    name = "fake"

    def __init__(self, *, should_fail: bool = False, text: str = "ok", fail_models: tuple = ()):
        self.should_fail = should_fail
        self.text = text
        self.fail_models = fail_models
        self.calls = 0
        self.models_tried = []

    async def health_check(self) -> bool:
        return True

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        self.calls += 1
        self.models_tried.append(model)
        if self.should_fail or model in self.fail_models:
            raise ProviderError("boom")
        return CompletionResponse(
            text=self.text,
            provider=self.name,
            model=model,
            usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        )

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        self.calls += 1
        if self.should_fail:
            raise ProviderError("boom")
        async def _iter():
            yield self.text
        return _iter()

    async def count_tokens(self, *, text: str, **kwargs) -> int:
        return len(text.split())


@pytest.mark.asyncio
async def test_router_falls_back_to_next_provider():
    router = LLMRouter()
    primary = FakeProvider(should_fail=True)
    secondary = FakeProvider(text="fallback")
    router.register_provider(primary, name="primary", priority=1)
    router.register_provider(secondary, name="secondary", priority=2)

    result = await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}])

    assert result.text == "fallback"
    assert result.provider == "secondary"
    # default retry config attempts each provider twice before falling back
    assert primary.calls == 2
    assert secondary.calls == 1


@pytest.mark.asyncio
async def test_router_normalizes_usage_and_model_defaults():
    router = LLMRouter()
    provider = FakeProvider(text="hello")
    router.register_provider(provider, name="fake", priority=1)

    result = await router.generate(
        agent_name="architect",
        messages=[{"role": "user", "content": "hello"}],
        model="custom-model",
    )

    assert result.model == "custom-model"
    assert result.usage["total_tokens"] == 5
    assert result.usage["prompt_tokens"] == 3


@pytest.mark.asyncio
async def test_router_falls_back_to_next_model_within_same_provider(tmp_path):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: fake
fallback_chain:
  - fake
retry:
  max_attempts: 1
agent_overrides:
  developer:
    model: primary-model
    model_fallbacks:
      - backup-model
"""
    )
    router = LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    provider = FakeProvider(text="from backup", fail_models=("primary-model",))
    router.register_provider(provider, name="fake", priority=1)

    result = await router.generate(agent_name="developer", messages=[{"role": "user", "content": "hi"}])

    assert result.text == "from backup"
    assert result.model == "backup-model"
    assert provider.models_tried == ["primary-model", "backup-model"]
