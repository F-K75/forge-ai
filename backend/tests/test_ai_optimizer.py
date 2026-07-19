"""Unit + integration tests for the AI Optimizer middleware (backend/optimizer).

Covers: context dedupe/trim, prompt normalization, token/cost estimation,
prompt/response caching (against a fake Redis), analytics aggregation, and
the end-to-end optimize_request() pipeline.
"""
import json
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

from optimizer.analytics import OptimizerAnalytics
from optimizer.config import OptimizerConfig
from optimizer.context_optimizer import dedupe_messages, optimize_context, truncate_to_budget
from optimizer.cost_estimator import estimate_request_cost
from optimizer.prompt_cache import PromptCache
from optimizer.prompt_optimizer import optimize_prompt
from optimizer.response_cache import ResponseCache
from optimizer.service import AIOptimizer
from optimizer.token_estimator import estimate_request_tokens


# --------------------------------------------------------------------------
# Context Optimizer
# --------------------------------------------------------------------------

def test_dedupe_messages_drops_exact_repeats():
    messages = [
        {"role": "system", "content": "You are a developer."},
        {"role": "user", "content": "Build a todo app."},
        {"role": "user", "content": "Build a todo app."},
    ]
    deduped = dedupe_messages(messages)
    assert len(deduped) == 2


def test_truncate_to_budget_preserves_system_and_recent_turns():
    system = [{"role": "system", "content": "x" * 100}]
    history = [{"role": "user", "content": f"turn {i}" * 50} for i in range(20)]
    messages = system + history
    trimmed = truncate_to_budget(messages, max_chars=500)
    assert trimmed[0]["role"] == "system"
    assert trimmed[-1] == history[-1]
    # Recent turns (default 5) are preserved, system is always kept
    assert len(trimmed) >= 6  # system + at least 1 user turn
    assert trimmed[1] == history[-5] or trimmed[1] == history[0]  # either recent preserved or oldest fit


def test_truncate_to_budget_without_preserve_recent_turns():
    """When preserve_recent_turns is 0, only the budget constrains output."""
    system = [{"role": "system", "content": "x" * 100}]
    history = [{"role": "user", "content": f"turn {i}" * 50} for i in range(20)]
    messages = system + history
    trimmed = truncate_to_budget(messages, max_chars=500, preserve_recent_turns=0)
    assert trimmed[0]["role"] == "system"
    assert sum(len(str(m["content"])) for m in trimmed) <= 500 + 100


def test_optimize_context_reports_accurate_savings():
    messages = [
        {"role": "system", "content": "instructions"},
        {"role": "user", "content": "same content"},
        {"role": "user", "content": "same content"},
    ]
    optimized, result = optimize_context(messages, max_chars=60_000)
    assert len(optimized) == 2
    assert result.tokens_saved > 0
    assert result.compression_ratio < 1.0


def test_optimize_context_strips_unused_metadata():
    messages = [{"role": "user", "content": "hi", "internal_id": "abc", "created_at": "now"}]
    optimized, _ = optimize_context(messages)
    assert "internal_id" not in optimized[0]
    assert "created_at" not in optimized[0]
    assert optimized[0]["content"] == "hi"


def test_optimize_context_compression_level_2_merges_system_messages():
    messages = [
        {"role": "system", "content": "You are a developer."},
        {"role": "system", "content": "Use Python 3.12."},
        {"role": "user", "content": "Build a todo app."},
    ]
    optimized, result = optimize_context(messages, compression_level=2)
    # System messages should be merged into one
    system_msgs = [m for m in optimized if m.get("role") == "system"]
    assert len(system_msgs) == 1
    assert "You are a developer." in system_msgs[0]["content"]
    assert "Use Python 3.12." in system_msgs[0]["content"]


def test_optimize_context_compression_level_2_dedupe_tool_calls():
    messages = [
        {"role": "user", "content": "List files."},
        {"role": "assistant", "content": "", "tool_calls": [{"id": "call_1", "function": {"name": "ls"}}]},
        {"role": "tool", "content": "file1.txt", "tool_call_id": "call_1"},
        {"role": "tool", "content": "file1.txt", "tool_call_id": "call_1"},  # duplicate
        {"role": "user", "content": "Now read file1."},
    ]
    optimized, _ = optimize_context(messages, compression_level=2)
    tool_msgs = [m for m in optimized if m.get("role") == "tool"]
    assert len(tool_msgs) == 1  # duplicate tool result removed


def test_optimize_context_compression_level_3_truncates_tool_results():
    messages = [
        {"role": "user", "content": "Read large file."},
        {"role": "tool", "content": "x" * 5000, "tool_call_id": "call_1"},
    ]
    optimized, _ = optimize_context(messages, compression_level=3, max_tool_result_chars=100)
    tool_msg = [m for m in optimized if m.get("role") == "tool"][0]
    assert len(tool_msg["content"]) <= 100 + 20  # content + truncation marker
    assert "[truncated...]" in tool_msg["content"]


def test_optimize_context_compression_level_0_is_noop():
    messages = [
        {"role": "user", "content": "hi", "internal_id": "abc"},
        {"role": "user", "content": "hi", "internal_id": "def"},
    ]
    optimized, result = optimize_context(messages, compression_level=0)
    assert len(optimized) == 2  # no deduplication
    assert result.compression_ratio == 1.0
    assert result.tokens_saved == 0


def test_optimize_context_semantic_dedupe_removes_near_duplicates():
    messages = [
        {"role": "user", "content": "Build a login page with authentication."},
        {"role": "user", "content": "Build a login page with authentication.  "},  # extra whitespace
        {"role": "user", "content": "Build a login page with authentication"},  # missing period
    ]
    optimized, _ = optimize_context(messages, compression_level=2)
    assert len(optimized) == 1  # all three are semantically identical


# --------------------------------------------------------------------------
# Prompt Optimizer
# --------------------------------------------------------------------------

def test_optimize_prompt_collapses_whitespace():
    text = "Section one.\n\n\n\nSection two.   has   extra   spaces.  \n"
    result = optimize_prompt(text)
    assert "\n\n\n" not in result
    assert "   " not in result


def test_optimize_prompt_merges_duplicate_sections():
    text = "Rule A applies.\n\nRule B applies.\n\nRule A applies."
    result = optimize_prompt(text)
    assert result.count("Rule A applies.") == 1
    assert "Rule B applies." in result


def test_optimize_prompt_noop_at_compression_level_zero():
    text = "Section one.\n\n\n\nSection one."
    result = optimize_prompt(text, compression_level=0)
    assert result == text


# --------------------------------------------------------------------------
# Token / Cost Estimator
# --------------------------------------------------------------------------

def test_estimate_request_tokens_uses_explicit_max_output():
    messages = [{"role": "user", "content": "hello world"}]
    estimate = estimate_request_tokens(messages, provider="anthropic", model="claude-sonnet-4-6", max_output_tokens=100)
    assert estimate.expected_output_tokens == 100
    assert estimate.total_tokens == estimate.input_tokens + 100


def test_estimate_request_cost_matches_pricing_table():
    messages = [{"role": "user", "content": "x" * 4000}]
    token_estimate = estimate_request_tokens(messages, provider="anthropic", model="claude-sonnet-4-6", max_output_tokens=1000)
    cost = estimate_request_cost(token_estimate, monthly_request_volume=100)
    assert cost.estimated_request_cost_usd > 0
    assert cost.estimated_monthly_cost_usd == round(cost.estimated_request_cost_usd * 100, 2)


# --------------------------------------------------------------------------
# Caches (against a fake Redis, matching tests/test_cache_plans.py pattern)
# --------------------------------------------------------------------------

class FakeRedisStore:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)

    async def setex(self, key, ttl, value):
        self.data[key] = value


@pytest.fixture
def fake_redis(monkeypatch):
    store = FakeRedisStore()

    async def fake_cache_get_json(key):
        raw = await store.get(key)
        return json.loads(raw) if raw is not None else None

    async def fake_cache_set_json(key, value, ttl=300):
        await store.setex(key, ttl, json.dumps(value, default=str))

    import optimizer.prompt_cache as prompt_cache_module
    import optimizer.response_cache as response_cache_module

    monkeypatch.setattr(prompt_cache_module, "cache_get_json", fake_cache_get_json)
    monkeypatch.setattr(prompt_cache_module, "cache_set_json", fake_cache_set_json)
    monkeypatch.setattr(response_cache_module, "cache_get_json", fake_cache_get_json)
    monkeypatch.setattr(response_cache_module, "cache_set_json", fake_cache_set_json)
    return store


async def test_prompt_cache_hit_after_set(fake_redis):
    cache = PromptCache(ttl_seconds=60)
    messages = [{"role": "user", "content": "hi"}]
    assert await cache.get(messages, "claude-sonnet-4-6") is None
    await cache.set(messages, "claude-sonnet-4-6", {"optimized": True})
    result = await cache.get(messages, "claude-sonnet-4-6")
    assert result == {"optimized": True}
    assert cache.stats() == {"hits": 1, "misses": 1}


async def test_response_cache_exact_match(fake_redis):
    cache = ResponseCache(ttl_seconds=60)
    messages = [{"role": "user", "content": "what is 2+2"}]
    await cache.set(messages, "claude-sonnet-4-6", "anthropic", {"text": "4"})
    cached = await cache.get(messages, "claude-sonnet-4-6", "anthropic")
    assert cached["text"] == "4"


async def test_response_cache_semantic_match_on_near_duplicate_prompt(fake_redis):
    cache = ResponseCache(ttl_seconds=60, semantic_enabled=True, similarity_threshold=0.8)
    original = [{"role": "user", "content": "please summarize this quarterly report for me"}]
    rephrased = [{"role": "user", "content": "please summarize this quarterly report for me now"}]

    await cache.set(original, "claude-sonnet-4-6", "anthropic", {"text": "summary"})
    cached = await cache.get(rephrased, "claude-sonnet-4-6", "anthropic")

    assert cached["text"] == "summary"
    assert cache.stats()["semantic_hits"] == 1


async def test_response_cache_semantic_match_disabled_by_default_flag(fake_redis):
    cache = ResponseCache(ttl_seconds=60, semantic_enabled=False)
    original = [{"role": "user", "content": "please summarize this quarterly report for me"}]
    rephrased = [{"role": "user", "content": "please summarize this quarterly report for me now"}]

    await cache.set(original, "claude-sonnet-4-6", "anthropic", {"text": "summary"})
    cached = await cache.get(rephrased, "claude-sonnet-4-6", "anthropic")

    assert cached is None
    assert cache.stats()["semantic_hits"] == 0


async def test_response_cache_semantic_match_rejects_dissimilar_prompt(fake_redis):
    cache = ResponseCache(ttl_seconds=60, semantic_enabled=True, similarity_threshold=0.8)
    original = [{"role": "user", "content": "please summarize this quarterly report for me"}]
    unrelated = [{"role": "user", "content": "write a haiku about the ocean at sunset"}]

    await cache.set(original, "claude-sonnet-4-6", "anthropic", {"text": "summary"})
    cached = await cache.get(unrelated, "claude-sonnet-4-6", "anthropic")

    assert cached is None


def test_response_cache_refuses_streaming_and_tools_and_randomized():
    assert ResponseCache.is_cacheable(streaming=True, has_tools=False) is False
    assert ResponseCache.is_cacheable(streaming=False, has_tools=True) is False
    assert ResponseCache.is_cacheable(streaming=False, has_tools=False, temperature=0.7) is False
    assert ResponseCache.is_cacheable(streaming=False, has_tools=False, cacheable=False) is False
    assert ResponseCache.is_cacheable(streaming=False, has_tools=False) is True


# --------------------------------------------------------------------------
# Analytics
# --------------------------------------------------------------------------

def test_analytics_snapshot_aggregates_requests():
    analytics = OptimizerAnalytics()
    analytics.record_request(
        tokens_used=100, tokens_saved=20, compression_ratio=0.8, provider="anthropic", model="claude-sonnet-4-6",
        cost_usd=0.01, latency_ms=200, optimization_overhead_ms=5, prompt_cache_hit=False, response_cache_hit=True,
    )
    analytics.record_request(
        tokens_used=50, tokens_saved=0, compression_ratio=1.0, provider="openai", model="gpt-4o-mini",
        cost_usd=0.002, latency_ms=100, optimization_overhead_ms=3, prompt_cache_hit=False, response_cache_hit=False,
    )
    snapshot = analytics.snapshot()
    assert snapshot.total_requests == 2
    assert snapshot.total_tokens_used == 150
    assert snapshot.total_tokens_saved == 20
    assert snapshot.cache_hit_ratio == 0.5
    assert "anthropic" in snapshot.cost_by_provider
    assert "gpt-4o-mini" in snapshot.cost_by_model


# --------------------------------------------------------------------------
# End-to-end AIOptimizer service
# --------------------------------------------------------------------------

async def test_optimize_request_end_to_end(fake_redis):
    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [
        {"role": "system", "content": "You are helpful.\n\n\n\nYou are helpful."},
        {"role": "user", "content": "Build a login page."},
        {"role": "user", "content": "Build a login page."},
    ]
    result = await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6")
    assert len(result.messages) == 2  # duplicate user turn dropped
    assert result.context_optimization.tokens_saved >= 0
    assert result.token_estimate.provider == "anthropic"
    assert result.cost_estimate.model == "claude-sonnet-4-6"
    assert result.response_cache_hit is False


async def test_optimize_request_serves_cached_response(fake_redis):
    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [{"role": "user", "content": "what is the capital of France"}]

    first = await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6")
    assert first.response_cache_hit is False
    await optimizer.cache_response(
        messages=first.messages, model="claude-sonnet-4-6", provider="anthropic", response_text="Paris"
    )

    second = await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6")
    assert second.response_cache_hit is True
    assert second.cached_response == "Paris"


async def test_optimize_request_skips_cache_for_streaming(fake_redis):
    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [{"role": "user", "content": "stream this"}]
    cached = await optimizer.cache_response(
        messages=messages, model="claude-sonnet-4-6", provider="anthropic", response_text="won't be cached", streaming=True
    )
    assert cached is False
    result = await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6", streaming=True)
    assert result.response_cache_hit is False


async def test_optimize_request_with_retrieval_prepends_relevant_chunks(fake_redis, monkeypatch):
    from retrieval.models import RetrievedChunk, SourceType

    async def fake_retrieve(query, *, top_k=3, org_id=None, project_id=None, **kwargs):
        assert query == "how do I add auth?"
        return [
            RetrievedChunk(
                id="c1", source_type=SourceType.DOCUMENTATION, source_id="doc-1",
                text="Use JWT for auth.", score=0.95,
            )
        ]

    class _FakeRetriever:
        retrieve = staticmethod(fake_retrieve)

    monkeypatch.setattr("retrieval.service.get_semantic_retriever", lambda: _FakeRetriever())

    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [{"role": "user", "content": "how do I add auth?"}]

    result = await optimizer.optimize_request(
        messages=messages, provider="anthropic", model="claude-sonnet-4-6", use_retrieval=True,
    )

    assert result.messages[0]["role"] == "system"
    assert "Use JWT for auth." in result.messages[0]["content"]
    assert result.messages[-1]["content"] == "how do I add auth?"


async def test_optimize_request_retrieval_failure_does_not_break_request(fake_redis, monkeypatch):
    class _FailingRetriever:
        async def retrieve(self, *args, **kwargs):
            raise RuntimeError("embeddings API down")

    monkeypatch.setattr("retrieval.service.get_semantic_retriever", lambda: _FailingRetriever())

    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [{"role": "user", "content": "how do I add auth?"}]

    result = await optimizer.optimize_request(
        messages=messages, provider="anthropic", model="claude-sonnet-4-6", use_retrieval=True,
    )

    assert result.messages == messages


async def test_optimize_request_without_retrieval_flag_skips_augmentation(fake_redis, monkeypatch):
    calls = []

    async def fake_retrieve(*args, **kwargs):
        calls.append(1)
        return []

    class _FakeRetriever:
        retrieve = staticmethod(fake_retrieve)

    monkeypatch.setattr("retrieval.service.get_semantic_retriever", lambda: _FakeRetriever())

    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    messages = [{"role": "user", "content": "how do I add auth?"}]

    await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6")

    assert calls == []


async def test_optimize_request_disabled_is_noop():
    optimizer = AIOptimizer(config=OptimizerConfig(enabled=False))
    messages = [{"role": "user", "content": "hi"}, {"role": "user", "content": "hi"}]
    result = await optimizer.optimize_request(messages=messages, provider="anthropic", model="claude-sonnet-4-6")
    assert result.messages == messages
    assert result.context_optimization.compression_ratio == 1.0


def test_get_optimization_metrics_and_cache_statistics():
    optimizer = AIOptimizer(config=OptimizerConfig(enabled=True))
    optimizer.record_completion(
        tokens_used=10, tokens_saved=2, compression_ratio=0.9, provider="anthropic", model="claude-sonnet-4-6",
        cost_usd=0.001, latency_ms=50, optimization_overhead_ms=1, prompt_cache_hit=False, response_cache_hit=False,
    )
    metrics = optimizer.get_optimization_metrics()
    assert metrics.total_requests >= 1
    stats = optimizer.get_cache_statistics()
    assert stats.prompt_cache_hits >= 0
