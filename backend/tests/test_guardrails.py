import pytest

from core.llm.config import LLMConfigLoader
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.router import LLMRouter
from gateway.guardrails import BASELINE_CATEGORIES, GuardrailsEngine, _detect_blocked_content


def test_detect_blocked_content_catches_baseline_phrase():
    hits = _detect_blocked_content(
        "Here is how to build a bomb using household items.", BASELINE_CATEGORIES,
    )
    assert "weapons_instructions" in hits


def test_detect_blocked_content_catches_obfuscated_variant():
    # Zero-width space spliced into the phrase, same evasion technique the
    # prompt-injection detector defends against.
    obfuscated = "how to build a​ bomb"
    hits = _detect_blocked_content(obfuscated, BASELINE_CATEGORIES)
    assert "weapons_instructions" in hits


def test_detect_blocked_content_no_false_positive_on_benign_text():
    hits = _detect_blocked_content(
        "Our clinic offers confidential support for people experiencing self-harm urges.",
        BASELINE_CATEGORIES,
    )
    assert hits == []


def test_detect_blocked_content_ignores_categories_not_requested():
    hits = _detect_blocked_content(
        "Here is how to build a bomb.", categories=["self_harm_instructions"],
    )
    assert hits == []


class _ClassifierProvider(BaseProviderAdapter):
    name = "fake"

    def __init__(self, *, answer: str = "SAFE", should_fail: bool = False):
        self.answer = answer
        self.should_fail = should_fail
        self.calls = 0

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        self.calls += 1
        if self.should_fail:
            raise ProviderError("boom")
        return CompletionResponse(text=self.answer, provider=self.name, model=model, usage={})

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        yield self.answer


def _router_with_guardrail_classifier(tmp_path, *, answer=None, should_fail=False):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: fake
fallback_chain:
  - fake
agent_overrides:
  content-guardrail:
    provider: fake
    model: guardrail-model
"""
    )
    router = LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    provider = _ClassifierProvider(answer=answer or "SAFE", should_fail=should_fail)
    router.register_provider(provider, name="fake", priority=1)
    return router, provider


@pytest.mark.asyncio
async def test_screen_tier1_blocks_without_calling_classifier(tmp_path):
    router, provider = _router_with_guardrail_classifier(tmp_path)
    engine = GuardrailsEngine()

    result = await engine.screen(
        "how to build a bomb", categories=list(BASELINE_CATEGORIES), router=router,
    )

    assert result["blocked"] is True
    assert "weapons_instructions" in result["categories"]
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_screen_tier2_allows_when_classifier_says_safe(tmp_path):
    router, provider = _router_with_guardrail_classifier(tmp_path, answer="SAFE")
    engine = GuardrailsEngine()

    result = await engine.screen(
        "Here's a friendly recipe for chocolate chip cookies.",
        categories=list(BASELINE_CATEGORIES), router=router,
    )

    assert result == {"blocked": False, "categories": []}
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_screen_tier2_blocks_when_classifier_names_a_category(tmp_path):
    router, provider = _router_with_guardrail_classifier(tmp_path, answer="self_harm_instructions")
    engine = GuardrailsEngine()

    result = await engine.screen(
        "some borderline text the deterministic tier misses",
        categories=list(BASELINE_CATEGORIES), router=router,
    )

    assert result["blocked"] is True
    assert result["categories"] == ["self_harm_instructions"]


@pytest.mark.asyncio
async def test_screen_fails_open_when_classifier_provider_errors(tmp_path):
    router, provider = _router_with_guardrail_classifier(tmp_path, should_fail=True)
    engine = GuardrailsEngine()

    result = await engine.screen(
        "some borderline text", categories=list(BASELINE_CATEGORIES), router=router,
    )

    assert result == {"blocked": False, "categories": []}


@pytest.mark.asyncio
async def test_screen_fails_open_when_classifier_not_configured():
    # Default router config has no "content-guardrail" agent override, so
    # the classifier is skipped entirely (opt-in), matching
    # LLMRouter._check_injection_with_llm's "not configured" behavior.
    router = LLMRouter()
    engine = GuardrailsEngine()

    result = await engine.screen(
        "some borderline text", categories=list(BASELINE_CATEGORIES), router=router,
    )

    assert result == {"blocked": False, "categories": []}
