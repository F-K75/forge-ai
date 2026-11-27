"""Forge's A2UI profile must stay a subset of official A2UI v1.0.

Every A2UI message in shared/os-schemas/examples (agent -> renderer messages
inside `a2ui.message` events, renderer -> agent actions inside
UserActionRequest) is validated against the official v1.0 JSON Schemas
vendored in shared/os-schemas/vendor/a2ui-v1_0 (see its README for
provenance), with the Forge Ember catalog plugged into the envelope's
catalog slot.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator, List

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

REPO_ROOT = Path(__file__).resolve().parents[2]
SHARED = REPO_ROOT / "shared" / "os-schemas"
VENDOR = SHARED / "vendor" / "a2ui-v1_0"
BASE = "https://a2ui.org/specification/v1_0/"

pytestmark = pytest.mark.skipif(not VENDOR.is_dir(), reason="vendored A2UI schemas not present")


def _load(name: str) -> Any:
    return json.loads((VENDOR / name).read_text(encoding="utf-8"))


def _registry() -> Registry:
    # The official envelope resolves components through "catalog.json#/$defs/anyComponent".
    # Plug the Forge Ember catalog into that slot, so components are checked against
    # the official envelope (ComponentCommon + unevaluatedProperties) and our catalog.
    catalog = json.loads((SHARED / "forge-ember.catalog.json").read_text(encoding="utf-8"))
    catalog.pop("$id")
    catalog["$defs"]["anyComponent"] = {"oneOf": [{"$ref": f"#/components/{n}"} for n in catalog["components"]]}
    resources = [(BASE + n, Resource.from_contents(_load(n))) for n in
                 ("agent_to_renderer.json", "renderer_to_agent.json", "common_types.json")]
    resources.append((BASE + "catalog.json", Resource.from_contents(catalog)))
    return Registry().with_resources(resources)


def _examples() -> Iterator[dict]:
    for path in sorted((SHARED / "examples").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        yield from doc.get("groups") or [doc]


def _agent_messages() -> List[Any]:
    out = []
    for g in _examples():
        if g["def"] == "OsEvent":
            out += [e["data"]["message"] for e in g["valid"] if e["type"] == "a2ui.message"]
    return out


def _catalog_components() -> List[Any]:
    out = []
    for g in _examples():
        if g["def"] == "catalog:component":
            out += g["valid"]
    return out


def _user_actions() -> List[Any]:
    out = []
    for g in _examples():
        if g["def"] == "UserActionRequest":
            out += [p["a2ui"] for p in g["valid"]]
    return out


def _errors(schema_name: str, payload: Any) -> List[str]:
    validator = Draft202012Validator(_load(schema_name), registry=_registry())
    return [e.message for e in validator.iter_errors(payload)]


def test_there_are_messages_to_check() -> None:
    assert len(_agent_messages()) >= 3
    assert _user_actions()


@pytest.mark.parametrize("message", _agent_messages() if VENDOR.is_dir() else [])
def test_forge_agent_messages_are_official_a2ui_v1(message: Any) -> None:
    assert _errors("agent_to_renderer.json", message) == []


@pytest.mark.parametrize("component", _catalog_components() if VENDOR.is_dir() else [], ids=lambda c: c["component"])
def test_forge_catalog_components_fit_the_official_envelope(component: Any) -> None:
    message = {"version": "1.0", "updateComponents": {"surfaceId": "s1", "components": [component]}}
    assert _errors("agent_to_renderer.json", message) == []


@pytest.mark.parametrize("action", _user_actions() if VENDOR.is_dir() else [])
def test_forge_user_actions_are_official_a2ui_v1(action: Any) -> None:
    assert _errors("renderer_to_agent.json", action) == []


def test_official_schema_rejects_legacy_forge_a2ui_v1_surface() -> None:
    legacy = {"surface_id": "s", "protocol": "a2ui/v1", "title": "t", "components": [{"type": "heading", "text": "x"}]}
    assert _errors("agent_to_renderer.json", legacy)
