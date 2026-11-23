"""BYOK isolation acceptance tests (docs/architecture/agent-collaboration-plan.md
§16.2, BY-1 ... BY-9). BY-10 lives in test_retrieval_scoping.py."""

from __future__ import annotations

import asyncio
import itertools
import json

import pytest

from core.config import get_settings
from core.data_use_consents import SCOPE_BYOK_AUTO_RETRY, SCOPE_PLATFORM_MODEL_PROCESSING, grant_consent, revoke_consent
from core.llm.provider import ProviderError
from core.processing_boundary import (
    CredentialMode,
    PlatformProcessingDenied,
    ProcessingBoundary,
    Purpose,
    assert_platform_model_allowed,
    build_scope,
    check_platform_model_allowed,
    refresh_boundary,
    snapshot_boundary,
)
from gateway.models import GatewayRequest
from tests.a2_support import (
    BYOK_TEST_KEY,
    CountingProvider,
    FakeDB,
    ForgeTripwires,
    StubBuildHarness,
    build_responses,
    byok_responder_for,
    make_build,
    make_user,
    op_marker,
    patch_infra,
    set_flags,
)

BYOK_NO_CONSENT = ProcessingBoundary(credential_mode=CredentialMode.BYOK, owner_user_id="u1").to_doc()


def _db(*, byok=True, boundary=BYOK_NO_CONSENT, shadow_flag=True):
    return FakeDB(
        builds=[make_build(boundary=boundary)],
        users=[make_user(byok=byok)],
        projects=[{"id": "p1", "org_id": "org-1", "user_id": "u1"}],
        feature_flags=[{"key": "specialist_shadow_developer", "enabled": shadow_flag}],
    )


def _everything_on(harness):
    """Org policy asking for L-tier everywhere and the injection classifier
    enabled by config: every Forge-model channel is configured to run."""
    harness.loader._org_policy_overrides["org-1"] = {
        "guardrail": {"llm_screen": "required", "byok_llm_screen": "optional"},
    }
    harness.loader._db_overrides["injection-check"] = {"provider": "forge", "model": "anthropic/claude-haiku-4.5"}


def _run_byok_build(monkeypatch, flags, *, db=None):
    global _SHADOW_BEFORE
    _SHADOW_BEFORE = set(_inflight())
    db = db or _db()
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, guardrail_monthly_usd=50.0, openai_api_key="sk-forge-embeddings", **flags)
    trip = ForgeTripwires(monkeypatch, byok_responder=byok_responder_for(build_responses()))
    forge = CountingProvider(tripwire=True, label="forge")
    guardrail = CountingProvider(tripwire=True, label="guardrail")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, guardrail=guardrail)
    _everything_on(harness)
    result = harness.run()
    return result, trip, forge, guardrail, db


_SHADOW_BEFORE: set = set()


def _inflight():
    import core.specialist_shadow as shadow_module

    return list(shadow_module._inflight_tasks)


def _settle_shadow_tasks():
    """Shadow tasks enqueued by this build (other tests' Forge builds may
    leave their own shadow task in flight on the worker loop)."""
    return [t for t in _inflight() if t not in _SHADOW_BEFORE]


# --------------------------------------------------------------------------- #
# BY-1 / BY-2
# --------------------------------------------------------------------------- #


def test_no_forge_model_call_on_byok_build(monkeypatch):
    result, trip, forge, guardrail, db = _run_byok_build(
        monkeypatch, dict(guardrail_v2=True, unified_usage_recording=True, build_path_retrieval=True),
    )

    assert result["status"] == "success"
    assert forge.calls == []
    assert guardrail.calls == []
    assert trip.forge_calls == []
    assert trip.embedding_calls == []
    assert _settle_shadow_tasks() == []
    # The whole max path ran on the customer's key: architect, business
    # model, designer, question pass, 3 answers, developer, integration,
    # 4 PM passes and 3 debug passes.
    assert len(trip.byok_calls) == 16
    build = db.builds.docs[0]
    assert build["credits_used"] == 0


FLAG_STATES = list(itertools.product([False, True], repeat=3))


@pytest.mark.parametrize("guardrail_v2,unified,retrieval", FLAG_STATES)
def test_boundary_check_is_unconditional(monkeypatch, guardrail_v2, unified, retrieval):
    """BY-1 in every guardrail / recording / retrieval flag state, including
    the rollback state (all off) and with the specialist shadow on."""
    result, trip, forge, guardrail, _ = _run_byok_build(
        monkeypatch,
        dict(guardrail_v2=guardrail_v2, unified_usage_recording=unified, build_path_retrieval=retrieval),
    )
    assert result["status"] == "success"
    assert forge.calls == [] and guardrail.calls == []
    assert trip.total_forge_model_calls == 0
    assert _settle_shadow_tasks() == []


def test_missing_customer_key_never_falls_back_to_forge(monkeypatch):
    """§5.5: a BYOK build whose key cannot be resolved at run time fails
    (byok_unavailable) instead of silently running on Forge keys."""
    db = _db()
    # A stored key that cannot be resolved at run time (an
    # openai_compatible key with no base URL or model).
    db.users.docs[0]["llm_provider"] = "openai_compatible"
    patch_infra(monkeypatch, db)
    trip = ForgeTripwires(monkeypatch)
    forge = CountingProvider(tripwire=True, label="forge")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge)
    with pytest.raises(PlatformProcessingDenied) as excinfo:
        harness.run()
    assert excinfo.value.error_class == "byok_unavailable"
    assert forge.calls == [] and trip.total_forge_model_calls == 0
    build = db.builds.docs[0]
    assert build["status"] == "failed"
    assert build["failure_reason"] == "byok_unavailable"


def test_assert_platform_model_allowed_matrix():
    forge = ProcessingBoundary(credential_mode=CredentialMode.FORGE)
    byok = ProcessingBoundary(credential_mode=CredentialMode.BYOK)
    consented = ProcessingBoundary(credential_mode=CredentialMode.BYOK,
                                   consents=frozenset({SCOPE_PLATFORM_MODEL_PROCESSING}))
    for purpose in Purpose:
        assert check_platform_model_allowed(forge, purpose).allowed
        assert not check_platform_model_allowed(byok, purpose).allowed
    for purpose in (Purpose.GUARDRAIL_OUTPUT, Purpose.GUARDRAIL_INPUT, Purpose.RETRIEVAL_EMBEDDING,
                    Purpose.SHADOW, Purpose.MONITORING):
        assert check_platform_model_allowed(consented, purpose).allowed
    for purpose in (Purpose.GENERATION, Purpose.REPAIR, Purpose.RETRY, Purpose.FALLBACK,
                    Purpose.RECOVERY, Purpose.CACHE_HIT):
        # Consent never turns a BYOK build into a Forge-key build (C4, U1).
        assert not check_platform_model_allowed(consented, purpose).allowed
        with pytest.raises(PlatformProcessingDenied):
            assert_platform_model_allowed(consented, purpose)
    # A malformed snapshot fails closed.
    assert ProcessingBoundary.from_doc({"credential_mode": "???"}).is_byok


# --------------------------------------------------------------------------- #
# BY-3 / BY-4 / BY-5 / BY-6
# --------------------------------------------------------------------------- #


def _gateway_with_byok(monkeypatch, db, *, responder):
    from core.llm.router import LLMRouter
    from gateway.service import AIGateway

    patch_infra(monkeypatch, db)
    trip = ForgeTripwires(monkeypatch, byok_responder=responder)
    router = LLMRouter()
    router.registry._providers.pop("ollama", None)
    return AIGateway(router=router), trip


@pytest.mark.parametrize("v2", [False, True])
@pytest.mark.asyncio
async def test_no_automatic_repair_on_customer_key(monkeypatch, v2):
    db = _db()
    set_flags(monkeypatch, guardrail_v2=v2)
    gateway, trip = _gateway_with_byok(monkeypatch, db, responder=lambda m: '{"nope": true}')
    schema = {"type": "object", "required": ["name"]}
    with build_scope(ProcessingBoundary.from_doc(BYOK_NO_CONSENT), build_id="build-1", user_id="u1"):
        response = await gateway.generate(GatewayRequest(
            agent_name="architectagent", messages=[{"role": "user", "content": "plan"}],
            structured_output_schema=schema, byok={"provider": "anthropic", "api_key": BYOK_TEST_KEY},
            build_id="build-1", user_id=None,
        ))
    assert len(trip.byok_calls) == 1  # exactly one customer-key call
    assert response.structured_data is None
    assert any("byok_auto_retry" in e for e in response.structured_output_errors)
    assert trip.total_forge_model_calls == 0


def test_no_automatic_repair_on_customer_key_build_fails_and_settles(monkeypatch):
    """BY-3 end to end: schema-invalid BYOK response -> one customer-key
    call, the operation fails, the build settles at 0 credits."""
    db = _db()
    patch_infra(monkeypatch, db)
    responses = build_responses()
    responses["blueprint"] = '{"not_a_blueprint": true}'
    trip = ForgeTripwires(monkeypatch, byok_responder=byok_responder_for(responses))
    harness = StubBuildHarness(monkeypatch, db=db, forge=CountingProvider(tripwire=True, label="forge"))
    with pytest.raises(ValueError):
        harness.run(reserved=100)
    assert len(trip.byok_calls) == 1
    build = db.builds.docs[0]
    assert build["status"] == "failed"
    assert build["credits_used"] == 0
    assert build["failure_reason"] == "byok_no_auto_retry"
    assert db.users.docs[0]["credits"] == 1100  # full reservation refunded


def test_no_celery_retry_without_authorization(monkeypatch):
    db = _db()
    patch_infra(monkeypatch, db)
    ForgeTripwires(monkeypatch, byok_fail=RuntimeError("503 overloaded"))
    harness = StubBuildHarness(monkeypatch, db=db, forge=CountingProvider(tripwire=True, label="forge"))
    retry_calls = []
    monkeypatch.setattr(harness.build_tasks.run_build, "retry",
                        lambda *a, **k: retry_calls.append(k) or RuntimeError("retry"))
    with pytest.raises(ProviderError):
        harness.run(retries=0)
    assert retry_calls == []
    build = db.builds.docs[0]
    assert build["status"] == "failed"
    assert build["failure_reason"] == "byok_no_auto_retry"
    assert "automatic retries on your own provider key are off" in build["error"]


def test_authorized_retries_bounded(monkeypatch):
    """BY-5: with byok_auto_retry = N, at most N extra customer-key calls
    (repairs and Celery retries share N), each recorded customer_provider."""

    class Retry(Exception):
        pass

    n = 2
    boundary = ProcessingBoundary(
        credential_mode=CredentialMode.BYOK, consents=frozenset({SCOPE_BYOK_AUTO_RETRY}),
        byok_auto_retry_max=n, owner_user_id="u1",
        policy_version=get_settings().processing_policy_version,
    ).to_doc()
    db = _db(boundary=boundary)
    asyncio.run(grant_consent(db, user_id="u1", scope=SCOPE_BYOK_AUTO_RETRY, max_retries=n))
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, unified_usage_recording=True)
    trip = ForgeTripwires(monkeypatch, byok_fail=RuntimeError("503 overloaded"))
    harness = StubBuildHarness(monkeypatch, db=db, forge=CountingProvider(tripwire=True, label="forge"))
    # Called directly (not by a worker), Celery's retry() re-raises the
    # original error; observe the decision instead.
    monkeypatch.setattr(harness.build_tasks.run_build, "retry", lambda *a, **k: Retry())

    outcomes = []
    for attempt in range(5):
        try:
            harness.run(retries=attempt)
            outcomes.append("success")
        except Retry:
            outcomes.append("retry")
        except ProviderError:
            outcomes.append("failed")
            break
    assert outcomes == ["retry", "retry", "failed"]
    assert len(trip.byok_calls) == 1 + n  # first dispatch + N authorized
    rows = [r for r in db.ai_usage.docs if r.get("credential") == "byok"]
    assert len(rows) == len(trip.byok_calls)
    assert all(r["cost_bearer"] == "customer_provider" and r["outcome"] == "error" for r in rows)
    assert db.builds.docs[0]["byok_extra_calls"] == n


@pytest.mark.asyncio
async def test_authorized_repair_counts_against_n(monkeypatch):
    n = 1
    boundary = ProcessingBoundary(
        credential_mode=CredentialMode.BYOK, consents=frozenset({SCOPE_BYOK_AUTO_RETRY}),
        byok_auto_retry_max=n, owner_user_id="u1",
        policy_version=get_settings().processing_policy_version,
    )
    db = _db(boundary=boundary.to_doc())
    await grant_consent(db, user_id="u1", scope=SCOPE_BYOK_AUTO_RETRY, max_retries=n)
    gateway, trip = _gateway_with_byok(monkeypatch, db, responder=lambda m: '{"nope": true}')
    schema = {"type": "object", "required": ["name"]}
    request = dict(agent_name="architectagent", messages=[{"role": "user", "content": "plan"}],
                   structured_output_schema=schema, byok={"provider": "anthropic", "api_key": BYOK_TEST_KEY},
                   build_id="build-1")
    with build_scope(boundary, build_id="build-1", user_id="u1"):
        await gateway.generate(GatewayRequest(**request))
        assert len(trip.byok_calls) == 2  # original + the one authorized repair
        await gateway.generate(GatewayRequest(**request))
    assert len(trip.byok_calls) == 3  # N used up: no second repair
    assert trip.total_forge_model_calls == 0


def test_interruption_terminates(monkeypatch):
    """BY-6: a redelivered BYOK task (interruption) does not dispatch again
    on any credential and settles at 0."""
    db = _db()
    db.builds.docs[0]["byok_dispatches"] = 1  # the interrupted first dispatch
    patch_infra(monkeypatch, db)
    trip = ForgeTripwires(monkeypatch, byok_responder=byok_responder_for(build_responses()))
    forge = CountingProvider(tripwire=True, label="forge")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge)
    result = harness.run(reserved=100)
    assert result["status"] == "failed" and result["reason"] == "byok_interrupted"
    assert trip.byok_calls == [] and forge.calls == [] and trip.total_forge_model_calls == 0
    build = db.builds.docs[0]
    assert build["status"] == "failed" and build["credits_used"] == 0
    assert db.users.docs[0]["credits"] == 1100


# --------------------------------------------------------------------------- #
# BY-7 / BY-8 / BY-9
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_consent_snapshot_semantics(monkeypatch):
    db = _db()
    patch_infra(monkeypatch, db)
    # Admitted with no consent: a grant made mid-build never widens it.
    snapshot = await snapshot_boundary(db, "u1")
    assert snapshot.is_byok and not snapshot.platform_model_processing
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    assert not (await refresh_boundary(snapshot, db)).platform_model_processing

    # Admitted with consent: a revocation narrows it at the next operation.
    granted = await snapshot_boundary(db, "u1")
    assert granted.platform_model_processing
    with build_scope(granted) as scope:
        assert check_platform_model_allowed(None, Purpose.GUARDRAIL_OUTPUT).allowed
        await revoke_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
        narrowed = await refresh_boundary(scope.boundary, db)
        assert not narrowed.platform_model_processing
        assert scope.boundary is narrowed  # later operations keep the narrowing
        assert not check_platform_model_allowed(None, Purpose.GUARDRAIL_OUTPUT).allowed
        # Re-granting does not widen the running build back.
        await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
        assert not (await refresh_boundary(scope.boundary, db)).platform_model_processing


@pytest.mark.asyncio
async def test_consent_from_other_policy_version_does_not_count(monkeypatch):
    db = _db()
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING, policy_version="old-text")
    assert not (await snapshot_boundary(db, "u1")).platform_model_processing


def test_byok_usage_attribution(monkeypatch):
    _, trip, _, _, db = _run_byok_build(
        monkeypatch, dict(guardrail_v2=True, unified_usage_recording=True, build_path_retrieval=False),
    )
    generation = [r for r in db.ai_usage.docs if r["purpose"] == "generation"]
    assert len(generation) == len(trip.byok_calls) == 16
    for row in generation:
        assert row["credential"] == "byok"
        assert row["cost_bearer"] == "customer_provider"
        assert row["account"] == "customer_provider"
        assert row["processing_boundary"] == {"credential_mode": "byok"}
        assert "credits" not in row  # usage rows never carry credits (two ledgers)
    assert db.builds.docs[0]["credits_used"] == 0


@pytest.mark.asyncio
async def test_shadow_and_specialist_shadow_never_enqueued_for_byok_without_consent(monkeypatch):
    import core.specialist_shadow as shadow_module
    from core.models import Build

    created = []
    real_create_task = asyncio.create_task

    def spy_create_task(coro, *a, **k):
        task = real_create_task(coro, *a, **k)
        created.append(task)
        return task

    async def _flag_off(key):
        return False

    monkeypatch.setattr(shadow_module.asyncio, "create_task", spy_create_task)
    monkeypatch.setattr(shadow_module, "is_feature_enabled", _flag_off)
    build = Build(id="b1", project_id="p1", user_id="u1", prompt="x")

    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.BYOK)):
        shadow_module.launch_shadow_comparison(build, {}, {}, {})
    assert created == []

    consented = ProcessingBoundary(credential_mode=CredentialMode.BYOK,
                                   consents=frozenset({SCOPE_PLATFORM_MODEL_PROCESSING}))
    with build_scope(consented):
        shadow_module.launch_shadow_comparison(build, {}, {}, {})
    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.FORGE)):
        shadow_module.launch_shadow_comparison(build, {}, {}, {})
    assert len(created) == 2
    await asyncio.gather(*created)

    # Shadow reviews (S0) are not built yet; their consent scope is
    # enforced by the same check (purpose `shadow`).
    assert not check_platform_model_allowed(ProcessingBoundary(credential_mode=CredentialMode.BYOK),
                                            Purpose.SHADOW).allowed


@pytest.mark.asyncio
async def test_monitor_takes_boundary_from_project_owner(monkeypatch):
    """§5.3: the repository monitor (outside builds) is denied for a BYOK
    owner without consent."""
    from core.llm.router import LLMRouter
    from gateway.service import AIGateway

    db = _db()
    patch_infra(monkeypatch, db)
    forge = CountingProvider(label="forge")
    router = LLMRouter()
    router.registry._providers.clear()
    router.register_provider(forge, name="fake", priority=1)
    gateway = AIGateway(router=router)
    with pytest.raises(PlatformProcessingDenied):
        await gateway.generate(GatewayRequest(
            agent_name="api_engineer", messages=[{"role": "user", "content": "finding"}],
            project_id="p1", purpose="monitoring",
        ))
    assert forge.calls == []
