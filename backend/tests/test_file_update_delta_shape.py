"""Regression test for WS-002: FILE_UPDATE events had two irreconcilable
shapes in flight at once -- {"delta": {"changed": ..., "deleted": ...}} and
{"files": {...}} -- and the frontend's parseWSEvent only ever accepted the
latter. Every delta-shaped FILE_UPDATE (every debug-loop patch, and the
final consolidation event) was silently dropped by the frontend's own
validation, so patched files from the debug loop never reached the editor.

Found 2026-07-03 while implementing WS-002 ("send deltas instead of the
full dict") -- the backend had already half-migrated to deltas, but nobody
had checked whether the frontend understood them.

Fixed by: standardizing on the delta shape everywhere (removing the
redundant {"files": ...} emission and the redundant trailing delta after
BUILD_COMPLETE, which already carries the full file state), and updating
wsContract.ts + buildStore.ts to parse/consume `data.delta` instead of
`data.files`. This test covers the backend half; the frontend half has no
test framework to exercise (confirmed zero test infra elsewhere in this
audit) -- verified instead via `tsc --noEmit` and a production `vite build`.
"""

import pytest


class _FakeDB:
    async def command(self, name):
        return {"ok": 1}

    async def find_one(self, query, projection=None):
        return {"id": "u1", "plan": "free"}


def _make_build():
    from core.models import Build, BuildStatus
    return Build(
        id="build-1",
        project_id="p1",
        user_id="u1",
        prompt="Build a todo app",
        status=BuildStatus.PENDING,
    )


class _StubAgent:
    """Drop-in replacement for each pipeline agent -- returns just enough
    to keep the orchestrator moving without touching a real LLM."""

    async def blueprint(self, *a, **kw):
        return {"integrations": [], "features": []}

    async def improve(self, *a, **kw):
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        return {"theme": "default"}

    async def generate_files(self, *a, **kw):
        return {"files": {"src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        return {"files": {}}


@pytest.mark.asyncio
async def test_exactly_one_file_update_per_developer_pass_using_delta_shape(monkeypatch):
    from core.orchestrator import Orchestrator

    monkeypatch.setattr(Orchestrator, "_is_byok_active", lambda self, user_id: asyncio_coroutine(False)())

    orchestrator = Orchestrator()
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        setattr(orchestrator, attr, _StubAgent())

    emitted = []

    async def emit(event):
        emitted.append(event)

    build = _make_build()
    await orchestrator.run_build(build, emit=emit, sandbox_runner=None)

    file_update_events = [e for e in emitted if e.type.value == "file_update"]

    assert len(file_update_events) == 1

    data = file_update_events[0].data
    assert "delta" in data, "file_update event must use the delta shape"
    assert "files" not in data, "the old, no-longer-understood {'files': ...} shape must not be sent"
    assert data["delta"]["changed"] == {"src/App.tsx": "// v1"}
    assert data["delta"]["deleted"] == []


def asyncio_coroutine(result):
    """Helper to create a coroutine that returns result immediately."""
    async def _coro():
        return result
    return _coro


@pytest.mark.asyncio
async def test_debug_loop_file_update_also_uses_delta_shape(monkeypatch):
    from core.orchestrator import Orchestrator

    monkeypatch.setattr(Orchestrator, "_is_byok_active", lambda self, user_id: asyncio_coroutine(False)())

    orchestrator = Orchestrator()
    for attr in ("architect", "business_model", "designer", "developer", "integration"):
        setattr(orchestrator, attr, _StubAgent())

    validate_calls = {"n": 0}

    class _PMStub(_StubAgent):
        async def validate(self, *a, **kw):
            validate_calls["n"] += 1
            if validate_calls["n"] == 1:
                return {"passed": False, "issues": [{"severity": "high", "file": "x", "description": "bug"}]}
            return {"passed": True}

    orchestrator.pm = _PMStub()

    emitted = []

    async def emit(event):
        emitted.append(event)

    build = _make_build()
    await orchestrator.run_build(build, emit=emit, sandbox_runner=None)

    file_update_events = [e for e in emitted if e.type.value == "file_update"]

    assert len(file_update_events) == 2
    for event in file_update_events:
        assert "delta" in event.data
        assert "files" not in event.data


@pytest.mark.asyncio
async def test_build_complete_carries_full_files_with_no_trailing_file_update(monkeypatch):
    from core.orchestrator import Orchestrator

    monkeypatch.setattr(Orchestrator, "_is_byok_active", lambda self, user_id: asyncio_coroutine(False)())

    orchestrator = Orchestrator()
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        setattr(orchestrator, attr, _StubAgent())

    emitted = []

    async def emit(event):
        emitted.append(event)

    build = _make_build()
    await orchestrator.run_build(build, emit=emit, sandbox_runner=None)

    build_complete_index = next(
        i for i, e in enumerate(emitted) if e.type.value == "build_complete"
    )
    assert emitted[build_complete_index].data["files"] == {"src/App.tsx": "// v1"}
    assert build_complete_index == len(emitted) - 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
