"""Unified usage accounting (docs/architecture/agent-collaboration-plan.md
§6, §7.2, §15.2, §16.3, UA-1 ... UA-5)."""

from __future__ import annotations

import json

import httpx
import pytest

from core.ai_usage import (
    LEGACY_USAGE_ROW_FIELDS,
    USAGE_ROW_FIELDS,
    UsageRowSchemaError,
    get_user_budget,
    record_provider_attempt,
    safe_error_class,
    validate_usage_row,
)
from core.llm.config import LLMConfigLoader
from core.llm.provider import ProviderError
from core.llm.router import LLMRouter
from core.processing_boundary import CredentialMode, ProcessingBoundary, build_scope
from gateway.models import GatewayRequest
from gateway.service import AIGateway
from tests.a2_support import (
    BYOK_TEST_KEY,
    CountingProvider,
    FakeDB,
    ForgeTripwires,
    StubBuildHarness,
    build_responses,
    developer_fixture,
    make_build,
    make_user,
    op_marker,
    patch_infra,
    set_flags,
)

POLICY_MODEL = "anthropic/claude-haiku-4.5"


def _full_build(monkeypatch):
    """A Forge max-path stub build with every channel exercised: a
    structured repair, a retry, a model fallback, the output L-tier on every
    artifact, the input classifier and build-path retrieval embeddings."""
    db = FakeDB(builds=[make_build()], users=[make_user(byok=False)], projects=[{"id": "p1", "org_id": "org-1"}])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, guardrail_v2=True, unified_usage_recording=True, build_path_retrieval=True,
              guardrail_monthly_usd=50.0, guardrail_per_build_usd=5.0, openai_api_key="sk-forge-embeddings")

    embedding_posts = []

    async def fake_post(self, url, *a, **k):
        embedding_posts.append(str(url))
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1, 0.2]}],
                                         "usage": {"prompt_tokens": 4}},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    responses = build_responses(dev_text=developer_fixture(6_000))
    seen = {}

    def respond(model, messages):
        op = op_marker(messages) or ""
        seen[op] = seen.get(op, 0) + 1
        if op == "blueprint" and seen[op] == 1:
            return '{"not": "a blueprint"}'  # -> one structured repair
        if op == "improve" and seen[op] == 1:
            raise ProviderError("503 overloaded")  # -> one retry on the same model
        if op == "design" and model == "primary-model":
            raise ProviderError("primary model unavailable")  # -> fallback model
        return responses.get(op, "ok")

    forge = CountingProvider(responder=respond, label="forge")

    def screen(model, messages):
        return "NO" if "security classifier" in messages[0]["content"] else "SAFE"

    guardrail = CountingProvider(responder=screen, label="guardrail")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, guardrail=guardrail)
    harness.loader._config = {**harness.loader._config, "model": "primary-model",
                              "model_fallbacks": ["fallback-model"],
                              "retry": {"max_attempts": 2, "backoff_seconds": 0}}
    harness.loader._org_policy_overrides["org-1"] = {"guardrail": {"llm_screen": "required",
                                                                   "partial_coverage": "accept"}}
    harness.loader._db_overrides["injection-check"] = {"provider": "openrouter", "model": POLICY_MODEL}
    result = harness.run()
    assert result["status"] == "success"
    return db, forge, guardrail, embedding_posts


def test_provider_calls_equal_recorded_attempts(monkeypatch):
    db, forge, guardrail, embeddings = _full_build(monkeypatch)
    provider_calls = len(forge.calls) + len(guardrail.calls) + len(embeddings)
    rows = db.ai_usage.docs
    assert len(rows) == provider_calls
    purposes = {r["purpose"] for r in rows}
    assert {"generation", "repair", "retry", "fallback", "guardrail_output", "guardrail_input",
            "retrieval_embedding"} <= purposes
    assert sum(r["purpose"] == "guardrail_output" for r in rows) == 16  # one per artifact
    # The classifier ran once per operation, not per attempt or repair.
    assert sum(r["purpose"] == "guardrail_input" for r in rows) == 16
    by_purpose = {p: [r for r in rows if r["purpose"] == p] for p in purposes}
    assert len(by_purpose["repair"]) == 1 and len(by_purpose["retry"]) == 1
    assert by_purpose["fallback"][0]["model"] == "fallback-model"
    assert all(r["account"] == "generation" for r in by_purpose["generation"])
    assert all(r["build_id"] == "build-1" for r in rows)


def test_failed_attempts_recorded(monkeypatch):
    import asyncio

    db = FakeDB()
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, unified_usage_recording=True)
    loader = LLMConfigLoader()
    loader._config = {**loader._config, "default_provider": "forge", "fallback_chain": ["forge", "backup"],
                      "agent_overrides": {}, "retry": {"max_attempts": 1, "backoff_seconds": 0}}
    router = LLMRouter(config_loader=loader)
    router.registry._providers.clear()
    router.register_provider(CountingProvider(fail=ProviderError("401 unauthorized: secret prompt text"),
                                              label="forge"), name="forge", priority=10)
    router.register_provider(CountingProvider(text="", label="backup"), name="backup", priority=5)
    with pytest.raises(ProviderError):
        asyncio.run(router.generate(agent_name="developeragent", messages=[{"role": "user", "content": "hi"}],
                                    build_id="b1"))
    errors = [r for r in db.ai_usage.docs if r["outcome"] == "error"]
    assert len(errors) == 2
    assert [r["error_class"] for r in errors] == ["ProviderError", "empty_response"]
    assert [r["attempt_kind"] for r in errors] == ["primary", "fallback"]
    # A transport failure has no tokens; an empty completion keeps whatever
    # usage the provider reported (it may still bill for it).
    assert errors[0]["total_tokens"] == 0 and errors[0]["cost"] == 0
    assert errors[1]["total_tokens"] == 12
    assert all("secret" not in json.dumps(r, default=str) for r in errors)

    # A failed attempt on the customer's key is recorded too.
    ForgeTripwires(monkeypatch, byok_fail=RuntimeError("timeout"))
    with pytest.raises(ProviderError):
        asyncio.run(router.generate(agent_name="developeragent", messages=[{"role": "user", "content": "hi"}],
                                    byok={"provider": "anthropic", "api_key": BYOK_TEST_KEY}))
    byok_row = db.ai_usage.docs[-1]
    assert byok_row["outcome"] == "error" and byok_row["credential"] == "byok"
    assert byok_row["cost_bearer"] == "customer_provider"


@pytest.mark.asyncio
async def test_platform_principals_recorded(monkeypatch):
    import core.specialist_shadow as shadow_module
    from agent_registry.task_router import Assignment
    from core.models import Build

    db = FakeDB(projects=[{"id": "p1", "user_id": "u1"}], users=[make_user(byok=False)])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, unified_usage_recording=True)
    loader = LLMConfigLoader()
    loader._config = {**loader._config, "default_provider": "forge", "fallback_chain": ["forge"],
                      "agent_overrides": {}}
    loader._org_policy_overrides = {}
    router = LLMRouter(config_loader=loader)
    router.registry._providers.clear()
    router.register_provider(CountingProvider(text="a suggestion", label="forge"), name="forge", priority=1)
    gateway = AIGateway(router=router)
    monkeypatch.setattr(shadow_module, "get_ai_gateway", lambda: gateway)

    async def _on(key):
        return True

    class _Router:
        async def route(self, project_id, text, max_assignments=3):
            return [Assignment(role="api_engineer", department="backend", agent_id="a1",
                               display_name="API", score=1, matched_keywords=["api"])]

    class _Registry:
        async def get_or_create_agent(self, *a, **k):
            return type("A", (), {"id": "a1"})(), False

        async def record_task_result(self, *a, **k):
            return None

    monkeypatch.setattr(shadow_module, "is_feature_enabled", _on)
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: _Router())
    monkeypatch.setattr(shadow_module, "get_agent_registry", lambda: _Registry())

    build = Build(id="b1", project_id="p1", user_id="u1", prompt="x")
    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.FORGE, owner_user_id="u1"),
                     build_id="b1", user_id="u1", project_id="p1", org_id="org-1"):
        await shadow_module.maybe_run_specialist_shadow_comparison(build, {"description": "api"}, {}, {})
    await gateway.generate(GatewayRequest(agent_name="api_engineer", messages=[{"role": "user", "content": "f"}],
                                          project_id="p1", purpose="monitoring"))

    shadow_row, monitor_row = db.ai_usage.docs
    assert shadow_row["principal"] == "platform:shadow" and shadow_row["account"] == "shadow"
    assert monitor_row["principal"] == "platform:monitoring" and monitor_row["account"] == "monitoring"
    for row in (shadow_row, monitor_row):
        assert row["user_id"] is None and row["org_id"] is None and row["project_id"] is None
        assert row["platform_principal"] is True
        assert row["beneficiary_project_id"] == "p1"
    assert shadow_row["beneficiary_user_id"] == "u1"


@pytest.mark.asyncio
async def test_platform_usage_excluded_from_user_daily_budget(monkeypatch):
    db = FakeDB(users=[make_user(byok=False)], organizations=[{"id": "org-1", "plan": "free"}])
    patch_infra(monkeypatch, db)
    common = dict(credential="forge", outcome="success", model=POLICY_MODEL, org_id="org-1",
                  project_id="p1", build_id="b1")
    await record_provider_attempt(purpose="generation", account="generation", user_id="u1",
                                  prompt_tokens=60, completion_tokens=40, **common)
    for purpose, principal, account in (("guardrail_output", "platform:guardrail", "guardrail"),
                                        ("shadow", "platform:shadow", "shadow"),
                                        ("monitoring", "platform:monitoring", "monitoring")):
        await record_provider_attempt(purpose=purpose, account=account, principal=principal, user_id="u1",
                                      prompt_tokens=5000, completion_tokens=0, **common)
    assert (await get_user_budget("u1"))["used"] == 100
    assert (await get_user_budget("u1", org_id="org-1"))["used"] == 100


def test_no_content_in_usage_rows(monkeypatch):
    db, _, _, _ = _full_build(monkeypatch)
    assert db.ai_usage.docs
    assert LEGACY_USAGE_ROW_FIELDS <= USAGE_ROW_FIELDS
    forbidden = {"prompt", "completion", "messages", "content", "text", "response", "error", "error_message"}
    assert not (forbidden & USAGE_ROW_FIELDS)
    for row in db.ai_usage.docs:
        assert set(row) <= USAGE_ROW_FIELDS
        flat = json.dumps(row, default=str)
        for marker in ("[op:", "export const handler", "Redirect to /login", "plan it"):
            assert marker not in flat
    with pytest.raises(UsageRowSchemaError):
        validate_usage_row({"id": "x", "prompt": "secret"})
    with pytest.raises(UsageRowSchemaError):
        validate_usage_row({"id": "x", "processing_boundary": {"credential_mode": "byok", "consents": []}})
    assert safe_error_class(ProviderError("leaks the prompt: build me a bank")) == "ProviderError"
    assert safe_error_class("free text with spaces") == "error"


def test_unified_recording_off_keeps_legacy_rows(monkeypatch):
    """Rollback state: legacy `track_usage` rows only (successful,
    user-attributed); no per-attempt or platform rows."""
    import asyncio

    db = FakeDB(users=[make_user(byok=False)])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, unified_usage_recording=False)
    loader = LLMConfigLoader()
    loader._config = {**loader._config, "default_provider": "forge", "fallback_chain": ["forge"],
                      "agent_overrides": {}, "retry": {"max_attempts": 2, "backoff_seconds": 0}}
    router = LLMRouter(config_loader=loader)
    router.registry._providers.clear()
    calls = {"n": 0}

    def flaky(model, messages):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ProviderError("503 overloaded")
        return "ok"

    router.register_provider(CountingProvider(responder=flaky, label="forge"), name="forge", priority=1)
    asyncio.run(router.generate(agent_name="developeragent", messages=[{"role": "user", "content": "hi"}],
                                user_id="u1"))
    asyncio.run(router.generate(agent_name="developeragent", messages=[{"role": "user", "content": "hi"}]))
    assert len(db.ai_usage.docs) == 1
    assert set(db.ai_usage.docs[0]) == LEGACY_USAGE_ROW_FIELDS
