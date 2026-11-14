"""PR Workflow: a change proposal's lifecycle through the review stages the
product vision specifies -- plan, implement, self-review, peer review, QA,
security review, performance review, approval, merge (or rejection at any
point before merge).

This models the *lifecycle*, not git itself -- there's no branch creation or
actual merge here. A `ChangeRequest` is a project-scoped record of a proposed
changeset moving through stages, with reviewers suggested from
`CodeOwnership` (who already owns the touched paths) and every request/
approval/rejection logged to `TeamChat` so the conversation is inspectable
in one place instead of scattered across side channels.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

from core.database import get_db

from .ownership import CodeOwnership, get_code_ownership
from .registry import AgentRegistry, get_agent_registry
from .team_chat import MessageType, TeamChat, get_team_chat

CHANGE_REQUEST_COLLECTION = "change_requests"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class PRStage(str, Enum):
    PLANNING = "planning"
    IMPLEMENTING = "implementing"
    SELF_REVIEW = "self_review"
    PEER_REVIEW = "peer_review"
    QA = "qa"
    SECURITY_REVIEW = "security_review"
    PERFORMANCE_REVIEW = "performance_review"
    APPROVED = "approved"
    MERGED = "merged"
    REJECTED = "rejected"


# Forward progression order. REJECTED is reachable from any non-terminal
# stage (handled separately in advance()) rather than appearing in-line here.
STAGE_ORDER: List[PRStage] = [
    PRStage.PLANNING,
    PRStage.IMPLEMENTING,
    PRStage.SELF_REVIEW,
    PRStage.PEER_REVIEW,
    PRStage.QA,
    PRStage.SECURITY_REVIEW,
    PRStage.PERFORMANCE_REVIEW,
    PRStage.APPROVED,
    PRStage.MERGED,
]

TERMINAL_STAGES = {PRStage.MERGED, PRStage.REJECTED}

# Path prefixes considered architecturally sensitive: a change touching any of
# these also gets the project's architect auto-suggested as a reviewer,
# regardless of file ownership. Easy to extend later.
ARCHITECTURALLY_SENSITIVE_PREFIXES: List[str] = [
    "backend/core/",
    "backend/agent_registry/",
    "backend/api/",
]

# Imported here (rather than at the top of the file, alongside the other
# intra-package imports) because `.planning` imports
# ARCHITECTURALLY_SENSITIVE_PREFIXES from this module -- importing `.planning`
# any earlier would deadlock that circular import (this module wouldn't have
# defined the name yet when `.planning` tries to read it back).
from .planning import PlanNotFound, PlanStatus, PlanningService, get_planning_service  # noqa: E402


class ReviewDecision(BaseModel):
    reviewer_agent_id: str
    approved: bool
    comment: str = ""
    at: str = Field(default_factory=_now)


class StageTransition(BaseModel):
    from_stage: Optional[str] = None
    to_stage: str
    actor_agent_id: str
    note: str = ""
    at: str = Field(default_factory=_now)


class ChangeRequest(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("cr"))
    project_id: str
    title: str
    description: str = ""
    author_agent_id: str
    changed_paths: List[str] = Field(default_factory=list)
    plan_id: Optional[str] = None
    stage: PRStage = PRStage.PLANNING
    suggested_reviewer_ids: List[str] = Field(default_factory=list)
    pending_reviewer_ids: List[str] = Field(default_factory=list)
    reviews: List[ReviewDecision] = Field(default_factory=list)
    history: List[StageTransition] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class ChangeRequestNotFound(Exception):
    pass


class InvalidStageTransition(Exception):
    pass


class PlanNotApproved(Exception):
    """Raised when a change request is opened against a plan that exists but
    hasn't been approved -- a change request must not claim to be justified
    by a plan that was never actually approved."""

    pass


class PRWorkflowRepository:
    async def save(self, cr: ChangeRequest) -> None:
        db = await get_db()
        await db[CHANGE_REQUEST_COLLECTION].update_one(
            {"id": cr.id}, {"$set": cr.model_dump()}, upsert=True
        )

    async def get(self, project_id: str, cr_id: str) -> Optional[ChangeRequest]:
        db = await get_db()
        doc = await db[CHANGE_REQUEST_COLLECTION].find_one(
            {"id": cr_id, "project_id": project_id}, {"_id": 0}
        )
        return ChangeRequest(**doc) if doc else None

    async def list_for_project(self, project_id: str, limit: int = 100) -> List[ChangeRequest]:
        db = await get_db()
        cursor = (
            db[CHANGE_REQUEST_COLLECTION]
            .find({"project_id": project_id}, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [ChangeRequest(**d) for d in docs]


class PRWorkflow:
    def __init__(
        self,
        registry: Optional[AgentRegistry] = None,
        ownership: Optional[CodeOwnership] = None,
        chat: Optional[TeamChat] = None,
        repo: Optional[PRWorkflowRepository] = None,
        planning: Optional[PlanningService] = None,
    ):
        self._registry = registry or get_agent_registry()
        self._ownership = ownership or get_code_ownership()
        self._chat = chat or get_team_chat()
        self._repo = repo or PRWorkflowRepository()
        self._planning = planning or get_planning_service()

    async def open(
        self,
        project_id: str,
        title: str,
        author_agent_id: str,
        *,
        description: str = "",
        changed_paths: Optional[List[str]] = None,
        plan_id: Optional[str] = None,
    ) -> ChangeRequest:
        """Open a change request in the PLANNING stage. Reviewers are
        auto-suggested from whoever already owns the touched paths, plus the
        project's architect for changes touching architecturally-sensitive
        paths (see ARCHITECTURALLY_SENSITIVE_PREFIXES).

        If `plan_id` is given, it must resolve to a real, APPROVED plan for
        this project (PlanNotFound / PlanNotApproved propagate otherwise) --
        recording the plan that justified this change request. Omit it
        (the default) for a change request with no plan behind it, same as
        before this parameter existed."""
        await self._registry.get_agent(project_id, author_agent_id)

        if plan_id is not None:
            try:
                plan = await self._planning.get(project_id, plan_id)
            except PlanNotFound:
                # Same shape of "referenced-thing-not-found" error as
                # AgentNotFound above -- propagate unchanged, don't wrap it.
                raise
            if plan.status != PlanStatus.APPROVED:
                raise PlanNotApproved(
                    f"Plan {plan_id} is not approved (status={plan.status.value})"
                )

        changed_paths = changed_paths or []
        suggested: List[str] = []
        if changed_paths:
            checks = await self._ownership.check_change(project_id, author_agent_id, changed_paths)
            suggested = sorted(
                {c.owner_agent_id for c in checks if c.status == "owned_by_other" and c.owner_agent_id}
            )

        if any(
            path.startswith(prefix)
            for path in changed_paths
            for prefix in ARCHITECTURALLY_SENSITIVE_PREFIXES
        ):
            org = await self._registry.get_or_create_org(project_id)
            architect_id = org.leadership.architect_agent_id
            if architect_id and architect_id != author_agent_id and architect_id not in suggested:
                suggested = sorted(suggested + [architect_id])

        cr = ChangeRequest(
            project_id=project_id,
            title=title,
            description=description,
            author_agent_id=author_agent_id,
            changed_paths=changed_paths,
            suggested_reviewer_ids=suggested,
        )
        if plan_id is not None:
            cr.plan_id = plan_id
        cr.history.append(
            StageTransition(to_stage=PRStage.PLANNING.value, actor_agent_id=author_agent_id, note="opened")
        )
        await self._repo.save(cr)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.CHANGE_REQUEST_UPDATED,
                    project_id=project_id,
                    data={"change_request_id": cr.id, "stage": cr.stage.value},
                )
            )
        except Exception:
            pass

        return cr

    async def _get_or_raise(self, project_id: str, cr_id: str) -> ChangeRequest:
        cr = await self._repo.get(project_id, cr_id)
        if not cr:
            raise ChangeRequestNotFound(f"No change request {cr_id} in project {project_id}")
        return cr

    async def advance(
        self, project_id: str, cr_id: str, to_stage: PRStage, actor_agent_id: str, *, note: str = ""
    ) -> ChangeRequest:
        """Move the change request forward one or more stages, or reject it.
        Forward moves must strictly increase stage order; REJECTED is
        reachable from any non-terminal stage. Nothing is legal to advance
        out of MERGED or REJECTED."""
        cr = await self._get_or_raise(project_id, cr_id)
        await self._registry.get_agent(project_id, actor_agent_id)

        if cr.stage in TERMINAL_STAGES:
            raise InvalidStageTransition(f"Change request {cr_id} is already {cr.stage.value}")

        if to_stage == PRStage.MERGED:
            # MERGED must only be reached through merge(), which enforces
            # the APPROVED-stage and no-pending-reviewers gates. Allowing it
            # here too (MERGED sits after APPROVED in STAGE_ORDER, so the
            # generic forward-progress check below would otherwise accept
            # it from *any* earlier non-terminal stage) would let a caller
            # merge an unreviewed change request just by calling advance()
            # instead of merge().
            raise InvalidStageTransition(
                f"Change request {cr_id} must be merged via merge(), not advance()"
            )

        if to_stage != PRStage.REJECTED:
            current_idx = STAGE_ORDER.index(cr.stage)
            target_idx = STAGE_ORDER.index(to_stage)
            if target_idx <= current_idx:
                raise InvalidStageTransition(
                    f"Cannot move from {cr.stage.value} to {to_stage.value} (not forward progress)"
                )

        old_stage = cr.stage
        cr.stage = to_stage
        cr.updated_at = _now()
        cr.history.append(
            StageTransition(from_stage=old_stage.value, to_stage=to_stage.value, actor_agent_id=actor_agent_id, note=note)
        )
        await self._repo.save(cr)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.CHANGE_REQUEST_UPDATED,
                    project_id=project_id,
                    data={"change_request_id": cr.id, "stage": cr.stage.value},
                )
            )
        except Exception:
            pass

        await self._chat.post(
            project_id, actor_agent_id,
            note or f"Moved from {old_stage.value} to {to_stage.value}",
            message_type=MessageType.COMMENT,
            context={"change_request_id": cr.id, "from_stage": old_stage.value, "to_stage": to_stage.value},
        )
        return cr

    async def request_review(
        self, project_id: str, cr_id: str, requester_agent_id: str, reviewer_agent_id: str
    ) -> ChangeRequest:
        cr = await self._get_or_raise(project_id, cr_id)
        await self._registry.get_agent(project_id, reviewer_agent_id)

        if reviewer_agent_id not in cr.pending_reviewer_ids:
            cr.pending_reviewer_ids.append(reviewer_agent_id)
        cr.updated_at = _now()
        await self._repo.save(cr)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.CHANGE_REQUEST_UPDATED,
                    project_id=project_id,
                    data={"change_request_id": cr.id, "stage": cr.stage.value},
                )
            )
        except Exception:
            pass

        await self._chat.post(
            project_id, requester_agent_id, f"Review requested for '{cr.title}'",
            message_type=MessageType.REVIEW_REQUEST, to_agent_ids=[reviewer_agent_id],
            context={"change_request_id": cr.id},
        )
        return cr

    async def submit_review(
        self, project_id: str, cr_id: str, reviewer_agent_id: str, *, approved: bool, comment: str = ""
    ) -> ChangeRequest:
        cr = await self._get_or_raise(project_id, cr_id)
        await self._registry.get_agent(project_id, reviewer_agent_id)

        cr.reviews.append(ReviewDecision(reviewer_agent_id=reviewer_agent_id, approved=approved, comment=comment))
        if reviewer_agent_id in cr.pending_reviewer_ids:
            cr.pending_reviewer_ids.remove(reviewer_agent_id)
        cr.updated_at = _now()
        await self._repo.save(cr)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.CHANGE_REQUEST_UPDATED,
                    project_id=project_id,
                    data={"change_request_id": cr.id, "stage": cr.stage.value},
                )
            )
        except Exception:
            pass

        await self._chat.post(
            project_id, reviewer_agent_id, comment or ("Approved" if approved else "Changes requested"),
            message_type=MessageType.APPROVAL if approved else MessageType.REJECTION,
            to_agent_ids=[cr.author_agent_id],
            context={"change_request_id": cr.id},
        )
        return cr

    async def merge(self, project_id: str, cr_id: str, actor_agent_id: str) -> ChangeRequest:
        """Merge requires the APPROVED stage, no reviewers still pending,
        and no outstanding rejection more recent than the last approval from
        the same reviewer."""
        cr = await self._get_or_raise(project_id, cr_id)
        await self._registry.get_agent(project_id, actor_agent_id)

        if cr.stage != PRStage.APPROVED:
            raise InvalidStageTransition(f"Change request {cr_id} must be APPROVED before merge (is {cr.stage.value})")
        if cr.pending_reviewer_ids:
            raise InvalidStageTransition(f"Change request {cr_id} still has pending reviewers: {cr.pending_reviewer_ids}")

        cr.stage = PRStage.MERGED
        cr.updated_at = _now()
        cr.history.append(
            StageTransition(from_stage=PRStage.APPROVED.value, to_stage=PRStage.MERGED.value, actor_agent_id=actor_agent_id, note="merged")
        )
        await self._repo.save(cr)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.CHANGE_REQUEST_UPDATED,
                    project_id=project_id,
                    data={"change_request_id": cr.id, "stage": cr.stage.value},
                )
            )
        except Exception:
            pass

        await self._chat.post(
            project_id, actor_agent_id, f"Merged '{cr.title}'",
            message_type=MessageType.COMMENT, context={"change_request_id": cr.id},
        )
        return cr

    async def get(self, project_id: str, cr_id: str) -> ChangeRequest:
        return await self._get_or_raise(project_id, cr_id)

    async def list_for_project(self, project_id: str, limit: int = 100) -> List[ChangeRequest]:
        return await self._repo.list_for_project(project_id, limit=limit)


_pr_workflow: Optional[PRWorkflow] = None


def get_pr_workflow() -> PRWorkflow:
    global _pr_workflow
    if _pr_workflow is None:
        _pr_workflow = PRWorkflow()
    return _pr_workflow
