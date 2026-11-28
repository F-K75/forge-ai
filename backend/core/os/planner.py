"""Presentation planner: ``IntentResult`` -> ``PresentationPlan`` (+ executor details).

Picks the first capability the caller may use (visibility, admin flag, plan,
permissions, project access), chooses a presentation (owner examples in
CAPABILITY_MATRIX.md, the capability's ``surfaces`` / ``default_surface``, and
what is already open in ``TurnContext``) and lists the steps. Steps that need
a human (``requires_approval``) render an approval card and wait; the planner
never runs destructive work by itself.

The wire plan is the closed ``PresentationPlan``; executor parameters travel
separately in ``StepSpec`` and are stored server-side on the turn, never
round-tripped through the client.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from core.os.common import new_id

# Capabilities whose result is a generated A2UI surface (deterministic
# templates exist for no-key mode; WS-D may register richer builders).
SURFACE_CAPABILITIES = {"data.analyze", "agents.create", "workflow.design", "models.compare", "governance.approvals"}

# Owner examples (CAPABILITY_MATRIX.md, "Intent to presentation").
INTENT_PRESENTATION: Dict[str, str] = {
    "build_website": "window",
    "analyze_data": "window",
    "create_agent": "window",
    "design_workflow": "fullscreen",
    "compare_models": "window",
    "manage_projects": "window",
    "monitor_run": "panel",
    "approve_gate": "inline",
}

STEP_TITLES = {
    "respond_text": "Answer",
    "render_surface": "Show {title}",
    "open_capability": "Open {title}",
    "run_agent": "Follow {title}",
    "open_mcp_app": "Open {title}",
}


@dataclass
class StepSpec:
    """One executable step: the wire ``PlanStep`` plus server-only parameters."""

    id: str
    kind: str
    title: str
    capability_id: Optional[str]
    requires_approval: bool
    presentation: Optional[str] = None
    size_hint: Optional[str] = None
    focus: bool = True
    window_id: Optional[str] = None
    params: Dict[str, Any] = field(default_factory=dict)
    canned_text: Optional[str] = None

    def wire(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title[:200] or "Step",
            "capability_id": self.capability_id,
            "requires_approval": self.requires_approval,
        }

    def to_doc(self) -> Dict[str, Any]:
        return {
            **self.wire(),
            "presentation": self.presentation,
            "size_hint": self.size_hint,
            "focus": self.focus,
            "window_id": self.window_id,
            "params": self.params,
            "canned_text": self.canned_text,
        }

    @classmethod
    def from_doc(cls, doc: Dict[str, Any]) -> "StepSpec":
        return cls(**{k: doc.get(k) for k in cls.__dataclass_fields__ if k in doc})


@dataclass
class Plan:
    wire: Dict[str, Any]
    steps: List[StepSpec]
    capability: Optional[Dict[str, Any]]


def window_id_for(capability_id: str) -> str:
    return "win_" + re.sub(r"[^A-Za-z0-9_.:-]", "_", capability_id)[:120]


def _presentation(desc: Dict[str, Any], intent_kind: str, synthesized: bool) -> str:
    preferred = INTENT_PRESENTATION.get(intent_kind)
    allowed = desc.get("surfaces") or [desc["default_surface"]]
    if preferred and (preferred in allowed or synthesized):
        return preferred
    return desc["default_surface"]


def _size_hint(presentation: str, capability_id: str) -> str:
    if presentation in ("inline", "panel"):
        return "compact"
    if capability_id in ("data.analyze", "models.compare", "workflow.design") or presentation == "fullscreen":
        return "large"
    return "regular"


async def _choose(rt, user, intent: Dict[str, Any], project) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    chosen = None
    denied: List[Dict[str, Any]] = []
    for cap_id in intent.get("capability_ids") or []:
        desc = rt.registry.get(cap_id)
        if desc is None:
            continue
        if not rt.registry.is_visible(user, desc):
            denied.append(desc)
            continue
        perms = [p for p in desc.get("permissions") or []]
        if project is None:
            # Project-scoped permissions are checked when a project is picked
            # (the capability opens with a project picker / its own guards).
            from core.os.capability_registry import PROJECT_PERMISSIONS

            perms = [p for p in perms if p not in PROJECT_PERMISSIONS]
        reason = await rt.registry.check_permissions(rt.db, user, perms, project=project)
        if reason:
            denied.append(desc)
            continue
        chosen = desc
        break
    return chosen, denied


async def plan_turn(
    rt,
    *,
    user,
    intent: Dict[str, Any],
    project: Optional[Dict[str, Any]],
    context: Optional[Dict[str, Any]] = None,
    model_ref: Optional[Dict[str, str]] = None,
    prompt: str = "",
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Plan:
    context = context or {}
    open_ids = set(context.get("open_capability_ids") or [])
    steps: List[StepSpec] = []
    desc, denied = await _choose(rt, user, intent, project)
    kind = intent["kind"]

    if desc is None and denied and kind != "chat":
        title = denied[0]["title"]
        steps.append(
            StepSpec(
                id="s1",
                kind="respond_text",
                title="Explain access",
                capability_id=None,
                requires_approval=False,
                canned_text=f"You don't have access to {title}. Ask an admin or the project owner if you need it.",
            )
        )
        presentation = "text"
    elif desc is None or desc["id"] == "chat.answer":
        steps.append(StepSpec(id="s1", kind="respond_text", title="Answer", capability_id=None, requires_approval=False))
        presentation = "text"
        desc = None
    else:
        synthesized = desc["id"] in getattr(rt.registry, "synthesized", set())
        presentation = _presentation(desc, kind, synthesized)
        cap_id = desc["id"]
        entities = intent.get("entities") or {}
        params: Dict[str, Any] = {}
        if project is not None:
            params["project_id"] = project["id"]
        requires_approval = False
        if cap_id in SURFACE_CAPABILITIES:
            step_kind = "render_surface"
            requires_approval = cap_id == "governance.approvals"
            if cap_id == "data.analyze":
                datasets = [a["id"] for a in attachments or [] if a.get("kind") == "dataset"]
                if datasets:
                    params["attachment_id"] = datasets[0]
            if cap_id == "models.compare" and entities.get("models"):
                params["models"] = [str(m)[:64] for m in entities["models"]][:8]
            if cap_id in ("agents.create", "workflow.design"):
                params["objective"] = str(entities.get("objective") or prompt)[:500]
        elif cap_id == "agents.kernel_run":
            step_kind = "run_agent"
            run_id = entities.get("run_id")
            if isinstance(run_id, str) and re.fullmatch(r"[A-Za-z0-9][\w\-]{0,63}", run_id):
                params["run_id"] = run_id
                params["mode"] = "monitor"
            else:
                params["mode"] = "start"
                params["objective"] = str(entities.get("objective") or prompt)[:2000]
                requires_approval = True  # starting a run spends budget: a human confirms
        elif cap_id == "protocols.mcp_app" and entities.get("app_id") and project is not None:
            step_kind = "open_mcp_app"
            params["app_id"] = str(entities["app_id"])[:128]
        else:
            step_kind = "open_capability"
            if cap_id == "build.new":
                params["prompt"] = prompt[:2000]
        if presentation == "text":  # pragma: no cover - capabilities never declare text
            presentation = "window"
        title_tpl = STEP_TITLES.get(step_kind, "{title}")
        steps.append(
            StepSpec(
                id="s1",
                kind=step_kind,
                title=title_tpl.format(title=desc["title"]),
                capability_id=cap_id,
                requires_approval=requires_approval,
                presentation=presentation,
                size_hint=_size_hint(presentation, cap_id),
                focus=True,
                window_id=window_id_for(cap_id) if cap_id in open_ids or presentation != "inline" else None,
                params=params,
            )
        )

    wire = {
        "plan_id": new_id("plan"),
        "intent": intent,
        "presentation": presentation,
        "steps": [s.wire() for s in steps][:20],
        "model": model_ref,
        "fallback": intent.get("source") == "rules",
    }
    return Plan(wire=wire, steps=steps, capability=desc)
