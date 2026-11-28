"""capabilities.json: shape, drift, coverage of the matrix and the index, and the handler partition."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from core import os_contracts as oc
from core.os_capabilities import (
    CAPABILITIES_FILE,
    CLIENT_SIDE_ACTIONS,
    HANDLERS,
    KERNEL_ACTIONS,
    action_event_name,
    load_capability_catalog,
    resolve_action_event,
)

REPO = Path(__file__).resolve().parents[2]
SHARED = REPO / "shared" / "os-schemas" / "capabilities.json"
needs_repo = pytest.mark.skipif(not SHARED.exists(), reason="shared/ not in this image")

RAW = json.loads(CAPABILITIES_FILE.read_text(encoding="utf-8"))
CATALOG = load_capability_catalog()
CAPS = CATALOG.capabilities


@needs_repo
@pytest.mark.parametrize("copy", ["backend/core/os_schemas/capabilities.json", "frontend/src/os/schemas/capabilities.json"])
def test_copies_match_canonical(copy: str) -> None:
    assert (REPO / copy).read_bytes() == SHARED.read_bytes(), f"copy {copy} drifted from shared/os-schemas/capabilities.json"


def test_is_a_valid_capability_catalog() -> None:
    assert oc.validate_contract("CapabilityCatalog", RAW) == []


def test_one_descriptor_per_index_row_in_index_order() -> None:
    index = oc.load_capability_index()
    assert [c.id for c in CAPS] == [c.id for c in index.capabilities]
    for cap, row in zip(CAPS, index.capabilities):
        for field in ("title", "category", "intents", "default_surface", "requires_project", "admin_only", "legacy_routes"):
            assert getattr(cap, field) == getattr(row, field), (cap.id, field)


@needs_repo
def test_every_matrix_capability_is_described() -> None:
    matrix = (REPO / "docs" / "os" / "CAPABILITY_MATRIX.md").read_text(encoding="utf-8")
    ids = set(re.findall(r"^\| `([a-z_]+(?:\.[a-z_]+)+)`", matrix, re.M))
    assert len(ids) >= 70
    assert ids == {c.id for c in CAPS}


@pytest.mark.parametrize("cap", CAPS, ids=[c.id for c in CAPS])
def test_descriptor_rules(cap) -> None:
    assert cap.default_surface in cap.surfaces
    assert cap.actions, "every capability declares at least one action"
    Draft202012Validator.check_schema(cap.input_schema)
    Draft202012Validator.check_schema(cap.output_schema)
    ids = [a.id for a in cap.actions]
    assert len(ids) == len(set(ids))
    for a in cap.actions:
        Draft202012Validator.check_schema(a.input_schema)
        if a.destructive:
            assert a.requires_confirmation, (cap.id, a.id)
        assert re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}", action_event_name(cap.id, a.id))
    if cap.admin_only:
        assert "admin" in cap.permissions
        assert all("admin" in a.permissions for a in cap.actions)
    if cap.legacy_routes:
        assert "deeplink" in cap.entry_points
    for b in cap.api_bindings:
        assert (b.method == "WS") == (b.stream == "websocket")


def test_every_declared_action_has_exactly_one_home() -> None:
    declared = {(c.id, a.id) for c in CAPS for a in c.actions}
    handled, client, kernel = set(HANDLERS), set(CLIENT_SIDE_ACTIONS), set(KERNEL_ACTIONS)
    assert not (handled & client) and not (handled & kernel) and not (client & kernel)
    assert declared == handled | client | kernel


def test_secret_bearing_actions_stay_client_side() -> None:
    for key in [("account.api_keys", "create"), ("account.byok_models", "set_provider"), ("account.security", "change_password"),
                ("account.security", "mfa_setup"), ("build.deploy", "push_github"), ("account.billing", "checkout")]:
        assert key in CLIENT_SIDE_ACTIONS and key not in HANDLERS


def test_resolve_action_event() -> None:
    assert resolve_action_event("governance.approvals.approve") == ("governance.approvals", "approve")
    assert resolve_action_event("plan.initiative.board.change_status") == ("plan.initiative.board", "change_status")
    assert resolve_action_event("gate.approve", "governance.approvals") == ("governance.approvals", "approve")
    assert resolve_action_event("approve", "governance.approvals") == ("governance.approvals", "approve")
    assert resolve_action_event("admin.ops.drop_database") is None
    assert resolve_action_event("gate.approve") is None
