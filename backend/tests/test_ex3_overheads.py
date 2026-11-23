"""EX-3: credit-neutral overheads (plan §16.4; Revision 2 amended §11.4).

Seeded random provider behaviour under the real gateway and router: router
retries after transient provider errors and structured-output repairs
after invalid JSON. Overheads are recorded as attempts of the operation
they belong to, never as operations of their own, so ``consumed`` is the
same as in a clean run, and I-1…I-12 hold. PR CI runs 12 seeds;
``FORGE_EX_FULL=1`` runs 2,000 (nightly).
"""

from __future__ import annotations

import asyncio
import random

import pytest

from core.llm.provider import ProviderError
from core.reconcile import reconcile_build
from tests.a2_support import CountingProvider, build_responses, op_marker
from tests.ex_matrix import FULL_MATRIX
from tests.test_ledger_attribution import _ledger_build

SEEDS = list(range(2000)) if FULL_MATRIX else list(range(12))
STRUCTURED = {"blueprint", "improve", "integrate", "validate_fail", "validate_pass", "patch"}


class SeededProvider(CountingProvider):
    """Fails the first attempt of a request with a transient error, or
    answers a structured operation with invalid JSON once, at random."""

    def __init__(self, seed: int, responses):
        # Streams (the Developer) answer cleanly; overheads hit chat calls.
        super().__init__(label="fake",
                         responder=lambda model, messages: responses.get(op_marker(messages) or "", "ok"))
        self.rng = random.Random(seed)
        self.responses = responses
        self.overheads = {"transient": 0, "invalid_json": 0}
        self._last_failed = False

    async def chat_completion(self, *, model, messages, **kwargs):
        marker = op_marker(messages)
        self.calls.append({"model": model, "messages": messages})
        if not self._last_failed and self.rng.random() < 0.25:
            self._last_failed = True
            self.overheads["transient"] += 1
            raise ProviderError("503 overloaded, please retry")
        self._last_failed = False
        text = self.responses.get(marker or "", "ok")
        is_repair = any("schema" in str(m.get("content", "")).lower() and m.get("role") == "user"
                        for m in messages[1:])
        if marker in STRUCTURED and not is_repair and self.rng.random() < 0.2:
            self.overheads["invalid_json"] += 1
            text = "{not json"
        from core.llm.provider import CompletionResponse

        return CompletionResponse(text=text, provider=self.label, model=model,
                                  usage={"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12})


def _run(monkeypatch, forge):
    from tests.a2_support import StubBuildHarness

    db, _, _ = _ledger_build(monkeypatch)
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, pm_failures=1)

    async def no_sleep(*a, **k):
        return None

    import core.llm.router as router_module

    monkeypatch.setattr(router_module.asyncio, "sleep", no_sleep, raising=False)
    result = harness.run(reserved=0)
    loop = asyncio.new_event_loop()
    report = loop.run_until_complete(reconcile_build(db, "build-1"))
    loop.close()
    return db, result, report


@pytest.fixture(scope="module")
def baseline_consumed():
    mp = pytest.MonkeyPatch()
    try:
        responses = build_responses()
        forge = CountingProvider(responder=lambda model, messages: responses.get(op_marker(messages) or "", "ok"))
        db, result, report = _run(mp, forge)
        assert result["status"] == "success" and report.ok, report.summary()
        return db.builds.docs[0]["settlement"]["consumed"]
    finally:
        mp.undo()


@pytest.mark.parametrize("seed", SEEDS)
def test_ex3_overheads_never_change_consumed(monkeypatch, seed, baseline_consumed):
    forge = SeededProvider(seed, build_responses())
    db, result, report = _run(monkeypatch, forge)
    doc = db.builds.docs[0]
    if result["status"] != "success":
        pytest.skip(f"seed {seed}: an operation exhausted its in-dispatch attempts")
    assert report.ok, report.summary()
    assert doc["settlement"]["consumed"] == baseline_consumed, forge.overheads
    rows = [r for r in db.ai_usage.docs if r.get("build_id") == "build-1"]
    # Every overhead attempt is a recorded attempt of an existing operation.
    assert len(rows) == len(forge.calls)
    assert all(r["operation_id"] for r in rows)
    OVERHEADS.append((forge.overheads["transient"], forge.overheads["invalid_json"],
                      sum(1 for r in rows if r.get("attempt_kind") in ("retry", "fallback", "repair")
                          or r.get("purpose") == "repair")))


OVERHEADS: list = []


def test_ex3_actually_exercised_overheads():
    """The seeds above injected router retries and repairs, and they were
    recorded as extra attempts (not extra operations)."""
    if not OVERHEADS:
        pytest.skip("run with the EX-3 seeds")
    transient = sum(t for t, _, _ in OVERHEADS)
    invalid = sum(i for _, i, _ in OVERHEADS)
    extra_attempts = sum(a for _, _, a in OVERHEADS)
    assert transient > 0 and invalid > 0 and extra_attempts >= transient
