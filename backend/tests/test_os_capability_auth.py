"""Authorization parity: capability handlers enforce exactly what the REST endpoints enforce.

Each handler calls the existing route function, so these tests drive the
handlers (not the routes) and assert the denials the routes are known for:
project / build / initiative access (404 for strangers), admin_required (admin
flag *and* MFA), plan limits (402) and governance-gate approver roles (403).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import pytest

from core.os_capabilities import HANDLERS, get_descriptor, get_handler
from core.os_contracts import validate_a2ui_message, validate_contract
from tests.test_os_capability_fakes import (
    ADMIN,
    MEMBER,
    OWNER,
    STRANGER,
    make_ctx,
    make_user,
    patch_db,
    seeded_db,
    user_doc,
)

PM_SEED = {
    "tasks": [{"id": "t1", "initiative_id": "i1", "user_id": OWNER, "title": "Task", "status": "todo"}],
    "sprints": [{"id": "s1", "initiative_id": "i1", "user_id": OWNER, "name": "Sprint 1"}],
    "epics": [{"id": "e1", "initiative_id": "i1", "user_id": OWNER, "title": "Epic"}],
    "releases": [{"id": "r1", "initiative_id": "i1", "user_id": OWNER, "version": "1.0.0"}],
    "agent_executions": [{"id": "x1", "initiative_id": "i1", "user_id": OWNER}],
}

# Resource ids owned by OWNER (seeded above); a STRANGER must never reach them.
OWNED_IDS = {
    "project_id": "p1",
    "build_id": "b1",
    "deployment_id": "d1",
    "initiative_id": "i1",
    "task_id": "t1",
    "sprint_id": "s1",
    "epic_id": "e1",
    "release_id": "r1",
    "execution_id": "x1",
    "run_id": "run1",
    "gate_id": "g1",
    "agent_id": "agent1",
    "plan_id": "plan1",
}


def _dummy(schema: Dict[str, Any], name: str) -> Any:
    if name in OWNED_IDS:
        return OWNED_IDS[name]
    t = schema.get("type")
    if "enum" in schema:
        return schema["enum"][0]
    if t == "string":
        return ("x" * max(int(schema.get("minLength", 0)), 12))[: schema.get("maxLength", 200)]
    if t == "integer":
        return max(schema.get("minimum", 1), 1)
    if t == "number":
        return float(max(schema.get("minimum", 1), 1))
    if t == "boolean":
        return False
    if t == "array":
        return []
    return {}


_STEP = {"id": "a", "title": "Step A"}
INPUT_OVERRIDES: Dict[Tuple[str, str], Dict[str, Any]] = {
    ("agents.product_lead", "ask"): {"kind": "why", "question": "Why did we build the bakery site?"},
    ("workflow.design", "save"): {"nodes": [_STEP], "edges": []},
    ("workflow.design", "run"): {"nodes": [_STEP], "edges": []},
}


def _input_for(cap_id: str, action_id: str) -> Dict[str, Any]:
    desc = get_descriptor(cap_id)
    action = next(a for a in desc.actions if a.id == action_id)
    schema = action.input_schema
    props = schema.get("properties", {})
    out = {k: _dummy(props[k], k) for k in schema.get("required", [])}
    for k in props:
        if k in OWNED_IDS and k not in out:
            out[k] = OWNED_IDS[k]
    out.update(INPUT_OVERRIDES.get((cap_id, action_id), {}))
    return out


def _owned_resource_handlers() -> List[Tuple[str, str]]:
    keys = []
    for (cap_id, action_id) in sorted(HANDLERS):
        if cap_id.startswith(("admin.", "models.")) or cap_id in ("data.retrieval",):
            continue
        desc = get_descriptor(cap_id)
        action = next(a for a in desc.actions if a.id == action_id)
        props = action.input_schema.get("properties", {})
        if any(k in props for k in OWNED_IDS) or desc.requires_project:
            keys.append((cap_id, action_id))
    return keys


OWNED_HANDLERS = _owned_resource_handlers()

# Routes that scope by ``user_id`` instead of denying: a stranger gets an empty result, never the owner's data.
USER_SCOPED = {("build.deploy", "list")}


@pytest.fixture
def db(monkeypatch):
    # Deployments are opt-in per instance; enable them so the access check (not the flag) is what denies.
    monkeypatch.setenv("DEPLOYMENTS_ENABLED", "true")
    fake = seeded_db(**PM_SEED)
    patch_db(monkeypatch, fake)
    return fake


@pytest.mark.parametrize("cap_id,action_id", OWNED_HANDLERS, ids=[f"{c}.{a}" for c, a in OWNED_HANDLERS])
async def test_stranger_is_denied_owned_resources(db, cap_id: str, action_id: str) -> None:
    """Every handler touching a project, build, deployment, initiative or PM item denies a stranger."""
    stranger = make_user(STRANGER)
    ctx = make_ctx(stranger, cap_id, action_id, project_id="p1")
    outcome = await get_handler(cap_id, action_id)(ctx, _input_for(cap_id, action_id))
    if (cap_id, action_id) in USER_SCOPED:
        assert outcome.status == "completed"
        assert '"d1"' not in json.dumps(ctx.metadata["result"]) and ctx.metadata["result"]["total"] == 0
        return
    assert outcome.status == "rejected", (cap_id, action_id, outcome)
    assert ctx.metadata["os_error"]["code"] in ("not_found", "forbidden"), ctx.metadata["os_error"]
    assert "result" not in ctx.metadata
    assert not outcome.a2ui_messages


def test_sweep_covers_the_project_scoped_handlers() -> None:
    assert len(OWNED_HANDLERS) >= 80
    for key in [("projects.manage", "delete"), ("build.deploy", "deploy"), ("agents.kernel_run", "start"),
                ("governance.approvals", "approve"), ("plan.initiative.board", "change_status"), ("workflow.design", "run")]:
        assert key in OWNED_HANDLERS


ADMIN_HANDLERS = sorted(k for k in HANDLERS if get_descriptor(k[0]).admin_only)


@pytest.mark.parametrize("cap_id,action_id", ADMIN_HANDLERS, ids=[f"{c}.{a}" for c, a in ADMIN_HANDLERS])
@pytest.mark.parametrize("who", ["non_admin", "admin_without_mfa"])
async def test_admin_only_handlers_deny_non_admins(monkeypatch, cap_id: str, action_id: str, who: str) -> None:
    fake = seeded_db()
    if who == "admin_without_mfa":
        fake.users.docs.append(user_doc(make_user("user-admin-nomfa"), is_admin=True, mfa_enabled=False))
        user = make_user("user-admin-nomfa", is_admin=True)
    else:
        user = make_user(OWNER)
    patch_db(monkeypatch, fake)
    ctx = make_ctx(user, cap_id, action_id)
    outcome = await get_handler(cap_id, action_id)(ctx, _input_for(cap_id, action_id))
    assert outcome.status == "rejected"
    assert ctx.metadata["os_error"]["code"] == "forbidden"


def test_admin_sweep_covers_every_admin_capability() -> None:
    caps = {c for c, _ in ADMIN_HANDLERS}
    assert caps == {"models.admin", "admin.ops", "admin.prompts", "admin.optimization", "admin.health", "admin.analytics"}


async def test_admin_with_mfa_passes_admin_gate(db) -> None:
    ctx = make_ctx(make_user(ADMIN, is_admin=True), "admin.ops", "flags")
    outcome = await get_handler("admin.ops", "flags")(ctx, {})
    assert outcome.status == "completed", ctx.metadata
    for msg in outcome.a2ui_messages:
        assert validate_a2ui_message(msg) == []


async def test_project_create_enforces_plan_limit(db) -> None:
    from api.billing import get_max_projects_for_user

    limit = await get_max_projects_for_user(db, OWNER)
    assert limit >= 0
    for n in range(limit):
        db.projects.docs.append({"id": f"extra{n}", "user_id": OWNER, "name": "x", "deleted_at": None})
    ctx = make_ctx(make_user(OWNER), "projects.manage", "create")
    outcome = await get_handler("projects.manage", "create")(ctx, {"name": "One too many"})
    assert outcome.status == "rejected"
    assert ctx.metadata["http_status"] == 402
    assert ctx.metadata["os_error"]["code"] == "budget_exceeded"


async def test_build_new_stops_at_plan_limit_without_starting_a_build(db) -> None:
    from api.billing import get_max_projects_for_user

    for n in range(await get_max_projects_for_user(db, OWNER)):
        db.projects.docs.append({"id": f"extra{n}", "user_id": OWNER, "name": "x", "deleted_at": None})
    builds_before = len(db.builds.docs)
    ctx = make_ctx(make_user(OWNER), "build.new", "start_build")
    outcome = await get_handler("build.new", "start_build")(ctx, {"prompt": "Build me a site for my bakery"})
    assert outcome.status == "rejected" and ctx.metadata["os_error"]["code"] == "budget_exceeded"
    assert len(db.builds.docs) == builds_before


async def test_org_member_cannot_decide_governance_gate(db) -> None:
    """Members can see a shared project's runs but only owners/admins decide gates (can_decide_project_gates)."""
    ctx = make_ctx(make_user(MEMBER), "governance.approvals", "approve", project_id="p1")
    outcome = await get_handler("governance.approvals", "approve")(ctx, {"project_id": "p1", "run_id": "run1", "gate_id": "g1"})
    assert outcome.status == "rejected"
    assert ctx.metadata["os_error"]["code"] == "forbidden"


async def test_org_viewer_cannot_approve_initiative(monkeypatch) -> None:
    fake = seeded_db(team_members=[{"org_id": "org2", "user_id": MEMBER, "role": "viewer"}])
    fake.initiatives.docs.append({"id": "i2", "user_id": OWNER, "org_id": "org2", "name": "Shared", "status": "ready"})
    patch_db(monkeypatch, fake)
    ctx = make_ctx(make_user(MEMBER), "plan.initiative.overview", "approve")
    outcome = await get_handler("plan.initiative.overview", "approve")(ctx, {"initiative_id": "i2"})
    assert outcome.status == "rejected"
    assert ctx.metadata["os_error"]["code"] in ("forbidden", "not_found")


async def test_owner_can_list_and_rename_projects(db) -> None:
    owner = make_user(OWNER)
    ctx = make_ctx(owner, "projects.manage", "list")
    outcome = await get_handler("projects.manage", "list")(ctx, {})
    assert outcome.status == "completed"
    assert [p["id"] for p in ctx.metadata["result"]["projects"]] == ["p1"]
    (message,) = outcome.a2ui_messages
    assert validate_a2ui_message(message) == []
    assert message["createSurface"]["dataModel"]["rows"][0]["name"] == "Bakery site"
    for place in outcome.placements:
        assert validate_contract("SurfacePlacement", place) == []

    ctx = make_ctx(owner, "projects.manage", "rename")
    outcome = await get_handler("projects.manage", "rename")(ctx, {"project_id": "p1", "name": "Bakery v2"})
    assert outcome.status == "completed"
    assert db.projects.docs[0]["name"] == "Bakery v2"


async def test_profile_update_cannot_smuggle_byok_key_or_token(db) -> None:
    ctx = make_ctx(make_user(OWNER), "account.profile", "update_profile")
    outcome = await get_handler("account.profile", "update_profile")(
        ctx, {"name": "New name", "llm_api_key": "sk-live-should-not-pass", "github_token": "ghp_nope"}
    )
    assert outcome.status == "completed"
    doc = next(u for u in db.users.docs if u["id"] == OWNER)
    assert doc["name"] == "New name"
    assert doc.get("llm_api_key") in (None, "")
    assert doc.get("github_token") in (None, "")


async def test_open_places_the_capability_renderer() -> None:
    ctx = make_ctx(make_user(OWNER), "projects.manage", "open")
    outcome = await get_handler("projects.manage", "open")(ctx, {})
    (place,) = outcome.placements
    assert place["capability_id"] == "projects.manage" and place["presentation"] == "window"
    assert validate_contract("SurfacePlacement", place) == []
