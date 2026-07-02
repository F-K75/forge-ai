"""Integration tests for the token-in-first-message WebSocket auth handshake (P1-002)."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.builds import router as builds_router


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None


class FakeDB:
    def __init__(self, users=None, builds=None, projects=None, team_members=None):
        self.users = FakeCollection(users or [])
        self.builds = FakeCollection(builds or [])
        self.projects = FakeCollection(projects or [])
        self.team_members = FakeCollection(team_members or [])


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(builds_router)
    return TestClient(app)


def _patch_db(monkeypatch, users=None, builds=None):
    fake_db = FakeDB(users=users, builds=builds)

    async def _get_db():
        return fake_db

    monkeypatch.setattr("services.ws_manager.get_db", _get_db)
    return fake_db


def _patch_tokens(monkeypatch, tokens: dict):
    monkeypatch.setattr("services.ws_manager.decode_token", lambda token: tokens.get(token))


USER = {"id": "user-1", "email": "u@example.com", "name": "U", "plan": "free", "credits": 10}
BUILD = {"id": "build-1", "user_id": "user-1", "project_id": "proj-1"}


def test_ws_accepts_valid_token_and_owned_build(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "access"}})

    with client.websocket_connect("/builds/ws/build-1") as ws:
        ws.send_text(json.dumps({"type": "auth", "token": "good-token"}))
        # Connection stays open and the server's receive loop tolerates arbitrary
        # follow-up messages (e.g. client heartbeat pings).
        ws.send_text("ping")


def test_ws_accepts_short_lived_ws_token_type(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"ws-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/builds/ws/build-1") as ws:
        ws.send_text(json.dumps({"type": "auth", "token": "ws-token"}))
        ws.send_text("ping")


def test_ws_rejects_invalid_token(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {})  # no token decodes successfully

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "bad-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_rejects_wrong_token_type(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"refresh-token": {"sub": "user-1", "type": "refresh"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "refresh-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_rejects_foreign_build(client, monkeypatch):
    other_build = {"id": "build-1", "user_id": "someone-else", "project_id": "proj-1"}
    _patch_db(monkeypatch, users=[USER], builds=[other_build])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "access"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            ws.send_text(json.dumps({"type": "auth", "token": "good-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_rejects_non_auth_first_message(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"good-token": {"sub": "user-1", "type": "access"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            ws.send_text(json.dumps({"type": "ping", "token": "good-token"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_rejects_missing_token_field(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            ws.send_text(json.dumps({"type": "auth"}))
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_ws_auth_timeout_closes_connection(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {})
    monkeypatch.setattr("services.ws_manager.WS_AUTH_TIMEOUT_SECONDS", 0.2)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1") as ws:
            # Never send anything; server should close us out after the timeout.
            ws.receive_text()
    assert exc_info.value.code == 4001


def test_no_query_param_token_path_remains():
    """Guards against regressing back to the deprecated ?token= query-string auth path."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "api" / "builds.py").read_text()
    assert "token: str = Query" not in src
    assert "authenticate_websocket(websocket, build_id=build_id)" in src


def test_frontend_uses_token_in_first_message_handshake():
    """Guards against the frontend regressing to the deprecated query-string token pattern."""
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "hooks"
        / "useBuildSocket.ts"
    ).read_text()
    assert "?token=" not in src
    assert "api.post('/auth/ws-token')" in src
    assert '"type": \'auth\'' in src or "type: 'auth'" in src
