"""Tests for the Review Board bridge (backend/agent_registry/review_board_bridge.py).

Covers the POC glue between a `ChangeRequest` reaching SECURITY_REVIEW and
the standalone `orchestrator/` microservice: repo-snapshot materialization
from the project's latest Build, the (mocked) HTTP call to `POST /reviews`
and the polling `GET /reviews/{run_id}`, the resulting TeamChat FINDING
message, and that failures at every stage are swallowed without raising and
never leak the temp snapshot directory. No real network calls are made --
`httpx.AsyncClient` is monkeypatched with an in-process fake.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from datetime import datetime, timezone

import pytest

import agent_registry.review_board_bridge as bridge_module
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (same shape as test_pr_workflow.py/test_team_chat.py)
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
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "to_agent_ids":
            if v not in (doc.get(k) or []):
                return False
            continue
        if doc.get(k) != v:
            return False
    return True


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
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()
        self.team_messages = FakeCollection()
        self.builds = FakeCollection()
        self.build_files = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _seed_build(db, project_id, build_id, files, created_at=None):
    created_at = created_at or datetime.now(timezone.utc).isoformat()
    db.builds.docs.append(
        {
            "id": build_id,
            "project_id": project_id,
            "user_id": "u1",
            "prompt": "build it",
            "created_at": created_at,
        }
    )
    for i, (path, content) in enumerate(files):
        db.build_files.docs.append(
            {
                "id": f"bf_{build_id}_{i}",
                "build_id": build_id,
                "path": path,
                "content": content,
                "created_at": created_at,
            }
        )


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(bridge_module, "get_db", _get_db)


# --------------------------------------------------------------------------- #
# Fake httpx.AsyncClient
# --------------------------------------------------------------------------- #


class FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self._json = json_data or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._json


class FakeAsyncClient:
    """Swapped in for httpx.AsyncClient. post_handler/get_handler are set as
    class attributes per-test (both _start_review and _poll_until_terminal
    instantiate their own client, so state must be shared, not per-instance)."""

    post_handler = None
    get_handler = None
    post_calls: list = []
    get_calls: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None):
        FakeAsyncClient.post_calls.append((url, json))
        return FakeAsyncClient.post_handler(url, json)

    async def get(self, url):
        FakeAsyncClient.get_calls.append(url)
        return FakeAsyncClient.get_handler(url)


def _patch_httpx(monkeypatch, *, post_handler=None, get_handler=None):
    FakeAsyncClient.post_handler = post_handler
    FakeAsyncClient.get_handler = get_handler
    FakeAsyncClient.post_calls = []
    FakeAsyncClient.get_calls = []
    monkeypatch.setattr(bridge_module.httpx, "AsyncClient", FakeAsyncClient)


def _capture_background_tasks(monkeypatch):
    """asyncio.create_task fires the polling task in the background; capture
    it so tests can await it deterministically instead of racing a real
    event loop scheduling gap."""
    created: list = []
    orig_create_task = asyncio.create_task

    def _capture(coro, *args, **kwargs):
        task = orig_create_task(coro, *args, **kwargs)
        created.append(task)
        return task

    monkeypatch.setattr(bridge_module.asyncio, "create_task", _capture)
    return created


def _spy_rmtree(monkeypatch):
    cleaned: list = []
    orig_rmtree = shutil.rmtree

    def _spy(path, ignore_errors=False):
        cleaned.append(path)
        orig_rmtree(path, ignore_errors=ignore_errors)

    monkeypatch.setattr(bridge_module.shutil, "rmtree", _spy)
    return cleaned


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_no_build_yet_is_a_noop(monkeypatch):
    db = FakeDB()
    _patch_db(monkeypatch, db)
    calls = []
    _patch_httpx(monkeypatch, post_handler=lambda *a: calls.append(1) or FakeResponse())
    tasks = _capture_background_tasks(monkeypatch)

    await bridge_module.trigger_security_review("proj1", "cr1")

    assert calls == []
    assert tasks == []
    assert db.team_messages.docs == []


@pytest.mark.asyncio
async def test_successful_review_posts_finding_and_cleans_up(monkeypatch):
    db = FakeDB()
    _patch_db(monkeypatch, db)
    _seed_build(db, "proj1", "build1", [("app/main.py", "print('hello')")])
    cleaned = _spy_rmtree(monkeypatch)

    seen_repo_paths = []

    def _post(url, json_body):
        assert url.endswith("/reviews")
        assert json_body["mode"] == "full"
        seen_repo_paths.append(json_body["repo_path"])
        # The materialized snapshot must actually exist on disk at POST time.
        assert os.path.isfile(os.path.join(json_body["repo_path"], "app", "main.py"))
        return FakeResponse(202, {"run_id": "run-123"})

    def _get(url):
        assert url.endswith("/reviews/run-123")
        return FakeResponse(
            200,
            {
                "run_id": "run-123",
                "status": "complete",
                "consolidated": {
                    "recommendation": "GO_WITH_FIXES",
                    "summary": "Found 2 medium-severity issues.",
                },
            },
        )

    _patch_httpx(monkeypatch, post_handler=_post, get_handler=_get)
    tasks = _capture_background_tasks(monkeypatch)

    await bridge_module.trigger_security_review("proj1", "cr1")
    assert len(tasks) == 1
    await asyncio.gather(*tasks)

    messages = [m for m in db.team_messages.docs if m["message_type"] == "finding"]
    assert len(messages) == 1
    msg = messages[0]
    assert "GO_WITH_FIXES" in msg["content"]
    assert "run-123" in msg["content"]
    assert "Found 2 medium-severity issues." in msg["content"]
    assert msg["context"]["change_request_id"] == "cr1"
    assert msg["context"]["orchestrator_run_id"] == "run-123"

    # Poster must be a real, registered agent (the security_engineer role),
    # never a synthetic/free-floating id.
    poster = next(a for a in db.agent_profiles.docs if a["id"] == msg["from_agent_id"])
    assert poster["role"] == "security_engineer"

    # The temp snapshot directory was cleaned up, not leaked.
    assert cleaned == seen_repo_paths
    assert not os.path.exists(seen_repo_paths[0])


@pytest.mark.asyncio
async def test_orchestrator_unreachable_swallows_error_and_cleans_up(monkeypatch):
    db = FakeDB()
    _patch_db(monkeypatch, db)
    _seed_build(db, "proj1", "build1", [("app/main.py", "print('hello')")])
    cleaned = _spy_rmtree(monkeypatch)

    def _post(url, json_body):
        raise RuntimeError("connection refused")

    _patch_httpx(monkeypatch, post_handler=_post, get_handler=lambda *a: FakeResponse())
    tasks = _capture_background_tasks(monkeypatch)

    # Must not raise.
    await bridge_module.trigger_security_review("proj1", "cr1")

    assert tasks == []  # never got far enough to start polling
    assert db.team_messages.docs == []
    assert len(cleaned) == 1
    assert not os.path.exists(cleaned[0])


@pytest.mark.asyncio
async def test_orchestrator_error_status_posts_graceful_finding(monkeypatch):
    """A run that reaches a terminal 'failed' status (e.g. every agent
    errored, or the consolidator call itself failed) is still reported back
    as a FINDING -- with an explanation, not a crash and not silence."""
    db = FakeDB()
    _patch_db(monkeypatch, db)
    _seed_build(db, "proj1", "build1", [("app/main.py", "print('hello')")])
    cleaned = _spy_rmtree(monkeypatch)

    def _post(url, json_body):
        return FakeResponse(202, {"run_id": "run-err"})

    def _get(url):
        return FakeResponse(200, {"run_id": "run-err", "status": "failed", "error": "all agents errored"})

    _patch_httpx(monkeypatch, post_handler=_post, get_handler=_get)
    tasks = _capture_background_tasks(monkeypatch)

    await bridge_module.trigger_security_review("proj1", "cr1")
    await asyncio.gather(*tasks)

    messages = [m for m in db.team_messages.docs if m["message_type"] == "finding"]
    assert len(messages) == 1
    assert "did not produce a usable result" in messages[0]["content"]
    assert "all agents errored" in messages[0]["content"]

    assert len(cleaned) == 1
    assert not os.path.exists(cleaned[0])


@pytest.mark.asyncio
async def test_post_error_status_swallowed_no_run_started(monkeypatch):
    """POST /reviews itself returning an HTTP error status is handled the
    same as a network failure -- no exception, no background task, cleaned
    up snapshot."""
    db = FakeDB()
    _patch_db(monkeypatch, db)
    _seed_build(db, "proj1", "build1", [("app/main.py", "x = 1")])
    cleaned = _spy_rmtree(monkeypatch)

    _patch_httpx(monkeypatch, post_handler=lambda *a: FakeResponse(500, {}))
    tasks = _capture_background_tasks(monkeypatch)

    await bridge_module.trigger_security_review("proj1", "cr1")

    assert tasks == []
    assert db.team_messages.docs == []
    assert len(cleaned) == 1
    assert not os.path.exists(cleaned[0])


@pytest.mark.asyncio
async def test_reviewer_agent_reused_across_runs(monkeypatch):
    """The same security_engineer AgentProfile should be reused (not
    recreated) across multiple triggered reviews for the same project."""
    db = FakeDB()
    _patch_db(monkeypatch, db)
    _seed_build(db, "proj1", "build1", [("a.py", "1")])

    def _post(url, json_body):
        return FakeResponse(202, {"run_id": "r1"})

    def _get(url):
        return FakeResponse(200, {"status": "complete", "consolidated": {"recommendation": "GO", "summary": "ok"}})

    _patch_httpx(monkeypatch, post_handler=_post, get_handler=_get)
    tasks = _capture_background_tasks(monkeypatch)

    await bridge_module.trigger_security_review("proj1", "cr1")
    await bridge_module.trigger_security_review("proj1", "cr2")
    await asyncio.gather(*tasks)

    security_agents = [a for a in db.agent_profiles.docs if a["project_id"] == "proj1" and a["role"] == "security_engineer"]
    assert len(security_agents) == 1

    findings = [m for m in db.team_messages.docs if m["message_type"] == "finding"]
    assert len(findings) == 2
    assert {f["from_agent_id"] for f in findings} == {security_agents[0]["id"]}


# --------------------------------------------------------------------------- #
# _launch_poll_and_post: the synchronous launcher trigger_security_review
# uses to kick off `_poll_and_post` in the background. asyncio.create_task()
# only holds a WEAK reference via the event loop's own bookkeeping -- a task
# with no other strong reference "may be garbage collected at any time, even
# before it's done" (stdlib docs). _launch_poll_and_post must hold a real
# reference for the task's full lifetime and release it once done, not leak
# it forever.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_launch_poll_and_post_retains_and_releases_task_reference(monkeypatch):
    async def _slow_noop(*a, **kw):
        await asyncio.sleep(0)

    monkeypatch.setattr(bridge_module, "_poll_and_post", _slow_noop)

    # Snapshot rather than assume `_inflight_tasks` starts empty -- it's
    # process-wide module state shared with every other test that exercises
    # this module in the same pytest run, so a delta comparison is the only
    # order-independent way to assert on it.
    before = set(bridge_module._inflight_tasks)

    bridge_module._launch_poll_and_post(
        "proj1", "cr1", "run-1", "/tmp/does-not-matter", "http://orchestrator"
    )
    # The task must be retained immediately after launch, before it's had
    # any chance to run (this is exactly the window where an unretained task
    # could vanish under GC).
    new_tasks = bridge_module._inflight_tasks - before
    assert len(new_tasks) == 1
    task = next(iter(new_tasks))

    await task  # let it actually run to completion
    await asyncio.sleep(0)  # yield once so the done-callback (call_soon) actually fires

    # Its own done-callback must have removed it -- back to baseline, not
    # "however many were there when this test happened to run."
    assert bridge_module._inflight_tasks == before
