"""``governance.approvals``: deterministic gate cards (``ApprovalCard``) for pending gates.

The cards' approve / reject actions name ``governance.approvals.approve`` and
``governance.approvals.reject`` with ``{project_id, run_id, gate_id}`` as
context, so a click goes back through the same handler (and therefore the
same ``can_decide_project_gates`` check) as the REST endpoint. Reject is
``requires_confirmation`` in the descriptor, so the client confirms first.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from core.os_capabilities.surfaces import action, create_surface, new_surface_id, placement

CAPABILITY_ID = "governance.approvals"
MAX_CARDS = 20

_RISK = {
    "pre_delivery_approval": "high",
    "escalation_review": "medium",
    "deploy": "high",
    "production": "critical",
}


def risk_level(gate_name: str) -> str:
    name = (gate_name or "").lower()
    for key, risk in _RISK.items():
        if key in name:
            return risk
    return "medium"


def _label(gate_name: str) -> str:
    return (gate_name or "Approval gate").replace("_", " ").strip().capitalize()[:200] or "Approval gate"


def pending_gates(runs: Sequence[Dict[str, Any]], project_id: str, project_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Pending gates from kernel run documents (``GET /kernel/runs``), newest first."""
    out = []
    for run in runs:
        if str(run.get("status", "")).lower() in ("completed", "failed", "cancelled", "rejected"):
            continue
        for gate in run.get("approval_gates") or []:
            if gate.get("status") != "pending":
                continue
            out.append({
                "project_id": project_id,
                "project_name": project_name or project_id,
                "run_id": run.get("id") or run.get("run_id"),
                "objective": run.get("objective") or "",
                "gate_id": gate.get("gate_id"),
                "gate_name": gate.get("gate_name") or "",
                "reason": gate.get("reason") or "",
                "created_at": gate.get("created_at"),
            })
    return [g for g in out if g["run_id"] and g["gate_id"]]


def gate_card(gate: Dict[str, Any], cid: str) -> Dict[str, Any]:
    context = {"project_id": gate["project_id"], "run_id": gate["run_id"], "gate_id": gate["gate_id"]}
    reason = gate.get("reason") or ""
    where = gate.get("project_name") or gate["project_id"]
    objective = gate.get("objective") or ""
    detail = " · ".join(p for p in (f"Project {where}", objective[:300], reason) if p)
    return {
        "id": cid,
        "component": "ApprovalCard",
        "gateId": str(gate["gate_id"])[:128],
        "gateName": _label(gate.get("gate_name", "")),
        "reason": detail[:1000],
        "riskLevel": risk_level(gate.get("gate_name", "")),
        "approve": action(CAPABILITY_ID, "approve", context),
        "reject": action(CAPABILITY_ID, "reject", context),
    }


def approvals_surface(gates: Sequence[Dict[str, Any]], *, presentation: str = "window") -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """One card per pending gate (inline for a single gate), or an empty-state callout."""
    surface_id = new_surface_id(CAPABILITY_ID, "list")
    gates = list(gates)[:MAX_CARDS]
    if len(gates) == 1 and presentation == "window":
        presentation = "inline"
    components: List[Dict[str, Any]] = []
    if not gates:
        children = ["title", "empty"]
        components += [
            {"id": "title", "component": "Heading", "text": "Approvals", "level": 3},
            {"id": "empty", "component": "Callout", "tone": "success", "title": "Nothing needs your approval",
             "text": "There are no pending governance gates on your projects."},
        ]
    else:
        children = ["title"] + [f"gate_{i}" for i in range(len(gates))]
        components.append({"id": "title", "component": "Heading", "level": 3,
                           "text": "1 gate needs your decision" if len(gates) == 1 else f"{len(gates)} gates need your decision"})
        components += [gate_card(g, f"gate_{i}") for i, g in enumerate(gates)]
    components.insert(0, {"id": "root", "component": "Column", "children": children, "gap": "md"})
    title = "Approvals" if len(gates) != 1 else _label(gates[0].get("gate_name", ""))
    return [create_surface(surface_id, components)], [placement(surface_id, presentation, title, CAPABILITY_ID)]
