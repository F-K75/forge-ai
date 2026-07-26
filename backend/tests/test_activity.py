"""Tests for the Activity Timeline (backend/agent_registry/activity.py).

Covers the read-time aggregation over agent_profiles.decision_log,
change_requests.history, plans, monitoring_findings, and team_messages
against an in-memory fake Mongo, plus the read-only API endpoint on top of
it.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.activity import ActivityService
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in
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


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        matched = [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()
        self.change_requests = FakeCollection()
        self.plans = FakeCollection()
        self.monitoring_findings = FakeCollection()
        self.team_messages = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_activity(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.activity as activity_module
    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(activity_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    return ActivityService(registry=registry), registry, db


# --------------------------------------------------------------------------- #
# agent_profiles.decision_log
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_promotion_entry_has_readable_summary(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "react_engineer")
    for _ in range(10):
        await registry.record_task_result("proj1", dev.id, success=True)

    timeline = await service.get_timeline("proj1")

    promotions = [e for e in timeline if e.type == "agent_promoted"]
    assert len(promotions) == 1
    entry = promotions[0]
    assert entry.actor_agent_id == dev.id
    assert "junior" in entry.summary
    assert "mid" in entry.summary
    assert dev.display_name in entry.summary


@pytest.mark.asyncio
async def test_retirement_entry_appears(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "rust_engineer")
    await registry.retire("proj1", dev.id, reason="no longer needed")

    timeline = await service.get_timeline("proj1")

    retirements = [e for e in timeline if e.type == "agent_retired"]
    assert len(retirements) == 1
    assert retirements[0].actor_agent_id == dev.id
    assert dev.display_name in retirements[0].summary
    assert "no longer needed" in retirements[0].summary


# --------------------------------------------------------------------------- #
# change_requests.history
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_change_request_transition_appears(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append({
        "id": "cr-1",
        "project_id": "proj1",
        "title": "Add login endpoint",
        "description": "",
        "author_agent_id": author.id,
        "changed_paths": [],
        "plan_id": None,
        "stage": "implementing",
        "suggested_reviewer_ids": [],
        "pending_reviewer_ids": [],
        "reviews": [],
        "history": [
            {
                "from_stage": None, "to_stage": "planning", "actor_agent_id": author.id,
                "note": "opened", "at": "2026-07-20T00:00:00Z",
            },
            {
                "from_stage": "planning", "to_stage": "implementing", "actor_agent_id": author.id,
                "note": "", "at": "2026-07-21T00:00:00Z",
            },
        ],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-21T00:00:00Z",
    })

    timeline = await service.get_timeline("proj1")

    transitions = [e for e in timeline if e.type == "change_request_transition"]
    assert len(transitions) == 2
    opened = next(e for e in transitions if e.at == "2026-07-20T00:00:00Z")
    assert "opened" in opened.summary
    assert opened.context == {"change_request_id": "cr-1"}
    assert opened.actor_agent_id == author.id
    moved = next(e for e in transitions if e.at == "2026-07-21T00:00:00Z")
    assert "planning" in moved.summary and "implementing" in moved.summary
    assert moved.actor_agent_id == author.id


# --------------------------------------------------------------------------- #
# plans
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_plan_created_and_decided_entries_appear(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    approver, _ = await registry.get_or_create_agent("proj1", "cto")

    db.plans.docs.append({
        "id": "plan-1",
        "project_id": "proj1",
        "objective": "Ship the activity timeline",
        "status": "approved",
        "tasks": [],
        "affected_paths": [],
        "risk_level": "low",
        "risk_notes": "",
        "rollback_strategy": "",
        "success_metrics": [],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-21T00:00:00Z",
        "approved_by_agent_id": approver.id,
        "decided_at": "2026-07-21T00:00:00Z",
    })

    timeline = await service.get_timeline("proj1")

    created = [e for e in timeline if e.type == "plan_created"]
    decided = [e for e in timeline if e.type == "plan_decided"]
    assert len(created) == 1
    assert len(decided) == 1
    assert created[0].at == "2026-07-20T00:00:00Z"
    assert decided[0].at == "2026-07-21T00:00:00Z"
    assert decided[0].actor_agent_id == approver.id
    assert "approved" in decided[0].summary


@pytest.mark.asyncio
async def test_undecided_plan_has_no_decided_entry(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")

    db.plans.docs.append({
        "id": "plan-2",
        "project_id": "proj1",
        "objective": "Draft objective",
        "status": "draft",
        "tasks": [],
        "affected_paths": [],
        "risk_level": "low",
        "risk_notes": "",
        "rollback_strategy": "",
        "success_metrics": [],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-20T00:00:00Z",
        "approved_by_agent_id": None,
        "decided_at": None,
    })

    timeline = await service.get_timeline("proj1")

    assert any(e.type == "plan_created" for e in timeline)
    assert not any(e.type == "plan_decided" for e in timeline)


# --------------------------------------------------------------------------- #
# monitoring_findings
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_finding_created_and_resolved_entries_appear(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    resolver, _ = await registry.get_or_create_agent("proj1", "developer")

    db.monitoring_findings.docs.append({
        "id": "finding-1",
        "project_id": "proj1",
        "category": "ci_failure",
        "severity": "high",
        "title": "Build pipeline broken",
        "description": "",
        "source": "ci",
        "status": "resolved",
        "change_request_id": None,
        "created_at": "2026-07-20T00:00:00Z",
        "resolved_at": "2026-07-21T00:00:00Z",
        "resolved_by_agent_id": resolver.id,
    })

    timeline = await service.get_timeline("proj1")

    recorded = [e for e in timeline if e.type == "finding_recorded"]
    resolved = [e for e in timeline if e.type == "finding_resolved"]
    assert len(recorded) == 1
    assert len(resolved) == 1
    assert recorded[0].at == "2026-07-20T00:00:00Z"
    assert resolved[0].at == "2026-07-21T00:00:00Z"
    assert resolved[0].actor_agent_id == resolver.id
    assert "Build pipeline broken" in recorded[0].summary


@pytest.mark.asyncio
async def test_unresolved_finding_has_no_resolved_entry(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")

    db.monitoring_findings.docs.append({
        "id": "finding-2",
        "project_id": "proj1",
        "category": "tech_debt",
        "severity": "low",
        "title": "Refactor legacy module",
        "description": "",
        "source": "manual",
        "status": "open",
        "change_request_id": None,
        "created_at": "2026-07-20T00:00:00Z",
        "resolved_at": None,
        "resolved_by_agent_id": None,
    })

    timeline = await service.get_timeline("proj1")

    assert any(e.type == "finding_recorded" for e in timeline)
    assert not any(e.type == "finding_resolved" for e in timeline)


# --------------------------------------------------------------------------- #
# team_messages
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_message_entry_appears(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    sender, _ = await registry.get_or_create_agent("proj1", "developer")

    db.team_messages.docs.append({
        "id": "msg-1",
        "project_id": "proj1",
        "thread_id": "thread-1",
        "reply_to_id": None,
        "message_type": "comment",
        "from_agent_id": sender.id,
        "to_agent_ids": [],
        "content": "Deployed the fix for the login bug.",
        "context": {},
        "created_at": "2026-07-20T00:00:00Z",
    })

    timeline = await service.get_timeline("proj1")

    messages = [e for e in timeline if e.type == "message_posted"]
    assert len(messages) == 1
    assert messages[0].actor_agent_id == sender.id
    assert messages[0].summary == "Deployed the fix for the login bug."


@pytest.mark.asyncio
async def test_message_summary_is_truncated(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    sender, _ = await registry.get_or_create_agent("proj1", "developer")

    long_content = "x" * 250
    db.team_messages.docs.append({
        "id": "msg-2",
        "project_id": "proj1",
        "thread_id": "thread-1",
        "reply_to_id": None,
        "message_type": "comment",
        "from_agent_id": sender.id,
        "to_agent_ids": [],
        "content": long_content,
        "context": {},
        "created_at": "2026-07-20T00:00:00Z",
    })

    timeline = await service.get_timeline("proj1")

    message = next(e for e in timeline if e.type == "message_posted")
    assert len(message.summary) < len(long_content)


# --------------------------------------------------------------------------- #
# Ordering, limit, and project scoping
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_entries_sorted_newest_first(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    sender, _ = await registry.get_or_create_agent("proj1", "developer")

    for i, at in enumerate(["2026-07-19T00:00:00Z", "2026-07-22T00:00:00Z", "2026-07-20T00:00:00Z"]):
        db.team_messages.docs.append({
            "id": f"msg-{i}",
            "project_id": "proj1",
            "thread_id": "thread-1",
            "reply_to_id": None,
            "message_type": "comment",
            "from_agent_id": sender.id,
            "to_agent_ids": [],
            "content": f"message {i}",
            "context": {},
            "created_at": at,
        })

    timeline = await service.get_timeline("proj1")

    # Any subsequence of a correctly-sorted list is itself sorted, so
    # filtering down to just these three known messages is a strong enough
    # check that the merge-and-sort actually reordered them (not just that
    # they happened to already be in insertion order).
    message_ats = [e.at for e in timeline if e.type == "message_posted"]
    assert message_ats == ["2026-07-22T00:00:00Z", "2026-07-20T00:00:00Z", "2026-07-19T00:00:00Z"]


@pytest.mark.asyncio
async def test_limit_is_respected(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    sender, _ = await registry.get_or_create_agent("proj1", "developer")

    for i in range(10):
        db.team_messages.docs.append({
            "id": f"msg-{i}",
            "project_id": "proj1",
            "thread_id": "thread-1",
            "reply_to_id": None,
            "message_type": "comment",
            "from_agent_id": sender.id,
            "to_agent_ids": [],
            "content": f"message {i}",
            "context": {},
            "created_at": f"2026-07-{10 + i:02d}T00:00:00Z",
        })

    timeline = await service.get_timeline("proj1", limit=3)
    assert len(timeline) == 3


@pytest.mark.asyncio
async def test_timeline_is_project_scoped(monkeypatch):
    service, registry, db = _patched_activity(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    dev1, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append({
        "id": "cr-proj1",
        "project_id": "proj1",
        "title": "Proj1-only change",
        "description": "",
        "author_agent_id": dev1.id,
        "changed_paths": [],
        "plan_id": None,
        "stage": "planning",
        "suggested_reviewer_ids": [],
        "pending_reviewer_ids": [],
        "reviews": [],
        "history": [
            {
                "from_stage": None, "to_stage": "planning", "actor_agent_id": dev1.id,
                "note": "opened", "at": "2026-07-20T00:00:00Z",
            },
        ],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-20T00:00:00Z",
    })
    db.team_messages.docs.append({
        "id": "msg-proj1",
        "project_id": "proj1",
        "thread_id": "thread-1",
        "reply_to_id": None,
        "message_type": "comment",
        "from_agent_id": dev1.id,
        "to_agent_ids": [],
        "content": "Proj1-only message",
        "context": {},
        "created_at": "2026-07-20T00:00:00Z",
    })

    timeline2 = await service.get_timeline("proj2")
    assert not any(e.type == "change_request_transition" for e in timeline2)
    assert not any(e.type == "message_posted" for e in timeline2)

    timeline1 = await service.get_timeline("proj1")
    assert any(e.type == "change_request_transition" for e in timeline1)
    assert any(e.type == "message_posted" for e in timeline1)


# --------------------------------------------------------------------------- #
# API endpoint
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.activity as activity_module
    import agent_registry.repository as repo_module
    import api.activity as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(activity_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def _create_agent(db, project_id, role="developer"):
    """Seed an agent directly via the registry (no agent-registry router
    mounted in these tests) so the seeded chat message has a valid sender."""
    import agent_registry.repository as repo_module

    async def _get_db():
        return db

    orig = repo_module.get_db
    repo_module.get_db = _get_db
    try:
        registry = AgentRegistry(repo=AgentRegistryRepository())
        # asyncio.run() always creates and cleanly tears down its own fresh
        # event loop, unlike asyncio.get_event_loop() -- which, called from
        # sync code with no loop already set on this thread, raises "There is
        # no current event loop" whenever it runs after another test has
        # already closed out its own loop.
        agent, _ = asyncio.run(registry.get_or_create_agent(project_id, role))
    finally:
        repo_module.get_db = orig
    return agent


def test_activity_endpoint_returns_entries(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    dev = _create_agent(db, "proj1")

    db.team_messages.docs.append({
        "id": "msg-1",
        "project_id": "proj1",
        "thread_id": "thread-1",
        "reply_to_id": None,
        "message_type": "comment",
        "from_agent_id": dev.id,
        "to_agent_ids": [],
        "content": "Shipped the activity endpoint.",
        "context": {},
        "created_at": "2026-07-20T00:00:00Z",
    })

    client = _client_for(monkeypatch, db, user)
    r = client.get("/projects/proj1/activity")
    assert r.status_code == 200, r.text
    entries = r.json()["entries"]
    assert any(e["type"] == "message_posted" for e in entries)


def test_activity_endpoint_respects_limit_query_param(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    dev = _create_agent(db, "proj1")

    for i in range(5):
        db.team_messages.docs.append({
            "id": f"msg-{i}",
            "project_id": "proj1",
            "thread_id": "thread-1",
            "reply_to_id": None,
            "message_type": "comment",
            "from_agent_id": dev.id,
            "to_agent_ids": [],
            "content": f"message {i}",
            "context": {},
            "created_at": f"2026-07-{10 + i:02d}T00:00:00Z",
        })

    client = _client_for(monkeypatch, db, user)
    r = client.get("/projects/proj1/activity?limit=2")
    assert r.status_code == 200, r.text
    assert len(r.json()["entries"]) == 2


def test_activity_endpoint_denies_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/activity")
    assert r.status_code == 404
