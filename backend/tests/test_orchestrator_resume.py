"""Checkpoint/resume for the build pipeline (core/orchestrator.py).

A crashed/retried build used to always restart the entire pipeline from the
Architect, even if later steps had already succeeded and burned real LLM
cost -- see BuildTask's old docstring in tasks/build_tasks.py. Orchestrator
now checks `build.agents` for an already-SUCCESS step before calling each of
architect/business_model/designer/developer/integration, and recovers the
JSON-serialized value from that step's persisted `output` instead of
re-running the agent. The PM/debug loop is never resumed at sub-step
granularity -- it always restarts from PM validation.

These tests use the same `_StubAgent`/`_make_orchestrator` pattern as
test_interactive_gates.py.
"""

import json
import logging

import pytest

from core.models import AgentStep, AgentType, Build, BuildStatus
from core.orchestrator import Orchestrator


class _StubAgent:
    def __init__(self):
        self.calls = []

    async def blueprint(self, *a, **kw):
        self.calls.append(("blueprint", a, kw))
        return {"integrations": [], "features": ["f1"]}

    async def clarify(self, *a, **kw):
        return []

    async def improve(self, *a, **kw):
        self.calls.append(("improve", a, kw))
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        self.calls.append(("design", a, kw))
        return {"theme": "default"}

    async def generate_files(self, *a, **kw):
        self.calls.append(("generate_files", a, kw))
        return {"files": {"src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        self.calls.append(("integrate", a, kw))
        return {"files": {"src/stripe.ts": "// stripe"}, "instructions": "wire stripe"}

    async def validate(self, *a, **kw):
        self.calls.append(("validate", a, kw))
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        self.calls.append(("patch_files", a, kw))
        return {"files": {}}


def _make_orchestrator(monkeypatch):
    async def _no_byok(self, user_id):
        return False

    monkeypatch.setattr(Orchestrator, "_is_byok_active", _no_byok)

    orchestrator = Orchestrator()
    stubs = {}
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        stub = _StubAgent()
        stubs[attr] = stub
        setattr(orchestrator, attr, stub)
    return orchestrator, stubs


def _make_build(agents=None, business_model=None, debug_iterations=0):
    return Build(
        id="build-1",
        project_id="p1",
        user_id="u1",
        prompt="Build a todo app",
        status=BuildStatus.PENDING,
        interactive=False,
        agents=agents or [],
        business_model=business_model,
        debug_iterations=debug_iterations,
    )


def _success_step(agent_type: AgentType, output) -> AgentStep:
    payload = output if isinstance(output, str) else json.dumps(output)
    return AgentStep(
        agent=agent_type,
        status=BuildStatus.SUCCESS,
        output=payload,
        files_changed=[],
    )


async def _run(orchestrator, build, existing_files=None, persist_files=None):
    emitted = []

    async def emit(event):
        emitted.append(event)

    build, files = await orchestrator.run_build(
        build, emit=emit, sandbox_runner=None,
        existing_files=existing_files, persist_files=persist_files,
    )
    return build, files, emitted


# --------------------------------------------------------------------------- #
# Test A: a recovered architect step is not re-run, and the recovered value
# flows into the next stage.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_recovered_architect_step_skips_blueprint_call_and_flows_downstream(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    blueprint = {"integrations": [], "features": ["recovered-feature"]}
    build = _make_build(agents=[_success_step(AgentType.ARCHITECT, blueprint)])

    build, files, emitted = await _run(orchestrator, build)

    assert stubs["architect"].calls == []  # blueprint() never called
    # Recovered blueprint reaches business_model.improve as the `blueprint=` kwarg.
    assert stubs["business_model"].calls[0][2]["blueprint"] == blueprint
    # Downstream stages still ran normally.
    assert stubs["business_model"].calls
    assert stubs["designer"].calls
    assert stubs["developer"].calls


# --------------------------------------------------------------------------- #
# Test B: bad JSON on a SUCCESS step falls back to a full re-run, with a
# warning logged, rather than crashing.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unparseable_success_output_forces_full_rerun(monkeypatch, caplog):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    build = _make_build(agents=[_success_step(AgentType.ARCHITECT, "not json")])

    with caplog.at_level(logging.WARNING, logger="core.orchestrator"):
        build, files, emitted = await _run(orchestrator, build)

    assert len(stubs["architect"].calls) == 1  # blueprint() WAS called
    assert any("failed to JSON-parse" in r.getMessage() for r in caplog.records)


# --------------------------------------------------------------------------- #
# Test C: architect recovered but business_model never ran -- business_model
# must still run normally (no incorrect skip of a step with no SUCCESS record).
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_gap_in_success_steps_does_not_skip_the_missing_step(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    blueprint = {"integrations": [], "features": []}
    build = _make_build(agents=[_success_step(AgentType.ARCHITECT, blueprint)])

    build, files, emitted = await _run(orchestrator, build)

    assert stubs["architect"].calls == []
    assert len(stubs["business_model"].calls) == 1
    assert len(stubs["designer"].calls) == 1
    assert len(stubs["developer"].calls) == 1


# --------------------------------------------------------------------------- #
# Test D: architect + business_model recovered, but designer has no SUCCESS
# record -- designer must run, and resume_ok must go False from that point on
# (developer must NOT be skipped even though it has no bearing here since it
# never had a SUCCESS record either, but this proves ordering doesn't skip
# ahead incorrectly).
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ordering_stops_resume_at_first_non_recovered_step(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    blueprint = {"integrations": [], "features": []}
    business_model = {"summary": "recovered"}
    build = _make_build(agents=[
        _success_step(AgentType.ARCHITECT, blueprint),
        _success_step(AgentType.BUSINESS_IMPROVER, business_model),
    ])

    build, files, emitted = await _run(orchestrator, build)

    assert stubs["architect"].calls == []
    assert stubs["business_model"].calls == []
    assert len(stubs["designer"].calls) == 1  # designer runs -- no SUCCESS record
    assert len(stubs["developer"].calls) == 1  # developer runs too (resume_ok now False)


# --------------------------------------------------------------------------- #
# Test E: persist_files is invoked after developer, after integration, and
# after each debug-loop patch.
# --------------------------------------------------------------------------- #


class _IntegrationBlueprintStubAgent(_StubAgent):
    """Same as _StubAgent, but returns a blueprint with an integration so the
    orchestrator's integration step actually runs."""

    async def blueprint(self, *a, **kw):
        self.calls.append(("blueprint", a, kw))
        return {"integrations": ["stripe"], "features": []}


@pytest.mark.asyncio
async def test_persist_files_called_after_developer_and_integration(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    stubs["architect"] = _IntegrationBlueprintStubAgent()
    orchestrator.architect = stubs["architect"]
    build = _make_build()

    persisted_snapshots = []

    async def persist_files(files):
        persisted_snapshots.append(dict(files))

    build, files, emitted = await _run(orchestrator, build, persist_files=persist_files)

    # At least one call after developer (files has src/App.tsx) and one
    # after integration (files additionally has src/stripe.ts).
    assert any("src/App.tsx" in snap for snap in persisted_snapshots)
    assert any("src/stripe.ts" in snap for snap in persisted_snapshots)


# --------------------------------------------------------------------------- #
# Developer-recovered-but-empty-files guard: a SUCCESS developer step with no
# actual files behind it must force a full regeneration, not emit an empty build.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_recovered_developer_with_no_files_forces_regeneration(monkeypatch, caplog):
    orchestrator, stubs = _make_orchestrator(monkeypatch)
    blueprint = {"integrations": [], "features": []}
    design = {"theme": "default"}
    build = _make_build(agents=[
        _success_step(AgentType.ARCHITECT, blueprint),
        _success_step(AgentType.BUSINESS_IMPROVER, {"summary": "ok"}),
        _success_step(AgentType.DESIGNER, design),
        _success_step(AgentType.DEVELOPER, "Generated 1 files"),
    ])

    with caplog.at_level(logging.WARNING, logger="core.orchestrator"):
        # No existing_files passed -- files dict is empty despite the SUCCESS record.
        build, files, emitted = await _run(orchestrator, build)

    assert len(stubs["developer"].calls) == 1  # forced to regenerate
    assert "src/App.tsx" in files
    assert any("forcing a full regeneration" in r.getMessage() for r in caplog.records)
