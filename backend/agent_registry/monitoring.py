"""Repository Monitoring: the intake, triage, and auto-escalation layer for
continuous repository health signals.

The product vision has agents watching a broad set of signals -- new
commits, CI failures, security issues, performance regressions, dependency
updates, tech debt, test failures, dead code, large bundles, memory leaks,
outdated packages, broken documentation -- and notifying the relevant teams
automatically. Real integrations with GitHub/CI systems (webhooks, external
API polling) are out of scope here; this module is the plumbing such
integrations plug into later: they call `record_finding`, and this module
takes care of persisting the finding and, for anything severe enough, routing
it to the right specialist and opening a change request automatically so it
doesn't just sit in a list unnoticed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.database import get_db
from gateway.models import GatewayRequest
from gateway.service import AIGateway, get_ai_gateway

from .ownership import CodeOwnership, get_code_ownership
from .pr_workflow import PRWorkflow, get_pr_workflow
from .registry import AgentRegistry, get_agent_registry
from .task_router import Assignment, TaskRouter, get_task_router
from .team_chat import MessageType, TeamChat, get_team_chat

# Cap on the specialist-suggestion LLM call below -- this is a best-effort
# internal observability addition, not a billed generation step, so cost is
# bounded regardless of role/provider.
_SPECIALIST_SUGGESTION_MAX_TOKENS = 512

MONITORING_COLLECTION = "monitoring_findings"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class FindingCategory(str, Enum):
    CI_FAILURE = "ci_failure"
    SECURITY = "security"
    PERFORMANCE_REGRESSION = "performance_regression"
    DEPENDENCY_UPDATE = "dependency_update"
    TECH_DEBT = "tech_debt"
    TEST_FAILURE = "test_failure"
    DEAD_CODE = "dead_code"
    LARGE_BUNDLE = "large_bundle"
    MEMORY_LEAK = "memory_leak"
    OUTDATED_PACKAGE = "outdated_package"
    BROKEN_DOCUMENTATION = "broken_documentation"


class FindingSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FindingStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class MonitoringFinding(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("finding"))
    project_id: str
    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str = ""
    # Free-text description of what detected it, e.g. "ci", "dependency-scan",
    # "manual" -- deliberately not an enum since real sources aren't wired up
    # yet and shouldn't need a code change to be named.
    source: str = "manual"
    status: FindingStatus = FindingStatus.OPEN
    change_request_id: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    resolved_at: Optional[str] = None
    resolved_by_agent_id: Optional[str] = None


class FindingNotFound(Exception):
    pass


class MonitoringRepository:
    async def save(self, finding: MonitoringFinding) -> None:
        db = await get_db()
        await db[MONITORING_COLLECTION].update_one(
            {"id": finding.id}, {"$set": finding.model_dump()}, upsert=True
        )

    async def get(self, project_id: str, finding_id: str) -> Optional[MonitoringFinding]:
        db = await get_db()
        doc = await db[MONITORING_COLLECTION].find_one(
            {"id": finding_id, "project_id": project_id}, {"_id": 0}
        )
        return MonitoringFinding(**doc) if doc else None

    async def list_findings(
        self,
        project_id: str,
        *,
        status: Optional[FindingStatus] = None,
        category: Optional[FindingCategory] = None,
        limit: int = 100,
    ) -> List[MonitoringFinding]:
        db = await get_db()
        query: Dict[str, Any] = {"project_id": project_id}
        if status:
            query["status"] = status
        if category:
            query["category"] = category

        cursor = (
            db[MONITORING_COLLECTION]
            .find(query, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [MonitoringFinding(**d) for d in docs]


class RepositoryMonitor:
    def __init__(
        self,
        registry: Optional[AgentRegistry] = None,
        router: Optional[TaskRouter] = None,
        ownership: Optional[CodeOwnership] = None,
        chat: Optional[TeamChat] = None,
        workflow: Optional[PRWorkflow] = None,
        repo: Optional[MonitoringRepository] = None,
        gateway: Optional[AIGateway] = None,
    ):
        self._registry = registry or get_agent_registry()
        self._router = router or get_task_router()
        self._ownership = ownership or get_code_ownership()
        self._chat = chat or get_team_chat()
        self._workflow = workflow or get_pr_workflow()
        self._repo = repo or MonitoringRepository()
        self._gateway = gateway or get_ai_gateway()

    async def record_finding(
        self,
        project_id: str,
        category: FindingCategory,
        severity: FindingSeverity,
        title: str,
        *,
        description: str = "",
        source: str = "manual",
        auto_escalate: bool = True,
    ) -> MonitoringFinding:
        """Intake a finding from any monitoring source. Findings can come from
        automated sources with no "author", so this only requires the project
        to have an org -- not a specific reporting agent. HIGH/CRITICAL
        findings are auto-escalated into a routed change request unless the
        caller opts out."""
        await self._registry.get_or_create_org(project_id)

        finding = MonitoringFinding(
            project_id=project_id,
            category=category,
            severity=severity,
            title=title,
            description=description,
            source=source,
        )
        await self._repo.save(finding)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.FINDING_RECORDED,
                    project_id=project_id,
                    data={
                        "finding_id": finding.id,
                        "category": finding.category.value,
                        "severity": finding.severity.value,
                    },
                )
            )
        except Exception:
            pass

        if auto_escalate and severity in (FindingSeverity.HIGH, FindingSeverity.CRITICAL):
            await self._escalate(project_id, finding)

        return finding

    async def _escalate(self, project_id: str, finding: MonitoringFinding) -> None:
        """Route the finding to the specialist who should own it and open a
        change request on their behalf. Defends against TaskRouter returning
        no assignments (shouldn't happen given its fallback-to-"developer"
        behavior) by skipping escalation gracefully rather than raising."""
        assignments = await self._router.route(project_id, f"{finding.title}: {finding.description}")
        if not assignments:
            return

        assignment = assignments[0]
        cr = await self._workflow.open(
            project_id,
            f"[{finding.severity.value}] {finding.title}",
            assignment.agent_id,
            description=finding.description,
        )
        finding.change_request_id = cr.id
        await self._repo.save(finding)

        await self._chat.post(
            project_id,
            assignment.agent_id,
            f"Auto-escalated: {finding.title}",
            message_type=MessageType.ESCALATION,
            context={"finding_id": finding.id, "category": finding.category.value},
        )

        # Best-effort, additive to the escalation above (never a
        # replacement): ask the resolved specialist -- via a real LLM call
        # framed by their specific `assignment.role` -- for a concrete
        # suggestion on this finding, and post it as a second chat message.
        # See docs/architecture/specialist-agent-execution-plan.md Phase 1:
        # the point is proving the resolved role changes what actually gets
        # generated, not just routing/bookkeeping.
        await self._post_specialist_suggestion(project_id, finding, assignment)

    async def _post_specialist_suggestion(
        self, project_id: str, finding: MonitoringFinding, assignment: Assignment
    ) -> None:
        """Ask the specialist assigned to this finding (framed by their
        `assignment.role`) for a role-specific suggestion, via `AIGateway`
        directly -- deliberately NOT `agents/base.py`'s `BaseAgent._call_llm`,
        which is tied to the paid-build-generation call path (per-user budget
        checks, BYOK resolution, shared circuit breaker state). This is an
        internal observability/suggestion feature: no `user_id` is passed, so
        `LLMRouter.generate` skips its daily budget check, and no credits are
        charged.

        Wrapped end-to-end in try/except so a misconfigured provider, an open
        circuit breaker, a timeout, or any other failure here can never
        prevent `record_finding()`/`_escalate()` from completing -- matching
        the fail-open style already used in this package for external side
        effects (e.g. `pr_workflow.py`'s `advance()` wrapping its
        `trigger_security_review()` call, `team_chat.py`'s `post()` wrapping
        its OrgEvent emission)."""
        try:
            system_prompt = (
                f"You are a {assignment.role} on this project's engineering "
                f"team. A monitoring system flagged this {finding.category.value} "
                "finding: analyze it from your specific role's perspective and "
                "suggest a concrete next step. Be concise (2-4 sentences)."
            )
            user_content = (
                f"Finding: {finding.title}\n"
                f"Severity: {finding.severity.value}\n"
                f"Category: {finding.category.value}\n"
                f"Description: {finding.description or '(no description provided)'}"
            )
            response = await self._gateway.generate(
                GatewayRequest(
                    agent_name=assignment.role,
                    messages=[{"role": "user", "content": user_content}],
                    system_prompt=system_prompt,
                    project_id=project_id,
                    max_tokens=_SPECIALIST_SUGGESTION_MAX_TOKENS,
                    # Platform channel (A2): recorded under account
                    # `monitoring` without a user_id; the gateway takes the
                    # boundary from the project owner (BYOK needs consent).
                    purpose="monitoring",
                )
            )
            content = (response.content or "").strip()
            if not content:
                # Nothing usable to post -- not an error, just nothing to
                # add on top of the escalation message already posted.
                return

            await self._chat.post(
                project_id,
                assignment.agent_id,
                content,
                message_type=MessageType.FINDING,
                context={"finding_id": finding.id, "role": assignment.role},
            )
        except Exception:
            pass

    async def list_findings(
        self,
        project_id: str,
        *,
        status: Optional[FindingStatus] = None,
        category: Optional[FindingCategory] = None,
        limit: int = 100,
    ) -> List[MonitoringFinding]:
        return await self._repo.list_findings(project_id, status=status, category=category, limit=limit)

    async def resolve(
        self, project_id: str, finding_id: str, *, resolved_by_agent_id: str
    ) -> MonitoringFinding:
        await self._registry.get_agent(project_id, resolved_by_agent_id)

        finding = await self._repo.get(project_id, finding_id)
        if not finding:
            raise FindingNotFound(f"No finding {finding_id} in project {project_id}")

        finding.status = FindingStatus.RESOLVED
        finding.resolved_at = _now()
        finding.resolved_by_agent_id = resolved_by_agent_id
        await self._repo.save(finding)

        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.FINDING_RESOLVED,
                    project_id=project_id,
                    data={
                        "finding_id": finding.id,
                        "category": finding.category.value,
                        "severity": finding.severity.value,
                    },
                )
            )
        except Exception:
            pass

        return finding


_monitor: Optional[RepositoryMonitor] = None


def get_repository_monitor() -> RepositoryMonitor:
    global _monitor
    if _monitor is None:
        _monitor = RepositoryMonitor()
    return _monitor
