"""Contract tests for the Forge OS shared contracts (core/os_contracts.py).

The same example payloads (shared/os-schemas/examples) are validated here with
the reference `jsonschema` library and the Pydantic mirror, and in
frontend/src/os/contracts.test.ts with the frontend validator, so all three
agree on what is valid.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pytest
from jsonschema import Draft202012Validator
from pydantic import TypeAdapter, ValidationError

from core import os_contracts as oc

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED = REPO_ROOT / "shared" / "os-schemas"
FRONTEND_COPY = REPO_ROOT / "frontend" / "src" / "os" / "schemas"
SCHEMA_FILES = ["os-contracts.schema.json", "forge-ember.catalog.json", "capability-index.json"]

needs_repo = pytest.mark.skipif(not SHARED.is_dir(), reason="shared/os-schemas not present (backend-only image)")


def _example_groups() -> List[Dict[str, Any]]:
    if not SHARED.is_dir():
        return []
    groups: List[Dict[str, Any]] = []
    for path in sorted((SHARED / "examples").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        for group in doc.get("groups") or [doc]:
            groups.append({**group, "file": path.name})
    return groups


def _cases(kind: str) -> List[Tuple[str, str, Any]]:
    out = []
    for g in _example_groups():
        if kind == "valid":
            out += [(g["def"], f"{g['file']}:{g['def']}:valid[{i}]", p) for i, p in enumerate(g["valid"])]
        else:
            out += [(g["def"], f"{g['file']}:{g['def']}:{it['reason']}", it["payload"]) for it in g["invalid"]]
    return out


def _schema_errors(def_name: str, payload: Any) -> List[str]:
    if def_name == "catalog:component":
        return oc.validate_component(payload)
    if def_name == "OsEvent":
        return oc.validate_os_event(payload)
    return oc.validate_contract(def_name, payload)


# --------------------------------------------------------------------------- #
# Drift: the backend and frontend copies are byte-identical to shared/
# --------------------------------------------------------------------------- #


@needs_repo
@pytest.mark.parametrize("name", SCHEMA_FILES)
def test_backend_schema_copy_matches_shared(name: str) -> None:
    assert (oc.SCHEMA_DIR / name).read_bytes() == (SHARED / name).read_bytes(), (
        f"backend/core/os_schemas/{name} drifted; run python backend/scripts/sync_os_schemas.py"
    )


@needs_repo
@pytest.mark.parametrize("name", SCHEMA_FILES)
def test_frontend_schema_copy_matches_shared(name: str) -> None:
    assert (FRONTEND_COPY / name).read_bytes() == (SHARED / name).read_bytes(), (
        f"frontend/src/os/schemas/{name} drifted; run python backend/scripts/sync_os_schemas.py"
    )


# --------------------------------------------------------------------------- #
# Schemas are themselves valid and self-consistent
# --------------------------------------------------------------------------- #


def test_contract_schema_is_valid_draft_2020_12() -> None:
    Draft202012Validator.check_schema(oc.load_contract_schema())


def test_every_catalog_component_schema_is_valid() -> None:
    catalog = oc.load_catalog()
    assert catalog["catalogId"] == oc.FORGE_CATALOG_ID
    assert catalog["protocolVersion"] == oc.A2UI_VERSION
    assert catalog["functions"] == {}, "Forge exposes no renderer-side functions to agents"
    for name, schema in catalog["components"].items():
        Draft202012Validator.check_schema({**schema, "$defs": catalog["$defs"]})
        assert schema["properties"]["component"] == {"const": name}
        assert schema["additionalProperties"] is False, f"{name} must be closed"


def test_catalog_action_profile_has_no_function_calls() -> None:
    action = oc.load_catalog()["$defs"]["Action"]
    assert set(action["properties"]) == {"event"}
    assert action["additionalProperties"] is False


def _schema_enum(def_name: str) -> List[str]:
    return oc.load_contract_schema()["$defs"][def_name]["enum"]


@pytest.mark.parametrize(
    "def_name,values",
    [
        ("IntentKind", oc.INTENT_KINDS),
        ("PresentationKind", oc.PRESENTATION_KINDS),
        ("Permission", oc.PERMISSIONS),
        ("OsEventType", oc.OS_EVENT_TYPES),
    ],
)
def test_enum_parity_with_schema(def_name: str, values: Tuple[str, ...]) -> None:
    assert list(values) == _schema_enum(def_name)


def test_event_union_covers_every_event_type() -> None:
    variants = oc.load_contract_schema()["$defs"]["OsEvent"]["oneOf"]
    assert len(variants) == len(oc.OS_EVENT_TYPES)


def test_contract_models_cover_schema_defs() -> None:
    defs = oc.load_contract_schema()["$defs"]
    assert set(oc.CONTRACT_MODELS) <= set(defs)


def test_capability_index_is_valid_and_unique() -> None:
    raw = json.loads(oc.CAPABILITY_INDEX_FILE.read_text(encoding="utf-8"))
    assert oc.validate_contract("CapabilityIndex", raw) == []
    index = oc.load_capability_index()
    ids = [c.id for c in index.capabilities]
    assert len(ids) == len(set(ids))
    routes = [r for c in index.capabilities for r in c.legacy_routes]
    assert len(routes) == len(set(routes)), "each legacy route belongs to exactly one capability"
    assert not set(routes) & set(index.outside_shell_routes)
    for cap in index.capabilities:
        if cap.admin_only:
            assert cap.category == "admin", cap.id


def test_legacy_component_map_targets_exist_in_catalog() -> None:
    names = set(oc.catalog_component_names())
    assert set(oc.LEGACY_A2UI_COMPONENT_MAP.values()) <= names


# --------------------------------------------------------------------------- #
# Shared examples: reference validator
# --------------------------------------------------------------------------- #


@needs_repo
def test_examples_exist_for_every_group() -> None:
    groups = _example_groups()
    assert {g["def"] for g in groups} >= {
        "OsEvent", "TurnRequest", "UserActionRequest", "CapabilityInvocation", "WorkspaceState",
        "CapabilityDescriptor", "catalog:component",
    }
    assert all(g["valid"] and g["invalid"] for g in groups)


@needs_repo
@pytest.mark.parametrize("def_name,case_id,payload", _cases("valid"), ids=lambda v: v if isinstance(v, str) else "")
def test_valid_example_passes_schema(def_name: str, case_id: str, payload: Any) -> None:
    assert _schema_errors(def_name, payload) == [], case_id


@needs_repo
@pytest.mark.parametrize("def_name,case_id,payload", _cases("invalid"), ids=lambda v: v if isinstance(v, str) else "")
def test_invalid_example_fails_schema(def_name: str, case_id: str, payload: Any) -> None:
    assert _schema_errors(def_name, payload), f"expected {case_id} to be rejected"


# --------------------------------------------------------------------------- #
# Shared examples: Pydantic mirror agrees with the schema
# --------------------------------------------------------------------------- #


def _adapter(def_name: str) -> TypeAdapter:
    return TypeAdapter(oc.CONTRACT_MODELS[def_name])


@needs_repo
@pytest.mark.parametrize(
    "def_name,case_id,payload",
    [c for c in _cases("valid") if c[0] in oc.CONTRACT_MODELS],
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_valid_example_parses_with_pydantic(def_name: str, case_id: str, payload: Any) -> None:
    parsed = _adapter(def_name).validate_python(payload)
    dumped = _adapter(def_name).dump_python(parsed, mode="json", exclude_unset=True)
    assert _schema_errors(def_name, dumped) == [], f"{case_id}: Pydantic round-trip left the schema"


@needs_repo
@pytest.mark.parametrize(
    "def_name,case_id,payload",
    [c for c in _cases("invalid") if c[0] in oc.CONTRACT_MODELS],
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_invalid_example_rejected_by_pydantic(def_name: str, case_id: str, payload: Any) -> None:
    with pytest.raises(ValidationError):
        _adapter(def_name).validate_python(payload)


# --------------------------------------------------------------------------- #
# Behaviour of the validation helpers
# --------------------------------------------------------------------------- #


def test_a2ui_message_rejects_unknown_component_inside_valid_envelope() -> None:
    message = {
        "version": "1.0",
        "createSurface": {
            "surfaceId": "s1",
            "catalogId": oc.FORGE_CATALOG_ID,
            "components": [{"id": "root", "component": "Iframe", "src": "https://evil.example"}],
        },
    }
    assert oc.validate_contract("A2UIServerMessage", message) == []  # envelope alone is fine
    errors = oc.validate_a2ui_message(message)
    assert errors and "not in the Forge catalog" in errors[0]


def test_os_event_validation_descends_into_a2ui_components() -> None:
    event = {
        "v": "forge-os/1", "seq": 1, "session_id": "s", "turn_id": "t", "ts": "2026-11-27T10:00:00Z",
        "type": "a2ui.message",
        "data": {"message": {"version": "1.0", "updateComponents": {"surfaceId": "s1", "components": [
            {"id": "x", "component": "Text", "text": "ok", "onClick": "alert(1)"}]}}},
    }
    assert oc.validate_os_event(event)


def test_os_event_to_sse_frames_seq_and_type() -> None:
    event = oc.OS_EVENT_ADAPTER.validate_python({
        "v": "forge-os/1", "seq": 7, "session_id": "s", "turn_id": None, "ts": "2026-11-27T10:00:00Z",
        "type": "heartbeat", "data": {},
    })
    frame = oc.os_event_to_sse(event)
    assert frame.startswith("id: 7\nevent: heartbeat\ndata: ")
    assert frame.endswith("\n\n")
    assert oc.validate_os_event(json.loads(frame.split("data: ", 1)[1])) == []


def test_pydantic_is_strict_about_types() -> None:
    with pytest.raises(ValidationError):
        oc.SessionSummary.model_validate({
            "id": "s", "title": "", "project_id": None, "created_at": "2026-11-27T10:00:00Z",
            "updated_at": "2026-11-27T10:00:00Z", "turn_count": "3", "pinned": False, "archived": False,
        })
