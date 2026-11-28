"""WS-D descriptors + handlers wired into WS-C's capability registry and executors."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.os import executors
from core.os.capability_registry import PROJECT_PERMISSIONS, CapabilityRegistry
from core.os.common import OsHTTPError
from core.os_capabilities import HANDLERS, install, load_capability_catalog
from core.os_capabilities.install import SURFACE_BUILDER_OVERRIDES
from core.os_contracts import validate_a2ui_message
from tests.test_os_capability_fakes import MEMBER, OWNER, make_user, patch_db, seeded_db

CAPS = load_capability_catalog().capabilities


@pytest.fixture
def registry(monkeypatch):
    monkeypatch.setattr(executors, "SURFACE_BUILDERS", {})
    reg = CapabilityRegistry.load()
    install(reg)
    return reg


def test_every_capability_is_described_not_synthesized() -> None:
    reg = CapabilityRegistry.load()
    assert reg.synthesized == set()
    assert len(reg.ids()) == 71
    assert all(reg.get(c.id)["actions"] for c in CAPS)


def test_install_registers_every_handler_and_the_surface_builders(registry) -> None:
    for cap, action in HANDLERS:
        assert registry.get_handler(cap, action) is HANDLERS[(cap, action)]
    assert set(executors.SURFACE_BUILDERS) == set(SURFACE_BUILDER_OVERRIDES)


@pytest.mark.parametrize("name,expected", [
    ("agents.create.create", ("agents.create", "create")),
    ("workflow.design.save", ("workflow.design", "save")),
    ("governance.approvals.approve", ("governance.approvals", "approve")),
    ("governance.approvals.reject", ("governance.approvals", "reject")),
    ("models.compare.pin_model", ("models.compare", "pin_model")),
])
def test_ws_c_builtin_surface_actions_resolve(registry, name, expected) -> None:
    assert registry.resolve_action_name(name) == expected


@pytest.mark.parametrize("cap", CAPS, ids=[c.id for c in CAPS])
def test_permissions_are_satisfiable_under_ws_c_rules(cap) -> None:
    """Project permissions need a project (session / invocation / surface context); org:manage needs org_id."""
    if not cap.requires_project:
        assert not set(cap.permissions) & (PROJECT_PERMISSIONS | {"org:manage"}), cap.id
    assert "org:manage" not in cap.permissions
    for a in cap.actions:
        props = a.input_schema.get("properties", {})
        # WS-C pops project_id from surface-action context before schema validation.
        assert "project_id" not in a.input_schema.get("required", []), (cap.id, a.id)
        if set(a.permissions) & PROJECT_PERMISSIONS and not cap.requires_project:
            assert "project_id" in props, (cap.id, a.id)
        if "org:manage" in a.permissions:
            assert "org_id" in props, (cap.id, a.id)


async def _noop(event_type, data):
    return None


async def test_registry_denies_member_gate_decision_and_requires_confirmation(registry, monkeypatch) -> None:
    db = seeded_db()
    patch_db(monkeypatch, db)
    project = db.projects.docs[0]
    with pytest.raises(OsHTTPError) as exc:
        await registry.invoke(db, user=make_user(MEMBER), capability_id="governance.approvals", action_id="approve",
                              input={"run_id": "run1", "gate_id": "g1"}, emit=_noop, project=project)
    assert exc.value.status == 403
    with pytest.raises(OsHTTPError) as exc:
        await registry.invoke(db, user=make_user(OWNER), capability_id="governance.approvals", action_id="reject",
                              input={"run_id": "run1", "gate_id": "g1"}, emit=_noop, project=project)
    assert exc.value.status == 409
    # Owner, confirmed: reaches the handler, which calls the kernel endpoint (the run does not exist).
    outcome = await registry.invoke(db, user=make_user(OWNER), capability_id="governance.approvals", action_id="reject",
                                    input={"run_id": "run1", "gate_id": "g1", "_confirmed": True}, emit=_noop, project=project)
    assert outcome.status == "rejected" and "not found" in (outcome.message or "").lower()


async def test_registry_runs_project_list_end_to_end(registry, monkeypatch) -> None:
    db = seeded_db()
    patch_db(monkeypatch, db)
    outcome = await registry.invoke(db, user=make_user(OWNER), capability_id="projects.manage", action_id="list",
                                    input={}, emit=_noop)
    assert outcome.status == "completed"
    for msg in outcome.a2ui_messages:
        assert validate_a2ui_message(msg) == []


async def test_surface_builders_produce_valid_surfaces(monkeypatch) -> None:
    db = seeded_db(kernel_runs=[{"id": "run1", "project_id": "p1", "status": "waiting_approval",
                                 "approval_gates": [{"gate_id": "g1", "gate_name": "pre_delivery_approval", "status": "pending"}]}])
    patch_db(monkeypatch, db)
    turn = SimpleNamespace(user=make_user(OWNER), project=None, prompt="Compare Claude and GPT", attachments=[],
                           session_id="s1", turn_id="t1", rt=SimpleNamespace(attachments=None))
    step = SimpleNamespace(params={})
    for cap in ("models.compare", "governance.approvals"):
        messages, title = await SURFACE_BUILDER_OVERRIDES[cap](turn, step)
        assert title and messages
        for msg in messages:
            assert validate_a2ui_message(msg) == []
    messages, _ = await SURFACE_BUILDER_OVERRIDES["governance.approvals"](turn, step)
    names = [c["component"] for c in messages[0]["createSurface"]["components"]]
    assert "ApprovalCard" in names

    member_turn = SimpleNamespace(**{**turn.__dict__, "user": make_user(MEMBER)})
    messages, _ = await SURFACE_BUILDER_OVERRIDES["governance.approvals"](member_turn, step)
    assert "ApprovalCard" not in [c["component"] for c in messages[0]["createSurface"]["components"]]


async def test_data_analyze_builder_reads_the_callers_attachment() -> None:
    csv = b"region,revenue\nEMEA,10\nAPAC,5\n"

    class Repo:
        async def get(self, user_id, att_id):
            return {"id": att_id, "name": "sales.csv", "ext": "csv", "kind": "dataset"} if user_id == OWNER else None

        async def read_bytes(self, user_id, att_id):
            return csv if user_id == OWNER else None

    step = SimpleNamespace(params={"attachment_id": "att_1"})
    turn = SimpleNamespace(user=make_user(OWNER), project=None, attachments=[], rt=SimpleNamespace(attachments=Repo()))
    messages, title = await SURFACE_BUILDER_OVERRIDES["data.analyze"](turn, step)
    assert title == "Analysis of sales.csv"
    assert validate_a2ui_message(messages[0]) == []
    assert "DataTable" in [c["component"] for c in messages[0]["createSurface"]["components"]]

    other = SimpleNamespace(user=make_user(MEMBER), project=None, attachments=[], rt=SimpleNamespace(attachments=Repo()))
    messages, _ = await SURFACE_BUILDER_OVERRIDES["data.analyze"](other, step)
    assert "DataTable" not in [c["component"] for c in messages[0]["createSurface"]["components"]]
