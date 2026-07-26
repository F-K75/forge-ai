"""Activity Timeline: a read-time projection of "what happened" across a
project, assembled from the append-only records several other modules
already keep -- agent decision logs, change request stage history, plan
decisions, monitoring findings, and team chat.

Same philosophy as `knowledge_graph.py`: this is a projection over existing
Mongo collections, not a new persisted store with its own write path. There is
no "activity log" collection and nothing new to remember to write to -- every
entry returned here is derived from a document/sub-document that some other
service already saves for its own reasons. If a new kind of event needs to
show up on the timeline later, it should be read here from wherever it's
already stored, not written here twice.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.database import get_db

from .registry import AgentRegistry, get_agent_registry


class ActivityEntry(BaseModel):
    # Deterministic, derived id -- f"{source_collection}:{doc_id}:{sub_index}"
    # (or without a sub_index where a document only ever produces one entry)
    # so the same underlying event always maps to the same id across calls.
    # Never a random uuid: nothing here is stored, so there's nothing to keep
    # an id stable *for* except repeat calls agreeing with each other.
    id: str
    project_id: str
    type: str
    summary: str
    actor_agent_id: Optional[str] = None
    at: str
    context: Dict[str, Any] = Field(default_factory=dict)


def _truncate(text: str, length: int = 100) -> str:
    text = text or ""
    if len(text) <= length:
        return text
    return text[:length].rstrip() + "..."


def _decision_summary(display_name: str, entry: Dict[str, Any]) -> str:
    """Human-readable summary for one `AgentProfile.decision_log` entry."""
    event = entry.get("event", "")
    reason = entry.get("reason")

    if event == "promoted":
        summary = f"{display_name} promoted from {entry.get('from')} to {entry.get('to')}"
    elif event == "retired":
        summary = f"{display_name} retired"
    elif event == "created":
        summary = f"{display_name} was created"
    else:
        summary = f"{display_name}: {event}"

    if reason:
        summary = f"{summary} ({reason})"
    return summary


class ActivityService:
    """Aggregates a project's activity timeline from existing collections at
    read time. No repository indirection -- there's no write path here to
    justify one, same as `KnowledgeGraphService.build_for_project` querying
    Mongo directly."""

    def __init__(self, registry: Optional[AgentRegistry] = None):
        self._registry = registry or get_agent_registry()

    async def get_timeline(self, project_id: str, *, limit: int = 100) -> List[ActivityEntry]:
        agents = await self._registry.list_agents(project_id)
        display_names: Dict[str, str] = {a.id: a.display_name for a in agents}

        db = await get_db()
        entries: List[ActivityEntry] = []

        # ------------------------------------------------------------------
        # agent_profiles.decision_log -- creation/promotion/retirement
        # ------------------------------------------------------------------
        for agent in agents:
            display_name = display_names.get(agent.id, agent.id)
            for idx, log_entry in enumerate(agent.decision_log):
                event = log_entry.get("event", "unknown")
                entries.append(
                    ActivityEntry(
                        id=f"agent_profiles:{agent.id}:{idx}",
                        project_id=project_id,
                        type=f"agent_{event}",
                        summary=_decision_summary(display_name, log_entry),
                        actor_agent_id=agent.id,
                        at=log_entry.get("at", ""),
                    )
                )

        # ------------------------------------------------------------------
        # change_requests.history -- stage transitions
        # ------------------------------------------------------------------
        cr_cursor = db.change_requests.find({"project_id": project_id}, {"_id": 0})
        cr_docs = await cr_cursor.to_list(length=None)
        for doc in cr_docs:
            title = doc.get("title", "")
            for idx, transition in enumerate(doc.get("history") or []):
                from_stage = transition.get("from_stage")
                to_stage = transition.get("to_stage")
                if from_stage is None:
                    summary = f"'{title}' opened"
                else:
                    summary = f"'{title}' moved from {from_stage} to {to_stage}"
                entries.append(
                    ActivityEntry(
                        id=f"change_requests:{doc['id']}:{idx}",
                        project_id=project_id,
                        type="change_request_transition",
                        summary=summary,
                        actor_agent_id=transition.get("actor_agent_id"),
                        at=transition.get("at", ""),
                        context={"change_request_id": doc["id"]},
                    )
                )

        # ------------------------------------------------------------------
        # plans -- creation, and decision once decided_at is set
        # ------------------------------------------------------------------
        plan_cursor = db.plans.find({"project_id": project_id}, {"_id": 0})
        plan_docs = await plan_cursor.to_list(length=None)
        for doc in plan_docs:
            objective = doc.get("objective", "")
            entries.append(
                ActivityEntry(
                    id=f"plans:{doc['id']}:created",
                    project_id=project_id,
                    type="plan_created",
                    summary=f"Plan created: {objective}",
                    actor_agent_id=None,
                    at=doc.get("created_at", ""),
                    context={"plan_id": doc["id"]},
                )
            )

            decided_at = doc.get("decided_at")
            if decided_at:
                status = doc.get("status")
                approved_by_agent_id = doc.get("approved_by_agent_id")
                summary = f"Plan {status}"
                if approved_by_agent_id:
                    approver_name = display_names.get(approved_by_agent_id, approved_by_agent_id)
                    summary = f"{summary} by {approver_name}"
                entries.append(
                    ActivityEntry(
                        id=f"plans:{doc['id']}:decided",
                        project_id=project_id,
                        type="plan_decided",
                        summary=summary,
                        actor_agent_id=approved_by_agent_id,
                        at=decided_at,
                        context={"plan_id": doc["id"]},
                    )
                )

        # ------------------------------------------------------------------
        # monitoring_findings -- creation, and resolution once resolved_at set
        # ------------------------------------------------------------------
        finding_cursor = db.monitoring_findings.find({"project_id": project_id}, {"_id": 0})
        finding_docs = await finding_cursor.to_list(length=None)
        for doc in finding_docs:
            title = doc.get("title", "")
            entries.append(
                ActivityEntry(
                    id=f"monitoring_findings:{doc['id']}:created",
                    project_id=project_id,
                    type="finding_recorded",
                    summary=f"Finding recorded: {title}",
                    actor_agent_id=None,
                    at=doc.get("created_at", ""),
                    context={"finding_id": doc["id"]},
                )
            )

            resolved_at = doc.get("resolved_at")
            if resolved_at:
                entries.append(
                    ActivityEntry(
                        id=f"monitoring_findings:{doc['id']}:resolved",
                        project_id=project_id,
                        type="finding_resolved",
                        summary=f"Finding resolved: {title}",
                        actor_agent_id=doc.get("resolved_by_agent_id"),
                        at=resolved_at,
                        context={"finding_id": doc["id"]},
                    )
                )

        # ------------------------------------------------------------------
        # team_messages -- one entry per message
        # ------------------------------------------------------------------
        message_cursor = db.team_messages.find({"project_id": project_id}, {"_id": 0})
        message_docs = await message_cursor.to_list(length=None)
        for doc in message_docs:
            content = doc.get("content", "")
            entries.append(
                ActivityEntry(
                    id=f"team_messages:{doc['id']}",
                    project_id=project_id,
                    type="message_posted",
                    summary=_truncate(content),
                    actor_agent_id=doc.get("from_agent_id"),
                    at=doc.get("created_at", ""),
                    context={"message_id": doc["id"]},
                )
            )

        # ISO 8601 strings with a Z suffix sort correctly lexicographically,
        # so no need to parse to datetime just to order them.
        entries.sort(key=lambda e: e.at, reverse=True)
        return entries[:limit]


_activity_service: Optional[ActivityService] = None


def get_activity_service() -> ActivityService:
    global _activity_service
    if _activity_service is None:
        _activity_service = ActivityService()
    return _activity_service
