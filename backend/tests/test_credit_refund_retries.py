"""Regression test for a real bug in backend/tasks/build_tasks.py.

`BuildTask` is configured with `autoretry_for=(Exception,)`, which makes
Celery re-invoke `run_build`'s entire function body on every retry — not
just the part after the point of failure. The task's own `except Exception`
block refunded credits and marked the build `failed` unconditionally, so a
single build that failed and retried (Celery's own configured resilience
behavior, `max_retries=3`) got refunded up to 4 times for one reservation.

Verified live 2026-07-03: a build reserved 17 credits, failed and retried 4
times (1 original + 3 retries), and the user's balance ended up at 38 —
*higher* than the starting balance — instead of the correct 5 (17 - 17
reservation + 5 refund for the 12 credits actually used). This is a real
"free credits" exploit path: any build that reliably raises a retryable
exception farms free credits on every retry.

The fix checks `self.request.retries` against the configured `max_retries`
and only refunds / finalizes the build as `failed` on the last attempt
Celery will ever make for a given task.
"""


from core.models import utcnow

import pytest
from celery.exceptions import SoftTimeLimitExceeded

import tasks.build_tasks as build_tasks_module


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return list(self._docs)


class FakeCollection:
    def __init__(self, docs):
        self.docs = {d["id"]: d for d in docs}
        self.inc_calls = []
        self.set_calls = []
        self.inserted = []
        self.deleted_many_calls = []

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query.get("id"))
        return dict(doc) if doc else None

    def find(self, query, projection=None):
        # Only build_files uses a non-id `find` in these tests (queried by
        # build_id, not id) -- filter on whatever key is present.
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
        return None

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return None

    async def insert_many(self, docs):
        docs = list(docs)
        self.inserted.extend(docs)
        for d in docs:
            self.docs[d.get("id", len(self.docs))] = d
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
    def __init__(self, build, user):
        self.builds = FakeCollection([build])
        self.users = FakeCollection([user])
        self.build_files = FakeCollection([])
        # run_build() looks up the project's `template` field (PROD-002,
        # 2026-07-03) to pass it through to the agent pipeline; no template
        # selected in these tests, so an id-only doc is enough.
        self.projects = FakeCollection([{"id": "p1"}])
        self.build_dead_letters = FakeCollection([])


def _make_build_and_user():
    build = {
        "id": "build-1",
        "project_id": "p1",
        "user_id": "u1",
        "prompt": "x",
        "status": "pending",
        "agents": [],
        "credits_used": 0,
        "context_tokens": 0,
        "debug_iterations": 0,
        "business_model": None,
        "created_at": utcnow(),
        "completed_at": None,
    }
    user = {"id": "u1", "credits": 100}
    return build, user


def _run_one_attempt(monkeypatch, retries: int):
    # Deliberately synchronous, matching how a real Celery worker calls this
    # task: run_build.run() manages its own event loop internally (see
    # _run_async), which conflicts with an ambient event loop already
    # running in the calling thread — exactly what an `async def` test
    # would introduce via pytest-asyncio, masking the real assertions below
    # behind a spurious "another loop is running" RuntimeError instead of
    # the task's actual behavior.
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*args, **kwargs):
        raise RuntimeError("simulated transient failure")

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", failing_run_build)

    build_tasks_module.run_build.push_request(retries=retries)
    try:
        with pytest.raises(RuntimeError):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    return fake_db


def test_non_final_retry_does_not_refund_or_finalize(monkeypatch):
    """retries=0 means this is the *first* attempt with 3 retries still
    configured (max_retries=3) — Celery will try again, so nothing should be
    refunded or marked permanently failed yet.
    """
    fake_db = _run_one_attempt(monkeypatch, retries=0)

    assert fake_db.users.inc_calls == []
    assert fake_db.builds.set_calls == []


def test_final_retry_refunds_exactly_once(monkeypatch):
    """retries=3 (== max_retries) means this is the last attempt Celery will
    make — this is the only attempt that should refund and finalize.
    """
    fake_db = _run_one_attempt(monkeypatch, retries=3)

    assert len(fake_db.users.inc_calls) == 1
    assert fake_db.users.inc_calls[0] == ("u1", {"credits": 100})
    assert len(fake_db.builds.set_calls) == 1
    assert fake_db.builds.set_calls[0][1]["status"] == "failed"


def test_refund_across_all_attempts_of_a_retried_build_totals_once(monkeypatch):
    """End-to-end shape of the original bug: simulate the full attempt
    sequence a real failing build goes through (attempts 0, 1, 2, then the
    final attempt 3) and confirm the total number of refund increments
    across the whole sequence is exactly one, not one per attempt.
    """
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*args, **kwargs):
        raise RuntimeError("simulated transient failure")

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", failing_run_build)

    for retries in (0, 1, 2, 3):
        build_tasks_module.run_build.push_request(retries=retries)
        try:
            with pytest.raises(RuntimeError):
                build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
        finally:
            build_tasks_module.run_build.pop_request()

    assert len(fake_db.users.inc_calls) == 1


def test_retry_after_progress_retries_instead_of_failing_immediately(monkeypatch):
    """run_build is now resume-aware (core/orchestrator.py's
    `_try_recover_json`/`resume_ok` chain skips any agent step that already
    has a persisted SUCCESS record instead of re-running it), so a retry
    after partial progress is no longer wasteful — it resumes rather than
    restarting from scratch. A transient failure on a non-final attempt
    (retries=0, well under max_retries=3) should therefore still retry via
    self.retry(), even though build.agents already contains a success,
    exactly like the zero-progress case in
    test_non_final_retry_does_not_refund_or_finalize — nothing should be
    refunded or finalized yet.
    """
    build, user = _make_build_and_user()
    build["agents"] = [
        {
            "agent": "architect",
            "status": "success",
            "started_at": utcnow(),
            "completed_at": utcnow(),
            "output": "{}",
            "files_changed": [],
            "error": None,
        }
    ]
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*args, **kwargs):
        raise RuntimeError("simulated transient failure after architect succeeded")

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


def test_soft_time_limit_refunds_and_fails_build_without_retry(monkeypatch):
    """Regression test for BE-006: settings.build_timeout used to be dead
    config — nothing enforced it, so a hung build never got refunded or
    marked failed; it just occupied a worker slot forever. Now the task is
    decorated with soft_time_limit=settings.build_timeout, which raises
    SoftTimeLimitExceeded (a BaseException, deliberately outside
    autoretry_for=(Exception,) — a hung pipeline would only hang again) —
    verify the single attempt refunds the unused reservation and finalizes
    the build as failed rather than leaving it stuck.
    """
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def timed_out_run_build(*args, **kwargs):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", timed_out_run_build)

    build_tasks_module.run_build.push_request(retries=0)
    try:
        with pytest.raises(SoftTimeLimitExceeded):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    assert len(fake_db.users.inc_calls) == 1
    assert fake_db.users.inc_calls[0] == ("u1", {"credits": 100})
    assert len(fake_db.builds.set_calls) == 1
    assert fake_db.builds.set_calls[0][1]["status"] == "failed"


def test_soft_time_limit_logs_build_id_and_duration(monkeypatch, caplog):
    """BE-006 residual: timeout events must be logged with the build ID and
    the configured timeout duration so operators can correlate timeouts with
    specific builds in logs without cross-referencing the database.
    """
    import logging

    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def timed_out_run_build(*args, **kwargs):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", timed_out_run_build)

    build_tasks_module.run_build.push_request(retries=0)
    try:
        with caplog.at_level(logging.ERROR, logger="tasks.build_tasks"):
            with pytest.raises(SoftTimeLimitExceeded):
                build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    messages = [r.getMessage() for r in caplog.records]
    assert any("build-1" in m for m in messages), f"build_id missing from log: {messages}"
    assert any(
        str(build_tasks_module.settings.build_timeout) in m for m in messages
    ), f"timeout duration missing from log: {messages}"
