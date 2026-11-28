"""Legacy ``a2ui/v1`` surfaces (``core/protocol_gateway.py``) -> A2UI v1.0 messages.

Maps component types with ``LEGACY_A2UI_COMPONENT_MAP``, renames snake_case
props to camelCase (recursively), gives every component an id and wraps them
in a ``Column`` root. The two shapes that differ structurally are adapted by
hand: ``approval_card`` (``actions: ["approve", "reject"]`` -> two ``Action``
events) and ``code_diff`` (``diff`` text -> ``code`` + ``diff: true``).
The result still goes through ``surface_validation`` (drop-and-log) before it
is emitted, so anything the adapter cannot express is dropped, not streamed.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from core.os_contracts import FORGE_CATALOG_ID, LEGACY_A2UI_COMPONENT_MAP

_DROP_PROPS = {"type", "actions"}
_STATUS_MAP = {"succeeded": "completed", "done": "completed", "error": "failed", "skipped": "cancelled"}


def camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(p[:1].upper() + p[1:] for p in rest)


def _camelize(value: Any) -> Any:
    if isinstance(value, dict):
        # Legacy props are nullable; the v1.0 catalog omits absent values instead.
        return {camel(k): _camelize(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_camelize(v) for v in value]
    return value


def _safe_id(raw: str) -> str:
    out = re.sub(r"[^A-Za-z0-9_-]", "_", raw)[:64]
    return out if re.match(r"^[A-Za-z_]", out) else f"c_{out}"[:64]


def _surface_id(raw: str) -> str:
    out = re.sub(r"[^A-Za-z0-9_.:-]", "_", raw or "surface")[:120]
    return out if re.match(r"^[A-Za-z0-9]", out) else f"s{out}"[:120]


def convert_component(legacy: Dict[str, Any], comp_id: str, *, gate_action_prefix: str = "governance.approvals") -> Optional[Dict[str, Any]]:
    ltype = legacy.get("type")
    name = LEGACY_A2UI_COMPONENT_MAP.get(ltype) if isinstance(ltype, str) else None
    if name is None:
        return None
    props = {k: v for k, v in legacy.items() if k not in _DROP_PROPS}
    out: Dict[str, Any] = {"id": comp_id, "component": name}
    if ltype == "approval_card":
        out.update(
            {
                "gateId": str(props.get("gate_id") or "gate")[:128],
                "gateName": str(props.get("gate_name") or "Approval")[:200],
                "reason": str(props.get("reason") or "")[:1000],
                "approve": {"event": {"name": f"{gate_action_prefix}.approve", "context": {"gate_id": props.get("gate_id")}}},
                "reject": {"event": {"name": f"{gate_action_prefix}.reject", "context": {"gate_id": props.get("gate_id")}}},
            }
        )
        if props.get("risk_level") in ("low", "medium", "high", "critical"):
            out["riskLevel"] = props["risk_level"]
        return out
    if ltype == "code_diff":
        out["code"] = str(props.get("diff") or "")
        out["diff"] = True
        if props.get("file_path"):
            out["filePath"] = str(props["file_path"])[:500]
        if props.get("language"):
            out["language"] = str(props["language"])[:32]
        return out
    converted = _camelize(props)
    for key in ("items", "events", "agents"):
        for item in converted.get(key) or [] if isinstance(converted.get(key), list) else []:
            if isinstance(item, dict) and item.get("status") in _STATUS_MAP:
                item["status"] = _STATUS_MAP[item["status"]]
    out.update(converted)
    return out


def legacy_surface_to_messages(surface: Dict[str, Any], *, context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """One legacy surface -> ``[createSurface]`` (v1.0). Gate actions carry ``context`` (e.g. project/run ids)."""
    sid = _surface_id(str(surface.get("surface_id") or "legacy"))
    components: List[Dict[str, Any]] = []
    for idx, legacy in enumerate(surface.get("components") or []):
        if not isinstance(legacy, dict):
            continue
        comp = convert_component(legacy, _safe_id(f"{legacy.get('type', 'c')}_{idx}"))
        if comp is None:
            continue
        if context and comp["component"] == "ApprovalCard":
            for key in ("approve", "reject"):
                comp[key]["event"]["context"] = {**comp[key]["event"]["context"], **context}
        components.append(comp)
    root = {"id": "root", "component": "Column", "children": [c["id"] for c in components]}
    return [
        {
            "version": "1.0",
            "createSurface": {"surfaceId": sid, "catalogId": FORGE_CATALOG_ID, "components": [root, *components][:200]},
        }
    ]
