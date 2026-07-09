"""Interactive build gates: the orchestrator pauses after each planning agent
(architect, business model, designer) for user approval, and the architect can
ask clarifying questions before drawing the blueprint. Responses arrive via
POST /builds/{id}/gate, which writes pending_gate.response for the Celery
worker's poll loop (Orchestrator._wait_for_gate) to pick up.

Non-interactive builds must behave exactly as before: no gates, no waiting.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.builds as builds_module
import core.orchestrator as orchestrator_module
from core.models import Build, BuildStatus, User
from core.orchestrator import BuildCancelled, Orchestrator


# --------------------------------------------------------------------------- #
# Stubs
# --------------------------------------------------------------------------- #


class _StubAgent:
    async def blueprint(self, *a, **kw):
        return {"integrations": [], "features": []}

    async def clarify(self, *a, **kw):
        return []

    async def improve(self, *a, **kw):
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        return {"theme": "default"}

    async def generate_files(self, *a, **kw):
        return {"files": {"src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        return {"files": {}}


class _FakeBuildsCollection:
    """Just enough Mongo for _wait_for_gate: stores pending_gate on a single
    build doc and lets the test inject the user's response."""

    def __init__(self, respond_with=None):
        self.doc = {}
        # Called with the gate dict when the orchestrator opens a gate;
        # returns the response dict to inject, or None to leave it pending.
        self.respond_with = respond_with
        self.opened_gates = []

    async def update_one(self, query, update):
        for field, val in update.get("$set", {}).items():
            self.doc[field] = val
        gate = self.doc.get("pending_gate")
        if gate and not gate.get("response"):
            self.opened_gates.append(dict(gate))
            if self.respond_with:
                response = self.respond_with(gate)
                if response:
                    gate["response"] = response

    async def find_one(self, query, projection=None):
        return dict(self.doc)


class _FakeDB:
    def __init__(self, respond_with=None):
        self.builds = _FakeBuildsCollection(respond_with)


def _make_build(interactive=False):
    return Build(
        id="build-1",
        project_id="p1",
        user_id="u1",
        prompt="Build a todo app",
        status=BuildStatus.PENDING,
        interactive=interactive,
    )


def _make_orchestrator(monkeypatch, fake_db=None):
    async def _no_byok(self, user_id):
        return False

    monkeypatch.setattr(Orchestrator, "_is_byok_active", _no_byok)
    if fake_db is not None:
        async def _get_db():
            return fake_db

        monkeypatch.setattr(orchestrator_module, "get_db", _get_db)
    monkeypatch.setattr(orchestrator_module.settings, "gate_poll_interval", 0.01)

    orchestrator = Orchestrator()
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        setattr(orchestrator, attr, _StubAgent())
    return orchestrator


async def _run(orchestrator, build):
    emitted = []

    async def emit(event):
        emitted.append(event)

    await orchestrator.run_build(build, emit=emit, sandbox_runner=None)
    return emitted


def _types(emitted):
    return [e.type.value for e in emitted]


# --------------------------------------------------------------------------- #
# Orchestrator behaviour
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_non_interactive_build_emits_agent_output_but_no_gates(monkeypatch):
    orchestrator = _make_orchestrator(monkeypatch)
    emitted = await _run(orchestrator, _make_build(interactive=False))

    types = _types(emitted)
    assert "gate_request" not in types
    assert "gate_resolved" not in types

    outputs = {e.data["agent"]: e.data["output"] for e in emitted if e.type.value == "agent_output"}
    assert outputs["architect"] == {"integrations": [], "features": []}
    assert outputs["business_improver"] == {"summary": "ok"}
    assert outputs["designer"] == {"theme": "default"}
    assert outputs["pm"] == {"passed": True}


@pytest.mark.asyncio
async def test_interactive_build_gates_each_planning_stage(monkeypatch):
    fake_db = _FakeDB(respond_with=lambda gate: {"action": "approve"})
    orchestrator = _make_orchestrator(monkeypatch, fake_db)
    emitted = await _run(orchestrator, _make_build(interactive=True))

    gates = [e.data["stage"] for e in emitted if e.type.value == "gate_request"]
    assert gates == ["architect", "business_improver", "designer"]

    types = _types(emitted)
    # The architect gate opens only after its output event, and the next
    # agent starts only after the gate resolves.
    assert types.index("agent_output") < types.index("gate_request")
    second_agent_start = [i for i, t in enumerate(types) if t == "agent_start"][1]
    assert types.index("gate_resolved") < second_agent_start

    # Gate cleared when the pipeline finishes.
    assert fake_db.builds.doc.get("pending_gate") is None
    assert types[-1] == "build_complete"


@pytest.mark.asyncio
async def test_clarifying_answers_reach_the_blueprint(monkeypatch):
    fake_db = _FakeDB(
        respond_with=lambda gate: (
            {"action": "answers", "answers": ["Just for my own team"]}
            if gate["kind"] == "questions"
            else {"action": "approve"}
        )
    )
    orchestrator = _make_orchestrator(monkeypatch, fake_db)

    seen = {}

    class _AskingArchitect(_StubAgent):
        async def clarify(self, *a, **kw):
            return ["Who is this app for?"]

        async def blueprint(self, prompt, conversation_history=None, **kw):
            seen["history"] = conversation_history
            return {"integrations": [], "features": []}

    orchestrator.architect = _AskingArchitect()
    emitted = await _run(orchestrator, _make_build(interactive=True))

    question_gates = [e for e in emitted if e.type.value == "gate_request" and e.data["kind"] == "questions"]
    assert len(question_gates) == 1
    assert question_gates[0].data["questions"] == ["Who is this app for?"]

    history_text = "\n".join(m["content"] for m in seen["history"])
    assert "Who is this app for?" in history_text
    assert "Just for my own team" in history_text


@pytest.mark.asyncio
async def test_cancel_at_gate_raises_build_cancelled(monkeypatch):
    fake_db = _FakeDB(respond_with=lambda gate: {"action": "cancel"})
    orchestrator = _make_orchestrator(monkeypatch, fake_db)

    with pytest.raises(BuildCancelled):
        await _run(orchestrator, _make_build(interactive=True))


@pytest.mark.asyncio
async def test_gate_timeout_auto_approves(monkeypatch):
    fake_db = _FakeDB(respond_with=None)  # user never responds
    orchestrator = _make_orchestrator(monkeypatch, fake_db)
    monkeypatch.setattr(orchestrator_module.settings, "gate_timeout", 0.03)

    emitted = await _run(orchestrator, _make_build(interactive=True))

    resolved = [e for e in emitted if e.type.value == "gate_resolved"]
    assert len(resolved) == 3
    assert all(e.data["auto"] and e.data["action"] == "approve" for e in resolved)
    assert _types(emitted)[-1] == "build_complete"


# --------------------------------------------------------------------------- #
# POST /builds/{id}/gate endpoint
# --------------------------------------------------------------------------- #


class _EndpointBuilds:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if d.get("id") == query.get("id"):
                return dict(d)
        return None

    async def update_one(self, query, update):
        for d in self.docs:
            if d.get("id") != query.get("id"):
                continue
            gate_id = query.get("pending_gate.gate_id")
            if gate_id is not None and (d.get("pending_gate") or {}).get("gate_id") != gate_id:
                continue
            for field, val in update.get("$set", {}).items():
                if field == "pending_gate.response":
                    d.setdefault("pending_gate", {})["response"] = val
                else:
                    d[field] = val


class _EndpointDB:
    def __init__(self, docs):
        self.builds = _EndpointBuilds(docs)


def _gate_client(monkeypatch, docs, user):
    db = _EndpointDB(docs)

    async def _get_db():
        return db

    monkeypatch.setattr(builds_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(builds_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app), db


def _user(uid="u1"):
    return User(id=uid, email="a@b.com", name="U", hashed_password="x", plan="free")


def test_gate_response_is_recorded(monkeypatch):
    docs = [{
        "id": "b1", "user_id": "u1", "project_id": "p1",
        "pending_gate": {"gate_id": "g1", "stage": "architect", "kind": "approval"},
    }]
    client, db = _gate_client(monkeypatch, docs, _user())

    r = client.post("/builds/b1/gate", json={"gate_id": "g1", "action": "approve"})
    assert r.status_code == 200
    assert docs[0]["pending_gate"]["response"]["action"] == "approve"


def test_gate_rejects_mismatched_gate_id(monkeypatch):
    docs = [{
        "id": "b1", "user_id": "u1", "project_id": "p1",
        "pending_gate": {"gate_id": "g1", "stage": "architect", "kind": "approval"},
    }]
    client, _ = _gate_client(monkeypatch, docs, _user())

    r = client.post("/builds/b1/gate", json={"gate_id": "stale", "action": "approve"})
    assert r.status_code == 409


def test_gate_rejects_double_response(monkeypatch):
    docs = [{
        "id": "b1", "user_id": "u1", "project_id": "p1",
        "pending_gate": {"gate_id": "g1", "response": {"action": "approve"}},
    }]
    client, _ = _gate_client(monkeypatch, docs, _user())

    r = client.post("/builds/b1/gate", json={"gate_id": "g1", "action": "cancel"})
    assert r.status_code == 409


def test_gate_hidden_from_other_users(monkeypatch):
    docs = [{
        "id": "b1", "user_id": "owner", "project_id": "p1",
        "pending_gate": {"gate_id": "g1"},
    }]

    class _NoProjects:
        async def find_one(self, *a, **kw):
            return None

    client, db = _gate_client(monkeypatch, docs, _user("intruder"))
    db.projects = _NoProjects()

    r = client.post("/builds/b1/gate", json={"gate_id": "g1", "action": "approve"})
    assert r.status_code == 404


def test_gate_answers_are_bounded(monkeypatch):
    docs = [{
        "id": "b1", "user_id": "u1", "project_id": "p1",
        "pending_gate": {"gate_id": "g1", "kind": "questions"},
    }]
    client, _ = _gate_client(monkeypatch, docs, _user())

    r = client.post(
        "/builds/b1/gate",
        json={"gate_id": "g1", "action": "answers", "answers": ["x" * 5000] * 20},
    )
    assert r.status_code == 200
    recorded = docs[0]["pending_gate"]["response"]["answers"]
    assert len(recorded) == 8
    assert all(len(a) <= 2000 for a in recorded)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
