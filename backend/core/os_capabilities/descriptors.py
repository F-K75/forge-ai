"""Load the full capability descriptors (``core/os_schemas/capabilities.json``).

``shared/os-schemas/capabilities.json`` is the canonical file (content owned by
WS-D, shape controlled by the ``CapabilityCatalog`` contract). The backend
image only copies ``backend/``, so it reads the byte-identical copy next to
the other OS schemas; ``tests/test_os_capability_descriptors.py`` checks the
copy for drift.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Dict, Optional, Tuple

from core.os_contracts import SCHEMA_DIR, CapabilityCatalog, CapabilityDescriptor

CAPABILITIES_FILE = SCHEMA_DIR / "capabilities.json"

# A2UI ``Action.event.name`` is ``^[A-Za-z_][A-Za-z0-9_.-]{0,63}$``; Forge surfaces built here
# name events ``<capability_id>.<action_id>`` (e.g. ``governance.approvals.approve``).
ACTION_EVENT_SEPARATOR = "."


@lru_cache(maxsize=1)
def load_capability_catalog() -> CapabilityCatalog:
    raw = json.loads(CAPABILITIES_FILE.read_text(encoding="utf-8"))
    return CapabilityCatalog.model_validate(raw)


@lru_cache(maxsize=1)
def _by_id() -> Dict[str, CapabilityDescriptor]:
    return {c.id: c for c in load_capability_catalog().capabilities}


def get_descriptor(capability_id: str) -> Optional[CapabilityDescriptor]:
    return _by_id().get(capability_id)


def capability_ids() -> Tuple[str, ...]:
    return tuple(_by_id())


def action_event_name(capability_id: str, action_id: str) -> str:
    """The A2UI event name a generated surface uses to trigger ``(capability_id, action_id)``."""
    return f"{capability_id}{ACTION_EVENT_SEPARATOR}{action_id}"


def resolve_action_event(name: str, surface_capability_id: Optional[str] = None) -> Optional[Tuple[str, str]]:
    """Map an A2UI action event name back to ``(capability_id, action_id)``.

    Accepts the fully qualified form produced by :func:`action_event_name`
    (longest matching capability id wins) and, when the surface was placed for
    a capability, a bare action id (``"approve"``) or a short dotted name whose
    last segment is the action (``"gate.approve"``). Returns ``None`` if the
    name does not resolve to a declared action.
    """
    caps = _by_id()
    parts = name.split(ACTION_EVENT_SEPARATOR)
    for cut in range(len(parts) - 1, 0, -1):
        cap_id = ACTION_EVENT_SEPARATOR.join(parts[:cut])
        action = ACTION_EVENT_SEPARATOR.join(parts[cut:])
        cap = caps.get(cap_id)
        if cap and any(a.id == action for a in cap.actions):
            return cap_id, action
    if surface_capability_id and surface_capability_id in caps:
        action = parts[-1]
        if any(a.id == action for a in caps[surface_capability_id].actions):
            return surface_capability_id, action
    return None
