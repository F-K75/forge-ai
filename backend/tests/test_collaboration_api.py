"""GET /builds/{build_id}/collaboration (collaboration protocol v2, §7):
the collaboration panel's hydration endpoint. Same access check as the
other build endpoints; legacy builds report protocol_version 1."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.collaboration as collaboration_module
from core import collaboration as collab
from core.config import get_settings
from core.models import AgentMessage, Build, BuildStatus, User, utcnow

settings = get_settings()


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None


class _DB:
    def __init__(self, builds, projects=(), team_members=()):
        self.builds = _Coll(list(builds))
        self.projects = _Coll(list(projects))
        self.team_members = _Coll(list(team_members))


def _client(monkeypatch, db, user_id="u1"):
    async def _get_db():
        return db

    monkeypatch.setattr(collaboration_module, "get_db", _get_db)
    app = FastAPI()
    app.include_router(collaboration_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: User(id=user_id, email="a@b.com", name="U")
    return TestClient(app)


def _legacy_doc():
    """A build stored before protocol v2: no collab fields, v1 messages."""
    return {
        "id": "b-legacy", "user_id": "u1", "project_id": "p1", "prompt": "x", "status": "success",
        "credits_used": 14,
        "agent_messages": [{
            "message_id": "m1", "conversation_id": "c1", "sender": "developer", "recipient": "architect",
            "message_type": "clarification", "question": "q?", "answer": "a", "status": "answered",
            "credits_charged": 1, "delivery_attempts": 1, "created_at": utcnow(),
        }, {
            "message_id": "m2", "conversation_id": "c1", "sender": "developer", "recipient": "architect",
            "message_type": "clarification", "question": "q2?", "status": "rejected", "reason": "budget_exhausted",
            "created_at": utcnow(),
        }],
    }


def _v2_doc():
    build = Build(id="b-v2", project_id="p1", user_id="u1", prompt="x", status=BuildStatus.RUNNING, credits_used=15)
    build.collab_config = collab.build_collab_snapshot(settings, 40)
    message = AgentMessage(
        conversation_id="c", sender="developer", recipient="designer", question="Empty state?",
        answer="Show a hint", status="answered", credits_charged=1, protocol_version=2,
    )
    build.agent_messages.append(message)
    entry = collab.add_entry(build, "ui.empty_state", "Show a hint", "designer", source_message_id=message.message_id)
    collab.open_escalation(build, "developer", "designer", "Conflict", "detail", ["Show a hint", "Show nothing"],
                           conflict={"key": "ui.empty_state", "existing_value": "Show a hint",
                                     "proposed_value": "Show nothing", "existing_entry_id": entry.entry_id})
    return build.model_dump()


def test_legacy_build_reports_protocol_v1_with_messages(monkeypatch):
    client = _client(monkeypatch, _DB([_legacy_doc()]))
    for path in ("/v1/builds/b-legacy/collaboration", "/builds/b-legacy/collaboration"):
        r = client.get(path)
        assert r.status_code == 200
        body = r.json()
        assert body["protocol_version"] == 1
        assert body["decisions"] == [] and body["escalations"] == []
        assert [(m["message_id"], m["status"], m["state"]) for m in body["messages"]] == [
            ("m1", "answered", "completed"), ("m2", "rejected", "rejected"),
        ]
        assert body["messages"][0]["question"] == "q?" and body["messages"][0]["content"] == "q?"
        assert body["budget"] == {
            "credits_used": 14, "reserved_credits": 0, "messages_used": 1,
            "max_messages": settings.developer_clarification_max_questions,
        }


def test_v2_build_returns_decisions_escalations_and_budget(monkeypatch):
    client = _client(monkeypatch, _DB([_v2_doc()]))
    body = client.get("/v1/builds/b-v2/collaboration").json()

    assert body["protocol_version"] == 2
    (message,) = body["messages"]
    assert message["protocol_version"] == 2 and message["state"] == "completed"
    (decision,) = body["decisions"]
    assert (decision["key"], decision["value"], decision["owner_agent"], decision["version"]) == ("ui.empty_state", "Show a hint", "designer", 1)
    (escalation,) = body["escalations"]
    assert escalation["state"] == "open" and escalation["options"] == ["Show a hint", "Show nothing"]
    assert body["budget"] == {
        "credits_used": 15, "reserved_credits": 40, "messages_used": 1,
        "max_messages": settings.collab_max_messages_per_build,
    }


def test_stored_reserved_credits_take_precedence(monkeypatch):
    doc = _v2_doc()
    doc["reserved_credits"] = 27
    client = _client(monkeypatch, _DB([doc]))
    assert client.get("/builds/b-v2/collaboration").json()["budget"]["reserved_credits"] == 27


@pytest.mark.parametrize("build_id", ["b-v2", "missing"])
def test_other_users_get_404(monkeypatch, build_id):
    db = _DB([_v2_doc()], projects=[{"id": "p1", "user_id": "u1", "deleted_at": None}])
    client = _client(monkeypatch, db, user_id="intruder")
    r = client.get(f"/v1/builds/{build_id}/collaboration")
    assert r.status_code == 404


def test_org_members_have_access(monkeypatch):
    db = _DB(
        [_v2_doc()],
        projects=[{"id": "p1", "user_id": "u1", "org_id": "o1", "deleted_at": None}],
        team_members=[{"org_id": "o1", "user_id": "teammate"}],
    )
    client = _client(monkeypatch, db, user_id="teammate")
    r = client.get("/v1/builds/b-v2/collaboration")
    assert r.status_code == 200 and r.json()["protocol_version"] == 2


def test_endpoint_is_registered_on_the_app():
    from main import app

    # The OpenAPI schema, not app.routes: included routers are lazy
    # placeholders there (see test_api_versioning.py).
    paths = app.openapi()["paths"].keys()
    assert "/v1/builds/{build_id}/collaboration" in paths
    assert "/builds/{build_id}/collaboration" in paths
