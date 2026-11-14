import pytest

from core.llm.config import LLMConfigLoader
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.router import LLMRouter
from gateway.audit import AuditLogger
from gateway.models import GatewayRequest
from gateway.service import AIGateway


class FakeProvider(BaseProviderAdapter):
    name = "fake"

    def __init__(self, *, text: str = "ok", chunks=None, should_fail: bool = False):
        self.text = text
        self.chunks = chunks
        self.should_fail = should_fail

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        if self.should_fail:
            raise ProviderError("boom")
        return CompletionResponse(
            text=self.text, provider=self.name, model=model,
            usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        )

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        for chunk in (self.chunks or [self.text]):
            yield chunk


class SequencedProvider(BaseProviderAdapter):
    """Returns a different chat_completion response text on each successive
    call -- used to simulate a repair round-trip (invalid JSON, then a
    corrected response on the follow-up call)."""

    name = "fake"

    def __init__(self, *, texts):
        self.texts = list(texts)
        self.calls = 0

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        text = self.texts[min(self.calls, len(self.texts) - 1)]
        self.calls += 1
        return CompletionResponse(text=text, provider=self.name, model=model, usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5})

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        yield self.texts[0]


class _FakeCollection:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)


class _FakeDB:
    def __init__(self):
        self.gateway_audit_log = _FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


@pytest.fixture(autouse=True)
def _stub_audit_db(monkeypatch):
    """Keep every test in this module off a real MongoDB.

    AuditLogger.record() runs on every gateway request and calls get_db(),
    which provisions indexes on first use. With no MongoDB reachable that
    blocks for pymongo's full server-selection timeout (30s) and trips CI's
    --timeout=30 on whichever test happens to hit it first.
    """
    fake_db = _FakeDB()

    async def fake_get_db():
        return fake_db

    monkeypatch.setattr("gateway.audit.get_db", fake_get_db)


@pytest.mark.asyncio
async def test_generate_populates_structured_data_when_response_is_already_valid():
    router = LLMRouter()
    router.register_provider(SequencedProvider(texts=['{"name": "forge"}']), name="fake", priority=1)
    gateway = AIGateway(router=router)
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    response = await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}],
        structured_output_schema=schema,
    ))

    assert response.structured_data == {"name": "forge"}
    assert response.structured_output_errors is None


@pytest.mark.asyncio
async def test_generate_repairs_invalid_structured_output_once():
    # Guardrails are disabled for this org: the guardrail classifier issues its
    # own router call, which would otherwise be counted in provider.calls and
    # obscure the "one original + one repair" contract under test.
    config_loader = LLMConfigLoader()
    config_loader._org_policy_overrides["org-1"] = {"guardrails_enabled": False}
    router = LLMRouter(config_loader=config_loader)
    provider = SequencedProvider(texts=['{"nope": true}', '{"name": "fixed"}'])
    router.register_provider(provider, name="fake", priority=1)
    gateway = AIGateway(router=router)
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    response = await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}],
        structured_output_schema=schema, org_id="org-1",
    ))

    assert provider.calls == 2  # original attempt + one repair call
    assert response.structured_data == {"name": "fixed"}
    assert response.structured_output_errors is None


@pytest.mark.asyncio
async def test_generate_returns_structured_errors_when_repair_still_fails():
    router = LLMRouter()
    provider = SequencedProvider(texts=['{"nope": true}', '{"still": "wrong"}'])
    router.register_provider(provider, name="fake", priority=1)
    gateway = AIGateway(router=router)
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    response = await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}],
        structured_output_schema=schema,
    ))

    assert response.structured_data is None
    assert response.structured_output_errors


@pytest.mark.asyncio
async def test_generate_blocks_response_matching_baseline_guardrail_category():
    router = LLMRouter()
    router.register_provider(FakeProvider(text="Here is how to build a bomb."), name="fake", priority=1)
    gateway = AIGateway(router=router)

    response = await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}]))

    assert response.guardrail_blocked is True
    assert "weapons_instructions" in response.guardrail_categories
    assert response.content == "This response was blocked by content safety guardrails."


@pytest.mark.asyncio
async def test_generate_leaves_clean_response_unblocked_by_guardrails():
    router = LLMRouter()
    router.register_provider(FakeProvider(text="Here's a friendly cookie recipe."), name="fake", priority=1)
    gateway = AIGateway(router=router)

    response = await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}]))

    assert response.guardrail_blocked is False
    assert response.guardrail_categories is None
    assert response.content == "Here's a friendly cookie recipe."


@pytest.mark.asyncio
async def test_generate_skips_guardrails_when_disabled_in_org_policy():
    config_loader = LLMConfigLoader()
    config_loader._org_policy_overrides["org-1"] = {"guardrails_enabled": False}
    router = LLMRouter(config_loader=config_loader)
    router.register_provider(FakeProvider(text="Here is how to build a bomb."), name="fake", priority=1)
    gateway = AIGateway(router=router)

    response = await gateway.generate(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}], org_id="org-1",
    ))

    assert response.guardrail_blocked is False
    assert response.content == "Here is how to build a bomb."


@pytest.mark.asyncio
async def test_generate_returns_unified_response_with_request_id_and_cost():
    router = LLMRouter()
    router.register_provider(FakeProvider(text="hello"), name="fake", priority=1)
    gateway = AIGateway(router=router)

    response = await gateway.generate(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}]))

    assert response.content == "hello"
    assert response.provider == "fake"
    assert response.request_id
    assert response.latency_ms >= 0
    assert response.usage["total_tokens"] == 5


@pytest.mark.asyncio
async def test_stream_yields_multiple_real_chunks():
    router = LLMRouter()
    router.register_provider(FakeProvider(chunks=["hel", "lo ", "world"]), name="fake", priority=1)
    gateway = AIGateway(router=router)

    chunks = [c async for c in gateway.stream(GatewayRequest(agent_name="developer", messages=[{"role": "user", "content": "hi"}], streaming=True))]

    assert chunks == ["hel", "lo ", "world"]


@pytest.mark.asyncio
async def test_stream_blocks_response_matching_baseline_guardrail_category():
    router = LLMRouter()
    router.register_provider(
        FakeProvider(chunks=["Here is how ", "to build a bomb."]), name="fake", priority=1,
    )
    gateway = AIGateway(router=router)

    chunks = [c async for c in gateway.stream(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}], streaming=True,
    ))]

    assert chunks == ["This response was blocked by content safety guardrails."]


@pytest.mark.asyncio
async def test_stream_skips_guardrails_when_disabled_in_org_policy():
    config_loader = LLMConfigLoader()
    config_loader._org_policy_overrides["org-1"] = {"guardrails_enabled": False}
    router = LLMRouter(config_loader=config_loader)
    router.register_provider(
        FakeProvider(chunks=["Here is how ", "to build a bomb."]), name="fake", priority=1,
    )
    gateway = AIGateway(router=router)

    chunks = [c async for c in gateway.stream(GatewayRequest(
        agent_name="developer", messages=[{"role": "user", "content": "hi"}], streaming=True, org_id="org-1",
    ))]

    assert chunks == ["Here is how ", "to build a bomb."]


@pytest.mark.asyncio
async def test_validate_output_accepts_valid_json():
    gateway = AIGateway(router=LLMRouter())
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    result = await gateway.validate_output('{"name": "forge"}', schema)

    assert result["valid"] is True
    assert result["data"]["name"] == "forge"


@pytest.mark.asyncio
async def test_validate_output_returns_structured_error_without_repair_fn():
    gateway = AIGateway(router=LLMRouter())
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    result = await gateway.validate_output('{"nope": true}', schema)

    assert result["valid"] is False
    assert result["errors"]


@pytest.mark.asyncio
async def test_validate_output_repairs_once_then_succeeds():
    gateway = AIGateway(router=LLMRouter())
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    async def repair_fn(text, schema, errors):
        return '{"name": "fixed"}'

    result = await gateway.validate_output('{"nope": true}', schema, repair_fn=repair_fn)

    assert result["valid"] is True
    assert result["data"]["name"] == "fixed"


@pytest.mark.asyncio
async def test_validate_output_gives_up_after_one_failed_repair():
    gateway = AIGateway(router=LLMRouter())
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    async def repair_fn(text, schema, errors):
        return '{"still": "wrong"}'

    result = await gateway.validate_output('{"nope": true}', schema, repair_fn=repair_fn)

    assert result["valid"] is False


@pytest.mark.asyncio
async def test_validate_output_strips_markdown_fences_without_repair():
    gateway = AIGateway(router=LLMRouter())
    schema = {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}

    async def repair_fn(text, schema, errors):
        raise AssertionError("repair_fn must not be called for valid fenced JSON")

    for fenced in (
        '```json\n{"name": "forge"}\n```',
        '```\n{"name": "forge"}\n```',
        '```json\n{"name": "forge ```code```"}\n```',
    ):
        result = await gateway.validate_output(fenced, schema, repair_fn=repair_fn)
        assert result["valid"] is True
        assert result["data"]["name"].startswith("forge")


@pytest.mark.asyncio
async def test_audit_logger_records_expected_fields_and_no_prompt_content(monkeypatch):
    fake_db = _FakeDB()

    async def fake_get_db():
        return fake_db

    monkeypatch.setattr("gateway.audit.get_db", fake_get_db)

    logger = AuditLogger()
    await logger.record(
        request_id="req-1", provider="fake", model="fake-model", agent_name="developer",
        retry_attempts=2, failovers=1,
    )

    assert len(fake_db.gateway_audit_log.inserted) == 1
    record = fake_db.gateway_audit_log.inserted[0]
    assert record["request_id"] == "req-1"
    assert record["retry_attempts"] == 2
    assert record["failovers"] == 1
    assert "messages" not in record
    assert "api_key" not in record
