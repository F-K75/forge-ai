"""Planning: the first, honest slice of the product vision's pre-coding
planning phase -- "Task graph, Dependency graph, Risk analysis, Time
estimate, Affected modules, Required agents, Parallel execution plan,
Rollback strategy, Success metrics... Only after approval begin coding."

This module builds the task-graph + risk-analysis + rollback/success-metric
slice of that: given a free-text objective, `TaskRouter` decomposes it into
per-department/role `PlanTask`s (the same deterministic keyword classifier
used to route work generally -- no LLM reasoning here, consistent with the
rest of `agent_registry`), risk is assessed with simple heuristics (does the
change touch architecturally-sensitive paths? how many departments does it
span?), and the resulting `Plan` sits in DRAFT until an existing agent
explicitly approves or rejects it. There are no computed dependency edges
between tasks yet -- that needs real code-structure analysis this pass
doesn't have -- so `PlanTask.depends_on` is present for shape-compatibility
but always empty for now.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from core.database import get_db

from .pr_workflow import ARCHITECTURALLY_SENSITIVE_PREFIXES
from .registry import AgentRegistry, get_agent_registry
from .task_router import TaskRouter, get_task_router

PLAN_COLLECTION = "plans"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


DEFAULT_ROLLBACK_STRATEGY = (
    "No automated rollback exists yet -- revert associated change requests manually."
)

DEFAULT_SUCCESS_METRICS: List[str] = [
    "all suggested reviewers approve",
    "no new HIGH/CRITICAL findings introduced",
]


class PlanStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class PlanTask(BaseModel):
    """A task-graph node. No computed dependency edges between tasks in this
    first pass -- that would need real code-structure analysis this pass
    doesn't have -- so `depends_on` is always empty for now, kept present
    only so the shape is future-proof without fabricating fake data."""

    id: str = Field(default_factory=lambda: _new_id("task"))
    role: str
    department: str
    agent_id: str
    description: str
    depends_on: List[str] = Field(default_factory=list)


class Plan(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("plan"))
    project_id: str
    objective: str
    status: PlanStatus = PlanStatus.DRAFT
    tasks: List[PlanTask] = Field(default_factory=list)
    affected_paths: List[str] = Field(default_factory=list)
    risk_level: RiskLevel = RiskLevel.LOW
    risk_notes: str = ""
    rollback_strategy: str = ""
    success_metrics: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
    approved_by_agent_id: Optional[str] = None
    decided_at: Optional[str] = None
    initiative_id: Optional[str] = None


class PlanNotFound(Exception):
    pass


class PlanNotEditable(Exception):
    pass


class InitiativeNotFound(Exception):
    pass


class PlanningRepository:
    async def save(self, plan: Plan) -> None:
        db = await get_db()
        await db[PLAN_COLLECTION].update_one(
            {"id": plan.id}, {"$set": plan.model_dump()}, upsert=True
        )

    async def get(self, project_id: str, plan_id: str) -> Optional[Plan]:
        db = await get_db()
        doc = await db[PLAN_COLLECTION].find_one(
            {"id": plan_id, "project_id": project_id}, {"_id": 0}
        )
        return Plan(**doc) if doc else None

    async def list_for_project(
        self, project_id: str, *, status: Optional[PlanStatus] = None, limit: int = 100
    ) -> List[Plan]:
        db = await get_db()
        query: Dict[str, Any] = {"project_id": project_id}
        if status is not None:
            query["status"] = status.value if isinstance(status, PlanStatus) else status
        cursor = (
            db[PLAN_COLLECTION]
            .find(query, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [Plan(**d) for d in docs]


class PlanningService:
    def __init__(
        self,
        registry: Optional[AgentRegistry] = None,
        router: Optional[TaskRouter] = None,
        repo: Optional[PlanningRepository] = None,
    ):
        self._registry = registry or get_agent_registry()
        self._router = router or get_task_router()
        self._repo = repo or PlanningRepository()

    def _assess_risk(
        self, tasks: List[PlanTask], affected_paths: List[str]
    ) -> Tuple[RiskLevel, str]:
        departments = sorted({t.department for t in tasks})
        sensitive_hits = sorted(
            {
                path
                for path in affected_paths
                for prefix in ARCHITECTURALLY_SENSITIVE_PREFIXES
                if path.startswith(prefix)
            }
        )

        if sensitive_hits or len(departments) > 2:
            risk_level = RiskLevel.HIGH
        elif len(departments) == 2:
            risk_level = RiskLevel.MEDIUM
        else:
            risk_level = RiskLevel.LOW

        notes: List[str] = []
        if sensitive_hits:
            notes.append(f"touches architecturally-sensitive paths: {', '.join(sensitive_hits)}")
        if len(departments) > 1:
            notes.append(f"touches {len(departments)} departments ({', '.join(departments)})")
        if not notes:
            if departments:
                notes.append(f"touches 1 department ({departments[0]})")
            else:
                notes.append("no departments touched")

        return risk_level, "; ".join(notes)

    async def create_plan(
        self,
        project_id: str,
        objective: str,
        *,
        affected_paths: Optional[List[str]] = None,
        max_assignments: int = 5,
        rollback_strategy: Optional[str] = None,
        success_metrics: Optional[List[str]] = None,
        initiative_id: Optional[str] = None,
    ) -> Plan:
        """Decompose `objective` into per-department/role tasks via
        `TaskRouter`, assess risk heuristically, and save the resulting plan
        in DRAFT status.

        `initiative_id` is an optional, purely additive, one-way reference to
        an existing Agile-PM-layer `Initiative` (see `core/pm_models.py`).
        When provided, it is validated read-only against the `initiatives`
        collection -- this file never writes to that collection. Ownership
        of the initiative is intentionally NOT checked here; the caller
        (the API layer, which already validates the caller owns
        `project_id`) is the boundary for this first pass."""
        affected_paths = list(affected_paths or [])
        assignments = await self._router.route(project_id, objective, max_assignments=max_assignments)

        tasks = [
            PlanTask(
                role=a.role,
                department=a.department,
                agent_id=a.agent_id,
                description=f"Handle: {objective} ({a.role.replace('_', ' ')})",
            )
            for a in assignments
        ]

        risk_level, risk_notes = self._assess_risk(tasks, affected_paths)

        if initiative_id is not None:
            db = await get_db()
            initiative_doc = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
            if not initiative_doc:
                raise InitiativeNotFound(f"No initiative {initiative_id}")

        plan = Plan(
            project_id=project_id,
            objective=objective,
            tasks=tasks,
            affected_paths=affected_paths,
            risk_level=risk_level,
            risk_notes=risk_notes,
            rollback_strategy=rollback_strategy if rollback_strategy is not None else DEFAULT_ROLLBACK_STRATEGY,
            success_metrics=success_metrics if success_metrics is not None else list(DEFAULT_SUCCESS_METRICS),
        )
        if initiative_id is not None:
            plan.initiative_id = initiative_id
        await self._repo.save(plan)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.PLAN_CREATED,
                    project_id=project_id,
                    data={"plan_id": plan.id, "status": plan.status.value},
                )
            )
        except Exception:
            pass

        return plan

    async def _get_or_raise(self, project_id: str, plan_id: str) -> Plan:
        plan = await self._repo.get(project_id, plan_id)
        if not plan:
            raise PlanNotFound(f"No plan {plan_id} in project {project_id}")
        return plan

    async def approve(self, project_id: str, plan_id: str, *, approved_by_agent_id: str) -> Plan:
        plan = await self._get_or_raise(project_id, plan_id)
        await self._registry.get_agent(project_id, approved_by_agent_id)

        if plan.status != PlanStatus.DRAFT:
            raise PlanNotEditable(f"Plan {plan_id} is already {plan.status.value}")

        plan.status = PlanStatus.APPROVED
        plan.approved_by_agent_id = approved_by_agent_id
        plan.decided_at = _now()
        plan.updated_at = _now()
        await self._repo.save(plan)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.PLAN_DECIDED,
                    project_id=project_id,
                    data={"plan_id": plan.id, "status": plan.status.value},
                )
            )
        except Exception:
            pass

        return plan

    async def reject(
        self, project_id: str, plan_id: str, *, rejected_by_agent_id: str, reason: str = ""
    ) -> Plan:
        plan = await self._get_or_raise(project_id, plan_id)
        await self._registry.get_agent(project_id, rejected_by_agent_id)

        if plan.status != PlanStatus.DRAFT:
            raise PlanNotEditable(f"Plan {plan_id} is already {plan.status.value}")

        plan.status = PlanStatus.REJECTED
        plan.decided_at = _now()
        plan.updated_at = _now()
        note = f"rejected by {rejected_by_agent_id}"
        if reason:
            note += f": {reason}"
        plan.risk_notes = f"{plan.risk_notes} | {note}" if plan.risk_notes else note
        await self._repo.save(plan)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.PLAN_DECIDED,
                    project_id=project_id,
                    data={"plan_id": plan.id, "status": plan.status.value},
                )
            )
        except Exception:
            pass

        return plan

    async def get(self, project_id: str, plan_id: str) -> Plan:
        return await self._get_or_raise(project_id, plan_id)

    async def list_for_project(
        self, project_id: str, *, status: Optional[PlanStatus] = None, limit: int = 100
    ) -> List[Plan]:
        return await self._repo.list_for_project(project_id, status=status, limit=limit)


_planning_service: Optional[PlanningService] = None


def get_planning_service() -> PlanningService:
    global _planning_service
    if _planning_service is None:
        _planning_service = PlanningService()
    return _planning_service
