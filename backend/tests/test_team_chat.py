"""Tests for the Team Chat communication layer (backend/agent_registry/team_chat.py).

Covers the TeamChat service against an in-memory fake Mongo (posting,
threading, filtering, agent validation) and the API endpoints on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.team_chat import MessageType, TeamChat, TeamChatRepository, UnknownAgent
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
        if isinstance(v, dict) and "$in" in v:
            if doc.get(k) not in v["$in"]:
                return False
            continue
        if k == "to_agent_ids":
            # Mongo semantics: querying an array field with a scalar matches
            # if the scalar is an element of the array.
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

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_chat(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    chat = TeamChat(registry=registry, repo=TeamChatRepository())
    return chat, registry, db


# --------------------------------------------------------------------------- #
# post / list_messages
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_post_message_between_known_agents(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")

    msg = await chat.post(
        "proj1", dev.id, "Can you review this auth change?",
        message_type=MessageType.REVIEW_REQUEST, to_agent_ids=[security.id],
    )
    assert msg.from_agent_id == dev.id
    assert msg.to_agent_ids == [security.id]
    assert msg.message_type == MessageType.REVIEW_REQUEST

    messages = await chat.list_messages("proj1")
    assert len(messages) == 1
    assert messages[0].content == "Can you review this auth change?"


@pytest.mark.asyncio
async def test_post_message_unknown_sender_raises(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(UnknownAgent):
        await chat.post("proj1", "does-not-exist", "hello")


@pytest.mark.asyncio
async def test_post_message_unknown_recipient_raises(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(UnknownAgent):
        await chat.post("proj1", dev.id, "hello", to_agent_ids=["does-not-exist"])


@pytest.mark.asyncio
async def test_reply_inherits_parent_thread(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")

    root = await chat.post("proj1", dev.id, "Found a possible SQLi", message_type=MessageType.FINDING)
    reply = await chat.post(
        "proj1", security.id, "Confirmed, filing as high severity",
        message_type=MessageType.ESCALATION, reply_to_id=root.id,
    )

    assert reply.thread_id == root.thread_id
    thread = await chat.list_messages("proj1", thread_id=root.thread_id)
    assert [m.id for m in thread] == [root.id, reply.id]


@pytest.mark.asyncio
async def test_list_messages_filters_by_agent(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    security, _ = await registry.get_or_create_agent("proj1", "security_engineer")
    pm, _ = await registry.get_or_create_agent("proj1", "product_manager")

    await chat.post("proj1", dev.id, "msg1", to_agent_ids=[security.id])
    await chat.post("proj1", pm.id, "msg2", to_agent_ids=[dev.id])
    await chat.post("proj1", security.id, "msg3", to_agent_ids=[pm.id])

    dev_messages = await chat.list_messages("proj1", agent_id=dev.id)
    contents = {m.content for m in dev_messages}
    assert contents == {"msg1", "msg2"}


@pytest.mark.asyncio
async def test_messages_are_project_scoped(monkeypatch):
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    dev1, _ = await registry.get_or_create_agent("proj1", "developer")

    await chat.post("proj1", dev1.id, "only in proj1")

    proj2_messages = await chat.list_messages("proj2")
    assert proj2_messages == []


@pytest.mark.asyncio
async def test_post_succeeds_even_when_org_event_emission_unavailable(monkeypatch):
    """post() emits a best-effort OrgEvent (MESSAGE_POSTED) after saving.
    services.org_ws_manager.get_db/get_redis are deliberately left unpatched
    here (no real Redis is reachable in this environment) to prove the
    try/except around the emission actually protects the caller -- posting
    a message must still succeed even though the emission itself fails."""
    chat, registry, db = _patched_chat(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    msg = await chat.post("proj1", dev.id, "hello despite no redis")
    assert msg.content == "hello despite no redis"

    messages = await chat.list_messages("proj1")
    assert len(messages) == 1


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module
    import api.agent_registry as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_post_and_list_message_endpoints(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    security = client.post("/projects/proj1/org/agents", json={"role": "security_engineer"}).json()["agent"]

    r = client.post(
        "/projects/proj1/org/chat",
        json={
            "from_agent_id": dev["id"],
            "content": "Please review this PR",
            "message_type": "review_request",
            "to_agent_ids": [security["id"]],
        },
    )
    assert r.status_code == 200
    assert r.json()["message_type"] == "review_request"

    r2 = client.get("/projects/proj1/org/chat")
    assert r2.status_code == 200
    assert len(r2.json()["messages"]) == 1


def test_post_message_endpoint_rejects_unknown_agent(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post(
        "/projects/proj1/org/chat",
        json={"from_agent_id": "nonexistent", "content": "hi"},
    )
    assert r.status_code == 404


def test_chat_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org/chat")
    assert r.status_code == 404
