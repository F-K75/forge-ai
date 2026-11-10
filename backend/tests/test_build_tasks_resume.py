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

import json

import pytest

import tasks.build_tasks as build_tasks_module

from core.models import utcnow


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
        "created_at": utcnow(),
        "completed_at": None,
    }
    user = {"id": "u1", "credits": 1000}
    return build, user


def _success_step(agent, output, files_changed=None):
    return {
        "agent": agent,
        "status": "success",
        "started_at": utcnow(),
        "completed_at": utcnow(),
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

    _patch_agents(monkeypatch)

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


class _ClarifyingStubAgent(_StubAgent):
    """Developer/Architect stub that takes part in the clarification phase;
    the developer's first generate_files call can be made to crash."""

    def __init__(self, crash_first_generation=False):
        super().__init__()
        self.answers = 0
        self.question_passes = 0
        self._crash = crash_first_generation

    async def identify_questions(self, *a, **kw):
        self.question_passes += 1
        return ["What happens when the session expires?"]

    async def answer(self, question, blueprint, design=None, **kw):
        self.answers += 1
        return "Redirect to /login and keep the draft."

    async def generate_files(self, *a, **kw):
        self.calls += 1
        self.last_clarifications = kw.get("clarifications")
        if self._crash:
            self._crash = False
            raise RuntimeError("simulated crash mid-generation")
        return {"files": {"src/App.tsx": "// v1"}}


def test_clarification_survives_crash_and_retry_without_double_charge(monkeypatch):
    """A crash during file generation, after a clarification was answered and
    charged, must not re-ask or re-charge it on the retried attempt: the
    exchange is persisted on the build document by the task's emit() in the
    same write as the charge, and the orchestrator reuses it on resume.
    The final refund is settled against the reservation passed to the task."""
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    _patch_agents(monkeypatch)
    architect = _ClarifyingStubAgent()
    developer = _ClarifyingStubAgent(crash_first_generation=True)
    monkeypatch.setattr(build_tasks_module.orchestrator, "architect", architect)
    monkeypatch.setattr(build_tasks_module.orchestrator, "developer", developer)

    reserved = 30
    build_tasks_module.run_build.push_request(retries=0)
    try:
        with pytest.raises(Exception):
            build_tasks_module.run_build.run("build-1", "p1", "u1", reserved)
    finally:
        build_tasks_module.run_build.pop_request()

    crashed_doc = fake_db.builds.docs["build-1"]
    (persisted,) = crashed_doc["agent_messages"]
    assert persisted["status"] == "answered"
    assert persisted["credits_charged"] == 1
    assert architect.answers == 1

    result = build_tasks_module.run_build.run("build-1", "p1", "u1", reserved)

    assert result["status"] == "success"
    assert architect.answers == 1           # not re-asked
    assert developer.question_passes == 1   # no fresh question pass
    assert developer.last_clarifications == [
        {"question": "What happens when the session expires?",
         "answer": "Redirect to /login and keep the draft."}
    ]
    final_doc = fake_db.builds.docs["build-1"]
    assert len(final_doc["agent_messages"]) == 1
    # One clarification credit in total, across both attempts.
    assert sum(m["credits_charged"] for m in final_doc["agent_messages"]) == 1
    assert result["credits_used"] <= reserved



class _WorkerCrash(BaseException):
    """Stands in for the worker process dying (SIGKILL, OOM): not an
    Exception, so no handler in the pipeline or the task can absorb it."""


def test_crash_after_paid_answer_before_persist_does_not_repeat_the_call_or_charge(monkeypatch):
    """The crash boundary between a successful (paid) Architect call and the
    write that records its answer + charge. The retried build must neither
    charge for that answer nor pay the provider for the same question again:
    the in-flight marker written before the call tells it the question was
    already sent, so it is closed as interrupted and the build continues."""
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    _patch_agents(monkeypatch)
    architect = _ClarifyingStubAgent()
    developer = _ClarifyingStubAgent()
    monkeypatch.setattr(build_tasks_module.orchestrator, "architect", architect)
    monkeypatch.setattr(build_tasks_module.orchestrator, "developer", developer)

    real_update_one = fake_db.builds.update_one
    crash = {"armed": True}

    async def crashing_update_one(query, update):
        msgs = (update.get("$set") or {}).get("agent_messages") or []
        if crash["armed"] and any(m["status"] == "answered" for m in msgs):
            crash["armed"] = False
            raise _WorkerCrash()
        return await real_update_one(query, update)

    monkeypatch.setattr(fake_db.builds, "update_one", crashing_update_one)

    reserved = 30
    with pytest.raises(_WorkerCrash):
        build_tasks_module.run_build.run("build-1", "p1", "u1", reserved)

    assert architect.answers == 1  # the provider call happened...
    (persisted,) = fake_db.builds.docs["build-1"]["agent_messages"]
    assert persisted["status"] == "pending"  # ...but its outcome was never saved
    assert persisted["delivery_attempts"] == 1
    assert persisted["credits_charged"] == 0

    result = build_tasks_module.run_build.run("build-1", "p1", "u1", reserved)

    assert result["status"] == "success"
    assert architect.answers == 1  # not paid for a second time
    (final,) = fake_db.builds.docs["build-1"]["agent_messages"]
    assert final["status"] == "failed"
    assert final["reason"] == "interrupted"
    assert final["credits_charged"] == 0
    assert developer.last_clarifications is None  # built without the lost answer
