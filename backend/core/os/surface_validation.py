"""Server-side validation of every outgoing generated surface (validate twice, #1 of 2).

Wraps ``core.os_contracts.validate_a2ui_message``. Like
``protocol_gateway._finalize_a2ui_surface``, invalid components are **dropped
and logged**, never streamed; references to dropped components are pruned so
the client never sees a dangling child. If what remains is unusable (no root,
envelope still invalid), the message is refused and the caller emits the text
fallback instead.
"""

from __future__ import annotations

import copy
import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from core.os_contracts import validate_a2ui_message, validate_component, validate_contract

logger = logging.getLogger(__name__)

MAX_MESSAGE_BYTES = 512 * 1024
ROOT_ID = "root"
FALLBACK_TEXT = "I couldn't display this result."


def _child_refs(comp: Dict[str, Any]) -> List[str]:
    refs: List[str] = []
    children = comp.get("children")
    if isinstance(children, list):
        refs.extend(c for c in children if isinstance(c, str))
    elif isinstance(children, dict) and isinstance(children.get("componentId"), str):
        refs.append(children["componentId"])
    for key in ("child", "content"):
        if isinstance(comp.get(key), str):
            refs.append(comp[key])
    tabs = comp.get("tabs")
    if isinstance(tabs, list):
        refs.extend(t["child"] for t in tabs if isinstance(t, dict) and isinstance(t.get("child"), str))
    return refs


def _prune(comp: Dict[str, Any], dropped: set) -> Dict[str, Any]:
    out = dict(comp)
    children = out.get("children")
    if isinstance(children, list):
        out["children"] = [c for c in children if c not in dropped]
    tabs = out.get("tabs")
    if isinstance(tabs, list):
        out["tabs"] = [t for t in tabs if not (isinstance(t, dict) and t.get("child") in dropped)]
    return out


def sanitize_a2ui_message(message: Any, *, require_root: bool = True) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Return ``(safe_message | None, problems)``.

    ``createSurface`` with components must keep a ``root`` component when
    ``require_root`` is set (Forge surfaces always render from ``root``).
    """
    problems: List[str] = []
    if not isinstance(message, dict):
        return None, ["message is not an object"]
    try:
        size = len(json.dumps(message, default=str))
    except (TypeError, ValueError):
        return None, ["message is not JSON-serialisable"]
    if size > MAX_MESSAGE_BYTES:
        return None, ["message exceeds the size cap"]
    msg = copy.deepcopy(message)
    body_key = "createSurface" if "createSurface" in msg else "updateComponents" if "updateComponents" in msg else None
    if body_key and isinstance(msg.get(body_key), dict) and isinstance(msg[body_key].get("components"), list):
        comps = msg[body_key]["components"]
        kept: List[Dict[str, Any]] = []
        dropped: set = set()
        seen: set = set()
        for comp in comps[:200]:
            errs = validate_component(comp)
            cid = comp.get("id") if isinstance(comp, dict) else None
            if errs or not isinstance(cid, str) or cid in seen:
                problems.append(f"dropped component {cid!r}: {(errs or ['duplicate id'])[0]}")
                if isinstance(cid, str) and cid not in seen:
                    dropped.add(cid)
                continue
            seen.add(cid)
            kept.append(comp)
        if len(comps) > 200:
            problems.append(f"dropped {len(comps) - 200} components over the 200 cap")
        # Prune references to dropped components, then any component whose
        # pruning made it invalid (e.g. a Card with no children left).
        kept = [_prune(c, dropped) for c in kept]
        changed = True
        while changed:
            changed = False
            for c in list(kept):
                if validate_component(c):
                    kept.remove(c)
                    dropped.add(c["id"])
                    problems.append(f"dropped component {c['id']!r} after pruning")
                    kept = [_prune(k, {c["id"]}) for k in kept]
                    changed = True
                    break
        if body_key == "createSurface" and require_root and comps and not any(c["id"] == ROOT_ID for c in kept):
            return None, problems + ["surface has no valid root component"]
        if body_key == "updateComponents" and not kept:
            return None, problems + ["no valid components left"]
        msg[body_key]["components"] = kept
    errors = validate_a2ui_message(msg)
    if errors:
        return None, problems + errors
    if problems:
        logger.warning("A2UI message sanitised: %s", problems[:10])
    return msg, problems


def validate_placement(placement: Any) -> List[str]:
    return validate_contract("SurfacePlacement", placement)


def text_fallback_surface(surface_id: str, title: str, capability_id: Optional[str] = None) -> Dict[str, Any]:
    """A minimal, always-valid surface: the "couldn't display" notice (+ link to the capability)."""
    components: List[Dict[str, Any]] = [
        {"id": ROOT_ID, "component": "Column", "children": ["fb_text"] + (["fb_open"] if capability_id else [])},
        {"id": "fb_text", "component": "Callout", "tone": "warning", "title": title[:200] or "Result", "text": FALLBACK_TEXT},
    ]
    if capability_id:
        components.append({"id": "fb_open", "component": "CapabilityLauncher", "capabilityId": capability_id, "label": "Open it instead"})
    return {
        "version": "1.0",
        "createSurface": {"surfaceId": surface_id, "catalogId": "urn:forge:a2ui:catalog:ember:1", "components": components},
    }


def collect_action_names(components: List[Dict[str, Any]]) -> set:
    """Every ``Action.event.name`` a stored surface offers (used to authorise clicks)."""
    names: set = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            event = node.get("event")
            if isinstance(event, dict) and isinstance(event.get("name"), str) and set(node) == {"event"}:
                names.add(event["name"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(components)
    return names


def action_context_for(components: List[Dict[str, Any]], name: str, source_component_id: str) -> Optional[Dict[str, Any]]:
    """The server-authored ``event.context`` for action ``name`` on ``source_component_id``."""
    for comp in components:
        if comp.get("id") != source_component_id:
            continue
        found: List[Dict[str, Any]] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                event = node.get("event")
                if isinstance(event, dict) and event.get("name") == name and set(node) == {"event"}:
                    found.append(event.get("context") or {})
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)

        walk(comp)
        if found:
            return found[0]
    return None
