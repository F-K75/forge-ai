"""WS-C: capability registry + invoke, generated-surface actions, models, attachments, workspaces."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import api.os as os_api
from core.os import attachments as attachments_module
from core.os.capability_registry import CapabilityRegistry, load_descriptor_file
from core.os.models_catalog import resolve_selection
from core.os.common import OsHTTPError
from core.os.runtime import OsRuntime
from core.os_contracts import ActionOutcome, validate_contract
from tests.os_fakes import FakeRedis, UserSwitch, indexed_db, make_app, make_user

ADMIN_ONLY = {"models.admin", "admin.ops", "admin.prompts", "admin.optimization", "admin.health", "admin.analytics"}

PROJECTS_DESCRIPTOR = {
    "id": "projects.manage",
    "version": 2,
    "title": "Projects",
    "summary": "List, create, rename and delete projects.",
    "category": "build",
    "intents": ["manage_projects"],
    "keywords": ["projects"],
    "permissions": ["authenticated"],
    "requires_project": False,
    "admin_only": False,
    "min_plan": None,
    "entry_points": ["prompt", "palette", "library", "deeplink"],
    "surfaces": ["window", "panel"],
    "default_surface": "window",
    "renderer": {"kind": "legacy_route", "route": "/projects"},
    "actions": [
        {
            "id": "rename",
            "title": "Rename",
            "permissions": ["project:write"],
            "destructive": False,
            "requires_confirmation": False,
            "input_schema": {
                "type": "object",
                "properties": {"name": {"type": "string", "minLength": 1, "maxLength": 50}},
                "required": ["name"],
                "additionalProperties": False,
            },
        },
        {
            "id": "delete",
            "title": "Delete",
            "permissions": ["project:write"],
            "destructive": True,
            "requires_confirmation": True,
            "input_schema": {"type": "object", "additionalProperties": False},
        },
    ],
    "input_schema": {"type": "object"},
    "output_schema": {"type": "object"},
    "api_bindings": [{"method": "GET", "path": "/v1/projects/", "stream": "none"}],
    "persistence": "server",
    "legacy_routes": ["/projects"],
    "status": "available",
}


@pytest.fixture
def registry(tmp_path):
    path = tmp_path / "capabilities.json"
    bad = {**PROJECTS_DESCRIPTOR, "id": "models.compare", "renderer": {"kind": "eval", "code": "x"}}
    path.write_text(json.dumps({"version": 1, "capabilities": [PROJECTS_DESCRIPTOR, bad]}))
    return CapabilityRegistry.load(descriptor_path=path)


@pytest.fixture
async def env(registry):
    db = await indexed_db()
    redis = FakeRedis()

    async def _redis():
        return redis

    rt = OsRuntime(db, registry=registry, redis_getter=_redis)
    db["projects"].docs.extend(
        [
            {"id": "proj_a", "user_id": "alice", "org_id": "org_1", "deleted_at": None, "name": "A"},
            {"id": "proj_m", "user_id": "mallory", "org_id": None, "deleted_at": None, "name": "M"},
        ]
    )
    db["team_members"].docs.append({"org_id": "org_1", "user_id": "victor", "role": "viewer"})
    caller = UserSwitch(make_user("alice"))
    calls = []

    async def rename(ctx, payload):
        calls.append((ctx, payload))
        return ActionOutcome(
            status="completed",
            message="Renamed",
            a2ui_messages=[
                {
                    "version": "1.0",
                    "createSurface": {
                        "surfaceId": "srf_rename",
                        "catalogId": "urn:forge:a2ui:catalog:ember:1",
                        "components": [
                            {"id": "root", "component": "Column", "children": ["ok", "evil"]},
                            {"id": "ok", "component": "Text", "text": "done"},
                            {"id": "evil", "component": "Iframe", "src": "https://evil.example"},
                        ],
                    },
                }
            ],
            placements=[
                {"surface_id": "srf_rename", "presentation": "inline", "title": "Renamed"},
                {"surface_id": "srf_not_mine", "presentation": "window", "title": "x"},
            ],
        )

    registry.register_action_handler("projects.manage", "rename", rename)
    with TestClient(make_app(rt, caller)) as client:
        yield {"rt": rt, "db": db, "client": client, "caller": caller, "calls": calls, "registry": registry}


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #


def test_registry_merges_descriptors_and_drops_invalid(registry):
    assert len(registry.all()) == 71
    assert registry.get("projects.manage")["version"] == 2  # WS-D descriptor wins
    assert "projects.manage" not in registry.synthesized
    # the invalid "models.compare" descriptor was dropped -> synthesized fallback
    assert "models.compare" in registry.synthesized
    assert registry.get("models.compare")["renderer"]["kind"] == "component"
    assert validate_contract("CapabilityCatalog", {"version": 1, "capabilities": registry.all()}) == []


def test_missing_capabilities_file_is_tolerated(tmp_path):
    assert load_descriptor_file(tmp_path / "nope.json") == []
    reg = CapabilityRegistry.load(descriptor_path=tmp_path / "nope.json")
    assert len(reg.all()) == 71 and len(reg.synthesized) == 71


def test_action_name_resolution(registry):
    assert registry.resolve_action_name("projects.manage.rename") == ("projects.manage", "rename")
    assert registry.resolve_action_name("projects.manage.drop_database") is None
    assert registry.resolve_action_name("admin.ops.rename") is None
    with pytest.raises(KeyError):
        registry.register_action_handler("projects.manage", "undeclared", lambda c, i: None)


def test_catalog_hides_admin_capabilities(env):
    client = env["client"]
    caps = client.get("/v1/os/capabilities").json()["capabilities"]
    assert len(caps) == 71 - len(ADMIN_ONLY)
    assert not ADMIN_ONLY & {c["id"] for c in caps}
    env["caller"].user = make_user("root", is_admin=True)  # admin without MFA: still hidden
    assert len(client.get("/v1/os/capabilities").json()["capabilities"]) == 65
    env["caller"].user = make_user("root", is_admin=True, mfa_enabled=True)
    body = client.get("/v1/os/capabilities").json()
    assert len(body["capabilities"]) == 71
    assert validate_contract("CapabilityCatalog", body) == []


# --------------------------------------------------------------------------- #
# Invoke (palette / library) -- validated, authorised
# --------------------------------------------------------------------------- #


def _invoke(client, action="rename", input=None, **kw):
    body = {"action_id": "act_1", "capability_id": "projects.manage", "action": action, "input": input or {}, **kw}
    return client.post("/v1/os/capabilities/projects.manage/invoke", json=body)


def test_invoke_validates_input_against_schema(env):
    c = env["client"]
    assert _invoke(c, input={"name": 5}, project_id="proj_a").status_code == 422
    assert _invoke(c, input={"name": "ok", "owner": "mallory"}, project_id="proj_a").status_code == 422
    assert _invoke(c, input={}, project_id="proj_a").status_code == 422
    assert env["calls"] == []
    r = _invoke(c, input={"name": "Renamed"}, project_id="proj_a")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"
    ctx, payload = env["calls"][0]
    assert payload == {"name": "Renamed"} and ctx.project_id == "proj_a" and ctx.user.id == "alice"
    # invalid component dropped, unknown-surface placement dropped
    comps = r.json()["a2ui_messages"][0]["createSurface"]["components"]
    assert [x["id"] for x in comps] == ["root", "ok"]
    assert comps[0]["children"] == ["ok"]


def test_invoke_rejects_unknown_and_hidden(env):
    c = env["client"]
    assert _invoke(c, action="drop_database").status_code == 404
    body = {"action_id": "a", "capability_id": "admin.ops", "action": "users", "input": {}}
    assert c.post("/v1/os/capabilities/admin.ops/invoke", json=body).status_code == 404
    body = {"action_id": "a", "capability_id": "projects.manage", "action": "rename", "input": {}}
    assert c.post("/v1/os/capabilities/admin.ops/invoke", json=body).status_code == 422  # path/body mismatch
    assert c.post("/v1/os/capabilities/Not-A-Cap/invoke", json=body).status_code == 422


def test_invoke_cross_tenant_project_is_404_and_viewer_cannot_write(env):
    c = env["client"]
    assert _invoke(c, input={"name": "x"}, project_id="proj_m").status_code == 404
    env["caller"].user = make_user("victor")  # org viewer of proj_a
    r = _invoke(c, input={"name": "x"}, project_id="proj_a")
    assert r.status_code == 403
    assert env["calls"] == []


def test_destructive_action_requires_confirmation_and_unhandled_is_rejected(env):
    c = env["client"]
    assert _invoke(c, action="delete", project_id="proj_a").status_code == 409
    r = _invoke(c, action="delete", input={"_confirmed": True}, project_id="proj_a")
    assert r.status_code == 200 and r.json()["status"] == "rejected"  # no WS-D handler registered


async def test_invoke_into_session_streams_validated_events(env):
    rt, c = env["rt"], env["client"]
    ses = await rt.sessions.create(user_id="alice", title="t", project_id="proj_a")
    r = _invoke(c, input={"name": "Renamed"}, session_id=ses["id"])
    assert r.status_code == 202, r.text
    events = await rt.events.log.read_after(ses["id"], "alice", 0)
    types = [e["type"] for e in events]
    assert types == ["a2ui.message", "surface.placed", "action.result"]
    assert events[1]["data"]["placement"]["surface_id"] == "srf_rename"
    # mallory cannot invoke into alice's session
    env["caller"].user = make_user("mallory")
    assert _invoke(c, input={"name": "x"}, session_id=ses["id"]).status_code == 404


# --------------------------------------------------------------------------- #
# Generated-surface actions
# --------------------------------------------------------------------------- #


async def _surface_with_action(rt, session_id):
    await rt.surfaces.apply(
        user_id="alice",
        session_id=session_id,
        turn_id="turn_1",
        message={
            "version": "1.0",
            "createSurface": {
                "surfaceId": "srf_btn",
                "catalogId": "urn:forge:a2ui:catalog:ember:1",
                "components": [
                    {"id": "root", "component": "Column", "children": ["btn"]},
                    {
                        "id": "btn",
                        "component": "Button",
                        "label": "Rename",
                        "action": {"event": {"name": "projects.manage.rename", "context": {"project_id": "proj_a"}}},
                    },
                ],
            },
        },
    )


def _action(session_id, name="projects.manage.rename", context=None, source="btn", surface="srf_btn"):
    return {
        "action_id": "act_9",
        "session_id": session_id,
        "a2ui": {
            "version": "1.0",
            "action": {
                "name": name,
                "surfaceId": surface,
                "sourceComponentId": source,
                "timestamp": "2026-11-27T10:00:00Z",
                "context": context or {},
            },
        },
    }


async def test_surface_action_must_be_offered_by_the_stored_surface(env):
    rt, c = env["rt"], env["client"]
    ses = await rt.sessions.create(user_id="alice", title="t")
    await _surface_with_action(rt, ses["id"])
    path = f"/v1/os/sessions/{ses['id']}/actions"
    # action not offered by this surface / component
    assert c.post(path, json=_action(ses["id"], name="projects.manage.delete")).status_code == 404
    assert c.post(path, json=_action(ses["id"], source="root")).status_code == 404
    assert c.post(path, json=_action(ses["id"], surface="srf_other")).status_code == 404
    assert c.post(path, json=_action("ses_other")).status_code == 422
    # client tries to swap the project: server-authored context wins
    r = c.post(path, json=_action(ses["id"], context={"name": "New", "project_id": "proj_m"}))
    assert r.status_code == 202, r.text
    ctx, payload = env["calls"][-1]
    assert ctx.project_id == "proj_a" and payload == {"name": "New"}
    events = await rt.events.log.read_after(ses["id"], "alice", 0)
    assert events[-1]["type"] == "action.result" and events[-1]["data"]["status"] == "completed"
    # another user cannot act on alice's session
    env["caller"].user = make_user("mallory")
    assert c.post(path, json=_action(ses["id"], context={"name": "x"})).status_code == 404


async def test_surface_action_schema_failure_is_reported_as_rejected(env):
    rt, c = env["rt"], env["client"]
    ses = await rt.sessions.create(user_id="alice", title="t")
    await _surface_with_action(rt, ses["id"])
    r = c.post(f"/v1/os/sessions/{ses['id']}/actions", json=_action(ses["id"], context={"name": 123}))
    assert r.status_code == 202
    last = (await rt.events.log.read_after(ses["id"], "alice", 0))[-1]
    assert last["data"]["status"] == "rejected"
    assert env["calls"] == []


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #


def test_models_catalog_is_secret_free(env):
    c = env["client"]
    body = c.get("/v1/os/models").json()
    assert [t["id"] for t in body["tiers"]] == ["fast", "balanced", "best"]
    assert body["can_pin"] is False
    blob = json.dumps(body).lower()
    for secret_word in ("api_key", "secret", "quota", "health", "policy", "base_url"):
        assert secret_word not in blob
    row = body["models"][0]
    assert set(row) == {"provider", "model", "tier", "input_per_1k_usd", "output_per_1k_usd", "available"}
    env["caller"].user = make_user("pro", plan="pro")
    assert c.get("/v1/os/models").json()["can_pin"] is True


def test_model_selection_rules():
    free, pro, byok = make_user("f"), make_user("p", plan="pro"), make_user("b", llm_api_key="enc", llm_model="my-model")
    assert resolve_selection(free, None).task_complexity == "moderate"
    assert resolve_selection(free, {"mode": "auto", "model": "fast"}).task_complexity == "simple"
    assert resolve_selection(free, {"mode": "auto", "model": "best"}).task_complexity == "critical"
    with pytest.raises(OsHTTPError) as exc:
        resolve_selection(free, {"mode": "auto", "model": "gpt-4.1"})
    assert exc.value.status == 422
    with pytest.raises(OsHTTPError) as exc:
        resolve_selection(free, {"mode": "pinned", "model": "gpt-4.1"})
    assert exc.value.status == 403
    pinned = resolve_selection(pro, {"mode": "pinned", "model": "gpt-4.1"})
    assert pinned.model_ref() == {"provider": "openai", "model": "gpt-4.1"}
    with pytest.raises(OsHTTPError):
        resolve_selection(pro, {"mode": "pinned", "provider": "anthropic", "model": "gpt-4.1"})
    with pytest.raises(OsHTTPError):
        resolve_selection(pro, {"mode": "pinned", "model": "made-up"})
    assert resolve_selection(byok, {"mode": "pinned", "model": "my-model"}).model == "my-model"


# --------------------------------------------------------------------------- #
# Attachments
# --------------------------------------------------------------------------- #

CSV = b"Region,Revenue,Units\nNorth,1200,3\nSouth,950.5,7\nEast,\"1,300\",2\n"


def test_upload_dataset_parses_and_returns_attachment_ref(env):
    c, rt = env["client"], env["rt"]
    r = c.post("/v1/os/attachments", files={"file": ("sales.csv", CSV, "text/csv")})
    assert r.status_code == 201, r.text
    ref = r.json()
    assert validate_contract("AttachmentRef", ref) == []
    assert ref["kind"] == "dataset" and ref["mime_type"] == "text/csv" and ref["size_bytes"] == len(CSV)
    doc = rt.db["os_attachments"].docs[0]
    assert doc["user_id"] == "alice"
    assert [col["type"] for col in doc["dataset"]["columns"]] == ["text", "number", "number"]
    assert doc["dataset"]["preview"][2] == {"region": "East", "revenue": 1300, "units": 2}


async def test_attachment_refs_are_owner_scoped(env):
    c, rt = env["client"], env["rt"]
    ref = c.post("/v1/os/attachments", files={"file": ("notes.txt", b"hello", "text/plain")}).json()
    # client cannot relabel: server metadata replaces the client's
    resolved = await rt.attachments.resolve_refs("alice", [{**ref, "name": "evil.exe", "size_bytes": 1, "kind": "dataset"}])
    assert resolved == [ref]
    with pytest.raises(OsHTTPError) as exc:
        await rt.attachments.resolve_refs("mallory", [ref])
    assert exc.value.status == 422
    assert await rt.attachments.read_bytes("mallory", ref["id"]) is None
    assert await rt.attachments.read_bytes("alice", ref["id"]) == b"hello"


def test_upload_type_and_size_limits(env, monkeypatch):
    c = env["client"]
    monkeypatch.setattr(os_api, "ATTACHMENT_LIMIT", (1000, 60))
    assert c.post("/v1/os/attachments", files={"file": ("run.exe", b"MZ", "application/octet-stream")}).status_code == 415
    assert c.post("/v1/os/attachments", files={"file": ("a.png", b"not a png", "image/png")}).status_code == 415
    assert c.post("/v1/os/attachments", files={"file": ("a.csv", b"x", "image/png")}).status_code == 415
    assert c.post("/v1/os/attachments", files={"file": ("a.json", b"{not json", "application/json")}).status_code == 422
    assert c.post("/v1/os/attachments", files={"file": ("empty.txt", b"", "text/plain")}).status_code == 422
    assert c.post("/v1/os/attachments", data={"x": "1"}).status_code == 422
    monkeypatch.setattr(attachments_module, "MAX_DATASET_ROWS", 2)
    assert c.post("/v1/os/attachments", files={"file": ("s.csv", CSV, "text/csv")}).status_code == 413
    monkeypatch.setattr(attachments_module, "MAX_ATTACHMENT_BYTES", 10)
    r = c.post("/v1/os/attachments", files={"file": ("big.txt", b"x" * 100, "text/plain")})
    assert r.status_code == 413
    assert env["db"]["os_attachment_chunks"].docs == []  # nothing half-stored
    monkeypatch.setattr(os_api, "MAX_ATTACHMENT_BYTES", 10)
    assert c.post("/v1/os/attachments", files={"file": ("big.txt", b"x" * 70000, "text/plain")}).status_code == 413


def test_attachment_and_invoke_rate_limits(env):
    c = env["client"]
    codes = [c.post("/v1/os/attachments", files={"file": ("a.txt", b"x", "text/plain")}).status_code for _ in range(21)]
    assert codes[:20] == [201] * 20 and codes[20] == 429
    codes = [_invoke(c, input={"name": "x"}, project_id="proj_a").status_code for _ in range(61)]
    assert codes[-1] == 429 and 429 not in codes[:60]


def test_large_file_is_chunked(env, monkeypatch):
    monkeypatch.setattr(attachments_module, "CHUNK_BYTES", 1000)
    c, db = env["client"], env["db"]
    data = b"%PDF-" + b"z" * 4500
    r = c.post("/v1/os/attachments", files={"file": ("doc.pdf", data, "application/pdf")})
    assert r.status_code == 201
    assert len(db["os_attachment_chunks"].docs) == 5


def test_json_dataset_and_parse_helpers():
    parsed = attachments_module.parse_dataset(json.dumps({"rows": [{"a b": 1, "c": {"x": 1}}, {"a b": "2.5"}]}).encode(), "json")
    assert [c["key"] for c in parsed["columns"]] == ["a_b", "c"]
    assert parsed["rows"][1]["a_b"] == 2.5
    assert attachments_module.sanitize_filename("../../etc/passwd") == "passwd"
    assert attachments_module.sanitize_filename("..\\x\x00y.csv") == "xy.csv"


# --------------------------------------------------------------------------- #
# Workspaces
# --------------------------------------------------------------------------- #


def test_workspace_put_concurrency_and_isolation(env):
    c = env["client"]
    ws = c.get("/v1/os/workspaces/current").json()
    assert validate_contract("WorkspaceState", ws) == []
    r = c.put(f"/v1/os/workspaces/{ws['id']}", json={**ws, "layout": "tiled", "active_session_id": "ses_not_mine"})
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["version"] == 1 and saved["layout"] == "tiled" and saved["active_session_id"] is None
    stale = c.put(f"/v1/os/workspaces/{ws['id']}", json={**ws, "layout": "focus"})
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["version"] == 1
    assert c.put(f"/v1/os/workspaces/{ws['id']}", json={**saved, "id": "wsp_other"}).status_code == 422
    env["caller"].user = make_user("mallory")
    assert c.put(f"/v1/os/workspaces/{ws['id']}", json=saved).status_code == 404
    assert c.get("/v1/os/workspaces/current").json()["id"] != ws["id"]
    bad = {**saved, "windows": [{"id": "w", "kind": "legacy_route", "title": "x", "presentation": "window", "route": "javascript:alert(1)", "z": 0, "state": "normal"}]}
    env["caller"].user = make_user("alice")
    assert c.put(f"/v1/os/workspaces/{ws['id']}", json=bad).status_code == 422


# --------------------------------------------------------------------------- #
# Auth + flag
# --------------------------------------------------------------------------- #


def test_every_route_requires_auth(env):
    c = env["client"]
    env["caller"].user = None
    assert c.get("/v1/os/capabilities").status_code == 401
    assert c.get("/v1/os/models").status_code == 401
    assert c.get("/v1/os/workspaces/current").status_code == 401
    assert c.post("/v1/os/attachments", files={"file": ("a.txt", b"x", "text/plain")}).status_code == 401
    assert _invoke(c, input={"name": "x"}).status_code == 401


async def test_flag_off_hides_the_api(registry, monkeypatch):
    db = await indexed_db()
    rt = OsRuntime(db, registry=registry)
    app = make_app(rt, UserSwitch(make_user("alice")))
    app.dependency_overrides.pop(os_api.require_os_shell)

    async def _off():
        return False

    monkeypatch.setattr(os_api, "is_os_shell_enabled", _off)
    with TestClient(app) as c:
        assert c.get("/v1/os/capabilities").status_code == 404

    async def _on():
        return True

    monkeypatch.setattr(os_api, "is_os_shell_enabled", _on)
    with TestClient(app) as c:
        assert c.get("/v1/os/capabilities").status_code == 200


async def test_os_shell_flag_defaults_on(monkeypatch):
    import core.feature_flags as ff
    from tests.os_fakes import FakeDB

    db = FakeDB()

    async def _db():
        return db

    monkeypatch.setattr(ff, "get_db", _db)
    assert await ff.is_os_shell_enabled() is True
    db["feature_flags"].docs.append({"key": "os_shell", "enabled": False})
    assert await ff.is_os_shell_enabled() is False

    async def _broken():
        raise RuntimeError("db down")

    monkeypatch.setattr(ff, "get_db", _broken)
    assert await ff.is_os_shell_enabled() is False
