"""Wire WS-D into WS-C's OS backend: action handlers + no-key surface builders.

``install()`` registers every handler in :data:`HANDLERS` with
``core.os.capability_registry`` (``register_action_handler`` refuses any pair
that capabilities.json does not declare) and overrides WS-C's default no-LLM
surface templates for ``data.analyze``, ``models.compare`` and
``governance.approvals`` via ``executors.register_surface_builder``.

It is idempotent. WS-C's runtime has no call site yet, so the app must call
``core.os_capabilities.install()`` once at startup (reported integration gap).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from core.os_capabilities import approvals as approvals_mod
from core.os_capabilities import data_analyze, models_compare
from core.os_capabilities.handlers import HANDLERS, get_handler
from core.os_capabilities.surfaces import message_surface
from core.os_contracts import ActionContext

logger = logging.getLogger(__name__)

_installed_on: Optional[int] = None


async def _noop_emit(event_type: str, data: Dict[str, Any]) -> None:
    return None


def _ctx(turn_ctx: Any, capability_id: str, action: str) -> ActionContext:
    project = getattr(turn_ctx, "project", None) or {}
    return ActionContext(
        user=turn_ctx.user, capability_id=capability_id, action=action,
        session_id=getattr(turn_ctx, "session_id", None), turn_id=getattr(turn_ctx, "turn_id", None),
        project_id=project.get("id"), emit=_noop_emit, metadata={"entry_point": "turn"},
    )


async def build_data_analyze_surface(turn_ctx: Any, step: Any) -> Tuple[List[Dict[str, Any]], str]:
    """Stdlib CSV/JSON analysis (table + aggregated chart + filters) of the turn's dataset attachment."""
    params = getattr(step, "params", {}) or {}
    att_id = params.get("attachment_id")
    if not att_id:
        att_id = next((a.get("id") for a in getattr(turn_ctx, "attachments", []) or [] if a.get("kind") == "dataset"), None)
    repo = turn_ctx.rt.attachments
    doc = await repo.get(turn_ctx.user.id, att_id) if att_id else None
    raw = await repo.read_bytes(turn_ctx.user.id, att_id) if doc else None
    if raw is None:
        messages, _ = message_surface(capability_id="data.analyze", action_id="analyze", title="Analyze data",
                                      text="Attach a CSV or JSON file (up to 5 MB) and ask again.", tone="info")
        return messages, "Analyze data"
    try:
        messages, _, _ = data_analyze.analyze_dataset(
            raw, fmt=doc.get("ext"), filename=doc.get("name"), x=params.get("x"), y=params.get("y"),
            chart_kind=params.get("chart_kind"),
        )
    except data_analyze.DatasetError as exc:
        messages, _ = message_surface(capability_id="data.analyze", action_id="analyze", title="Couldn't analyze this file",
                                      text=str(exc), tone="warning")
        return messages, "Analyze data"
    title = f"Analysis of {doc.get('name')}"[:200] if doc.get("name") else "Dataset analysis"
    return messages, title


async def build_models_compare_surface(turn_ctx: Any, step: Any) -> Tuple[List[Dict[str, Any]], str]:
    params = getattr(step, "params", {}) or {}
    messages, _, _ = models_compare.compare_surface(
        models=params.get("models") or [], providers=params.get("providers") or [],
        query=params.get("topic") or getattr(turn_ctx, "prompt", None),
    )
    return messages, "Model comparison"


async def build_approvals_surface(turn_ctx: Any, step: Any) -> Tuple[List[Dict[str, Any]], str]:
    """Pending gates through the same access-checked path as the ``governance.approvals.list`` action."""
    ctx = _ctx(turn_ctx, approvals_mod.CAPABILITY_ID, "list")
    outcome = await get_handler("governance.approvals", "list")(ctx, {})
    if outcome.status != "completed" or not outcome.a2ui_messages:
        messages, _ = message_surface(capability_id="governance.approvals", action_id="list", title="Approvals",
                                      text=outcome.message or "Approvals are unavailable right now.", tone="warning")
        return messages, "Approvals"
    return outcome.a2ui_messages, (outcome.placements[0]["title"] if outcome.placements else "Approvals")


SURFACE_BUILDER_OVERRIDES = {
    "data.analyze": build_data_analyze_surface,
    "models.compare": build_models_compare_surface,
    "governance.approvals": build_approvals_surface,
}


def install(registry: Any = None, *, surface_builders: bool = True) -> int:
    """Register WS-D's handlers (and surface builders) with WS-C. Returns the number of handlers."""
    global _installed_on
    from core.os.capability_registry import get_capability_registry

    reg = registry or get_capability_registry()
    if _installed_on == id(reg) and registry is None:
        return len(HANDLERS)
    for (cap, action), handler in HANDLERS.items():
        reg.register_action_handler(cap, action, handler)
    if surface_builders:
        from core.os import executors

        for cap, builder in SURFACE_BUILDER_OVERRIDES.items():
            executors.register_surface_builder(cap, builder)
    if registry is None:
        _installed_on = id(reg)
    logger.info("Forge OS: registered %d capability action handlers", len(HANDLERS))
    return len(HANDLERS)
