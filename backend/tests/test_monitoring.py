"""Tests for Repository Monitoring (backend/agent_registry/monitoring.py).

Covers the intake/triage/auto-escalation layer against an in-memory fake
Mongo -- recording findings, auto-escalation for HIGH/CRITICAL severity
(routing + change request + escalation chat message), filtering, and
resolution -- plus the API endpoints on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.monitoring import (
    FindingCategory,
    FindingNotFound,
    FindingSeverity,
    FindingStatus,
    MonitoringRepository,
    RepositoryMonitor,
)
from agent_registry.ownership import CodeOwnership
from agent_registry.pr_workflow import PRWorkflow, PRWorkflowRepository
from agent_registry.registry import AgentNotFound, AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import TaskRouter
from agent_registry.team_chat import TeamChat, TeamChatRepository
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
        self.change_requests = FakeCollection()
        self.monitoring_findings = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_monitor(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.monitoring as monitoring_module
    import agent_registry.pr_workflow as pr_module
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(monitoring_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    ownership = CodeOwnership(registry=registry)
    chat = TeamChat(registry=registry, repo=TeamChatRepository())
    workflow = PRWorkflow(registry=registry, ownership=ownership, chat=chat, repo=PRWorkflowRepository())
    router = TaskRouter(registry=registry)
    monitor = RepositoryMonitor(
        registry=registry,
        router=router,
        ownership=ownership,
        chat=chat,
        workflow=workflow,
        repo=MonitoringRepository(),
    )
    return monitor, registry, chat, workflow, db


# --------------------------------------------------------------------------- #
# record_finding() / auto-escalation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_low_severity_finding_does_not_auto_escalate(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.DEAD_CODE, FindingSeverity.LOW, "Unused helper function"
    )

    assert finding.change_request_id is None
    changes = await workflow.list_for_project("proj1")
    assert changes == []
    messages = await chat.list_messages("proj1")
    assert not any(m.message_type.value == "escalation" for m in messages)


@pytest.mark.asyncio
async def test_high_severity_finding_auto_escalates(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.CI_FAILURE, FindingSeverity.HIGH,
        "CI pipeline broken", description="Build fails on main due to a flaky test",
    )

    assert finding.change_request_id is not None
    changes = await workflow.list_for_project("proj1")
    assert len(changes) == 1
    assert changes[0].id == finding.change_request_id
    assert changes[0].title == "[high] CI pipeline broken"

    messages = await chat.list_messages("proj1")
    escalations = [m for m in messages if m.message_type.value == "escalation"]
    assert len(escalations) == 1
    assert escalations[0].context["finding_id"] == finding.id
    assert escalations[0].context["category"] == "ci_failure"


@pytest.mark.asyncio
async def test_critical_severity_finding_auto_escalates(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.SECURITY, FindingSeverity.CRITICAL, "SQL injection found"
    )

    assert finding.change_request_id is not None
    changes = await workflow.list_for_project("proj1")
    assert len(changes) == 1


@pytest.mark.asyncio
async def test_record_and_resolve_succeed_even_when_org_event_emission_unavailable(monkeypatch):
    """record_finding()/resolve() each emit a best-effort OrgEvent
    (FINDING_RECORDED/FINDING_RESOLVED) after saving.
    services.org_ws_manager.get_db/get_redis are deliberately left unpatched
    here (no real Redis is reachable in this environment) to prove the
    try/except around each emission actually protects the caller."""
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.DEAD_CODE, FindingSeverity.LOW, "Unused helper function"
    )
    assert finding.status == FindingStatus.OPEN

    resolved = await monitor.resolve("proj1", finding.id, resolved_by_agent_id=dev.id)
    assert resolved.status == FindingStatus.RESOLVED


@pytest.mark.asyncio
async def test_auto_escalate_false_suppresses_escalation(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.SECURITY, FindingSeverity.CRITICAL, "SQL injection found",
        auto_escalate=False,
    )

    assert finding.change_request_id is None
    changes = await workflow.list_for_project("proj1")
    assert changes == []
    messages = await chat.list_messages("proj1")
    assert not any(m.message_type.value == "escalation" for m in messages)


# --------------------------------------------------------------------------- #
# list_findings()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_findings_filters_by_status_and_category(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    f1 = await monitor.record_finding("proj1", FindingCategory.CI_FAILURE, FindingSeverity.LOW, "Build flaky")
    f2 = await monitor.record_finding("proj1", FindingCategory.SECURITY, FindingSeverity.LOW, "Minor XSS")
    f3 = await monitor.record_finding("proj1", FindingCategory.CI_FAILURE, FindingSeverity.LOW, "Build timeout")

    await monitor.resolve("proj1", f2.id, resolved_by_agent_id=dev.id)

    ci_findings = await monitor.list_findings("proj1", category=FindingCategory.CI_FAILURE)
    assert {f.id for f in ci_findings} == {f1.id, f3.id}

    resolved = await monitor.list_findings("proj1", status=FindingStatus.RESOLVED)
    assert [f.id for f in resolved] == [f2.id]

    open_findings = await monitor.list_findings("proj1", status=FindingStatus.OPEN)
    assert {f.id for f in open_findings} == {f1.id, f3.id}


# --------------------------------------------------------------------------- #
# resolve()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_resolve_sets_status_and_metadata(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.TEST_FAILURE, FindingSeverity.LOW, "Flaky test in suite"
    )

    resolved = await monitor.resolve("proj1", finding.id, resolved_by_agent_id=dev.id)

    assert resolved.status == FindingStatus.RESOLVED
    assert resolved.resolved_at is not None
    assert resolved.resolved_by_agent_id == dev.id


@pytest.mark.asyncio
async def test_resolve_unknown_finding_raises(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(FindingNotFound):
        await monitor.resolve("proj1", "does-not-exist", resolved_by_agent_id=dev.id)


@pytest.mark.asyncio
async def test_resolve_unknown_agent_raises(monkeypatch):
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.TEST_FAILURE, FindingSeverity.LOW, "Flaky test in suite"
    )

    with pytest.raises(AgentNotFound):
        await monitor.resolve("proj1", finding.id, resolved_by_agent_id="does-not-exist")


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.monitoring as monitoring_module
    import agent_registry.pr_workflow as pr_module
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module
    import api.agent_registry as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(monitoring_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_record_finding_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post(
        "/projects/proj1/org/monitoring/findings",
        json={
            "category": "ci_failure",
            "severity": "high",
            "title": "CI pipeline broken",
            "description": "Build fails on main",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "open"
    assert body["change_request_id"] is not None


def test_list_findings_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    client.post(
        "/projects/proj1/org/monitoring/findings",
        json={"category": "dead_code", "severity": "low", "title": "Unused function"},
    )
    client.post(
        "/projects/proj1/org/monitoring/findings",
        json={"category": "security", "severity": "low", "title": "Minor XSS"},
    )

    r = client.get("/projects/proj1/org/monitoring/findings", params={"category": "dead_code"})
    assert r.status_code == 200
    findings = r.json()["findings"]
    assert len(findings) == 1
    assert findings[0]["category"] == "dead_code"


def test_resolve_finding_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    finding = client.post(
        "/projects/proj1/org/monitoring/findings",
        json={"category": "dead_code", "severity": "low", "title": "Unused function"},
    ).json()

    r = client.post(
        f"/projects/proj1/org/monitoring/findings/{finding['id']}/resolve",
        json={"resolved_by_agent_id": dev["id"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "resolved"
    assert body["resolved_by_agent_id"] == dev["id"]


def test_resolve_finding_endpoint_unknown_finding_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]

    r = client.post(
        "/projects/proj1/org/monitoring/findings/does-not-exist/resolve",
        json={"resolved_by_agent_id": dev["id"]},
    )
    assert r.status_code == 404


def test_resolve_finding_endpoint_unknown_agent_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    finding = client.post(
        "/projects/proj1/org/monitoring/findings",
        json={"category": "dead_code", "severity": "low", "title": "Unused function"},
    ).json()

    r = client.post(
        f"/projects/proj1/org/monitoring/findings/{finding['id']}/resolve",
        json={"resolved_by_agent_id": "does-not-exist"},
    )
    assert r.status_code == 404


def test_monitoring_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org/monitoring/findings")
    assert r.status_code == 404

    r2 = client.post(
        "/projects/proj1/org/monitoring/findings",
        json={"category": "dead_code", "severity": "low", "title": "Unused function"},
    )
    assert r2.status_code == 404

    r3 = client.post(
        "/projects/proj1/org/monitoring/findings/some-id/resolve",
        json={"resolved_by_agent_id": "some-agent"},
    )
    assert r3.status_code == 404
