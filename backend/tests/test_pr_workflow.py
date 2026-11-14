"""Tests for the PR Workflow (backend/agent_registry/pr_workflow.py).

Covers the ChangeRequest lifecycle against an in-memory fake Mongo --
opening with auto-suggested reviewers from ownership, stage progression
rules, review request/submission, merge gating, and team-chat side effects
-- plus the API endpoints on top of it.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.ownership import CodeOwnership
from agent_registry.planning import (
    PlanningRepository,
    PlanningService,
    PlanNotFound,
    PlanStatus,
)
from agent_registry.pr_workflow import (
    ChangeRequestNotFound,
    InvalidStageTransition,
    PlanNotApproved,
    PRStage,
    PRWorkflow,
    PRWorkflowRepository,
)
from agent_registry.registry import AgentNotFound, AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import TaskRouter
from agent_registry.team_chat import TeamChat, TeamChatRepository
from core.models import User

# Matches only react_engineer (frontend) in task_router.ROLE_KEYWORDS --
# used to create real plans via PlanningService without pulling in
# unrelated departments.
PLAN_OBJECTIVE = "Rework the react dashboard component."


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
        self.plans = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_workflow(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.planning as planning_module
    import agent_registry.pr_workflow as pr_module
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(planning_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    ownership = CodeOwnership(registry=registry)
    chat = TeamChat(registry=registry, repo=TeamChatRepository())
    planning = PlanningService(registry=registry, router=TaskRouter(registry=registry), repo=PlanningRepository())
    workflow = PRWorkflow(
        registry=registry, ownership=ownership, chat=chat, repo=PRWorkflowRepository(), planning=planning
    )
    return workflow, registry, chat, db


# --------------------------------------------------------------------------- #
# open()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_open_suggests_reviewers_from_ownership(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    react, _ = await registry.get_or_create_agent("proj1", "react_engineer")

    await registry.record_task_result("proj1", react.id, success=True, files_touched=["frontend/src/App.tsx"])

    cr = await workflow.open(
        "proj1", "Refactor dashboard", dev.id,
        changed_paths=["frontend/src/App.tsx", "backend/new_file.py"],
    )
    assert cr.stage == PRStage.PLANNING
    assert cr.suggested_reviewer_ids == [react.id]
    assert cr.history[0].to_stage == "planning"


@pytest.mark.asyncio
async def test_open_adds_architect_for_architecturally_sensitive_paths(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    org = await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    cr = await workflow.open(
        "proj1", "Refactor core module", dev.id,
        changed_paths=["backend/core/database.py"],
    )
    assert org.leadership.architect_agent_id in cr.suggested_reviewer_ids


@pytest.mark.asyncio
async def test_open_does_not_add_architect_for_unrelated_paths(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    org = await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    cr = await workflow.open(
        "proj1", "Update docs", dev.id,
        changed_paths=["docs/README.md"],
    )
    assert org.leadership.architect_agent_id not in cr.suggested_reviewer_ids
    assert cr.suggested_reviewer_ids == []


@pytest.mark.asyncio
async def test_open_architect_as_author_is_not_self_added(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    org = await registry.get_or_create_org("proj1")
    architect_id = org.leadership.architect_agent_id

    cr = await workflow.open(
        "proj1", "Architect refactors core", architect_id,
        changed_paths=["backend/core/database.py"],
    )
    assert architect_id not in cr.suggested_reviewer_ids


@pytest.mark.asyncio
async def test_open_unknown_author_raises(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(AgentNotFound):
        await workflow.open("proj1", "title", "does-not-exist")


# --------------------------------------------------------------------------- #
# open() -- plan_id traceability link
# --------------------------------------------------------------------------- #


def _planning_for(registry):
    """A PlanningService sharing `registry` (and, transitively, the same
    monkeypatched FakeDB) with a `_patched_workflow`-built PRWorkflow --
    mirrors the cross-module fake wiring in test_monitoring.py/test_planning.py."""
    return PlanningService(registry=registry, router=TaskRouter(registry=registry), repo=PlanningRepository())


@pytest.mark.asyncio
async def test_open_with_approved_plan_id_succeeds_and_sets_plan_id(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    planning = _planning_for(registry)
    plan = await planning.create_plan("proj1", PLAN_OBJECTIVE)
    approved = await planning.approve("proj1", plan.id, approved_by_agent_id=dev.id)
    assert approved.status == PlanStatus.APPROVED

    cr = await workflow.open("proj1", "Add feature", dev.id, plan_id=plan.id)
    assert cr.plan_id == plan.id


@pytest.mark.asyncio
async def test_open_with_unknown_plan_id_raises_plan_not_found(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(PlanNotFound):
        await workflow.open("proj1", "Add feature", dev.id, plan_id="does-not-exist")


@pytest.mark.asyncio
async def test_open_with_draft_plan_id_raises_plan_not_approved(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    planning = _planning_for(registry)
    plan = await planning.create_plan("proj1", PLAN_OBJECTIVE)
    assert plan.status == PlanStatus.DRAFT

    with pytest.raises(PlanNotApproved):
        await workflow.open("proj1", "Add feature", dev.id, plan_id=plan.id)


@pytest.mark.asyncio
async def test_open_without_plan_id_is_unchanged(monkeypatch):
    """Regression check: omitting plan_id (the default) still opens a change
    request exactly as before this parameter existed, with plan_id left
    unset."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    cr = await workflow.open("proj1", "Add feature", dev.id)
    assert cr.plan_id is None


# --------------------------------------------------------------------------- #
# advance()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_advance_moves_forward_and_logs_history(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)

    updated = await workflow.advance(
        "proj1", cr.id, PRStage.IMPLEMENTING, dev.id, note="starting work"
    )
    assert updated.stage == PRStage.IMPLEMENTING
    assert len(updated.history) == 2
    assert updated.history[-1].from_stage == "planning"
    assert updated.history[-1].to_stage == "implementing"

    messages = await chat.list_messages("proj1")
    assert any("starting work" in m.content for m in messages)


@pytest.mark.asyncio
async def test_open_succeeds_even_when_org_event_emission_unavailable(monkeypatch):
    """open() also emits a best-effort OrgEvent (CHANGE_REQUEST_UPDATED) once
    the CR is created. Same robustness guarantee as advance()/etc.: a Redis
    hiccup must never prevent opening a change request."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    cr = await workflow.open("proj1", "title", dev.id)
    assert cr.stage == PRStage.PLANNING


@pytest.mark.asyncio
async def test_advance_succeeds_even_when_org_event_emission_unavailable(monkeypatch):
    """advance() emits a best-effort OrgEvent (CHANGE_REQUEST_UPDATED) after
    saving. services.org_ws_manager.get_db/get_redis are deliberately left
    unpatched here (no real Redis is reachable in this environment) to prove
    the try/except around the emission actually protects the caller --
    advancing a change request must still succeed even though the emission
    itself fails."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)

    updated = await workflow.advance("proj1", cr.id, PRStage.IMPLEMENTING, dev.id)
    assert updated.stage == PRStage.IMPLEMENTING


@pytest.mark.asyncio
async def test_advance_to_security_review_succeeds(monkeypatch):
    """advance() to SECURITY_REVIEW persists state and posts a TeamChat note."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)
    for stage in [PRStage.IMPLEMENTING, PRStage.SELF_REVIEW, PRStage.PEER_REVIEW, PRStage.QA]:
        await workflow.advance("proj1", cr.id, stage, dev.id)

    updated = await workflow.advance("proj1", cr.id, PRStage.SECURITY_REVIEW, dev.id, note="off to security")
    assert updated.stage == PRStage.SECURITY_REVIEW
    assert updated.history[-1].to_stage == "security_review"

    refetched = await workflow.get("proj1", cr.id)
    assert refetched.stage == PRStage.SECURITY_REVIEW

    messages = await chat.list_messages("proj1")
    assert any("off to security" in m.content for m in messages)


@pytest.mark.asyncio
async def test_advance_rejects_backward_or_sideways_moves(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)
    await workflow.advance("proj1", cr.id, PRStage.IMPLEMENTING, dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.advance("proj1", cr.id, PRStage.PLANNING, dev.id)
    with pytest.raises(InvalidStageTransition):
        await workflow.advance("proj1", cr.id, PRStage.IMPLEMENTING, dev.id)


@pytest.mark.asyncio
async def test_advance_to_rejected_allowed_from_any_stage(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)

    rejected = await workflow.advance("proj1", cr.id, PRStage.REJECTED, dev.id, note="not needed")
    assert rejected.stage == PRStage.REJECTED


@pytest.mark.asyncio
async def test_advance_terminal_stage_raises(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)
    await workflow.advance("proj1", cr.id, PRStage.REJECTED, dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.advance("proj1", cr.id, PRStage.IMPLEMENTING, dev.id)


@pytest.mark.asyncio
async def test_advance_to_merged_is_rejected_even_when_forward_progress(monkeypatch):
    """MERGED sits after APPROVED in STAGE_ORDER, so the generic
    forward-progress check in advance() would otherwise happily accept a
    jump straight to MERGED from any earlier non-terminal stage -- entirely
    bypassing merge()'s APPROVED-stage and no-pending-reviewers gates.
    advance() must refuse to reach MERGED at all; only merge() may."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.advance("proj1", cr.id, PRStage.MERGED, dev.id)

    # Unaffected: still sitting in PLANNING, not silently merged.
    refetched = await workflow.get("proj1", cr.id)
    assert refetched.stage == PRStage.PLANNING


@pytest.mark.asyncio
async def test_advance_to_merged_rejected_even_from_approved_stage(monkeypatch):
    """Same guard, but from the stage immediately before MERGED -- proves
    this isn't just a distance/skip check, advance() must never be able to
    reach MERGED, full stop; merge() is the only legal path there."""
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)
    await _advance_to_approved(workflow, "proj1", cr.id, dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.advance("proj1", cr.id, PRStage.MERGED, dev.id)

    refetched = await workflow.get("proj1", cr.id)
    assert refetched.stage == PRStage.APPROVED


@pytest.mark.asyncio
async def test_advance_unknown_change_request_raises(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(ChangeRequestNotFound):
        await workflow.advance("proj1", "does-not-exist", PRStage.IMPLEMENTING, dev.id)


# --------------------------------------------------------------------------- #
# request_review / submit_review / merge
# --------------------------------------------------------------------------- #


async def _advance_to_approved(workflow, project_id, cr_id, actor_id):
    for stage in [
        PRStage.IMPLEMENTING, PRStage.SELF_REVIEW, PRStage.PEER_REVIEW,
        PRStage.QA, PRStage.SECURITY_REVIEW, PRStage.PERFORMANCE_REVIEW, PRStage.APPROVED,
    ]:
        await workflow.advance(project_id, cr_id, stage, actor_id)


@pytest.mark.asyncio
async def test_full_review_and_merge_flow(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")

    cr = await workflow.open("proj1", "Add payment flow", dev.id)
    cr = await workflow.request_review("proj1", cr.id, dev.id, security.id)
    assert security.id in cr.pending_reviewer_ids

    cr = await workflow.submit_review("proj1", cr.id, security.id, approved=True, comment="LGTM")
    assert security.id not in cr.pending_reviewer_ids
    assert len(cr.reviews) == 1
    assert cr.reviews[0].approved is True

    await _advance_to_approved(workflow, "proj1", cr.id, dev.id)
    merged = await workflow.merge("proj1", cr.id, dev.id)
    assert merged.stage == PRStage.MERGED

    messages = await chat.list_messages("proj1")
    types = [m.message_type.value for m in messages]
    assert "review_request" in types
    assert "approval" in types


@pytest.mark.asyncio
async def test_merge_blocked_before_approved_stage(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    cr = await workflow.open("proj1", "title", dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.merge("proj1", cr.id, dev.id)


@pytest.mark.asyncio
async def test_merge_blocked_with_pending_reviewers(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")

    cr = await workflow.open("proj1", "title", dev.id)
    await workflow.request_review("proj1", cr.id, dev.id, security.id)
    await _advance_to_approved(workflow, "proj1", cr.id, dev.id)

    with pytest.raises(InvalidStageTransition):
        await workflow.merge("proj1", cr.id, dev.id)


@pytest.mark.asyncio
async def test_submit_review_rejection_posts_rejection_message(monkeypatch):
    workflow, registry, chat, db = _patched_workflow(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")
    cr = await workflow.open("proj1", "title", dev.id)

    await workflow.submit_review("proj1", cr.id, security.id, approved=False, comment="Needs work")

    messages = await chat.list_messages("proj1")
    rejection = next(m for m in messages if m.message_type.value == "rejection")
    assert rejection.content == "Needs work"
    assert rejection.to_agent_ids == [dev.id]


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.planning as planning_module
    import agent_registry.pr_workflow as pr_module
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module
    import api.agent_registry as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(planning_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_open_and_list_change_requests_endpoints(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]

    r = client.post(
        "/projects/proj1/org/changes",
        json={"title": "Add feature", "author_agent_id": dev["id"]},
    )
    assert r.status_code == 200
    assert r.json()["stage"] == "planning"

    r2 = client.get("/projects/proj1/org/changes")
    assert r2.status_code == 200
    assert len(r2.json()["changes"]) == 1


def test_open_change_request_endpoint_plan_id_404_vs_400(monkeypatch):
    """Unknown plan_id -> 404 (the plan doesn't exist); a real but
    not-yet-approved (draft) plan_id -> 400 (the plan exists but isn't in
    the right state) -- same 400-vs-404 split InvalidStageTransition/
    ChangeRequestNotFound already use elsewhere on this router."""
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]

    r_404 = client.post(
        "/projects/proj1/org/changes",
        json={"title": "Add feature", "author_agent_id": dev["id"], "plan_id": "does-not-exist"},
    )
    assert r_404.status_code == 404

    registry = AgentRegistry(repo=AgentRegistryRepository())
    planning = _planning_for(registry)
    plan = asyncio.run(planning.create_plan("proj1", PLAN_OBJECTIVE))

    r_400 = client.post(
        "/projects/proj1/org/changes",
        json={"title": "Add feature", "author_agent_id": dev["id"], "plan_id": plan.id},
    )
    assert r_400.status_code == 400


def test_advance_and_merge_endpoints(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    cr = client.post(
        "/projects/proj1/org/changes", json={"title": "Add feature", "author_agent_id": dev["id"]}
    ).json()

    for stage in ["implementing", "self_review", "peer_review", "qa", "security_review", "performance_review", "approved"]:
        r = client.post(
            f"/projects/proj1/org/changes/{cr['id']}/advance",
            json={"to_stage": stage, "actor_agent_id": dev["id"]},
        )
        assert r.status_code == 200, r.text

    r = client.post(
        f"/projects/proj1/org/changes/{cr['id']}/merge", json={"actor_agent_id": dev["id"]}
    )
    assert r.status_code == 200
    assert r.json()["stage"] == "merged"


def test_advance_endpoint_rejects_invalid_transition(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    cr = client.post(
        "/projects/proj1/org/changes", json={"title": "Add feature", "author_agent_id": dev["id"]}
    ).json()

    r = client.post(
        f"/projects/proj1/org/changes/{cr['id']}/advance",
        json={"to_stage": "planning", "actor_agent_id": dev["id"]},
    )
    assert r.status_code == 400


def test_change_request_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org/changes")
    assert r.status_code == 404
