"""Agent Workload: a read-time projection answering the product vision's
Developer Experience question -- "what is each persistent agent actually
carrying right now?" -- assembled from records several other modules already
keep (change requests, plans).

Same philosophy as `activity.py` / `KnowledgeGraphService`: this is a
projection over existing Mongo collections, not a new persisted store with
its own write path. There is no "workload" collection and nothing new to
remember to write to -- every count here is derived from a change request or
plan document some other service already saves for its own reasons. If a new
kind of workload needs to show up later, it should be read here from wherever
it's already stored, not written here twice.

Inclusion policy: only agents with at least one non-zero count across the
three categories are returned. A dashboard listing all agents in a project's
default org (which seeds a couple dozen roles) would be mostly zeros and bury
the handful of agents actually carrying something under noise -- the point of
this view is "what does THIS agent have on their plate", which zero-workload
agents have nothing to contribute to. Agents are sorted by total workload
(sum of the three counts) descending, so the busiest agents surface first.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from core.database import get_db

from .pr_workflow import TERMINAL_STAGES
from .registry import AgentRegistry, get_agent_registry

_TERMINAL_STAGE_VALUES = {s.value for s in TERMINAL_STAGES}


class AgentWorkloadSummary(BaseModel):
    agent_id: str
    display_name: str
    role: str
    department: str
    open_change_requests_authored: int
    open_change_requests_authored_ids: List[str] = Field(default_factory=list)
    pending_reviews: int
    pending_review_ids: List[str] = Field(default_factory=list)
    open_plan_tasks: int
    open_plan_task_descriptions: List[str] = Field(default_factory=list)


class WorkloadService:
    """Aggregates each agent's current workload from existing collections at
    read time. No repository indirection -- there's no write path here to
    justify one, same as `ActivityService.get_timeline` querying Mongo
    directly."""

    def __init__(self, registry: Optional[AgentRegistry] = None):
        self._registry = registry or get_agent_registry()

    async def get_workload(self, project_id: str) -> List[AgentWorkloadSummary]:
        agents = await self._registry.list_agents(project_id)

        db = await get_db()
        cr_cursor = db.change_requests.find({"project_id": project_id}, {"_id": 0})
        cr_docs = await cr_cursor.to_list(length=None)

        plan_cursor = db.plans.find({"project_id": project_id}, {"_id": 0})
        plan_docs = await plan_cursor.to_list(length=None)
        approved_plan_docs = [d for d in plan_docs if d.get("status") == "approved"]

        summaries: List[AgentWorkloadSummary] = []
        for agent in agents:
            authored_ids: List[str] = []
            pending_review_ids: List[str] = []
            for doc in cr_docs:
                if (
                    doc.get("author_agent_id") == agent.id
                    and doc.get("stage") not in _TERMINAL_STAGE_VALUES
                ):
                    authored_ids.append(doc["id"])
                if (
                    agent.id in (doc.get("pending_reviewer_ids") or [])
                    and doc.get("stage") not in _TERMINAL_STAGE_VALUES
                ):
                    pending_review_ids.append(doc["id"])

            task_descriptions: List[str] = []
            for doc in approved_plan_docs:
                for task in doc.get("tasks") or []:
                    if task.get("agent_id") == agent.id:
                        task_descriptions.append(task.get("description", ""))

            total = len(authored_ids) + len(pending_review_ids) + len(task_descriptions)
            if total == 0:
                continue

            summaries.append(
                AgentWorkloadSummary(
                    agent_id=agent.id,
                    display_name=agent.display_name,
                    role=agent.role,
                    department=agent.department,
                    open_change_requests_authored=len(authored_ids),
                    open_change_requests_authored_ids=authored_ids,
                    pending_reviews=len(pending_review_ids),
                    pending_review_ids=pending_review_ids,
                    open_plan_tasks=len(task_descriptions),
                    open_plan_task_descriptions=task_descriptions,
                )
            )

        summaries.sort(
            key=lambda s: s.open_change_requests_authored + s.pending_reviews + s.open_plan_tasks,
            reverse=True,
        )
        return summaries


_workload_service: Optional[WorkloadService] = None


def get_workload_service() -> WorkloadService:
    global _workload_service
    if _workload_service is None:
        _workload_service = WorkloadService()
    return _workload_service
