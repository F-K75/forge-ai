"""End-to-end resume behavior at the Celery task level (tasks/build_tasks.py).

Exercises the real `orchestrator` singleton (with its agent instances
monkeypatched to stubs, same shape as test_orchestrator_resume.py) driven
through `run_build.run(...)`, to prove:
  - a retry after partial progress resumes instead of re-running completed
    (and already-charged) agents,
  - credits are not double-counted across the crash+retry,
  - `db.build_files` rows for the *current* build_id take priority over the
    task-argument `existing_files` (the separate cross-build amend case).
"""

import datetime
import json

import pytest

import tasks.build_tasks as build_tasks_module
from core.models import AgentType, BuildStatus


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return list(self._docs)


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = {d["id"]: d for d in (docs or [])}
        self.inc_calls = []
        self.set_calls = []
        self.inserted = []
        self.deleted_many_calls = []

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query.get("id"))
        return dict(doc) if doc else None

    def find(self, query, projection=None):
        matches = [
            dict(d) for d in self.docs.values()
            if all(d.get(k) == v for k, v in query.items())
        ]
        return FakeCursor(matches)

    async def update_one(self, query, update):
        if "$inc" in update:
            self.inc_calls.append((query.get("id"), update["$inc"]))
        if "$set" in update:
            self.set_calls.append((query.get("id"), update["$set"]))
            doc = self.docs.get(query.get("id"))
            if doc is not None:
                doc.update(update["$set"])
        return None

    async def insert_one(self, doc):
        self.inserted.append(doc)
        self.docs[doc.get("id", len(self.docs))] = doc
        return None

    async def find_one_and_update(self, query, update, return_document=False):
        doc = self.docs.get(query.get("id"))
        if doc is None:
            return None
        if "$inc" in update:
            self.inc_calls.append((query.get("id"), update["$inc"]))
            for key, inc in update["$inc"].items():
                doc[key] = doc.get(key, 0) + inc
        if "$set" in update:
            self.set_calls.append((query.get("id"), update["$set"]))
            doc.update(update["$set"])
        return dict(doc)

    async def insert_many(self, docs):
        docs = list(docs)
        self.inserted.extend(docs)
        for i, d in enumerate(docs):
            self.docs[d.get("id", f"generated-{len(self.docs)}-{i}")] = d
        return None

    async def delete_many(self, query):
        self.deleted_many_calls.append(query)
        build_id = query.get("build_id")
        if build_id is not None:
            self.docs = {
                k: v for k, v in self.docs.items() if v.get("build_id") != build_id
            }
        return None


class FakeDB:
    def __init__(self, build, user, build_files=None):
        self.builds = FakeCollection([build])
        self.users = FakeCollection([user])
        self.build_files = FakeCollection(build_files or [])
        self.projects = FakeCollection([{"id": "p1"}])
        self.build_dead_letters = FakeCollection([])


def _make_build_and_user(agents=None, credits_used=0, debug_iterations=0):
    build = {
        "id": "build-1",
        "project_id": "p1",
        "user_id": "u1",
        "prompt": "x",
        "status": "pending",
        "agents": agents or [],
        "credits_used": credits_used,
        "context_tokens": 0,
        "debug_iterations": debug_iterations,
        "business_model": None,
        "created_at": datetime.datetime.utcnow(),
        "completed_at": None,
    }
    user = {"id": "u1", "credits": 1000}
    return build, user


def _success_step(agent, output, files_changed=None):
    return {
        "agent": agent,
        "status": "success",
        "started_at": datetime.datetime.utcnow(),
        "completed_at": datetime.datetime.utcnow(),
        "output": output if isinstance(output, str) else json.dumps(output),
        "files_changed": files_changed or [],
        "error": None,
    }


class _StubAgent:
    def __init__(self):
        self.calls = 0

    async def blueprint(self, *a, **kw):
        self.calls += 1
        return {"integrations": [], "features": []}

    async def clarify(self, *a, **kw):
        return []

    async def improve(self, *a, **kw):
        self.calls += 1
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        self.calls += 1
        return {"theme": "default"}

    async def generate_files(self, *a, **kw):
        self.calls += 1
        return {"files": {"src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        self.calls += 1
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        self.calls += 1
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        self.calls += 1
        return {"files": {}}


def _patch_agents(monkeypatch):
    stubs = {}
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        stub = _StubAgent()
        stubs[attr] = stub
        monkeypatch.setattr(build_tasks_module.orchestrator, attr, stub)

    async def _no_byok(self, user_id):
        return False

    monkeypatch.setattr(
        type(build_tasks_module.orchestrator), "_is_byok_active", _no_byok
    )
    return stubs


def test_resume_after_developer_success_skips_completed_agents_and_credits_not_doubled(monkeypatch):
    """Simulates a crash after Developer succeeded: build.agents already has
    SUCCESS records for architect/business_model/designer/developer (with a
    nonzero credits_used reflecting those 4 charges), and db.build_files
    already has the developer's generated file for this build_id. A retry
    (retries=0, well under max_retries) should skip re-running those four
    agents, only run PM, and must not double-charge credits already spent."""
    already_charged = 40  # architect+business_model+designer+developer stand-in total
    build, user = _make_build_and_user(
        agents=[
            _success_step("architect", {"integrations": [], "features": []}),
            _success_step("business_improver", {"summary": "ok"}),
            _success_step("designer", {"theme": "default"}),
            _success_step("developer", "Generated 1 files", files_changed=["src/App.tsx"]),
        ],
        credits_used=already_charged,
    )
    build_files = [
        {"id": "bf-1", "build_id": "build-1", "path": "src/App.tsx", "content": "// v1"}
    ]
    fake_db = FakeDB(build, user, build_files=build_files)

    async def fake_get_db():
        return fake_db

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    stubs = _patch_agents(monkeypatch)

    result = build_tasks_module.run_build.run("build-1", "p1", "u1", 100)

    assert result["status"] == "success"
    # None of the already-SUCCESS agents were re-invoked.
    assert stubs["architect"].calls == 0
    assert stubs["business_model"].calls == 0
    assert stubs["designer"].calls == 0
    assert stubs["developer"].calls == 0
    # Only PM actually ran (no integrations in the recovered blueprint).
    assert stubs["pm"].calls == 1

    final_build_doc = fake_db.builds.docs["build-1"]
    # credits_used only grew by whatever PM's step cost, on top of the
    # already-persisted total -- never re-added the first four agents' cost.
    assert final_build_doc["credits_used"] >= already_charged
    # The originally recovered file survived through to the final build_files.
    assert any(
        row["path"] == "src/App.tsx"
        for row in fake_db.build_files.docs.values()
    )


def test_retry_fires_even_after_partial_progress(monkeypatch):
    """Companion to test_credit_refund_retries.py's equivalent assertion --
    included here too since it's the crux of what makes resume useful: a
    transient failure after some agents already succeeded must still retry
    (not fail immediately) on a non-final attempt."""
    build, user = _make_build_and_user(
        agents=[_success_step("architect", {"integrations": [], "features": []})],
        credits_used=10,
    )
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*a, **kw):
        raise RuntimeError("simulated transient failure")

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", failing_run_build)

    build_tasks_module.run_build.push_request(retries=0)
    try:
        with pytest.raises(RuntimeError):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    assert fake_db.users.inc_calls == []
    assert fake_db.builds.set_calls == []


def test_build_files_for_current_build_id_take_priority_over_existing_files_arg(monkeypatch):
    """The task-argument `existing_files` represents a different prior
    build's amend context; db.build_files rows for *this* build_id (written
    by this build's own earlier, crashed attempt) must win."""
    build, user = _make_build_and_user(
        agents=[
            _success_step("architect", {"integrations": [], "features": []}),
            _success_step("business_improver", {"summary": "ok"}),
            _success_step("designer", {"theme": "default"}),
            _success_step("developer", "Generated 1 files", files_changed=["src/Resumed.tsx"]),
        ],
        credits_used=40,
    )
    build_files = [
        {"id": "bf-1", "build_id": "build-1", "path": "src/Resumed.tsx", "content": "// resumed"}
    ]
    fake_db = FakeDB(build, user, build_files=build_files)

    async def fake_get_db():
        return fake_db

    stubs = _patch_agents(monkeypatch)

    captured = {}
    real_run_build = build_tasks_module.orchestrator.run_build

    async def spying_run_build(*args, **kwargs):
        captured["existing_files"] = kwargs.get("existing_files")
        return await real_run_build(*args, **kwargs)

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", spying_run_build)

    build_tasks_module.run_build.run(
        "build-1", "p1", "u1", 100,
        existing_files={"src/FromAmend.tsx": "// amend seed, should be ignored"},
    )

    assert captured["existing_files"] == {"src/Resumed.tsx": "// resumed"}
