import pytest

from core.llm.model_router import ModelRouter, TaskComplexity
from core.llm.provider import BaseProviderAdapter, CompletionResponse
from core.llm.router import LLMRouter


class FakeProvider(BaseProviderAdapter):
    name = "fake"

    def __init__(self):
        self.requested_models = []

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        self.requested_models.append(model)
        return CompletionResponse(
            text="ok", provider=self.name, model=model,
            usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        )

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        yield "ok"


CANDIDATES = ["claude-opus-3", "claude-sonnet-4-6", "anthropic/claude-haiku-4.5", "gpt-4-turbo"]


def test_select_simple_picks_cheapest_candidate():
    router = ModelRouter()
    assert router.select(TaskComplexity.SIMPLE, CANDIDATES) == "anthropic/claude-haiku-4.5"


def test_select_critical_picks_most_expensive_candidate():
    router = ModelRouter()
    assert router.select(TaskComplexity.CRITICAL, CANDIDATES) == "claude-opus-3"


def test_select_empty_candidates_falls_back_to_default():
    router = ModelRouter()
    from core.ai_usage import DEFAULT_MODEL

    assert router.select(TaskComplexity.COMPLEX, []) == DEFAULT_MODEL


def test_reorder_moves_chosen_model_to_front_and_keeps_rest():
    router = ModelRouter()
    chain = ["claude-opus-3", "anthropic/claude-haiku-4.5", "claude-sonnet-4-6"]

    reordered = router.reorder(chain, TaskComplexity.SIMPLE)

    assert reordered[0] == "anthropic/claude-haiku-4.5"
    assert set(reordered) == set(chain)


def test_reorder_single_model_chain_is_unchanged():
    router = ModelRouter()
    assert router.reorder(["claude-opus-3"], TaskComplexity.SIMPLE) == ["claude-opus-3"]


@pytest.mark.asyncio
async def test_generate_uses_complexity_routed_model_from_fallback_chain():
    from core.llm.config import LLMConfigLoader

    config_loader = LLMConfigLoader()
    config_loader._db_overrides["developer"] = {
        "model": "claude-opus-3",
        "model_fallbacks": ["anthropic/claude-haiku-4.5", "claude-sonnet-4-6"],
    }
    router = LLMRouter(config_loader=config_loader)
    provider = FakeProvider()
    router.register_provider(provider, name="fake", priority=1)

    await router.generate(
        agent_name="developer",
        messages=[{"role": "user", "content": "fix a typo"}],
        task_complexity="simple",
    )

    assert provider.requested_models[0] == "anthropic/claude-haiku-4.5"


@pytest.mark.asyncio
async def test_generate_explicit_model_overrides_task_complexity():
    router = LLMRouter()
    provider = FakeProvider()
    router.register_provider(provider, name="fake", priority=1)

    await router.generate(
        agent_name="developer",
        messages=[{"role": "user", "content": "fix a typo"}],
        model="claude-opus-3",
        task_complexity="simple",
    )

    assert provider.requested_models[0] == "claude-opus-3"
