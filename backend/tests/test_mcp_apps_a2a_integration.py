"""End-to-end integration tests for MCP Apps and A2A (inbound + outbound).

No real network is used:
- The fake MCP server is a real `mcp` SDK `MCPServer` with the MCP Apps
  extension, served as an in-process Streamable HTTP ASGI app and bridged into
  Forge's `StreamableHTTPMCPClient` through its `transport_fn` seam.
- The fake remote A2A agent is an in-process Starlette app reached through
  `httpx.ASGITransport`.
- Forge's own API is driven through FastAPI's `TestClient` (and, for the
  Forge-to-Forge round trip, through `httpx.ASGITransport`).
- DNS resolution in the SSRF validator is replaced with a deterministic fake.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import httpx
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api.a2a_public as a2a_public_module  # noqa: E402
import api.protocols as protocols_module  # noqa: E402
import core.protocol_gateway as protocol_gateway_module  # noqa: E402
from api.auth import get_current_user  # noqa: E402
from core.a2a_adapter import (  # noqa: E402
    A2ABlockedURLError,
    A2AGateway,
    A2ARemoteClient,
    A2ARemoteError,
    validate_a2a_remote_url,
)
from core.agent_kernel import AgentKernel, KernelTask  # noqa: E402
from core.mcp_apps import (  # noqa: E402
    MAX_APP_HTML_BYTES,
    MCPAppResourceError,
    MCPAppsService,
    sanitize_mcp_app_resource,
)
from core.models import User  # noqa: E402
from core.protocol_gateway import AGUIStreamBroker, MCPGateway, StreamableHTTPMCPClient  # noqa: E402

from mcp.server.apps import Apps, ResourceCsp, ResourcePermissions  # noqa: E402
from mcp.server.mcpserver import MCPServer  # noqa: E402
from mcp.server.transport_security import TransportSecuritySettings  # noqa: E402

PROJECT_ID = "proj_a2a"
OTHER_PROJECT_ID = "proj_other"
USER_ID = "user-1"


# --------------------------------------------------------------------------- #
# Shared fakes
# --------------------------------------------------------------------------- #


def _fake_getaddrinfo(host, *_args, **_kwargs):
    table = {"rebind.example": "10.1.2.3", "public.example": "93.184.216.34"}
    if host in table:
        return [(2, 1, 6, "", (table[host], 0))]
    if str(host).endswith(".test"):
        return [(2, 1, 6, "", ("93.184.216.34", 0))]
    raise OSError("no such host (offline test resolver)")


@pytest.fixture(autouse=True)
def _offline_dns(monkeypatch):
    monkeypatch.setattr(
        protocol_gateway_module, "socket", SimpleNamespace(getaddrinfo=_fake_getaddrinfo)
    )


class FakeCollection:
    def __init__(self, docs=None):
        self.docs: List[Dict[str, Any]] = list(docs or [])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection(
            [
                {"id": PROJECT_ID, "user_id": USER_ID, "deleted_at": None},
                {"id": OTHER_PROJECT_ID, "user_id": "someone-else", "deleted_at": None},
            ]
        )
        self.team_members = FakeCollection()
        self.mcp_audit_logs = FakeCollection()
        self.a2a_audit_logs = FakeCollection()


def _stub_kernel(delay: float = 0.0) -> AgentKernel:
    async def _exec(task: KernelTask, _ctx, _dctx):
        if delay:
            await asyncio.sleep(delay)
        return {"summary": f"{task.role} delivered.", "touched_files": [f"src/{task.id}.py"]}

    return AgentKernel(task_executor=_exec)


# --------------------------------------------------------------------------- #
# Fake MCP server (real SDK server with the MCP Apps extension)
# --------------------------------------------------------------------------- #

APP_HTML = (
    "<!doctype html><html><head><title>Chart</title>"
    '<meta http-equiv="refresh" content="0;url=https://evil.example">'
    "</head><body><div id=root></div><script>window.parent.postMessage({ready:true},'*')</script>"
    "</body></html>"
)


def _build_fake_mcp_server() -> Starlette:
    apps = Apps()

    @apps.tool(resource_uri="ui://charts/app.html", description="Render a chart")
    def chart(points: int) -> str:
        return f"chart with {points} points"

    @apps.tool(resource_uri="ui://charts/huge.html", description="Oversized UI")
    def huge_chart() -> str:
        return "huge"

    apps.add_html_resource(
        "ui://charts/app.html",
        APP_HTML,
        csp=ResourceCsp(
            connect_domains=["https://api.charts.example", "http://10.0.0.1", "https://localhost"],
            resource_domains=["https://cdn.charts.example", "*", "https://x.example; script-src *"],
        ),
        permissions=ResourcePermissions(camera={}),
        prefers_border=True,
    )
    apps.add_html_resource(
        "ui://charts/huge.html", "<html><body>" + ("A" * (MAX_APP_HTML_BYTES + 10)) + "</body></html>"
    )

    srv = MCPServer("fake-apps", extensions=[apps])

    @srv.tool(meta={"ui": {"resourceUri": "ui://legacy/page.html"}}, description="Wrong mime UI")
    def legacy_page() -> str:
        return "legacy"

    @srv.resource("ui://legacy/page.html", mime_type="text/html")
    def legacy_resource() -> str:
        return "<html><body>plain html</body></html>"

    @srv.tool(meta={"ui": {"resourceUri": "ui://ghost/missing.html"}}, description="Missing UI")
    def ghost() -> str:
        return "ghost"

    @srv.tool(meta={"ui": {"resourceUri": "ui://charts/../secrets"}}, description="Traversal UI")
    def traversal() -> str:
        return "traversal"

    @srv.tool(description="Plain tool, no UI")
    def plain(x: int) -> int:
        return x * 2

    return srv.streamable_http_app(
        json_response=True,
        stateless_http=True,
        transport_security=TransportSecuritySettings(allowed_hosts=["mcp.test"]),
    )


@pytest.fixture
def fake_mcp():
    calls: List[Dict[str, Any]] = []
    with TestClient(_build_fake_mcp_server(), base_url="https://mcp.test") as mcp_client:

        def transport(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
            calls.append({"url": url, "method": payload.get("method"), "params": payload.get("params")})
            resp = mcp_client.post(
                httpx.URL(url).path, json=payload, headers={"Accept": "application/json"}
            )
            assert resp.status_code == 200, resp.text
            return resp.json()

        yield SimpleNamespace(transport=transport, calls=calls)


async def _discovered_gateway(fake_mcp) -> MCPGateway:
    gw = MCPGateway(http_client=StreamableHTTPMCPClient(transport_fn=fake_mcp.transport))
    gw.register_external_server("apps-mcp", "https://mcp.test/mcp")
    await gw.discover_external_tools("apps-mcp")
    return gw


# --------------------------------------------------------------------------- #
# Fake remote A2A agent
# --------------------------------------------------------------------------- #


def _build_fake_remote_agent() -> SimpleNamespace:
    state: Dict[str, Any] = {"tasks": {}, "requests": []}

    def _task(tid: str) -> Dict[str, Any]:
        t = state["tasks"][tid]
        return {
            "id": tid,
            "sessionId": t.get("sessionId"),
            "status": {
                "state": t["state"],
                "message": {"role": "agent", "parts": [{"type": "text", "text": t["msg"]}]},
                "timestamp": "2026-11-26T00:00:00Z",
            },
            "artifacts": t.get("artifacts", []),
        }

    async def card(request: Request):
        state["requests"].append(("GET", request.url.path))
        return JSONResponse(
            {
                "name": "Partner Research Agent",
                "description": "Answers research questions.",
                "url": "https://agent.test/rpc",
                "version": "1.0.0",
                "protocol": "a2a/0.2",
                "capabilities": {"streaming": False, "pushNotifications": False, "weird": "x"},
                "skills": [{"id": "research", "name": "Research", "description": "Deep research"}],
            }
        )

    async def evil_card(request: Request):
        state["requests"].append(("GET", request.url.path))
        return JSONResponse({"name": "Evil", "url": "https://169.254.169.254/latest/meta-data"})

    async def redirect(request: Request):
        state["requests"].append(("GET", request.url.path))
        return Response(status_code=302, headers={"Location": "https://169.254.169.254/"})

    async def huge(request: Request):
        state["requests"].append(("GET", request.url.path))
        return JSONResponse({"name": "Huge", "url": "https://agent.test/rpc", "pad": "x" * (300 * 1024)})

    async def html(request: Request):
        state["requests"].append(("GET", request.url.path))
        return Response("<html></html>", media_type="text/html")

    async def rpc(request: Request):
        body = await request.json()
        state["requests"].append(("POST", body.get("method")))
        method, params, rid = body.get("method"), body.get("params") or {}, body.get("id")
        tid = params.get("id")
        if method == "tasks/send":
            state["tasks"][tid] = {"state": "working", "msg": "on it", "polls": 0, "sessionId": params.get("sessionId")}
        elif method == "tasks/get":
            t = state["tasks"].get(tid)
            if t is None:
                return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32001, "message": "Task not found"}})
            t["polls"] += 1
            if t["state"] == "working" and t["polls"] >= 2:
                t.update(state="completed", msg="done", artifacts=[{"name": "answer", "parts": [{"type": "text", "text": "42"}]}])
        elif method == "tasks/cancel":
            t = state["tasks"].get(tid)
            if t is None:
                return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32001, "message": "Task not found"}})
            t.update(state="canceled", msg="canceled")
        else:
            return JSONResponse({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "nope"}})
        return JSONResponse({"jsonrpc": "2.0", "id": rid, "result": _task(tid)})

    app = Starlette(
        routes=[
            Route("/.well-known/agent.json", card),
            Route("/evil/agent.json", evil_card),
            Route("/redirect/agent.json", redirect),
            Route("/huge/agent.json", huge),
            Route("/html/agent.json", html),
            Route("/rpc", rpc, methods=["POST"]),
        ]
    )
    return SimpleNamespace(app=app, state=state)


@pytest.fixture
def remote_agent():
    agent = _build_fake_remote_agent()
    client = A2ARemoteClient(
        transport=httpx.ASGITransport(app=agent.app),
        allowlisted_hosts=frozenset({"agent.test"}),
        timeout_seconds=2.0,
    )
    agent.gateway = A2AGateway(kernel=_stub_kernel(), remote_client=client)
    return agent


# --------------------------------------------------------------------------- #
# Forge API test app
# --------------------------------------------------------------------------- #


@pytest.fixture
def forge(monkeypatch, fake_mcp):
    db = FakeDB()

    async def _get_db():
        return db

    a2a_gw = A2AGateway(kernel=_stub_kernel(delay=0.01))
    mcp_gw = MCPGateway(http_client=StreamableHTTPMCPClient(transport_fn=fake_mcp.transport))
    mcp_gw.register_external_server("apps-mcp", "https://mcp.test/mcp")
    asyncio.run(mcp_gw.discover_external_tools("apps-mcp"))

    monkeypatch.setattr(protocols_module, "get_db", _get_db)
    monkeypatch.setattr(a2a_public_module, "get_db", _get_db)
    monkeypatch.setattr(protocols_module, "get_a2a_gateway", lambda: a2a_gw)
    monkeypatch.setattr(a2a_public_module, "get_a2a_gateway", lambda: a2a_gw)
    monkeypatch.setattr(protocols_module, "get_mcp_gateway", lambda: mcp_gw)
    local_broker = AGUIStreamBroker()
    monkeypatch.setattr(protocols_module, "get_agui_broker", lambda: local_broker)
    monkeypatch.setattr(a2a_public_module, "public_api_base_url", lambda: "https://forge.test")
    monkeypatch.setattr(protocols_module, "public_api_base_url", lambda: "https://forge.test")

    app = FastAPI()
    v1 = APIRouter(prefix="/v1")
    v1.include_router(protocols_module.router)
    v1.include_router(a2a_public_module.router)
    app.include_router(v1)
    app.include_router(a2a_public_module.well_known_router)

    async def _user():
        return User(id=USER_ID, email="u@example.com", name="Test User")

    app.dependency_overrides[get_current_user] = _user
    with TestClient(app, base_url="https://forge.test") as client:
        yield SimpleNamespace(client=client, app=app, db=db, a2a=a2a_gw, mcp=mcp_gw)


def _rpc(method: str, params: Dict[str, Any], rid: Any = 1) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}


def _send_params(task_id: str, text: str = "Build an authenticated REST endpoint with tests", **meta):
    params: Dict[str, Any] = {
        "id": task_id,
        "sessionId": "sess-1",
        "message": {"role": "user", "parts": [{"type": "text", "text": text}]},
    }
    if meta:
        params["metadata"] = meta
    return params


def _poll_until(client: TestClient, url: str, task_id: str, states, timeout: float = 10.0) -> Dict[str, Any]:
    deadline = time.monotonic() + timeout
    last: Dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = client.post(url, json=_rpc("tasks/get", {"id": task_id})).json()
        if last.get("result", {}).get("status", {}).get("state") in states:
            return last
        time.sleep(0.05)
    raise AssertionError(f"task {task_id} never reached {states}: {last}")


PROJECT_RPC = f"/v1/projects/{PROJECT_ID}/protocols/a2a/rpc"


# --------------------------------------------------------------------------- #
# A2A inbound
# --------------------------------------------------------------------------- #


def test_public_and_project_agent_card_discovery(forge):
    public = forge.client.get("/.well-known/agent.json")
    assert public.status_code == 200
    card = public.json()
    assert card["protocol"] == "a2a/0.2"
    assert card["url"] == "https://forge.test/v1/a2a/rpc"
    assert card["authentication"]["projectSelector"] == "params.metadata.projectId"
    assert card["skills"] and len(card["departments"]) == 9
    assert PROJECT_ID not in json.dumps(card)

    scoped = forge.client.get(f"/v1/projects/{PROJECT_ID}/protocols/a2a/.well-known/agent.json")
    assert scoped.status_code == 200
    assert scoped.json()["url"] == f"https://forge.test{PROJECT_RPC}"

    # Project-scoped card enforces project access
    denied = forge.client.get(f"/v1/projects/{OTHER_PROJECT_ID}/protocols/a2a/.well-known/agent.json")
    assert denied.status_code == 404


def test_inbound_task_send_runs_to_completion_with_audit(forge):
    sent = forge.client.post(
        PROJECT_RPC, json=_rpc("tasks/send", _send_params("task-ok", callerAgent="partner-agent"), rid="r1")
    )
    assert sent.status_code == 200
    body = sent.json()
    assert body["id"] == "r1"
    assert body["result"]["id"] == "task-ok"
    assert body["result"]["sessionId"] == "sess-1"
    assert body["result"]["status"]["state"] == "working"

    done = _poll_until(forge.client, PROJECT_RPC, "task-ok", {"completed", "failed"})
    result = done["result"]
    assert result["status"]["state"] == "completed"
    assert result["metadata"]["taskCount"] >= 2
    assert result["artifacts"] and result["artifacts"][0]["parts"][0]["type"] == "data"

    # Idempotent resend returns the same task, no second run
    again = forge.client.post(PROJECT_RPC, json=_rpc("tasks/send", _send_params("task-ok"))).json()
    assert again["result"]["status"]["state"] == "completed"

    # REST view matches
    rest = forge.client.get(f"/v1/projects/{PROJECT_ID}/protocols/a2a/tasks/task-ok")
    assert rest.status_code == 200 and rest.json()["status"]["state"] == "completed"

    # Project isolation: same task id is invisible from another project's view
    assert forge.a2a.get_task(project_id=OTHER_PROJECT_ID, task_id="task-ok") is None

    audit = forge.client.get(f"/v1/projects/{PROJECT_ID}/protocols/a2a/audit").json()["audit_log"]
    methods = [(a["direction"], a["method"], a["status"]) for a in audit]
    assert ("inbound", "tasks/send", "succeeded") in methods
    assert ("inbound", "tasks/execute", "succeeded") in methods
    assert ("inbound", "tasks/get", "succeeded") in methods
    assert all(a["actor"] in (USER_ID, None) for a in audit)
    # Mongo persister hook wrote the same records
    assert len(forge.db.a2a_audit_logs.docs) == len(forge.a2a.get_audit_log(limit=500))


def test_inbound_task_cancel(forge):
    forge.a2a._kernel = _stub_kernel(delay=0.4)
    sent = forge.client.post(PROJECT_RPC, json=_rpc("tasks/send", _send_params("task-cancel"))).json()
    assert sent["result"]["status"]["state"] == "working"
    time.sleep(0.05)

    canceled = forge.client.post(PROJECT_RPC, json=_rpc("tasks/cancel", {"id": "task-cancel"})).json()
    assert canceled["result"]["status"]["state"] == "canceled"

    # Background run winds down without overwriting the canceled state
    deadline = time.monotonic() + 10
    while forge.a2a._runners and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not forge.a2a._runners
    got = forge.client.post(PROJECT_RPC, json=_rpc("tasks/get", {"id": "task-cancel"})).json()
    assert got["result"]["status"]["state"] == "canceled"

    # Canceling a terminal task is a protocol error
    again = forge.client.post(PROJECT_RPC, json=_rpc("tasks/cancel", {"id": "task-cancel"})).json()
    assert again["error"]["code"] == -32002
    missing = forge.client.post(PROJECT_RPC, json=_rpc("tasks/cancel", {"id": "nope"})).json()
    assert missing["error"]["code"] == -32001
    rest_missing = forge.client.post(f"/v1/projects/{PROJECT_ID}/protocols/a2a/tasks/nope/cancel")
    assert rest_missing.status_code == 404


def test_inbound_plan_only_and_rest_cancel(forge):
    sent = forge.client.post(
        PROJECT_RPC, json=_rpc("tasks/send", _send_params("task-plan", planOnly=True, maxAgents=3))
    ).json()
    assert sent["result"]["status"]["state"] == "submitted"
    assert not forge.a2a._runners
    rest = forge.client.post(f"/v1/projects/{PROJECT_ID}/protocols/a2a/tasks/task-plan/cancel")
    assert rest.status_code == 200 and rest.json()["status"]["state"] == "canceled"


def test_inbound_input_validation(forge):
    c = forge.client
    cases = [
        (_rpc("tasks/send", _send_params("bad id!")), -32602),
        (_rpc("tasks/send", _send_params("t1", text="x")), -32602),
        (_rpc("tasks/send", _send_params("t1", text="y" * 4001)), -32602),
        (_rpc("tasks/send", _send_params("t1", maxBudgetUsd=1000)), -32602),
        (_rpc("tasks/send", _send_params("t1", maxAgents="many")), -32602),
        (_rpc("tasks/send", {"id": "t1", "message": {"role": "agent", "parts": [{"type": "text", "text": "hello"}]}}), -32602),
        (_rpc("tasks/send", {"id": "t1", "message": {"role": "user", "parts": [{"type": "file", "file": {}}]}}), -32602),
        (_rpc("tasks/sendSubscribe", _send_params("t1")), -32601),
        (_rpc("tasks/get", {}), -32602),
        ({"jsonrpc": "1.0", "id": 1, "method": "tasks/get"}, -32600),
        ([_rpc("tasks/get", {"id": "a"})], -32600),
    ]
    for payload, code in cases:
        res = c.post(PROJECT_RPC, json=payload)
        assert res.status_code == 200, payload
        assert res.json()["error"]["code"] == code, (payload, res.json())

    parse = c.post(PROJECT_RPC, content=b"{not json", headers={"Content-Type": "application/json"})
    assert parse.json()["error"]["code"] == -32700
    wrong_ct = c.post(PROJECT_RPC, content=b"{}", headers={"Content-Type": "text/plain"})
    assert wrong_ct.status_code == 415
    # Rejections are audited
    assert any(a["status"] == "rejected" for a in forge.a2a.get_audit_log(project_id=PROJECT_ID))


def test_inbound_oversized_payload_rejected(forge):
    big = _rpc("tasks/send", _send_params("big", text="z" * (70 * 1024)))
    res = forge.client.post(PROJECT_RPC, json=big)
    assert res.status_code == 413

    # Chunked body without Content-Length is also capped while streaming
    def _chunks():
        yield b'{"jsonrpc":"2.0","id":1,"method":"tasks/send","params":{"pad":"'
        for _ in range(80):
            yield b"a" * 1024
        yield b'"}}'

    res2 = forge.client.post(PROJECT_RPC, content=_chunks(), headers={"Content-Type": "application/json"})
    assert res2.status_code == 413
    assert forge.a2a.get_task(project_id=PROJECT_ID, task_id="big") is None


def test_inbound_auth_and_project_access(forge):
    # Root RPC requires a project selector and enforces project access
    no_pid = forge.client.post("/v1/a2a/rpc", json=_rpc("tasks/get", {"id": "x"})).json()
    assert no_pid["error"]["code"] == -32602
    other = forge.client.post(
        "/v1/a2a/rpc", json=_rpc("tasks/get", {"id": "x", "metadata": {"projectId": OTHER_PROJECT_ID}})
    )
    assert other.status_code == 404
    project_denied = forge.client.post(
        f"/v1/projects/{OTHER_PROJECT_ID}/protocols/a2a/rpc", json=_rpc("tasks/get", {"id": "x"})
    )
    assert project_denied.status_code == 404

    # Without the auth override every A2A task endpoint is 401
    forge.app.dependency_overrides.clear()
    assert forge.client.post(PROJECT_RPC, json=_rpc("tasks/get", {"id": "x"})).status_code == 401
    assert forge.client.post("/v1/a2a/rpc", json=_rpc("tasks/get", {"id": "x"})).status_code == 401
    # ...while the public discovery card stays reachable
    assert forge.client.get("/.well-known/agent.json").status_code == 200


# --------------------------------------------------------------------------- #
# A2A outbound
# --------------------------------------------------------------------------- #


async def test_outbound_card_discovery_send_poll_and_cancel(remote_agent):
    gw = remote_agent.gateway
    card = await gw.fetch_remote_agent_card("https://agent.test", project_id=PROJECT_ID, actor=USER_ID)
    assert card["name"] == "Partner Research Agent"
    assert card["endpoint_allowed"] is True
    assert card["capabilities"] == {"streaming": False, "pushNotifications": False}
    assert card["skills"][0]["id"] == "research"

    sent = await gw.send_remote_task(card["url"], project_id=PROJECT_ID, text="Summarize A2A", task_id="out-1")
    assert sent["status"]["state"] == "working"
    done = await gw.poll_remote_task(
        card["url"], project_id=PROJECT_ID, task_id="out-1", interval_seconds=0.01, timeout_seconds=2
    )
    assert done["status"]["state"] == "completed"
    assert done["status"]["message"] == "done"
    assert done["artifacts"][0]["name"] == "answer"

    await gw.send_remote_task(card["url"], project_id=PROJECT_ID, text="Long running job", task_id="out-2")
    canceled = await gw.cancel_remote_task(card["url"], project_id=PROJECT_ID, task_id="out-2")
    assert canceled["status"]["state"] == "canceled"

    with pytest.raises(A2ARemoteError, match="-32001"):
        await gw.get_remote_task(card["url"], project_id=PROJECT_ID, task_id="never-sent")

    audit = gw.get_audit_log(project_id=PROJECT_ID)
    outbound = [(a["method"], a["status"]) for a in audit if a["direction"] == "outbound"]
    assert ("agent/card", "succeeded") in outbound
    assert ("tasks/send", "succeeded") in outbound
    assert ("tasks/get", "succeeded") in outbound
    assert ("tasks/cancel", "succeeded") in outbound
    assert ("tasks/get", "error") in outbound
    assert all(a["peer"] == "agent.test" for a in audit if a["direction"] == "outbound")


async def test_outbound_ssrf_rejections(remote_agent):
    gw = remote_agent.gateway
    blocked_urls = [
        "http://agent.test/rpc",  # plaintext
        "https://127.0.0.1/rpc",
        "https://[::1]/rpc",
        "https://10.0.0.5/rpc",
        "https://192.168.1.10/rpc",
        "https://169.254.169.254/latest/meta-data",
        "https://100.64.0.1/rpc",  # CGNAT, not globally routable
        "https://localhost/rpc",
        "https://metadata.google.internal/rpc",
        "https://user:pw@agent.test/rpc",
        "https://rebind.example/rpc",  # resolves to a private IP
        "ftp://agent.test/rpc",
    ]
    before = len(remote_agent.state["requests"])
    for url in blocked_urls:
        with pytest.raises(A2ABlockedURLError):
            await gw.send_remote_task(url, project_id=PROJECT_ID, text="hello there", task_id="ssrf")
    # No request ever reached the transport
    assert len(remote_agent.state["requests"]) == before

    denied = [a for a in gw.get_audit_log(project_id=PROJECT_ID, limit=100) if a["status"] == "denied"]
    assert len(denied) == len(blocked_urls)

    # Redirects are never followed
    with pytest.raises(A2ABlockedURLError, match="redirect"):
        await gw.fetch_remote_agent_card("https://agent.test/redirect/agent.json", project_id=PROJECT_ID)

    # A card advertising an internal endpoint is flagged, and sending to it is blocked
    evil = await gw.fetch_remote_agent_card("https://agent.test/evil/agent.json", project_id=PROJECT_ID)
    assert evil["endpoint_allowed"] is False
    with pytest.raises(A2ABlockedURLError):
        await gw.send_remote_task(evil["url"], project_id=PROJECT_ID, text="hello there")

    # Explicit allowlisting (tests / trusted peers) is the only way through for loopback
    ok, _ = validate_a2a_remote_url("https://127.0.0.1/rpc", allowlisted_hosts=frozenset({"127.0.0.1"}))
    assert ok
    ok, _ = validate_a2a_remote_url("http://127.0.0.1/rpc", allowlisted_hosts=frozenset({"127.0.0.1"}))
    assert not ok  # allowlisting never relaxes https


async def test_outbound_oversized_and_non_json_responses(remote_agent):
    gw = remote_agent.gateway
    with pytest.raises(A2ARemoteError, match="size limit"):
        await gw.fetch_remote_agent_card("https://agent.test/huge/agent.json", project_id=PROJECT_ID)
    with pytest.raises(A2ARemoteError, match="non-JSON"):
        await gw.fetch_remote_agent_card("https://agent.test/html/agent.json", project_id=PROJECT_ID)
    with pytest.raises(A2ARemoteError):
        await gw.send_remote_task("https://agent.test/rpc", project_id=PROJECT_ID, text="z" * 5000)
    errors = [a for a in gw.get_audit_log(project_id=PROJECT_ID) if a["status"] == "error"]
    assert len(errors) == 2


async def test_outbound_timeout():
    async def slow_handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json={})

    client = A2ARemoteClient(
        transport=httpx.MockTransport(slow_handler),
        allowlisted_hosts=frozenset({"slow.test"}),
        timeout_seconds=0.5,
    )
    gw = A2AGateway(kernel=_stub_kernel(), remote_client=client)
    t0 = time.monotonic()
    with pytest.raises(A2ARemoteError, match="timed out"):
        await gw.fetch_remote_agent_card("https://slow.test", project_id=PROJECT_ID)
    assert time.monotonic() - t0 < 3


async def test_forge_to_forge_round_trip(forge):
    """Forge's outbound client discovers and drives Forge's own inbound A2A endpoint."""
    client = A2ARemoteClient(
        transport=httpx.ASGITransport(app=forge.app),
        allowlisted_hosts=frozenset({"forge.test"}),
    )
    caller = A2AGateway(kernel=_stub_kernel(), remote_client=client)
    card = await caller.fetch_remote_agent_card("https://forge.test", project_id="caller-proj")
    assert card["url"] == "https://forge.test/v1/a2a/rpc" and card["endpoint_allowed"]

    meta = {"projectId": PROJECT_ID, "callerAgent": "forge-peer"}
    sent = await caller.send_remote_task(
        card["url"], project_id="caller-proj", text="Add a health check endpoint", task_id="f2f-1", metadata=meta
    )
    assert sent["status"]["state"] == "working"
    done = await caller.poll_remote_task(
        card["url"], project_id="caller-proj", task_id="f2f-1", metadata=meta,
        interval_seconds=0.05, timeout_seconds=10,
    )
    assert done["status"]["state"] == "completed"
    assert done["metadata"]["projectId"] == PROJECT_ID


def test_outbound_api_endpoints_reject_ssrf(forge):
    res = forge.client.post(
        f"/v1/projects/{PROJECT_ID}/protocols/a2a/remote/discover",
        json={"agent_url": "https://169.254.169.254/latest"},
    )
    assert res.status_code == 400
    res = forge.client.post(
        f"/v1/projects/{PROJECT_ID}/protocols/a2a/remote/tasks/send",
        json={"endpoint_url": "https://10.0.0.1/rpc", "text": "hello there"},
    )
    assert res.status_code == 400
    audit = forge.a2a.get_audit_log(project_id=PROJECT_ID)
    assert [a["status"] for a in audit if a["direction"] == "outbound"] == ["denied", "denied"]


# --------------------------------------------------------------------------- #
# MCP Apps
# --------------------------------------------------------------------------- #


async def test_mcp_apps_discovery_registers_ui_tools(fake_mcp):
    gw = await _discovered_gateway(fake_mcp)
    tools = {t["name"]: t for t in gw.list_tools()}
    assert tools["apps-mcp.chart"]["ui_resource_uri"] == "ui://charts/app.html"
    assert tools["apps-mcp.plain"]["ui_resource_uri"] is None
    apps = {a["app_id"]: a for a in gw.list_apps()}
    assert apps["app_apps_mcp_chart"]["resource_uri"] == "ui://charts/app.html"
    assert apps["app_apps_mcp_chart"]["protocol"] == "mcp-apps/v1"
    assert "app_apps_mcp_plain" not in apps
    # Built-in declarative apps remain
    assert "app_security_hygiene" in apps


async def test_mcp_app_resource_fetch_is_sanitized_and_audited(fake_mcp):
    gw = await _discovered_gateway(fake_mcp)
    persisted: List[Dict[str, Any]] = []

    async def persist(rec):
        persisted.append(rec)

    gw.attach_audit_persister(persist)
    payload = await MCPAppsService(gw).fetch_app_resource(
        app_id="app_apps_mcp_chart", role="frontend_engineer", department="engineering", project_id=PROJECT_ID
    )
    out = payload.to_dict()
    assert fake_mcp.calls[-1]["method"] == "resources/read"
    assert fake_mcp.calls[-1]["params"] == {"uri": "ui://charts/app.html"}
    assert out["mime_type"] == "text/html;profile=mcp-app"
    assert out["extension"] == "io.modelcontextprotocol/ui"

    sandbox = out["sandbox"]
    assert sandbox["iframe_sandbox"] == "allow-scripts"
    assert "allow-same-origin" not in sandbox["iframe_sandbox"]
    assert sandbox["prefers_border"] is True
    assert sandbox["denied_permissions"] == ["camera"]
    assert sandbox["allowed_domains"]["connect_domains"] == ["https://api.charts.example"]
    assert sandbox["allowed_domains"]["resource_domains"] == ["https://cdn.charts.example"]
    csp = sandbox["csp"]
    assert csp.startswith("default-src 'none'")
    assert "connect-src https://api.charts.example;" in csp
    assert "10.0.0.1" not in csp and "localhost" not in csp and " * " not in csp
    assert "base-uri 'none'" in csp and "object-src 'none'" in csp

    html = out["html"]
    assert html.startswith("<!DOCTYPE html>\n<meta http-equiv=\"Content-Security-Policy\"")
    assert html.lower().count("<!doctype") == 1
    assert "http-equiv=\"refresh\"" not in html
    assert "postMessage" in html  # app script preserved (runs only inside the sandbox)
    assert out["size_bytes"] == len(html.encode())
    assert len(out["content_sha256"]) == 64
    assert any("unsafe" in w for w in out["warnings"])

    audit = gw.get_audit_log(project_id=PROJECT_ID)
    assert audit[-1]["action"] == "resources/read"
    assert audit[-1]["status"] == "succeeded"
    assert audit[-1]["resource_uri"] == "ui://charts/app.html"
    assert persisted and persisted[-1]["action"] == "resources/read"


@pytest.mark.parametrize(
    "app_id,status,match",
    [
        ("app_apps_mcp_legacy_page", 415, "text/html;profile=mcp-app"),
        ("app_apps_mcp_huge_chart", 413, "size limit"),
        ("app_apps_mcp_ghost", 502, "Unknown resource"),
        ("app_apps_mcp_traversal", 400, "invalid"),
        ("app_does_not_exist", 404, "Unknown MCP App"),
        ("app_security_hygiene", 400, "does not declare"),
    ],
)
async def test_mcp_app_invalid_resources_rejected(fake_mcp, app_id, status, match):
    gw = await _discovered_gateway(fake_mcp)
    with pytest.raises(MCPAppResourceError, match=match) as exc_info:
        await MCPAppsService(gw).fetch_app_resource(
            app_id=app_id, role="security_engineer", department="security", project_id=PROJECT_ID
        )
    assert exc_info.value.status == status
    if status in (413, 415, 502, 400) and app_id.startswith("app_apps_mcp"):
        last = gw.get_audit_log(project_id=PROJECT_ID)[-1]
        assert last["action"] == "resources/read"
        assert last["status"] in ("error", "denied")


async def test_mcp_app_department_rbac(fake_mcp):
    gw = await _discovered_gateway(fake_mcp)
    before = len(fake_mcp.calls)
    with pytest.raises(MCPAppResourceError) as exc_info:
        await MCPAppsService(gw).fetch_app_resource(
            app_id="app_apps_mcp_chart", role="product_manager", department="business", project_id=PROJECT_ID
        )
    assert exc_info.value.status == 403
    assert len(fake_mcp.calls) == before  # denied before any outbound call
    assert gw.get_audit_log(project_id=PROJECT_ID)[-1]["status"] == "denied"


def test_mcp_app_sanitizer_rejects_mismatched_and_malformed_content():
    good_entry = {"uri": "ui://a/app.html", "mimeType": "text/html;profile=mcp-app", "text": "<p>hi</p>"}
    with pytest.raises(MCPAppResourceError, match="does not match"):
        sanitize_mcp_app_resource({"contents": [dict(good_entry, uri="ui://b/x.html")]}, expected_uri="ui://a/app.html")
    with pytest.raises(MCPAppResourceError, match="exactly one"):
        sanitize_mcp_app_resource({"contents": [good_entry, good_entry]}, expected_uri="ui://a/app.html")
    with pytest.raises(MCPAppResourceError, match="control characters"):
        sanitize_mcp_app_resource(
            {"contents": [dict(good_entry, text="<p>\x00</p>")]}, expected_uri="ui://a/app.html"
        )
    with pytest.raises(MCPAppResourceError, match="base64"):
        sanitize_mcp_app_resource(
            {"contents": [{"uri": "ui://a/app.html", "mimeType": "text/html;profile=mcp-app", "blob": "@@@"}]},
            expected_uri="ui://a/app.html",
        )
    html, sandbox, _ = sanitize_mcp_app_resource(
        {"contents": [{"uri": "ui://a/app.html", "mimeType": "Text/HTML; profile=mcp-app", "blob": "PHA+aGk8L3A+"}]},
        expected_uri="ui://a/app.html",
    )
    assert html.endswith("<p>hi</p>")
    assert sandbox["csp"].count("connect-src 'none'") == 1


def test_mcp_app_resource_api_endpoint(forge):
    url = f"/v1/projects/{PROJECT_ID}/protocols/mcp/apps/app_apps_mcp_chart/resource"
    res = forge.client.get(url, params={"role": "frontend_engineer", "department": "engineering"})
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["sandbox"]["iframe_sandbox"] == "allow-scripts"
    assert body["resource_uri"] == "ui://charts/app.html"

    listing = forge.client.get(f"/v1/projects/{PROJECT_ID}/protocols/mcp/apps").json()
    assert any(a["app_id"] == "app_apps_mcp_chart" for a in listing["apps"])

    bad = forge.client.get(
        f"/v1/projects/{PROJECT_ID}/protocols/mcp/apps/app_apps_mcp_legacy_page/resource",
        params={"role": "frontend_engineer", "department": "engineering"},
    )
    assert bad.status_code == 415
    denied = forge.client.get(url, params={"role": "pm", "department": "business"})
    assert denied.status_code == 403
    other = forge.client.get(
        f"/v1/projects/{OTHER_PROJECT_ID}/protocols/mcp/apps/app_apps_mcp_chart/resource",
        params={"role": "frontend_engineer", "department": "engineering"},
    )
    assert other.status_code == 404

    # MCP audit persisted to the (fake) Mongo collection
    actions = [(d["action"], d["status"]) for d in forge.db.mcp_audit_logs.docs]
    assert ("resources/read", "succeeded") in actions
    assert ("resources/read", "error") in actions
    assert ("resources/read", "denied") in actions
