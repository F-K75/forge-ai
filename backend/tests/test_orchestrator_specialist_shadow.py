"""Integration coverage for the Phase 2 specialist-shadow hook in
`core/orchestrator.py`'s Developer stage (docs/architecture/specialist-
agent-execution-plan.md, Phase 2; see `core/specialist_shadow.py` for the
unit-level behavior of the shadow function itself).

The single most important property under test here: with the feature flag
OFF (the default -- no flag doc exists), `run_build()`'s own return value
(`files`), the exact WSEvent sequence, and credit charging must be
byte-for-byte identical to the pipeline's behavior before this change. The
shadow hook existing at all must never observably change the real build.

Uses the same `_StubAgent`/`_make_orchestrator` pattern as
`test_orchestrator_resume.py`.
"""

from __future__ import annotations

import asyncio

import pytest

import core.orchestrator as orchestrator_module
import core.specialist_shadow as shadow_module
from core.models import Build, BuildStatus
from core.orchestrator import Orchestrator


class _StubAgent:
    def __init__(self):
        self.calls = []

    async def blueprint(self, *a, **kw):
        self.calls.append(("blueprint", a, kw))
        return {
            "integrations": [],
            "features": ["orders"],
            "description": "A REST API for order management with a database schema",
            "api_endpoints": [{"method": "GET", "path": "/orders"}],
        }

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
        return {"files": {"backend/main.py": "# v1", "src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        self.calls.append(("integrate", a, kw))
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        self.calls.append(("validate", a, kw))
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        self.calls.append(("patch_files", a, kw))
        return {"files": {}}


def _make_orchestrator(monkeypatch):
    async def _no_byok(self, user_id):
        return False

    async def _no_profile(self, build, agent_type):
        return None

    monkeypatch.setattr(Orchestrator, "_is_byok_active", _no_byok)
    monkeypatch.setattr(Orchestrator, "_resolve_agent_profile", _no_profile)

    orchestrator = Orchestrator()
    stubs = {}
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        stub = _StubAgent()
        stubs[attr] = stub
        setattr(orchestrator, attr, stub)
    return orchestrator, stubs


def _make_build():
    return Build(
        id="build-1", project_id="p1", user_id="u1", prompt="Build an orders API",
        status=BuildStatus.PENDING, interactive=False, agents=[],
    )


def _capture_created_tasks(monkeypatch):
    """Same technique as tests/test_review_board_bridge.py's
    `_capture_background_tasks`: intercept `asyncio.create_task` calls made
    from within `core.specialist_shadow.launch_shadow_comparison` (NOT
    `core.orchestrator` -- the Developer stage calls the synchronous
    `launch_shadow_comparison` wrapper directly; the actual `create_task`
    call, and the module-level reference-retention set that keeps the task
    alive, both live in `specialist_shadow.py`) so the test controls exactly
    when (or whether) the fire-and-forget shadow task actually runs."""
    captured = []
    orig_create_task = asyncio.create_task

    def _capture(coro, *args, **kwargs):
        task = orig_create_task(coro, *args, **kwargs)
        captured.append(task)
        return task

    monkeypatch.setattr(shadow_module.asyncio, "create_task", _capture)
    return captured


async def _run(orchestrator, build):
    emitted = []

    async def emit(event):
        emitted.append(event)

    build, files = await orchestrator.run_build(build, emit=emit, sandbox_runner=None)
    return build, files, emitted


def _event_shapes(emitted):
    """Reduce emitted WSEvents to (type, data) tuples for comparison,
    ignoring anything build/timestamp specific that isn't relevant here."""
    return [(e.type, e.data) for e in emitted]


# --------------------------------------------------------------------------- #
# The most important test: flag OFF (default, no flag doc) -> byte-for-byte
# identical run_build() behavior whether or not the shadow hook exists.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_flag_off_run_build_is_byte_for_byte_unaffected(monkeypatch):
    # No flag doc created anywhere -- is_feature_enabled must resolve False
    # via its own real fail-closed logic. Patch only get_db so the check
    # doesn't attempt a real Mongo connection; return a DB with no matching
    # doc, exactly like production before anyone creates this flag.
    class _EmptyCollection:
        async def find_one(self, query, projection=None):
            return None

    class _EmptyDB:
        feature_flags = _EmptyCollection()

    async def _get_db():
        return _EmptyDB()

    import core.feature_flags as feature_flags_module
    monkeypatch.setattr(feature_flags_module, "get_db", _get_db)

    tasks = _capture_created_tasks(monkeypatch)

    orchestrator, stubs = _make_orchestrator(monkeypatch)
    build, files, emitted = await _run(orchestrator, _make_build())

    assert build.status == BuildStatus.SUCCESS
    assert files == {"backend/main.py": "# v1", "src/App.tsx": "// v1"}

    # Credits: exactly the steps you'd expect, nothing extra.
    from core.models import AgentType
    agent_types = [step.agent for step in build.agents]
    assert agent_types == [
        AgentType.ARCHITECT, AgentType.BUSINESS_IMPROVER, AgentType.DESIGNER,
        AgentType.DEVELOPER, AgentType.PM,
    ]

    # The shadow task IS created (unconditionally, since the flag check
    # itself happens inside the fire-and-forget task) -- but running it to
    # completion must be a total no-op given the flag resolves False.
    assert len(tasks) == 1
    await tasks[0]  # drain it so nothing is left pending at teardown

    # Re-run without the shadow hook present at all (monkeypatch the
    # synchronous launcher orchestrator.py actually calls to a no-op) to get
    # a true "before this change" baseline and diff the full event/files/
    # build-agents shape.
    def _noop(*a, **kw):
        return None

    monkeypatch.setattr(orchestrator_module, "launch_shadow_comparison", _noop)

    orchestrator2, _ = _make_orchestrator(monkeypatch)
    build2, files2, emitted2 = await _run(orchestrator2, _make_build())

    assert files == files2
    assert _event_shapes(emitted) == _event_shapes(emitted2)
    assert [s.agent for s in build.agents] == [s.agent for s in build2.agents]
    assert [s.status for s in build.agents] == [s.status for s in build2.agents]


# --------------------------------------------------------------------------- #
# Flag ON: the shadow task is invoked, but run_build()'s own synchronous
# return path (files/events/build) is completely unaffected either way.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_flag_on_shadow_invoked_but_run_build_unaffected(monkeypatch):
    async def _flag_on(key):
        return key == shadow_module.FLAG_KEY

    monkeypatch.setattr(shadow_module, "is_feature_enabled", _flag_on)

    gateway_calls = []

    class _FakeAssignment:
        role = "api_engineer"
        department = "backend"
        agent_id = "ignored"
        display_name = "API"

    class _FakeRouter:
        async def route(self, project_id, text, max_assignments=3):
            return [_FakeAssignment()]

    class _FakeGatewayResponse:
        content = "second opinion text"

    class _FakeGateway:
        async def generate(self, request):
            gateway_calls.append(request)
            return _FakeGatewayResponse()

    class _FakeAgentProfile:
        id = "agent-1"

        class stats:
            tasks_completed = 0
            tasks_failed = 0

    record_calls = []

    class _FakeRegistry:
        async def get_or_create_agent(self, project_id, role, department=None, display_name=None):
            return _FakeAgentProfile(), False

        async def record_task_result(self, project_id, agent_id, **kw):
            record_calls.append((project_id, agent_id, kw))
            return _FakeAgentProfile()

    monkeypatch.setattr(shadow_module, "get_task_router", lambda: _FakeRouter())
    monkeypatch.setattr(shadow_module, "get_ai_gateway", lambda: _FakeGateway())
    monkeypatch.setattr(shadow_module, "get_agent_registry", lambda: _FakeRegistry())

    tasks = _capture_created_tasks(monkeypatch)

    orchestrator, stubs = _make_orchestrator(monkeypatch)
    build, files, emitted = await _run(orchestrator, _make_build())

    # Real build output: unaffected regardless of the flag.
    assert files == {"backend/main.py": "# v1", "src/App.tsx": "// v1"}
    assert build.status == BuildStatus.SUCCESS
    from core.models import AgentType
    assert [step.agent for step in build.agents] == [
        AgentType.ARCHITECT, AgentType.BUSINESS_IMPROVER, AgentType.DESIGNER,
        AgentType.DEVELOPER, AgentType.PM,
    ]
    # No WS event type/shape the frontend depends on was added -- only the
    # existing real pipeline event types appear, nothing shadow-specific.
    assert {e.type for e in emitted} <= {
        orchestrator_module.WSEventType.BUILD_START,
        orchestrator_module.WSEventType.AGENT_START,
        orchestrator_module.WSEventType.AGENT_UPDATE,
        orchestrator_module.WSEventType.AGENT_PROGRESS,
        orchestrator_module.WSEventType.AGENT_COMPLETE,
        orchestrator_module.WSEventType.AGENT_OUTPUT,
        orchestrator_module.WSEventType.FILE_UPDATE,
        orchestrator_module.WSEventType.STREAM_TOKEN,
        orchestrator_module.WSEventType.BUILD_COMPLETE,
    }

    # The shadow task was created and, once actually run, drove the fake
    # gateway/registry exactly once.
    assert len(tasks) == 1
    await tasks[0]
    assert len(gateway_calls) == 1
    assert gateway_calls[0].agent_name == "api_engineer"
    assert gateway_calls[0].user_id is None
    assert len(record_calls) == 1


# --------------------------------------------------------------------------- #
# Shadow raising internally never propagates anywhere near the real build.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_shadow_task_raising_does_not_affect_build(monkeypatch):
    async def _raise(*a, **kw):
        raise RuntimeError("boom -- forced failure deep inside the shadow path")

    # Patch the actual async coroutine `launch_shadow_comparison` wraps in
    # create_task -- exercises the real synchronous launcher (orchestrator.py's
    # real call path) with only the async body swapped for one that raises
    # immediately, simulating "the shadow function raises at any point."
    monkeypatch.setattr(shadow_module, "maybe_run_specialist_shadow_comparison", _raise)

    tasks = _capture_created_tasks(monkeypatch)

    orchestrator, stubs = _make_orchestrator(monkeypatch)
    build, files, emitted = await _run(orchestrator, _make_build())

    assert files == {"backend/main.py": "# v1", "src/App.tsx": "// v1"}
    assert build.status == BuildStatus.SUCCESS

    assert len(tasks) == 1
    # Awaiting the raising task directly re-raises to *this* awaiter (that's
    # normal asyncio.Task semantics) -- the point is it already didn't
    # affect run_build()'s completed, returned result above. A real
    # fire-and-forget caller (orchestrator.py) never awaits this task at
    # all, so in production nothing ever observes this exception except the
    # task's own internal try/except (proven in test_specialist_shadow.py)
    # and, as a last resort, asyncio's default "exception was never
    # retrieved" logging -- never anything build-related.
    with pytest.raises(RuntimeError):
        await tasks[0]
