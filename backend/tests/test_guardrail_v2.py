"""Guardrail v2 acceptance tests (docs/architecture/agent-collaboration-plan.md
§4, §16.1, GR-1 ... GR-10)."""

from __future__ import annotations

import asyncio
import os

import pytest
from fastapi import HTTPException

from core import platform_budgets
from core.ai_usage import estimate_tokens
from core.data_use_consents import SCOPE_PLATFORM_MODEL_PROCESSING, grant_consent
from core.llm.config import LLMConfigLoader
from core.llm.guardrail_errors import GuardrailBlocked
from core.llm.guardrail_policy import GuardrailPolicyError, validate_guardrail_policy
from core.llm.router import LLMRouter
from core.operation_context import operation_scope
from core.processing_boundary import CredentialMode, ProcessingBoundary, build_scope
from gateway.guardrails import BLOCKED_MESSAGE, IncrementalDTierScanner, _detect_blocked_content
from gateway.models import GatewayRequest
from gateway.service import AIGateway
from tests.a2_support import (
    CountingProvider,
    FakeCollection,
    FakeDB,
    StubBuildHarness,
    build_responses,
    chunked,
    developer_fixture,
    make_build,
    make_user,
    op_marker,
    patch_infra,
    set_flags,
)

POLICY_MODEL = "anthropic/claude-haiku-4.5"
AGENT_MODEL = "anthropic/claude-opus-4.8"


def _gateway(monkeypatch, *, db=None, org_policy=None, forge=None, guardrail=None, flags=None):
    db = db or FakeDB()
    patch_infra(monkeypatch, db)
    defaults = dict(guardrail_v2=True, unified_usage_recording=True, guardrail_monthly_usd=50.0)
    defaults.update(flags or {})
    set_flags(monkeypatch, **defaults)
    loader = LLMConfigLoader()
    loader._config = {**loader._config, "default_provider": "forge", "fallback_chain": ["forge"],
                      "agent_overrides": {"developeragent": {"provider": "forge", "model": AGENT_MODEL}}}
    if org_policy is not None:
        loader._org_policy_overrides["org-1"] = org_policy
    router = LLMRouter(config_loader=loader)
    router.registry._providers.pop("ollama", None)
    forge = forge or CountingProvider(text="ok", label="forge")
    guardrail = guardrail or CountingProvider(text="SAFE", label="guardrail")
    router.register_provider(forge, name="forge", priority=100)
    router.register_provider(guardrail, name="openrouter", priority=1)
    return AIGateway(router=router), forge, guardrail, db


def _stream_request(**kw):
    base = dict(agent_name="developeragent", messages=[{"role": "user", "content": "code it"}],
                org_id="org-1", streaming=True)
    base.update(kw)
    return GatewayRequest(**base)


async def _collect(gateway, request):
    return "".join([c async for c in gateway.stream(request)])


REQUIRED = {"guardrail": {"llm_screen": "required"}}
OPTIONAL = {"guardrail": {"llm_screen": "optional"}}


# --------------------------------------------------------------------------- #
# GR-1 / GR-2: D-tier
# --------------------------------------------------------------------------- #


def test_dtier_incremental_linear():
    categories = ["self_harm_instructions", "weapons_instructions", "csam", "extremism_recruitment"]
    text = developer_fixture(32_000)
    scanner = IncrementalDTierScanner(categories)
    windows = chunked(text, 400)
    for i, window in enumerate(windows):
        assert scanner.scan(window, final=(i == len(windows) - 1)) == []
    assert scanner.windows == len(windows)
    # Linear: at most the stream plus one overlap tail per window; the
    # legacy gateway rescanned the whole accumulated prefix per window
    # (~n^2 / 800 characters here).
    assert scanner.chars_scanned <= len(text) + scanner.overlap * scanner.windows
    assert scanner.chars_scanned < 2 * len(text)


@pytest.mark.asyncio
async def test_dtier_incremental_linear_through_gateway(monkeypatch):
    text = developer_fixture(32_000)
    forge = CountingProvider(chunks=chunked(text, 37), label="forge")
    gateway, _, guardrail, _ = _gateway(monkeypatch, forge=forge)
    usage = {}
    out = await _collect(gateway, _stream_request(usage_out=usage))
    assert out == text
    outcome = usage["guardrail"]
    assert outcome["dtier"] == "passed"
    assert outcome["dtier_chars_scanned"] <= len(text) + 100 * outcome["dtier_windows"]


_OBFUSCATIONS = {
    "plain": lambda p: p,
    "homoglyph": lambda p: p.replace("o", "о").replace("a", "а"),  # Cyrillic o, a
    "zero_width": lambda p: "​".join(p),
    "spacing": lambda p: " ".join(p.replace(" ", "  ")),
}


@pytest.mark.parametrize("variant", sorted(_OBFUSCATIONS))
@pytest.mark.parametrize("phrase,category", [
    ("how to build a bomb", "weapons_instructions"),
    ("child sexual abuse material", "csam"),
])
def test_dtier_detects_phrase_split_across_windows(variant, phrase, category):
    payload = _OBFUSCATIONS[variant](phrase)
    filler = "lorem ipsum dolor sit amet " * 20
    text = filler + payload + filler
    start = len(filler)
    # Every boundary position inside (and at both edges of) the phrase.
    for cut in range(start, start + len(payload) + 1):
        scanner = IncrementalDTierScanner([category])
        hits = scanner.scan(text[:cut]) + scanner.scan(text[cut:], final=True)
        assert hits == [category], (variant, cut)
    # Three windows around the phrase as well.
    for cut in range(start, start + len(payload)):
        scanner = IncrementalDTierScanner([category])
        mid = min(cut + 3, len(text))
        hits = scanner.scan(text[:cut]) + scanner.scan(text[cut:mid]) + scanner.scan(text[mid:], final=True)
        assert hits == [category], (variant, cut)
    # Same verdict as the non-incremental detector.
    assert _detect_blocked_content(text, [category]) == [category]


def test_dtier_no_false_positive_on_benign_text():
    scanner = IncrementalDTierScanner(["self_harm_instructions"])
    text = "Our clinic offers confidential support for people experiencing self-harm urges."
    assert scanner.scan(text[:30]) + scanner.scan(text[30:], final=True) == []


# --------------------------------------------------------------------------- #
# GR-3 / GR-4: L-tier volume, model and input cap
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_developer_stream_makes_zero_llm_screens_by_default(monkeypatch):
    text = developer_fixture(32_000)
    forge = CountingProvider(chunks=chunked(text, 37), label="forge")
    gateway, forge, guardrail, _ = _gateway(monkeypatch, forge=forge)
    out = await _collect(gateway, _stream_request())
    assert out == text
    assert guardrail.calls == []
    assert len(forge.calls) == 1  # the generation stream only


@pytest.mark.asyncio
async def test_legacy_developer_stream_screen_volume_for_reference(monkeypatch):
    """The rollback path (guardrail_v2 off) still screens every window on the
    agent's own model -- the F26 measurement this PR removes by default."""
    text = developer_fixture(32_000)
    forge = CountingProvider(chunks=chunked(text, 37), label="forge")
    gateway, forge, _, _ = _gateway(monkeypatch, forge=forge, flags={"guardrail_v2": False})
    await _collect(gateway, _stream_request())
    screens = [c for c in forge.calls if not c.get("stream")]
    assert len(screens) >= 73
    assert {c["model"] for c in screens} == {AGENT_MODEL}


@pytest.mark.asyncio
async def test_required_policy_makes_at_most_one_screen_per_artifact(monkeypatch):
    text = developer_fixture(32_000)
    forge = CountingProvider(chunks=chunked(text, 37), label="forge")
    gateway, forge, guardrail, _ = _gateway(monkeypatch, forge=forge, org_policy=REQUIRED)
    usage = {}
    out = await _collect(gateway, _stream_request(usage_out=usage))
    assert out == text
    assert len(guardrail.calls) == 1
    call = guardrail.calls[0]
    assert call["model"] == POLICY_MODEL != AGENT_MODEL
    screened = "\n".join(m["content"] for m in call["messages"])
    assert estimate_tokens(screened) <= 8000
    # The 32k-character artifact exceeds the cap: partial coverage is not a
    # pass for a required screen (X12 interim default).
    assert usage["guardrail"]["coverage"] == "partial"
    assert usage["guardrail"]["ltier"] == "unverified"

    # A structured artifact with a repair is still one artifact: one screen.
    forge2 = CountingProvider(responder=lambda m, msgs: '{"name": "x"}' if len(msgs) > 2 else '{"bad": 1}',
                              label="forge")
    gateway2, forge2, guardrail2, _ = _gateway(monkeypatch, forge=forge2, org_policy=REQUIRED)
    response = await gateway2.generate(GatewayRequest(
        agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
        structured_output_schema={"type": "object", "required": ["name"]},
    ))
    assert response.structured_data == {"name": "x"}
    assert len(forge2.calls) == 2  # original + one repair
    assert len(guardrail2.calls) == 1
    assert response.guardrail_outcome["ltier"] == "passed"
    assert response.guardrail_outcome["coverage"] == "full"


@pytest.mark.asyncio
async def test_partial_coverage_can_be_accepted_by_policy(monkeypatch):
    text = developer_fixture(32_000)
    forge = CountingProvider(chunks=chunked(text, 37), label="forge")
    policy = {"guardrail": {"llm_screen": "required", "partial_coverage": "accept"}}
    gateway, _, guardrail, _ = _gateway(monkeypatch, forge=forge, org_policy=policy)
    usage = {}
    await _collect(gateway, _stream_request(usage_out=usage))
    assert usage["guardrail"]["ltier"] == "passed" and usage["guardrail"]["coverage"] == "partial"


# --------------------------------------------------------------------------- #
# GR-5: required failures are INCOMPLETE, never PASSED
# --------------------------------------------------------------------------- #


class _SlowProvider(CountingProvider):
    async def chat_completion(self, *, model, messages, **kwargs):
        self.calls.append({"model": model})
        await asyncio.sleep(1)
        return await super().chat_completion(model=model, messages=messages, **kwargs)


FAILURES = {
    "error": dict(guardrail=CountingProvider(fail=RuntimeError("boom"), label="guardrail")),
    "timeout": dict(guardrail=_SlowProvider(text="SAFE", label="guardrail"),
                    flags={"guardrail_llm_timeout_seconds": 0.01}),
    "garbage_verdict": dict(guardrail=CountingProvider(text="probably fine?", label="guardrail")),
    "budget_exhausted": dict(flags={"guardrail_monthly_usd": 0.000001}),
    "budget_unset": dict(flags={"guardrail_monthly_usd": None}),
}


@pytest.mark.parametrize("failure", sorted(FAILURES))
@pytest.mark.asyncio
async def test_required_screen_failure_is_incomplete_not_pass(monkeypatch, failure):
    spec = FAILURES[failure]
    gateway, _, _, _ = _gateway(monkeypatch, org_policy=REQUIRED, guardrail=spec.get("guardrail"),
                                flags=spec.get("flags"))
    with build_scope(ProcessingBoundary.forge_default("u1"), build_id="b-1") as scope:
        response = await gateway.generate(GatewayRequest(
            agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
        ))
    outcome = response.guardrail_outcome
    assert outcome["ltier"] == "unverified"
    assert outcome["unverified"] is True and response.guardrail_unverified is True
    assert outcome["quality_effect"] == "incomplete"
    assert outcome["reason_code"] == "guardrail_unverified"
    assert outcome["ltier"] != "passed" and not response.guardrail_blocked
    # The artifact is kept (published unverified), and the build records it.
    assert response.content == "ok"
    assert scope.guardrail_outcomes[-1]["unverified"] is True


@pytest.mark.parametrize("failure", sorted(FAILURES))
@pytest.mark.asyncio
async def test_optional_screen_failure_is_skipped(monkeypatch, failure):
    spec = FAILURES[failure]
    gateway, _, _, _ = _gateway(monkeypatch, org_policy=OPTIONAL, guardrail=spec.get("guardrail"),
                                flags=spec.get("flags"))
    response = await gateway.generate(GatewayRequest(
        agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
    ))
    assert response.guardrail_outcome["ltier"] == "skipped"
    assert response.guardrail_outcome["quality_effect"] == "none"


@pytest.mark.asyncio
async def test_required_screen_not_permitted_for_byok_is_incomplete(monkeypatch):
    """A required BYOK screen without consent cannot be saved (GR-9); if a
    stored policy still says so, the screen is not run and the result is
    unverified, not passed."""
    policy = {"guardrail": {"llm_screen": "required", "byok_llm_screen": "required"}}
    gateway, _, guardrail, _ = _gateway(monkeypatch, org_policy=policy)
    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.BYOK)):
        await _collect(gateway, _stream_request(byok=None, processing_boundary={"credential_mode": "forge"}))
    assert guardrail.calls  # the Forge snapshot was honoured explicitly
    guardrail.calls.clear()
    from tests.a2_support import ForgeTripwires

    ForgeTripwires(monkeypatch, byok_responder=lambda m: "ok")
    usage = {}
    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.BYOK)):
        await _collect(gateway, _stream_request(
            byok={"provider": "anthropic", "api_key": "customer-owned-test-key"}, usage_out=usage,
        ))
    assert guardrail.calls == []
    assert usage["guardrail"]["ltier"] == "unverified"
    assert usage["guardrail"]["ltier_reason"] == "not_permitted"


@pytest.mark.asyncio
async def test_required_input_classifier_fails_closed(monkeypatch):
    from core.llm.guardrail_errors import GuardrailUnavailable

    policy = {"guardrail": {"input_classifier": "required"}}
    gateway, forge, guardrail, _ = _gateway(monkeypatch, org_policy=policy, flags={"guardrail_monthly_usd": None})
    gateway.router.config_loader._db_overrides["injection-check"] = {"provider": "openrouter", "model": POLICY_MODEL}
    with pytest.raises(GuardrailUnavailable):
        await gateway.generate(GatewayRequest(
            agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
        ))
    assert forge.calls == []  # the generation never ran on an unscreened input


# --------------------------------------------------------------------------- #
# GR-6: an L-tier block withholds the version
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_llm_block_withholds_version_previous_stays_active(monkeypatch):
    text = "benign looking text " * 30
    blocker = CountingProvider(text="weapons_instructions", label="guardrail")

    # Preview mode: previews were released, so the version is withdrawn.
    forge = CountingProvider(chunks=chunked(text, 40), label="forge")
    gateway, _, _, _ = _gateway(monkeypatch, forge=forge, guardrail=blocker, org_policy=REQUIRED)
    released = []
    with build_scope(ProcessingBoundary.forge_default("u1"), build_id="b-1") as scope:
        with pytest.raises(GuardrailBlocked) as excinfo:
            async for chunk in gateway.stream(_stream_request()):
                released.append(chunk)
    assert excinfo.value.outcome["withheld"] is True
    assert excinfo.value.outcome["quality_effect"] == "withheld"
    assert scope.guardrail_outcomes[-1]["withheld"] is True
    assert "".join(released) != text  # the final window was never released

    # buffer_until_screened: nothing but the block message is released.
    policy = {"guardrail": {"llm_screen": "required", "stream_mode": "buffer_until_screened"}}
    forge = CountingProvider(chunks=chunked(text, 40), label="forge")
    gateway, _, _, _ = _gateway(monkeypatch, forge=forge, guardrail=blocker, org_policy=policy)
    assert await _collect(gateway, _stream_request()) == BLOCKED_MESSAGE

    # Non-streamed: the artifact is withheld and never structured.
    gateway, _, _, _ = _gateway(monkeypatch, forge=CountingProvider(text='{"name": "x"}', label="forge"),
                                guardrail=blocker, org_policy=REQUIRED)
    response = await gateway.generate(GatewayRequest(
        agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
        structured_output_schema={"type": "object", "required": ["name"]},
    ))
    assert response.artifact_withheld and response.guardrail_blocked
    assert response.structured_data is None
    assert response.content == BLOCKED_MESSAGE


def test_llm_block_build_keeps_previous_files_and_is_not_retried(monkeypatch):
    """Build level: the Developer artifact is withheld, the previously
    persisted files for the build stay as they were, and a guardrail block
    is never retried. (The manifest pointer and `artifact_withheld` WS event
    belong to A3; the uncharged operation to A1.)"""
    previous = {"id": "bf-1", "build_id": "build-1", "path": "backend/main.py", "content": "# previous"}
    db = FakeDB(builds=[make_build()], users=[make_user(byok=False)],
                projects=[{"id": "p1", "org_id": "org-1"}], build_files=[previous])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, guardrail_v2=True, guardrail_monthly_usd=50.0)
    responses = build_responses()

    def respond(model, messages):
        return responses.get(op_marker(messages) or "", "ok")

    def screen(model, messages):
        return "weapons_instructions" if "export const handler" in messages[-1]["content"] else "SAFE"

    forge = CountingProvider(responder=respond, label="forge")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge,
                               guardrail=CountingProvider(responder=screen, label="guardrail"))
    harness.loader._org_policy_overrides["org-1"] = REQUIRED
    retries = []
    monkeypatch.setattr(harness.build_tasks.run_build, "retry", lambda *a, **k: retries.append(k) or RuntimeError())
    with pytest.raises(GuardrailBlocked):
        harness.run()
    assert retries == []
    build = db.builds.docs[0]
    assert build["failure_reason"] == "blocked_by_guardrail"
    assert build["guardrail_report"]["withheld"]
    assert [f["content"] for f in db.build_files.docs] == ["# previous"]


# --------------------------------------------------------------------------- #
# GR-7 / GR-8
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_every_guardrail_call_recorded(monkeypatch):
    gateway, _, guardrail, db = _gateway(monkeypatch, org_policy={"guardrail": {"llm_screen": "required"}})
    gateway.router.config_loader._db_overrides["injection-check"] = {"provider": "openrouter", "model": POLICY_MODEL}
    guardrail.responder = lambda model, messages: "NO" if "security classifier" in messages[0]["content"] else "SAFE"
    with operation_scope("op-1", dispatch_no=1):
        await gateway.generate(GatewayRequest(
            agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
            user_id="u1",
        ))
        await _collect(gateway, _stream_request(user_id="u1"))
    rows = [r for r in db.ai_usage.docs if r["purpose"] in ("guardrail_output", "guardrail_input")]
    assert len(rows) == len(guardrail.calls) == 4  # 2 classifier + 2 output screens
    assert {r["purpose"] for r in rows} == {"guardrail_output", "guardrail_input"}
    for row in rows:
        assert row["account"] == "guardrail"
        assert row["operation_id"] == "op-1" and row["dispatch_no"] == 1
        assert row["user_id"] is None and row["beneficiary_user_id"] == "u1"
        assert row["principal"] == "platform:guardrail"
    seqs = [r["attempt_seq"] for r in db.ai_usage.docs]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)


class _InterleavingCollection(FakeCollection):
    """Yields to the event loop before every write so 50 concurrent
    reservations genuinely interleave between their two statements."""

    async def update_one(self, *a, **k):
        await asyncio.sleep(0)
        return await super().update_one(*a, **k)

    async def find_one_and_update(self, *a, **k):
        await asyncio.sleep(0)
        return await super().find_one_and_update(*a, **k)


async def _concurrent_reservations(db, *, n=50, amount=0.01, limit=0.2):
    results = await asyncio.gather(*[
        platform_budgets.reserve(db, account="guardrail", amount_usd=amount, monthly_limit_usd=limit)
        for _ in range(n)
    ])
    return results


@pytest.mark.asyncio
async def test_guardrail_budget_atomic():
    db = FakeDB()
    db._collections["platform_budgets"] = _InterleavingCollection()
    results = await _concurrent_reservations(db)
    ok = [r for r in results if r.ok]
    assert len(ok) == 20 and all(r.reason == "budget_exhausted" for r in results if not r.ok)
    doc = db.platform_budgets.docs[0]
    assert doc["reserved_micros"] + doc["spent_micros"] <= doc["limit_micros"]
    for r in ok[:10]:
        await platform_budgets.settle(db, r, actual_usd=0.004)
    doc = db.platform_budgets.docs[0]
    assert doc["reserved_micros"] + doc["spent_micros"] <= doc["limit_micros"]
    assert doc["spent_micros"] == 10 * 4000
    # Freed headroom can be reserved again, still within the limit.
    more = await _concurrent_reservations(db, n=10)
    doc = db.platform_budgets.docs[0]
    assert sum(r.ok for r in more) == 6
    assert doc["reserved_micros"] + doc["spent_micros"] <= doc["limit_micros"]


@pytest.mark.skipif(
    not os.getenv("FORGE_RS0_MONGODB_URL"),
    reason="rs0: needs a real single-node replica set (set FORGE_RS0_MONGODB_URL); "
           "the in-memory double above proves the guarded-update logic, not server atomicity",
)
@pytest.mark.asyncio
async def test_guardrail_budget_atomic_rs0():
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["FORGE_RS0_MONGODB_URL"])
    try:
        hello = await client.admin.command("hello")
        assert hello.get("setName") == "rs0"
        db = client["forge_a2_gr8"]
        await db.platform_budgets.delete_many({})
        results = await _concurrent_reservations(db)
        doc = await db.platform_budgets.find_one({})
        assert sum(r.ok for r in results) == 20
        assert doc["reserved_micros"] + doc["spent_micros"] <= doc["limit_micros"]
    finally:
        await client.drop_database("forge_a2_gr8")
        client.close()


@pytest.mark.asyncio
async def test_per_build_guardrail_budget(monkeypatch):
    gateway, _, guardrail, _ = _gateway(monkeypatch, org_policy=REQUIRED,
                                        flags={"guardrail_per_build_usd": 0.0001})
    response = await gateway.generate(GatewayRequest(
        agent_name="developeragent", messages=[{"role": "user", "content": "plan"}], org_id="org-1",
        build_id="b-9",
    ))
    assert guardrail.calls == []
    assert response.guardrail_outcome["ltier_reason"] == "build_budget_exhausted"
    assert response.guardrail_unverified


# --------------------------------------------------------------------------- #
# GR-9 / GR-10
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_policy_rejects_required_ltier_for_byok_without_consent(monkeypatch):
    from api.org_llm_policy import _validated_guardrail_block

    with pytest.raises(GuardrailPolicyError):
        validate_guardrail_policy({"byok_llm_screen": "required"}, byok_consent=False)
    with pytest.raises(GuardrailPolicyError):
        validate_guardrail_policy({"byok_input_classifier": "required"}, byok_consent=False)
    with pytest.raises(GuardrailPolicyError):
        validate_guardrail_policy({"llm_screen": "sometimes"}, byok_consent=True)
    with pytest.raises(GuardrailPolicyError):
        validate_guardrail_policy({"unknown_field": "x"}, byok_consent=True)
    # Required for Forge builds is fine; BYOK then defaults to optional.
    assert validate_guardrail_policy({"llm_screen": "required"}, byok_consent=False) == {"llm_screen": "required"}

    db = FakeDB(team_members=[{"org_id": "org-1", "user_id": "u1"}, {"org_id": "org-1", "user_id": "u2"}],
                users=[make_user(byok=True), make_user(byok=False, user_id="u2")])
    patch_infra(monkeypatch, db)
    with pytest.raises(HTTPException) as excinfo:
        await _validated_guardrail_block(db, "org-1", {"byok_llm_screen": "required"})
    assert excinfo.value.status_code == 422
    # With the BYOK member's consent the same policy is accepted.
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    assert await _validated_guardrail_block(db, "org-1", {"byok_llm_screen": "required"}) == {
        "byok_llm_screen": "required",
    }


def test_policy_save_endpoint_rejects_required_byok_screen(monkeypatch):
    from fastapi.testclient import TestClient

    import api.org_llm_policy as policy_module
    from auth import create_access_token
    from main import app

    db = FakeDB(
        users=[{**make_user(byok=True), "is_admin": False, "mfa_enabled": True}],
        team_members=[{"org_id": "org-1", "user_id": "u1", "role": "owner"}],
    )
    patch_infra(monkeypatch, db)

    async def _ok(*a, **k):
        return True

    monkeypatch.setattr(policy_module, "require_org_role", _ok)
    import core.security as security_module

    monkeypatch.setattr(security_module, "validate_csrf_token", _ok, raising=False)
    token = create_access_token({"sub": "u1"})
    client = TestClient(app)
    response = client.put(
        "/api/orgs/org-1/llm-policy",
        json={"guardrail": {"byok_llm_screen": "required"}},
        headers={"Authorization": f"Bearer {token}", "X-CSRF-Token": "t"},
        cookies={"csrf_token": "t"},
    )
    assert response.status_code == 422, response.text
    assert "platform_model_processing" in response.json()["detail"]


def _forge_build_harness(monkeypatch, policy):
    db = FakeDB(builds=[make_build()], users=[make_user(byok=False)], projects=[{"id": "p1", "org_id": "org-1"}])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, guardrail_v2=True, unified_usage_recording=True, guardrail_monthly_usd=50.0,
              guardrail_per_build_usd=1.0)
    responses = build_responses(dev_text=developer_fixture(8_000))

    def respond(model, messages):
        return responses.get(op_marker(messages) or "", "ok")

    forge = CountingProvider(responder=respond, label="forge")
    guardrail = CountingProvider(text="SAFE", label="guardrail")
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, guardrail=guardrail)
    if policy is not None:
        harness.loader._org_policy_overrides["org-1"] = policy
    return harness, forge, guardrail, db


@pytest.mark.parametrize("policy,expected", [(None, 0), (REQUIRED, 16)])
def test_cost_regression_guard(monkeypatch, policy, expected):
    harness, forge, guardrail, db = _forge_build_harness(monkeypatch, policy)
    result = harness.run()
    assert result["status"] == "success"
    artifacts = len(forge.calls)
    assert artifacts == 16  # max path: one generation per artifact
    assert len(guardrail.calls) == expected <= artifacts
    if policy is not None:
        report = db.builds.docs[0]["guardrail_report"]
        assert report["artifacts"] == 16 and report["ltier_calls"] == 16
