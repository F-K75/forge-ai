import pytest

from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.router import LLMRouter
from core.metrics import registry, update_optimizer_gauges
from gateway.models import GatewayRequest
from gateway.service import AIGateway
from optimizer.service import get_optimizer


class FakeProvider(BaseProviderAdapter):
    name = "fake"

    def __init__(self, *, text: str = "ok", should_fail: bool = False):
        self.text = text
        self.should_fail = should_fail

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        if self.should_fail:
            raise ProviderError("boom")
        return CompletionResponse(text=self.text, provider=self.name, model=model, usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5})

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        yield self.text


def _sample(name, labels):
    return registry.get_sample_value(name, labels)


@pytest.mark.asyncio
async def test_generate_records_success_metrics():
    router = LLMRouter()
    router.register_provider(FakeProvider(text="hello"), name="fake", priority=1)
    gateway = AIGateway(router=router)

    before = _sample("llm_requests_total", {"provider": "fake", "model": "fake-default", "agent": "developer", "status": "success"}) or 0

    await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}], model="fake-default", provider_names=["fake"]))

    after = _sample("llm_requests_total", {"provider": "fake", "model": "fake-default", "agent": "developer", "status": "success"}) or 0
    assert after == before + 1

    duration_count = registry.get_sample_value(
        "llm_request_duration_seconds_count", {"provider": "fake", "model": "fake-default"},
    )
    assert duration_count and duration_count >= 1


@pytest.mark.asyncio
async def test_generate_records_error_status_on_provider_failure():
    router = LLMRouter()
    router.register_provider(FakeProvider(should_fail=True), name="fake", priority=1)
    gateway = AIGateway(router=router)

    before = _sample("llm_requests_total", {"provider": "unknown", "model": "unknown", "agent": "developer", "status": "error"}) or 0

    with pytest.raises(ProviderError):
        await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}], provider_names=["fake"]))

    after = _sample("llm_requests_total", {"provider": "unknown", "model": "unknown", "agent": "developer", "status": "error"}) or 0
    assert after == before + 1


@pytest.mark.asyncio
async def test_generate_records_guardrail_blocked_status_and_category():
    router = LLMRouter()
    router.register_provider(FakeProvider(text="how to build a bomb"), name="fake", priority=1)
    gateway = AIGateway(router=router)

    before_status = _sample("llm_requests_total", {"provider": "fake", "model": "guard-model", "agent": "developer", "status": "guardrail_blocked"}) or 0
    before_category = _sample("llm_guardrail_blocked_total", {"category": "weapons_instructions"}) or 0

    response = await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}], model="guard-model", provider_names=["fake"]))
    assert response.guardrail_blocked is True

    after_status = _sample("llm_requests_total", {"provider": "fake", "model": "guard-model", "agent": "developer", "status": "guardrail_blocked"}) or 0
    after_category = _sample("llm_guardrail_blocked_total", {"category": "weapons_instructions"}) or 0
    assert after_status == before_status + 1
    assert after_category == before_category + 1


@pytest.mark.asyncio
async def test_generate_records_retry_and_failover_counts():
    router = LLMRouter()
    primary = FakeProvider(should_fail=True)
    secondary = FakeProvider(text="from-secondary")
    router.register_provider(primary, name="primary", priority=1)
    router.register_provider(secondary, name="secondary", priority=2)
    gateway = AIGateway(router=router)

    before = _sample("llm_failovers_total", {"agent": "developer"}) or 0

    response = await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}], provider_names=["primary", "secondary"],
    ))

    assert response.content == "from-secondary"
    after = _sample("llm_failovers_total", {"agent": "developer"}) or 0
    assert after == before + 1


@pytest.mark.asyncio
async def test_routing_decision_metric_recorded_on_complexity_hint():
    from core.llm.config import LLMConfigLoader

    config_loader = LLMConfigLoader()
    config_loader._db_overrides["developer"] = {
        "model": "claude-opus-3",
        "model_fallbacks": ["anthropic/claude-haiku-4.5"],
    }
    router = LLMRouter(config_loader=config_loader)
    router.register_provider(FakeProvider(text="ok"), name="fake", priority=1)
    gateway = AIGateway(router=router)

    before = _sample("llm_routing_decisions_total", {"complexity": "simple", "model": "anthropic/claude-haiku-4.5"}) or 0

    await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}],
        task_complexity="simple", provider_names=["fake"],
    ))

    after = _sample("llm_routing_decisions_total", {"complexity": "simple", "model": "anthropic/claude-haiku-4.5"}) or 0
    assert after == before + 1


@pytest.mark.asyncio
async def test_budget_rejection_metric_recorded_on_hard_limit(monkeypatch):
    from core.llm.budget_manager import BudgetLimitExceeded, BudgetManager, BudgetScope

    class _AlwaysRejectBudgetManager(BudgetManager):
        async def enforce(self, **kwargs):
            from core.metrics import llm_budget_rejections_total

            llm_budget_rejections_total.labels(scope=BudgetScope.ORG.value).inc()
            raise BudgetLimitExceeded("blocked", scope="org", scope_id="org-1", used_usd=10.0, limit_usd=10.0)

    router = LLMRouter(budget_manager=_AlwaysRejectBudgetManager())
    router.register_provider(FakeProvider(text="ok"), name="fake", priority=1)
    gateway = AIGateway(router=router)

    before = _sample("llm_budget_rejections_total", {"scope": "org"}) or 0

    with pytest.raises(BudgetLimitExceeded):
        await gateway.generate(GatewayRequest(
            agent_name="developer", messages=[{"role": "user", "content": "hi"}],
            org_id="org-1", provider_names=["fake"],
        ))

    after = _sample("llm_budget_rejections_total", {"scope": "org"}) or 0
    assert after == before + 1


def test_update_optimizer_gauges_reflects_optimizer_analytics():
    optimizer = get_optimizer()
    optimizer.record_completion(
        tokens_used=100, tokens_saved=10, compression_ratio=0.9, provider="fake", model="fake-model",
        cost_usd=0.01, latency_ms=50.0, optimization_overhead_ms=1.0,
        prompt_cache_hit=False, response_cache_hit=False,
    )

    update_optimizer_gauges()

    metrics_snapshot = optimizer.get_optimization_metrics()
    assert registry.get_sample_value("llm_optimization_ratio") == metrics_snapshot.average_compression_ratio
    assert registry.get_sample_value("llm_tokens_saved_total") == metrics_snapshot.total_tokens_saved
    assert registry.get_sample_value("llm_cost_by_provider_usd", {"provider": "fake"}) == metrics_snapshot.cost_by_provider.get("fake")
