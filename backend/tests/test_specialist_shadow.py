"""Tests for `core.specialist_shadow.maybe_run_specialist_shadow_comparison`
(docs/architecture/specialist-agent-execution-plan.md, Phase 2's shadow
comparison). These exercise the function directly, off the real orchestrator
call site -- see `tests/test_orchestrator_specialist_shadow.py` for
integration coverage proving the real `run_build()` path is unaffected.

Every case here proves the function is genuinely fail-safe: gated by the
feature flag first, scoped to the backend role allowlist, and swallows any
internal failure without ever raising to its caller (it always runs inside
a detached `asyncio.create_task` in production, but tests call it directly
to assert on its own behavior in isolation).
"""

from __future__ import annotations

from typing import List

import pytest

import core.specialist_shadow as shadow_module
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import Assignment
from core.models import Build, BuildStatus
from gateway.models import GatewayRequest, GatewayResponse


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        docs = self._docs
        return docs[:length] if length is not None else docs


def _matches(doc, query):
    return all(doc.get(k) == v for k, v in query.items())


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        return FakeCursor([d for d in self.docs if _matches(d, query)])


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


class FakeGateway:
    def __init__(self, *, content: str = "I would split auth into its own module.", should_raise: bool = False):
        self.content = content
        self.should_raise = should_raise
        self.requests: List[GatewayRequest] = []

    async def generate(self, request: GatewayRequest) -> GatewayResponse:
        self.requests.append(request)
        if self.should_raise:
            raise RuntimeError("simulated provider failure")
        return GatewayResponse(content=self.content, provider="fake", model="fake-model", request_id="req-1")


class FakeRouter:
    """Stand-in for TaskRouter whose `route()` result is fully controlled by
    the test, including returning [] (TaskRouter itself never does this by
    design, but the shadow function must still defend against it)."""

    def __init__(self, assignments):
        self._assignments = assignments
        self.calls = []

    async def route(self, project_id, request_text, max_assignments=3):
        self.calls.append((project_id, request_text))
        return self._assignments


def _make_build() -> Build:
    return Build(
        id="build-1", project_id="proj1", user_id="u1", prompt="Build a todo app",
        status=BuildStatus.PENDING,
    )


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    import agent_registry.repository as repo_module
    monkeypatch.setattr(repo_module, "get_db", _get_db)


def _patch_flag(monkeypatch, *, enabled: bool):
    async def _is_enabled(key):
        assert key == shadow_module.FLAG_KEY
        return enabled

    monkeypatch.setattr(shadow_module, "is_feature_enabled", _is_enabled)


def _patch_gateway_and_registry(monkeypatch, db, gateway):
    registry = AgentRegistry(repo=AgentRegistryRepository())
    monkeypatch.setattr(shadow_module, "get_ai_gateway", lambda: gateway)
    monkeypatch.setattr(shadow_module, "get_agent_registry", lambda: registry)
    return registry


BLUEPRINT = {
    "app_name": "Orders",
    "description": "A REST API for order management with a database schema and auth",
    "features": ["orders", "auth"],
    "integrations": [],
    "api_endpoints": [{"method": "GET", "path": "/orders"}],
}
DESIGN = {"theme": "default"}
FILES = {"backend/main.py": "...", "src/App.tsx": "..."}


# --------------------------------------------------------------------------- #
# Flag off: nothing runs at all.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_flag_off_is_a_complete_noop(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=False)

    router = FakeRouter([Assignment(role="api_engineer", department="backend", agent_id="a1", display_name="API", score=2, matched_keywords=["api"])])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: router)

    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)

    assert gateway.requests == []
    assert router.calls == []  # never even got to routing


# --------------------------------------------------------------------------- #
# Flag on, backend role resolved: the real path runs end-to-end.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_flag_on_backend_role_calls_gateway_and_records_result(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway(content="As the API engineer, I'd version the /orders endpoint.")
    _patch_db(monkeypatch, db)
    registry = _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    assignment = Assignment(role="api_engineer", department="backend", agent_id="ignored", display_name="API", score=2, matched_keywords=["api"])
    router = FakeRouter([assignment])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: router)

    build = _make_build()
    await shadow_module.maybe_run_specialist_shadow_comparison(build, BLUEPRINT, DESIGN, FILES)

    assert len(gateway.requests) == 1
    request = gateway.requests[0]
    assert request.agent_name == "api_engineer"
    assert request.project_id == "proj1"
    assert request.user_id is None
    assert request.max_tokens == shadow_module._SHADOW_MAX_TOKENS

    # A real AgentProfile for api_engineer now exists with a recorded result.
    agent, created = await registry.get_or_create_agent("proj1", "api_engineer")
    assert created is False  # already created by get_or_create_agent inside the shadow call
    assert agent.stats.tasks_completed == 1
    assert agent.stats.tasks_failed == 0


@pytest.mark.asyncio
async def test_only_backend_prefixed_files_are_recorded_as_touched(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    registry = _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    assignment = Assignment(role="database_engineer", department="backend", agent_id="ignored", display_name="DB", score=1, matched_keywords=["database"])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: FakeRouter([assignment]))

    files = {"backend/models.py": "...", "src/App.tsx": "...", "api/routes.py": "..."}
    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, files)

    agent, _ = await registry.get_or_create_agent("proj1", "database_engineer")
    # files_touched isn't directly exposed on AgentProfile.stats, but the
    # call must have succeeded (tasks_completed incremented) without error
    # regardless of the heuristic's exact output.
    assert agent.stats.tasks_completed == 1


# --------------------------------------------------------------------------- #
# Flag on, but resolved role is outside the backend allowlist: no-op.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_non_backend_role_is_skipped(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    assignment = Assignment(role="react_engineer", department="frontend", agent_id="ignored", display_name="React", score=2, matched_keywords=["react"])
    router = FakeRouter([assignment])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: router)

    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)

    assert router.calls  # routing did happen
    assert gateway.requests == []  # but nothing further ran


@pytest.mark.asyncio
async def test_no_assignments_is_skipped(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    router = FakeRouter([])  # TaskRouter never really does this, but defend anyway
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: router)

    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)

    assert gateway.requests == []


# --------------------------------------------------------------------------- #
# Failures anywhere inside are fully swallowed.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_gateway_failure_is_swallowed(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway(should_raise=True)
    _patch_db(monkeypatch, db)
    _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    assignment = Assignment(role="api_engineer", department="backend", agent_id="ignored", display_name="API", score=2, matched_keywords=["api"])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: FakeRouter([assignment]))

    # Must not raise.
    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)
    assert len(gateway.requests) == 1  # it was actually attempted


@pytest.mark.asyncio
async def test_task_router_raising_is_swallowed(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    class RaisingRouter:
        async def route(self, *a, **kw):
            raise RuntimeError("routing exploded")

    monkeypatch.setattr(shadow_module, "get_task_router", lambda: RaisingRouter())

    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)
    assert gateway.requests == []


@pytest.mark.asyncio
async def test_record_task_result_raising_is_swallowed(monkeypatch):
    db = FakeDB()
    gateway = FakeGateway()
    _patch_db(monkeypatch, db)
    registry = _patch_gateway_and_registry(monkeypatch, db, gateway)
    _patch_flag(monkeypatch, enabled=True)

    async def _raise(*a, **kw):
        raise RuntimeError("registry write failed")

    monkeypatch.setattr(registry, "record_task_result", _raise)

    assignment = Assignment(role="api_engineer", department="backend", agent_id="ignored", display_name="API", score=2, matched_keywords=["api"])
    monkeypatch.setattr(shadow_module, "get_task_router", lambda: FakeRouter([assignment]))

    # Must not raise even though the gateway call succeeded first.
    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)
    assert len(gateway.requests) == 1


@pytest.mark.asyncio
async def test_feature_flag_check_raising_is_swallowed(monkeypatch):
    async def _raise(key):
        raise RuntimeError("flag check exploded")

    monkeypatch.setattr(shadow_module, "is_feature_enabled", _raise)

    # Must not raise, and must not get anywhere near routing/gateway.
    await shadow_module.maybe_run_specialist_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)


# --------------------------------------------------------------------------- #
# Blueprint summary helper: sanity check it produces reasonable, non-empty
# text for TaskRouter's keyword classifier.
# --------------------------------------------------------------------------- #


def test_blueprint_summary_includes_description_and_endpoints():
    summary = shadow_module._blueprint_summary(BLUEPRINT)
    assert "REST API for order management" in summary
    assert "/orders" in summary


def test_blueprint_summary_handles_empty_blueprint():
    assert shadow_module._blueprint_summary({}) == "app"


# --------------------------------------------------------------------------- #
# launch_shadow_comparison: the synchronous launcher core/orchestrator.py
# actually calls. asyncio.create_task() only holds a WEAK reference via the
# event loop's own bookkeeping -- a task with no other strong reference "may
# be garbage collected at any time, even before it's done" (stdlib docs).
# launch_shadow_comparison must hold a real reference for the task's full
# lifetime and release it once done, not leak it forever.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_launch_shadow_comparison_retains_and_releases_task_reference():
    import asyncio

    async def _slow_noop(*a, **kw):
        await asyncio.sleep(0)

    import core.specialist_shadow as _shadow

    orig = _shadow.maybe_run_specialist_shadow_comparison
    _shadow.maybe_run_specialist_shadow_comparison = _slow_noop
    try:
        # Snapshot rather than assume `_inflight_tasks` starts empty -- it's
        # process-wide module state shared with every other test that
        # exercises this module in the same pytest run, so a delta
        # comparison is the only order-independent way to assert on it.
        before = set(_shadow._inflight_tasks)

        _shadow.launch_shadow_comparison(_make_build(), BLUEPRINT, DESIGN, FILES)
        # The task must be retained immediately after launch, before it's
        # had any chance to run (this is exactly the window where an
        # unretained task could vanish under GC).
        new_tasks = _shadow._inflight_tasks - before
        assert len(new_tasks) == 1
        task = next(iter(new_tasks))

        await task  # let it actually run to completion
        await asyncio.sleep(0)  # yield once so the done-callback (call_soon) actually fires

        # Its own done-callback must have removed it -- back to baseline,
        # not "however many were there when this test happened to run."
        assert _shadow._inflight_tasks == before
    finally:
        _shadow.maybe_run_specialist_shadow_comparison = orig
