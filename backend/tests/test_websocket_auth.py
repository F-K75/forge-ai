"""Integration tests for the token-in-first-message WebSocket auth handshake (P1-002)."""

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


def test_ws_accepts_valid_ws_token_and_owned_build(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"ws-token": {"sub": "user-1", "type": "ws"}})

    with client.websocket_connect("/builds/ws/build-1?token=ws-token") as ws:
        ws.send_text("ping")


def test_ws_rejects_invalid_token(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {})  # no token decodes successfully

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1?token=bad-token"):
            pass
    assert exc_info.value.code == 4001


def test_ws_rejects_access_token_type(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"access-token": {"sub": "user-1", "type": "access"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1?token=access-token"):
            pass
    assert exc_info.value.code == 4001


def test_ws_rejects_wrong_token_type(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {"refresh-token": {"sub": "user-1", "type": "refresh"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1?token=refresh-token"):
            pass
    assert exc_info.value.code == 4001


def test_ws_rejects_foreign_build(client, monkeypatch):
    other_build = {"id": "build-1", "user_id": "someone-else", "project_id": "proj-1"}
    _patch_db(monkeypatch, users=[USER], builds=[other_build])
    _patch_tokens(monkeypatch, {"ws-token": {"sub": "user-1", "type": "ws"}})

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1?token=ws-token"):
            pass
    assert exc_info.value.code == 4001


def test_ws_auth_timeout_closes_connection(client, monkeypatch):
    _patch_db(monkeypatch, users=[USER], builds=[BUILD])
    _patch_tokens(monkeypatch, {})
    monkeypatch.setattr("services.ws_manager.WS_AUTH_TIMEOUT_SECONDS", 0.2)

    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/builds/ws/build-1?token=bad-token"):
            pass
    assert exc_info.value.code == 4001


def test_no_query_param_token_path_remains():
    """Guards against regressing back to the deprecated untyped token path."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1] / "api" / "builds.py").read_text()
    assert "authenticate_websocket_token(token, build_id=build_id)" in src


def test_frontend_uses_ws_token_for_websocket():
    """Guards against the frontend sending access tokens as WebSocket credentials."""
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "hooks"
        / "useBuildSocket.ts"
    ).read_text()
    assert "api.post('/v1/auth/ws-token')" in src


def test_org_websocket_rejects_before_accept(monkeypatch):
    """8.4: the org (agent-registry) websocket must reject an invalid token by
    closing BEFORE accepting so Starlette never upgrades the connection (F-024)."""
    from api.agent_registry import router as org_router

    async def _reject(*args, **kwargs):
        return None

    monkeypatch.setattr("services.org_ws_manager.authenticate_org_websocket_token", _reject)

    app = FastAPI()
    app.include_router(org_router)
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/projects/p/org/ws?token=bad"):
                pass
        assert exc_info.value.code == 4001


def test_pm_websocket_rejects_before_accept(monkeypatch):
    """8.4: the PM initiative websocket must reject an invalid token by closing
    BEFORE accepting so Starlette never upgrades the connection (F-024)."""
    from api.initiatives import router as pm_router

    async def _reject(*args, **kwargs):
        return None

    monkeypatch.setattr("services.pm_ws_manager.authenticate_pm_websocket_token", _reject)
    monkeypatch.setattr("api.initiatives._is_allowed_ws_origin", lambda origin: True)

    app = FastAPI()
    app.include_router(pm_router)
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/initiatives/ws/init-1?token=bad"):
                pass
        assert exc_info.value.code == 4001
