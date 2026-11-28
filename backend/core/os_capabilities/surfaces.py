"""Deterministic (no-LLM) A2UI v1.0 surface builders shared by capability handlers.

Everything here emits only Forge Ember catalog components with closed props.
WS-C re-validates every message (``validate_a2ui_message``) before it is
persisted or streamed; the tests run the same validator over each builder.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List, Optional, Sequence, Tuple

from core.os_contracts import A2UI_VERSION, FORGE_CATALOG_ID

MAX_TABLE_ROWS = 200
MAX_TABLE_COLUMNS = 12
MAX_KV_ITEMS = 40

# Never surface credentials or their derivatives, whatever an endpoint returns.
_SECRET_KEY = re.compile(r"(pass(word)?|secret|token|api_?key|hash|mfa|otp|backup_codes|private|credential)", re.I)
_SAFE_KEYS = {"key_prefix", "token_count", "tokens", "input_tokens", "output_tokens", "max_tokens"}
_COMPONENT_ID = re.compile(r"[^A-Za-z0-9_-]")


def new_surface_id(capability_id: str, action: str) -> str:
    base = f"srf_{capability_id}_{action}".replace(".", "_")[:100]
    return f"{base}_{uuid.uuid4().hex[:10]}"


def component_id(raw: str, fallback: str = "c") -> str:
    cid = _COMPONENT_ID.sub("_", raw)[:60] or fallback
    return cid if re.match(r"[A-Za-z_]", cid) else f"c_{cid}"[:64]


def is_secret_key(key: str) -> bool:
    return key not in _SAFE_KEYS and bool(_SECRET_KEY.search(key))


def scrub(value: Any, depth: int = 0) -> Any:
    """Drop secret-looking keys recursively (defence in depth; endpoints already omit them)."""
    if depth > 8:
        return None
    if isinstance(value, dict):
        # Secrets are scalars; containers such as ``{"api_keys": [...]}`` are kept and scrubbed inside.
        return {k: scrub(v, depth + 1) for k, v in value.items() if isinstance(v, (dict, list)) or not is_secret_key(str(k))}
    if isinstance(value, list):
        return [scrub(v, depth + 1) for v in value]
    return value


def humanize(key: str) -> str:
    label = re.sub(r"[_\-]+", " ", str(key)).strip() or str(key)
    return (label[:1].upper() + label[1:])[:80]


def cell(value: Any, limit: int = 300) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:limit]
    return json.dumps(value, default=str)[:limit]


def text_value(value: Any, limit: int = 500) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float, str)):
        return str(value)[:limit]
    return json.dumps(value, default=str)[:limit]


def create_surface(surface_id: str, components: List[Dict[str, Any]], data_model: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body: Dict[str, Any] = {"surfaceId": surface_id, "catalogId": FORGE_CATALOG_ID, "components": components}
    if data_model is not None:
        body["dataModel"] = data_model
    return {"version": A2UI_VERSION, "createSurface": body}


def update_components(surface_id: str, components: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"version": A2UI_VERSION, "updateComponents": {"surfaceId": surface_id, "components": components}}


def update_data_model(surface_id: str, path: str, value: Any) -> Dict[str, Any]:
    return {"version": A2UI_VERSION, "updateDataModel": {"surfaceId": surface_id, "path": path, "value": value}}


def placement(surface_id: str, presentation: str, title: str, capability_id: Optional[str], focus: bool = True) -> Dict[str, Any]:
    out: Dict[str, Any] = {"surface_id": surface_id, "presentation": presentation, "title": title[:200] or "Result"}
    if capability_id:
        out["capability_id"] = capability_id
    out["focus"] = focus
    return out


def action(capability_id: str, action_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    from core.os_capabilities.descriptors import action_event_name

    event: Dict[str, Any] = {"name": action_event_name(capability_id, action_id)}
    if context:
        event["context"] = context
    return {"event": event}


# --------------------------------------------------------------------------- generic result


def _rows_in(result: Any, key: Optional[str]) -> Optional[List[Any]]:
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        if key and isinstance(result.get(key), list):
            return result[key]
        for value in result.values():
            if isinstance(value, list) and value and all(isinstance(v, dict) for v in value[:5]):
                return value
    return None


def _columns(rows: Sequence[Dict[str, Any]]) -> List[str]:
    seen: List[str] = []
    for row in rows[:50]:
        for k, v in row.items():
            k = str(k)
            if k in seen or k.startswith("_") or is_secret_key(k) or len(k) > 64:
                continue
            if isinstance(v, (dict, list)):
                continue
            seen.append(k)
    return seen[:MAX_TABLE_COLUMNS]


def _column_type(rows: Sequence[Dict[str, Any]], key: str) -> str:
    values = [r.get(key) for r in rows[:50] if r.get(key) is not None]
    if values and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return "number"
    if key in ("status", "state"):
        return "status"
    if key.endswith("_at") or key in ("date", "created", "updated"):
        return "date"
    return "text"


def result_surface(
    *,
    capability_id: str,
    action_id: str,
    title: str,
    result: Any,
    presentation: str,
    list_key: Optional[str] = None,
    summary: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """A table (for list results) or key/value list (for objects) showing an endpoint result."""
    surface_id = new_surface_id(capability_id, action_id)
    result = scrub(result)
    components: List[Dict[str, Any]] = [{"id": "title", "component": "Heading", "text": title[:200], "level": 3}]
    children = ["title"]
    data_model: Dict[str, Any] = {}
    if summary:
        components.append({"id": "summary", "component": "Text", "text": summary[:2000], "variant": "muted"})
        children.append("summary")
    rows = _rows_in(result, list_key)
    if rows is not None:
        dict_rows = [r for r in rows if isinstance(r, dict)]
        cols = _columns(dict_rows)
        if not dict_rows or not cols:
            components.append({"id": "empty", "component": "Callout", "tone": "info", "text": "Nothing to show yet."})
            children.append("empty")
        else:
            data_model["rows"] = [{c: cell(r.get(c)) for c in cols} for r in dict_rows[:MAX_TABLE_ROWS]]
            components.append({
                "id": "table",
                "component": "DataTable",
                "columns": [{"key": c, "label": humanize(c), "type": _column_type(dict_rows, c)} for c in cols],
                "rows": {"@path": "/rows"},
                "sortable": True,
                "pageSize": 25,
            })
            children.append("table")
            if len(dict_rows) > MAX_TABLE_ROWS:
                components.append({"id": "more", "component": "Text", "variant": "caption",
                                   "text": f"Showing the first {MAX_TABLE_ROWS} of {len(dict_rows)}."})
                children.append("more")
    elif isinstance(result, dict) and result:
        items = [{"key": humanize(k)[:200], "value": text_value(v)} for k, v in list(result.items())[:MAX_KV_ITEMS]]
        components.append({"id": "details", "component": "KeyValueList", "items": items})
        children.append("details")
    else:
        components.append({"id": "done", "component": "Callout", "tone": "success", "text": text_value(result) if result not in (None, {}) else "Done."})
        children.append("done")
    components.insert(0, {"id": "root", "component": "Column", "children": children, "gap": "md"})
    message = create_surface(surface_id, components, data_model or None)
    return [message], [placement(surface_id, presentation, title, capability_id)]


def message_surface(*, capability_id: str, action_id: str, title: str, text: str, tone: str, presentation: str = "inline") -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    surface_id = new_surface_id(capability_id, action_id)
    components = [
        {"id": "root", "component": "Column", "children": ["note"], "gap": "sm"},
        {"id": "note", "component": "Callout", "tone": tone, "title": title[:200], "text": text[:2000]},
    ]
    return [create_surface(surface_id, components)], [placement(surface_id, presentation, title, capability_id)]

