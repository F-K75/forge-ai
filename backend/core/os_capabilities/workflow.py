"""``workflow.design``: turn a canvas graph into a kernel plan template.

Phase 2 decision (docs/os/PHASE2_DECISIONS.md #4): a designed workflow is a
kernel plan template saved as a session artifact. There is no workflow entity:
"save" returns the template as a surface data-model update (WS-C persists it in
``os_surfaces`` with the session) and "run" hands the same template to the
existing kernel (``POST /v1/projects/{project_id}/kernel/runs`` with ``tasks``).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence

MAX_NODES = 16  # ExecuteKernelRunRequest.max_agents upper bound
_SLUG = re.compile(r"[^a-z0-9_]+")


class WorkflowError(ValueError):
    """The graph is not a valid plan (cycle, dangling edge, too big). Safe to show."""


def _slug(value: str, fallback: str) -> str:
    slug = _SLUG.sub("_", (value or "").lower()).strip("_")[:64]
    return slug or fallback


def plan_template(objective: str, nodes: Sequence[Dict[str, Any]], edges: Sequence[Dict[str, Any]], name: str = "") -> Dict[str, Any]:
    if not nodes:
        raise WorkflowError("Add at least one step to the workflow.")
    if len(nodes) > MAX_NODES:
        raise WorkflowError(f"A workflow can have at most {MAX_NODES} steps.")
    ids = [str(n.get("id", "")) for n in nodes]
    if len(set(ids)) != len(ids) or not all(ids):
        raise WorkflowError("Every step needs a unique id.")
    deps: Dict[str, List[str]] = {i: [] for i in ids}
    for edge in edges:
        src, dst = str(edge.get("source", "")), str(edge.get("target", ""))
        if src not in deps or dst not in deps:
            raise WorkflowError("A connection points at a step that does not exist.")
        if src == dst:
            raise WorkflowError("A step cannot depend on itself.")
        if src not in deps[dst]:
            deps[dst].append(src)
    # Kahn's algorithm: reject cycles and emit tasks in dependency order.
    indeg = {i: len(deps[i]) for i in ids}
    ready = [i for i in ids if indeg[i] == 0]
    order: List[str] = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for other in ids:
            if cur in deps[other]:
                indeg[other] -= 1
                if indeg[other] == 0:
                    ready.append(other)
    if len(order) != len(ids):
        raise WorkflowError("The workflow has a cycle; remove a connection so steps run in order.")
    by_id = {str(n["id"]): n for n in nodes}
    task_ids: Dict[str, str] = {}
    for idx, nid in enumerate(ids):
        base = slug = _slug(nid, f"step_{idx + 1}")
        suffix = 2
        while slug in task_ids.values():
            slug = f"{base[:58]}_{suffix}"
            suffix += 1
        task_ids[nid] = slug
    tasks = []
    for nid in order:
        node = by_id[nid]
        # WS-C's no-key workflow template labels nodes with ``label``; the canvas uses ``title``.
        title = str(node.get("title") or node.get("label") or nid)[:200]
        tasks.append({
            "id": task_ids[nid],
            "title": title,
            "role": _slug(str(node.get("role") or "generalist"), "generalist"),
            "department": _slug(str(node.get("department") or "engineering"), "engineering"),
            "description": str(node.get("description") or title)[:2000],
            "depends_on": [task_ids[d] for d in deps[nid]],
        })
    return {
        "kind": "kernel_plan_template",
        "version": 1,
        "name": (name or objective)[:200],
        "objective": objective[:2000],
        "tasks": tasks,
        "graph": {"nodes": list(nodes), "edges": list(edges)},
    }
