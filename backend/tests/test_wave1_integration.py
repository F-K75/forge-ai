"""Integration seams between the wave-1 branches (A2, collaboration protocol
v2, Foundation C) that no single branch could own.

- The shipped LLM config passes the guardrail v2 startup check (§4.6).
- A2's build fields survive ``Build(**doc)`` round trips.
- The BYOK dispatch counters stay out of the ``Build`` model, so the
  completion ``$set`` of the whole model can never write back a stale count
  (U1, BY-6).
- ``Orchestrator._is_byok_active`` follows the admission snapshot inside a
  build, not the user's current key (BY-7).
"""

import asyncio

import pytest

from core.llm.config import LLMConfigLoader
from core.llm.guardrail_policy import validate_guardrail_model_config
from core.models import Build
from core.orchestrator import Orchestrator
from core.processing_boundary import CredentialMode, ProcessingBoundary, build_scope


def test_shipped_guardrail_model_config_is_valid():
    validate_guardrail_model_config(asyncio.run(LLMConfigLoader().load()))


def test_a2_build_fields_round_trip():
    doc = {
        "project_id": "p1",
        "user_id": "u1",
        "prompt": "x",
        "processing_boundary": {"credential_mode": "byok", "consents": [], "policy_version": "2026-11"},
        "guardrail_report": {"status": "verified"},
        "failure_reason": "byok_no_auto_retry",
    }
    dumped = Build(**doc).model_dump()
    for key in ("processing_boundary", "guardrail_report", "failure_reason"):
        assert dumped[key] == doc[key]


def test_byok_dispatch_counters_are_not_model_fields():
    dumped = Build(project_id="p1", user_id="u1", prompt="x").model_dump()
    assert "byok_dispatches" not in dumped
    assert "byok_authorized_redispatches" not in dumped


@pytest.mark.parametrize("mode, expected", [(CredentialMode.BYOK, True), (CredentialMode.FORGE, False)])
def test_is_byok_active_follows_the_build_snapshot(monkeypatch, mode, expected):
    async def _db_must_not_be_read():
        raise AssertionError("inside a build the snapshot is authoritative")

    monkeypatch.setattr("core.orchestrator.get_db", _db_must_not_be_read)
    orchestrator = Orchestrator.__new__(Orchestrator)
    boundary = ProcessingBoundary(credential_mode=mode, owner_user_id="u1")

    async def _check():
        with build_scope(boundary, build_id="b1", user_id="u1"):
            return await orchestrator._is_byok_active("u1")

    assert asyncio.run(_check()) is expected
