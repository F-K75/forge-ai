"""Canonical execution state (C10, LC-1) and the per-token write fix (F3).

The ledger-path half of LC-1 (``running`` only under a lease, no ``failed``
before a retry) is in test_build_ledger.py, next to the lease it depends on.
"""

from __future__ import annotations

import pytest

from core import execution_state
from core.models import Build, BuildStatus, WSEventType
from tests.a2_support import (
    CountingProvider,
    FakeDB,
    StubBuildHarness,
    build_responses,
    make_build,
    make_user,
    op_marker,
    patch_infra,
    set_flags,
)


def _build(**kw) -> Build:
    return Build(project_id="p", user_id="u", prompt="x", **kw)


def test_canonical_mapping():
    assert execution_state.canonical_for("pending") == "pending"
    assert execution_state.canonical_for("running") == "running"
    assert execution_state.canonical_for("debugging") == "running"
    assert execution_state.canonical_for("success") == "completed"
    assert execution_state.canonical_for(BuildStatus.FAILED) == "failed"


def test_legacy_document_derives_build_status():
    assert Build(**{"project_id": "p", "user_id": "u", "prompt": "x", "status": "success"}).build_status == "completed"
    assert _build(status=BuildStatus.DEBUGGING).build_status == "running"


def test_set_status_appends_one_transition_per_change():
    build = _build()
    execution_state.admit(build)
    assert [t["to"] for t in build.execution_transitions] == ["pending"]
    execution_state.set_status(build, BuildStatus.RUNNING, reason="lease", attempt_token="T1")
    # debugging is a sub-state of running: no new transition.
    assert execution_state.set_status(build, BuildStatus.DEBUGGING) is None
    execution_state.set_status(build, BuildStatus.SUCCESS)
    assert [(t["from"], t["to"]) for t in build.execution_transitions] == [
        (None, "pending"), ("pending", "running"), ("running", "completed"),
    ]
    assert build.execution_transitions[1]["attempt_token"] == "T1"
    fields = execution_state.state_fields(build)
    assert fields["status"] == "success" and fields["build_status"] == "completed"
    assert len(fields["execution_transitions"]) == 3


def test_transition_update_sets_and_pushes_in_one_write():
    update = execution_state.transition_update("running", BuildStatus.FAILED, reason="orphaned",
                                               extra_set={"error": "x"})
    assert update["$set"] == {"status": "failed", "build_status": "failed", "error": "x"}
    assert update["$push"]["execution_transitions"]["from"] == "running"
    assert update["$push"]["execution_transitions"]["to"] == "failed"
    assert "$push" not in execution_state.transition_update("failed", BuildStatus.FAILED)


# --------------------------------------------------------------------------- #
# Through the real worker (legacy path, every flag off)
# --------------------------------------------------------------------------- #


class _RecordingCollection:
    """Wraps the A2 fake ``builds`` collection to log writes in order with
    the WebSocket events, so a per-token write would show up as a write
    immediately before a ``stream_token`` event."""

    def __init__(self, inner, log):
        self._inner = inner
        self._log = log

    def __getattr__(self, name):
        return getattr(self._inner, name)

    async def update_one(self, query, update, **kw):
        self._log.append("W")
        return await self._inner.update_one(query, update, **kw)


def _run_legacy_build(monkeypatch, log):
    db = FakeDB(users=[make_user(byok=False)], builds=[make_build()], projects=[{"id": "p1"}])
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, collab_protocol_v2=False, developer_clarification_max_questions=0)
    responses = build_responses()
    forge = CountingProvider(responder=lambda model, messages: responses.get(op_marker(messages) or "", "ok"))
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, pm_failures=1)

    import services.ws_manager as ws

    async def record_emit(event):
        log.append(event.type.value if hasattr(event.type, "value") else str(event.type))

    monkeypatch.setattr(ws.manager, "emit", record_emit)
    builds = db._collections["builds"]
    db._collections["builds"] = _RecordingCollection(builds, log)
    result = harness.run(reserved=17)
    return db, builds, result


def test_no_build_document_write_per_token(monkeypatch):
    """F3 / B1: ``emit`` writes the build document only for state-changing
    events; a 32,000-character Developer stream adds no writes."""
    log = []
    _, _, result = _run_legacy_build(monkeypatch, log)
    assert result["status"] == "success"
    tokens = [i for i, entry in enumerate(log) if entry == WSEventType.STREAM_TOKEN.value]
    assert len(tokens) > 100
    assert all(log[i - 1] != "W" for i in tokens)
    writes = log.count("W")
    non_token_events = len([e for e in log if e not in ("W", WSEventType.STREAM_TOKEN.value)])
    assert writes <= non_token_events + 3


def test_legacy_build_persists_canonical_state_with_status(monkeypatch):
    """Every flag off: the legacy status is unchanged and build_status plus
    the transitions are written alongside it."""
    log = []
    _, builds, _ = _run_legacy_build(monkeypatch, log)
    doc = builds.docs[0]
    assert doc["status"] == BuildStatus.SUCCESS
    assert doc["build_status"] == "completed"
    states = [t["to"] for t in doc["execution_transitions"]]
    assert states[0] == "pending" and states[-1] == "completed"
    # One record per change, never a repeat.
    assert all(a != b for a, b in zip(states, states[1:]))
    assert execution_state.canonical_for(doc["status"]) == doc["build_status"]


@pytest.mark.parametrize("legacy,canonical", [("pending", "pending"), ("debugging", "running"),
                                               ("success", "completed"), ("failed", "failed")])
def test_state_fields_always_in_sync(legacy, canonical):
    build = _build(status=legacy)
    execution_state.sync(build)
    fields = execution_state.state_fields(build)
    assert fields["build_status"] == canonical
    assert execution_state.canonical_for(fields["status"]) == fields["build_status"]
