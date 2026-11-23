"""Agent-to-agent messages charged through the ledger (plan §8.1
``clarification#i``; collaboration protocol v1 and v2): one optional
operation per reply-expecting message, never past the reservation."""

from __future__ import annotations

from core.pricing import quote_from_settings
from tests.a1_support import set_flags
from tests.ledger_harness import LedgerHarness, Script
from tests.test_build_ledger import _assert_balanced

QUOTE = quote_from_settings()
P = QUOTE.prices
N = QUOTE.params.debug_iterations
Q = QUOTE.params.clarification_questions


def test_messages_never_exceed_the_reservation(monkeypatch):
    """Admitted when Q was 1 (a smaller reservation); the run then allows 3
    questions. Only what the reservation's optional headroom covers is
    charged; the rest is rejected ``budget_exhausted`` before any call."""
    set_flags(monkeypatch, developer_clarification_max_questions=1)
    h = LedgerHarness(monkeypatch, script=Script(integrations=True, clarifications=["answered"] * 3,
                                                 pass_at=None, debug_usable=[True] * N))
    assert h.doc["funding"]["reserved_credits"] == QUOTE.max_cost - (Q - 1) * P.clarification
    set_flags(monkeypatch, developer_clarification_max_questions=3)
    h.run_to_end()
    doc = h.doc
    answered = [m for m in doc["agent_messages"] if m["status"] == "answered"]
    rejected = [m for m in doc["agent_messages"] if m["reason"] == "budget_exhausted"]
    assert len(answered) == 1 and len(rejected) == 2
    assert h.script.calls.count("answer#1") == 0 and h.script.calls.count("answer#2") == 0
    assert doc["settlement"]["consumed"] == doc["funding"]["reserved_credits"]
    _assert_balanced(h)


def test_collaboration_v2_messages_charged_through_the_ledger(monkeypatch):
    h = LedgerHarness(monkeypatch, flags={"collab_protocol_v2": True},
                      script=Script(integrations=False, clarifications=["answered", "failed", "answered"]))
    assert h.quote.params.collab_protocol == 2
    result, exc = h.run_to_end()
    assert exc is None
    doc = h.doc
    assert doc["collab_config"]["protocol_version"] == 2
    clar = {op["stage_key"]: op for op in doc["ledger"] if op["stage_key"].startswith("clarification#")}
    assert sorted(op["credits"] for op in clar.values()) == [0, P.clarification, P.clarification]
    for message in doc["agent_messages"]:
        op = clar[f"clarification#{message['message_id']}"]
        assert message["credits_charged"] == op["credits"]
    assert any(op["stage_key"] == "question_pass:developer" for op in doc["ledger"])
    _assert_balanced(h)
