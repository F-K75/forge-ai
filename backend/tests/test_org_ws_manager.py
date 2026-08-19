"""Tests for the project-scoped real-time push WebSocket layer
(backend/services/org_ws_manager.py and its `@router.websocket("/ws")` route
in backend/api/agent_registry.py).

Mirrors tests/test_websocket_auth.py's fake-DB/token-patching approach for
the auth handshake, and tests/test_ws_pubsub_bridge.py's philosophy of
exercising the real ConnectionManager-style code (here OrgConnectionManager)
rather than a hand-rolled stand-in. Delivery is verified through a real
`TestClient.websocket_connect` session -- since the ASGI app's websocket
connection runs on its own `anyio` blocking-portal thread, `emit()` calls
made from the test are scheduled onto that same thread via `ws.portal.call`
so they run on the loop that actually owns the connection.
"""

from __future__ import annotations

import json

import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from agent_registry.ws_events import OrgEvent, OrgEventType
from api.agent_registry import router as agent_registry_router
from services.org_ws_manager import org_manager


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None


class FakeDB:
    def __init__(self, users=None, projects=None, team_members=None):
        self.users = FakeCollection(users or [])
        self.projects = FakeCollection(projects or [])
        self.team_members = FakeCollection(team_members or [])


class FakeRedis:
    """Stands in for redis.asyncio.Redis so tests never need a live Redis --
    the connection-scoped delivery path (_deliver_local) doesn't touch Redis
    at all; only the fanout publish does, and that's best-effort already."""

    async def publish(self, channel, data):
        return 0


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(agent_registry_router)
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_org_manager(monkeypatch):
    """`org_manager` is a module-level singleton -- the same object the real
    route imports -- so reset its Redis handle and connection table around
    every test to keep tests from leaking state into each other."""

    async def _get_redis():
        return FakeRedis()

    monkeypatch.setattr("services.org_ws_manager.get_redis", _get_redis)
    org_manager._redis = None
    org_manager.active.clear()
    yield
    org_manager.active.clear()
    org_manager._redis = None


def _patch_db(monkeypatch, users=None, projects=None, team_members=None):
    fake_db = FakeDB(users=users, projects=projects, team_members=team_members)

    async def _get_db():
        return fake_db

    monkeypatch.setattr("services.org_ws_manager.get_db", _get_db)
    return fake_db


def _patch_tokens(monkeypatch, tokens: dict):
    monkeypatch.setattr("services.org_ws_manager.decode_token", lambda token: tokens.get(token))


async def _try_receive(receive_fn, timeout: float = 0.2):
    """Await `receive_fn()` but give up after `timeout` seconds instead of
    blocking forever -- used to prove a message was *not* delivered."""
    with anyio.move_on_after(timeout):
        return await receive_fn()
    return None


USER = {"id": "user-1", "email": "u@example.com", "name": "U", "plan": "free", "credits": 10}
PROJECT_1 = {"id": "proj-1", "user_id": "user-1", "org_id": None}
PROJECT_2 = {"id": "proj-2", "user_id": "user-1", "org_id": None}


# --------------------------------------------------------------------------- #
# ws_events.py -- trivial, covered inline rather than in a dedicated file
# --------------------------------------------------------------------------- #


def test_org_event_shape():
    event = OrgEvent(type=OrgEventType.PLAN_CREATED, project_id="proj-1", data={"plan_id": "p1"})
    assert event.type == OrgEventType.PLAN_CREATED
    assert event.project_id == "proj-1"
    assert event.data == {"plan_id": "p1"}
    assert event.timestamp.endswith("Z")


def test_org_event_default_data_is_empty_dict():
    event = OrgEvent(type=OrgEventType.MESSAGE_POSTED, project_id="proj-1")
    assert event.data == {}


# --------------------------------------------------------------------------- #
# Delivery scoping
# --------------------------------------------------------------------------- #


def test_emit_reaches_connected_client_for_same_project(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:

        event = OrgEvent(
            type=OrgEventType.MESSAGE_POSTED,
            project_id="proj-1",
            data={"message_id": "m1"},
        )
        ws.portal.call(org_manager.emit, event)

        received = json.loads(ws.receive_text())
        assert received["project_id"] == "proj-1"
        assert received["type"] == "message_posted"
        assert received["data"]["message_id"] == "m1"


def test_emit_does_not_reach_client_in_different_project(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1, PROJECT_2])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws1, \
            client.websocket_connect("/projects/proj-2/org/ws?token=good-token") as ws2:

        event = OrgEvent(
            type=OrgEventType.MESSAGE_POSTED,
            project_id="proj-1",
            data={"message_id": "m1"},
        )
        ws1.portal.call(org_manager.emit, event)

        received_by_ws1 = json.loads(ws1.receive_text())
        assert received_by_ws1["project_id"] == "proj-1"

        # ws2 watches a different project -- it must receive nothing.
        result = ws2.portal.call(_try_receive, ws2._send_rx.receive)
        assert result is None


# --------------------------------------------------------------------------- #
# Auth handshake
# --------------------------------------------------------------------------- #


def test_ws_accepts_valid_token_and_owned_project(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
        ws.send_text("ping")


def test_ws_rejects_invalid_token(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1])
    _patch_tokens(monkeypatch, {})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "bad-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_rejects_missing_token_field(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1])
    _patch_tokens(monkeypatch, {})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
            ws.send_text(json.dumps({"type": "auth"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_ignores_message_content_after_query_token_auth(client, monkeypatch):
    """Since F-024, auth happens via the `token` query param at upgrade time --
    there is no message-based handshake anymore, so the first frame is free-form
    (the server only drains frames as keepalive/backpressure)."""
    _patch_db(monkeypatch, users=[USER], projects=[PROJECT_1])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
        ws.send_text(json.dumps({"type": "ping", "token": "good-token"}))
        ws.send_text("ping")


def test_ws_rejects_project_user_does_not_own(client, monkeypatch):
    other_project = {"id": "proj-1", "user_id": "someone-else", "org_id": None}
    _patch_db(monkeypatch, users=[USER], projects=[other_project])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_accepts_org_member_who_does_not_own_the_project(client, monkeypatch):
    org_project = {"id": "proj-1", "user_id": "owner", "org_id": "org-1"}
    member = {"org_id": "org-1", "user_id": "user-1", "role": "developer"}
    _patch_db(monkeypatch, users=[USER], projects=[org_project], team_members=[member])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/projects/proj-1/org/ws?token=good-token") as ws:
        ws.send_text("ping")
