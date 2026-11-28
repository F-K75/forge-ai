"""WS-C end to end over HTTP: turns, stream, cancel, sessions -- plus the no-LLM-key test and
cross-tenant checks for every session-scoped route."""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from core.os import events as os_events
from core.os import intent as intent_module
from core.os.capability_registry import CapabilityRegistry
from core.os.runtime import OsRuntime
from core.os_contracts import validate_contract, validate_os_event
from tests.os_fakes import FakeRedis, UserSwitch, indexed_db, make_app, make_user
from tests.test_os_intent_rules import owner_examples

CSV = b"Region,Revenue\nNorth,1200\nSouth,950\nEast,1300\n"


def no_key_gateway():
    """A real AIGateway whose router has no providers registered: the no-key deployment."""
    from core.llm.registry import ProviderRegistry
    from core.llm.router import LLMRouter
    from gateway.service import AIGateway

    router = LLMRouter()
    router.registry = ProviderRegistry()
    return AIGateway(router=router)


class StreamingGateway:
    """Fake LLM: streams the given chunks; ``block`` makes it hang (for cancel tests)."""

    def __init__(self, chunks=("Why do programmers prefer dark mode? ", "Because light attracts bugs."), block=False):
        self.chunks = chunks
        self.block = block

    def list_providers(self):
        return [{"name": "fake"}]

    async def generate(self, request):
        raise RuntimeError("no structured output in this fake")

    async def stream(self, request):
        for c in self.chunks:
            yield c
        if request.usage_out is not None:
            request.usage_out.update({"input_tokens": 12, "output_tokens": 9, "cost_usd": 0.0001})
        if self.block:
            await asyncio.sleep(30)


@pytest.fixture(autouse=True)
def _fast_stream(monkeypatch):
    monkeypatch.setattr(os_events, "HEARTBEAT_SECONDS", 0.1)
    monkeypatch.setattr(os_events, "STREAM_MAX_SECONDS", 0.6)
    intent_module.reset_llm_backoff()


@pytest.fixture
def make_env():
    clients = []

    def _make(gateway=None):
        db = asyncio.run(indexed_db())
        db["projects"].docs.extend([
            {"id": "proj_a", "user_id": "alice", "org_id": None, "deleted_at": None},
            {"id": "proj_m", "user_id": "mallory", "org_id": None, "deleted_at": None},
        ])
        redis = FakeRedis()

        async def _redis():
            return redis

        gw = gateway or no_key_gateway()
        rt = OsRuntime(db, registry=CapabilityRegistry.load(), redis_getter=_redis, gateway_getter=lambda: gw)
        caller = UserSwitch(make_user("alice"))
        client = TestClient(make_app(rt, caller))
        client.__enter__()
        clients.append(client)
        return SimpleNamespace(rt=rt, db=db, client=client, caller=caller)

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


def wait_turn(env, turn_id, timeout=5.0) -> Dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for d in env.db["os_turns"].docs:
            if d["id"] == turn_id and d["status"] != "running":
                time.sleep(0.05)  # let the terminal event's lease release land
                return d
        time.sleep(0.02)
    raise AssertionError(f"turn {turn_id} did not finish")


def events_of(env, session_id, user="alice") -> List[Dict[str, Any]]:
    evs = [d["event"] for d in sorted(env.db["os_events"].docs, key=lambda d: d["seq"]) if d["session_id"] == session_id]
    for e in evs:
        assert validate_os_event(e) == [], e
    return evs


def read_sse(client, path, headers=None) -> List[Dict[str, Any]]:
    out, cur = [], {}
    with client.stream("GET", path, headers=headers or {}) as r:
        assert r.status_code == 200, r.read()
        assert r.headers["content-type"].startswith("text/event-stream")
        for line in r.iter_lines():
            if line.startswith("id: "):
                cur["id"] = int(line[4:])
            elif line.startswith("event: "):
                cur["event"] = line[7:]
            elif line.startswith("data: "):
                cur["data"] = json.loads(line[6:])
            elif line == "" and cur:
                out.append(cur)
                cur = {}
    return out


def post_turn(env, prompt, session_id=None, client_turn_id=None, **extra):
    path = f"/v1/os/sessions/{session_id or 'new'}/turns"
    body = {"client_turn_id": client_turn_id or f"c_{time.monotonic_ns()}", "prompt": prompt, **extra}
    return env.client.post(path, json=body)


# --------------------------------------------------------------------------- #
# The no-LLM-key test
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("prompt,with_csv,kind,capability,presentation", owner_examples())
def test_no_llm_key_every_owner_example_resolves(make_env, prompt, with_csv, kind, capability, presentation):
    env = make_env()  # real AIGateway, zero providers
    extra = {}
    if with_csv:
        ref = env.client.post("/v1/os/attachments", files={"file": ("sales.csv", CSV, "text/csv")}).json()
        extra["attachments"] = [ref]
    r = post_turn(env, prompt, **extra)
    assert r.status_code == 202, r.text
    accepted = r.json()
    assert validate_contract("TurnAccepted", accepted) == []
    wait_turn(env, accepted["turn_id"])
    evs = events_of(env, accepted["session_id"])
    types = [e["type"] for e in evs]
    assert types[0] == "turn.started" and types[1] == "intent.resolved" and types[2] == "plan.ready"
    intent = evs[1]["data"]["intent"]
    assert intent["source"] == "rules" and intent["kind"] == kind and intent["capability_ids"][0] == capability
    plan = evs[2]["data"]["plan"]
    assert plan["presentation"] == presentation and plan["fallback"] is True
    terminal = [e for e in evs if e["type"] in ("turn.completed", "turn.failed")]
    assert len(terminal) == 1 and terminal[0] is evs[-1]
    if capability == "chat.answer":
        assert terminal[0]["type"] == "turn.failed"
        assert terminal[0]["data"]["error"]["code"] == "llm_unavailable"
        assert terminal[0]["data"]["error"]["retryable"] is False
    else:
        assert terminal[0]["type"] == "turn.completed", terminal[0]
        placed = [e["data"]["placement"] for e in evs if e["type"] == "surface.placed"]
        if capability != "agents.kernel_run":  # run 42 does not exist in this empty workspace
            assert placed and placed[0]["capability_id"] == capability
            assert placed[0]["presentation"] == presentation
    # the stream replays exactly what the log holds
    frames = [f for f in read_sse(env.client, accepted["stream_path"] + f"?after_seq={accepted['after_seq']}") if f["event"] != "heartbeat"]
    assert [f["id"] for f in frames] == [e["seq"] for e in evs]


# --------------------------------------------------------------------------- #
# Turns: idempotency, 409, cancel, text streaming
# --------------------------------------------------------------------------- #


def test_turn_retries_are_idempotent(make_env):
    env = make_env()
    a = post_turn(env, "Show my projects", client_turn_id="c_same").json()
    b = post_turn(env, "Show my projects", client_turn_id="c_same").json()
    assert a == b
    wait_turn(env, a["turn_id"])
    c = post_turn(env, "Show my projects", session_id=a["session_id"], client_turn_id="c_same").json()
    assert c == a
    assert len(env.db["os_sessions"].docs) == 1 and len(env.db["os_turns"].docs) == 1
    d = post_turn(env, "Show my projects", session_id=a["session_id"], client_turn_id="c_next").json()
    assert d["turn_id"] != a["turn_id"] and d["after_seq"] > a["after_seq"]
    wait_turn(env, d["turn_id"])


def test_second_turn_while_running_is_409(make_env):
    env = make_env()
    a = post_turn(env, "Show my projects").json()
    wait_turn(env, a["turn_id"])
    asyncio.run(env.rt.sessions.acquire_turn_lease("alice", a["session_id"], "turn_other"))
    r = post_turn(env, "again", session_id=a["session_id"])
    assert r.status_code == 409


def test_text_turn_streams_deltas_and_records_usage(make_env):
    env = make_env(StreamingGateway())
    a = post_turn(env, "Tell me a joke").json()
    turn = wait_turn(env, a["turn_id"])
    evs = events_of(env, a["session_id"])
    deltas = [e["data"]["delta"] for e in evs if e["type"] == "text.delta"]
    done = [e for e in evs if e["type"] == "text.completed"][0]
    assert "".join(deltas) == done["data"]["text"] == "Why do programmers prefer dark mode? Because light attracts bugs."
    assert evs[-1]["type"] == "turn.completed" and evs[-1]["data"]["usage"]["output_tokens"] == 9
    assert turn["status"] == "completed"
    detail = env.client.get(f"/v1/os/sessions/{a['session_id']}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    for m in detail["messages"]:
        assert validate_contract("SessionMessage", m) == []


def test_cancel_ends_turn_exactly_once(make_env):
    env = make_env(StreamingGateway(block=True))
    a = post_turn(env, "Tell me a long story").json()
    deadline = time.monotonic() + 3
    while not any(e["type"] == "text.delta" for e in events_of(env, a["session_id"])):
        assert time.monotonic() < deadline
        time.sleep(0.02)
    path = f"/v1/os/sessions/{a['session_id']}/turns/{a['turn_id']}/cancel"
    assert env.client.post(path).status_code == 204
    turn = wait_turn(env, a["turn_id"])
    assert turn["status"] == "cancelled"
    assert env.client.post(path).status_code == 204  # idempotent
    time.sleep(0.1)
    evs = events_of(env, a["session_id"])
    terminal = [e for e in evs if e["type"] in ("turn.completed", "turn.failed")]
    assert len(terminal) == 1 and terminal[0]["data"]["status"] == "cancelled"
    # the session is free again
    b = post_turn(env, "Show my projects", session_id=a["session_id"])
    assert b.status_code == 202
    wait_turn(env, b.json()["turn_id"])


def test_turn_request_bounds(make_env):
    env = make_env()
    assert post_turn(env, "x" * 16001).status_code == 422
    assert post_turn(env, "").status_code == 422
    assert post_turn(env, "hi", client_turn_id="bad id!").status_code == 422
    refs = [{"id": f"att_{i}", "name": "a", "mime_type": "text/plain", "size_bytes": 1, "kind": "file"} for i in range(11)]
    assert post_turn(env, "hi", attachments=refs).status_code == 422
    huge = [{"id": "att_1", "name": "a", "mime_type": "text/plain", "size_bytes": 52428801, "kind": "file"}]
    assert post_turn(env, "hi", attachments=huge).status_code == 422
    assert post_turn(env, "hi", model={"mode": "pinned", "model": "gpt-4.1"}).status_code == 403
    assert post_turn(env, "hi", model={"mode": "auto", "model": "turbo"}).status_code == 422
    assert post_turn(env, "hi", unknown_field=1).status_code == 422
    assert env.db["os_sessions"].docs == []


def test_turn_rate_limit(make_env):
    env = make_env()
    codes = []
    for i in range(31):
        r = post_turn(env, "Show my projects")
        codes.append(r.status_code)
        if r.status_code == 202:
            wait_turn(env, r.json()["turn_id"])
    assert codes[:30] == [202] * 30 and codes[30] == 429


# --------------------------------------------------------------------------- #
# Stream: replay via Last-Event-ID / after_seq
# --------------------------------------------------------------------------- #


def test_stream_resumes_from_last_event_id(make_env):
    env = make_env()
    a = post_turn(env, "Show my projects").json()
    wait_turn(env, a["turn_id"])
    all_frames = [f for f in read_sse(env.client, a["stream_path"]) if f["event"] != "heartbeat"]
    seqs = [f["id"] for f in all_frames]
    assert seqs == list(range(1, len(seqs) + 1))
    resumed = [f for f in read_sse(env.client, a["stream_path"], headers={"Last-Event-ID": "2"}) if f["event"] != "heartbeat"]
    assert [f["id"] for f in resumed] == seqs[2:]
    beats = [f for f in read_sse(env.client, a["stream_path"] + f"?after_seq={seqs[-1]}") if f["event"] == "heartbeat"]
    assert beats and all(b["id"] == seqs[-1] for b in beats)


# --------------------------------------------------------------------------- #
# Sessions + cross-tenant isolation
# --------------------------------------------------------------------------- #


def test_session_lifecycle(make_env):
    env = make_env()
    ref = env.client.post("/v1/os/attachments", files={"file": ("sales.csv", CSV, "text/csv")}).json()
    a = post_turn(env, "Chart revenue by region", attachments=[ref]).json()
    wait_turn(env, a["turn_id"])
    listed = env.client.get("/v1/os/sessions").json()
    assert listed["total"] == 1 and listed["items"][0]["title"] == "Chart revenue by region"
    for item in listed["items"]:
        assert validate_contract("SessionSummary", item) == []
    detail = env.client.get(f"/v1/os/sessions/{a['session_id']}").json()
    assert detail["surfaces"] and validate_contract("StoredSurface", detail["surfaces"][0]) == []
    assert detail["messages"][0]["attachments"] == [ref]
    assert detail["last_seq"] == len(events_of(env, a["session_id"]))
    r = env.client.patch(f"/v1/os/sessions/{a['session_id']}", json={"title": "Sales", "pinned": True})
    assert r.status_code == 200 and r.json()["title"] == "Sales" and r.json()["pinned"] is True
    assert env.client.patch(f"/v1/os/sessions/{a['session_id']}", json={"user_id": "mallory"}).status_code == 422
    assert env.client.delete(f"/v1/os/sessions/{a['session_id']}").status_code == 204
    assert env.client.get(f"/v1/os/sessions/{a['session_id']}").status_code == 404
    assert env.client.get("/v1/os/sessions").json()["total"] == 0


def test_cross_tenant_isolation_on_every_session_route(make_env):
    env = make_env()
    ref = env.client.post("/v1/os/attachments", files={"file": ("sales.csv", CSV, "text/csv")}).json()
    a = post_turn(env, "Show my projects").json()
    wait_turn(env, a["turn_id"])
    sid, tid = a["session_id"], a["turn_id"]

    env.caller.user = make_user("mallory")
    c = env.client
    assert c.get(f"/v1/os/sessions/{sid}").status_code == 404
    assert c.patch(f"/v1/os/sessions/{sid}", json={"title": "x"}).status_code == 404
    assert c.delete(f"/v1/os/sessions/{sid}").status_code == 404
    assert c.get(f"/v1/os/sessions/{sid}/stream").status_code == 404
    assert post_turn(env, "hi", session_id=sid).status_code == 404
    assert post_turn(env, "Show my projects", session_id=sid, client_turn_id=env.db["os_turns"].docs[0]["client_turn_id"]).status_code == 404
    assert c.post(f"/v1/os/sessions/{sid}/turns/{tid}/cancel").status_code == 404
    action = {"action_id": "a1", "session_id": sid, "a2ui": {"version": "1.0", "action": {
        "name": "x", "surfaceId": "srf_1", "sourceComponentId": "b", "timestamp": "2026-11-27T10:00:00Z", "context": {}}}}
    assert c.post(f"/v1/os/sessions/{sid}/actions", json=action).status_code == 404
    assert c.get("/v1/os/sessions").json()["total"] == 0
    # mallory cannot use alice's attachment or bind her turn to alice's project
    assert post_turn(env, "Chart this", attachments=[ref]).status_code == 422
    assert post_turn(env, "Show my projects", project_id="proj_a").status_code == 404
    # ...and nothing of alice's changed
    env.caller.user = make_user("alice")
    assert c.get(f"/v1/os/sessions/{sid}").json()["session"]["title"] == "Show my projects"
    assert len([d for d in env.db["os_sessions"].docs if d["user_id"] == "mallory"]) == 0


def test_project_bound_turn(make_env):
    env = make_env()
    a = post_turn(env, "Create an agent that triages bugs", project_id="proj_a").json()
    wait_turn(env, a["turn_id"])
    evs = events_of(env, a["session_id"])
    form = [c for e in evs if e["type"] == "a2ui.message" for c in e["data"]["message"]["createSurface"]["components"]
            if c["component"] == "AgentConfigForm"]
    assert form and form[0]["submit"]["event"]["context"] == {"project_id": "proj_a"}
    assert env.db["os_sessions"].docs[0]["project_id"] == "proj_a"


def test_unauthenticated_session_routes(make_env):
    env = make_env()
    env.caller.user = None
    assert env.client.get("/v1/os/sessions").status_code == 401
    assert post_turn(env, "hi").status_code == 401
    assert env.client.get("/v1/os/sessions/ses_1/stream").status_code == 401
