"""AgentRegistry: the service layer over AgentRegistryRepository.

Owns the lifecycle rules the persistence layer doesn't know about: seeding a
default org for a new project, dynamic specialist creation ("does an agent
for this role already exist? no -> create it, permanently"), recording task
outcomes into an agent's running performance stats, and promotion/retirement.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from .default_org import (
    DEFAULT_DEPARTMENTS,
    SPECIALISTS_DEPARTMENT_KEY,
    SPECIALISTS_DEPARTMENT_NAME,
    department_for_role,
    display_name_for_role,
)
from .models import (
    AgentLevel,
    AgentProfile,
    AgentStatus,
    Department,
    EngineeringOrg,
    LEVEL_ORDER,
    Leadership,
)
from .repository import AgentRegistryRepository

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# (min_tasks_completed, min_success_rate) required to promote OUT of this
# level into the next one in LEVEL_ORDER. PRINCIPAL has no ceiling above it.
PROMOTION_THRESHOLDS: Dict[AgentLevel, Tuple[int, float]] = {
    AgentLevel.JUNIOR: (10, 0.70),
    AgentLevel.MID: (30, 0.80),
    AgentLevel.SENIOR: (75, 0.85),
    AgentLevel.LEAD: (150, 0.90),
}

# Minimum sample size before stats.success_rate is considered meaningful
# enough to derive a strength/weakness tag from.
COMPETENCE_SAMPLE_SIZE = 5
STRENGTH_SUCCESS_RATE = 0.8
WEAKNESS_SUCCESS_RATE = 0.5

# Levels (by LEVEL_ORDER index) that require CTO sign-off to promote into,
# regardless of `force` -- an organizational governance gate, not a
# performance bar.
CTO_APPROVAL_REQUIRED_FROM_INDEX = 3  # LEAD, PRINCIPAL


def _strength_tag(role: str) -> str:
    return f"reliable {role.replace('_', ' ')}"


def _weakness_tag(role: str) -> str:
    return f"inconsistent {role.replace('_', ' ')}"


class AgentNotFound(Exception):
    pass


class PromotionNotEligible(Exception):
    def __init__(
        self,
        level: AgentLevel,
        required_tasks: int,
        required_rate: float,
        agent: AgentProfile,
        message: Optional[str] = None,
    ):
        self.level = level
        self.required_tasks = required_tasks
        self.required_rate = required_rate
        self.agent = agent
        if message is None:
            message = (
                f"Agent {agent.id} ({level.value}) needs >= {required_tasks} tasks and "
                f">= {required_rate:.0%} success rate to be promoted; has "
                f"{agent.stats.tasks_completed} tasks at {agent.stats.success_rate:.0%}"
            )
        super().__init__(message)


class AgentRegistry:
    def __init__(self, repo: Optional[AgentRegistryRepository] = None):
        self._repo = repo or AgentRegistryRepository()

    # ------------------------------------------------------------------
    # Org lifecycle
    # ------------------------------------------------------------------

    async def get_or_create_org(self, project_id: str) -> EngineeringOrg:
        org = await self._repo.get_org(project_id)
        if org:
            return org
        return await self._seed_default_org(project_id)

    async def _seed_default_org(self, project_id: str) -> EngineeringOrg:
        org = EngineeringOrg(project_id=project_id)
        leadership_ids: Dict[str, str] = {}

        for dept_key, spec in DEFAULT_DEPARTMENTS.items():
            dept = Department(key=dept_key, name=spec["name"])
            for role in spec["roles"]:
                agent = AgentProfile(
                    project_id=project_id,
                    role=role,
                    department=dept_key,
                    display_name=display_name_for_role(role),
                )
                agent.decision_log.append(
                    {"event": "created", "reason": "default org seed", "at": _now()}
                )
                await self._repo.save_agent(agent)
                dept.agent_ids.append(agent.id)
                if dept_key == "leadership":
                    leadership_ids[role] = agent.id
            org.departments.append(dept)

        org.leadership = Leadership(
            cto_agent_id=leadership_ids.get("cto"),
            pm_agent_id=leadership_ids.get("product_manager"),
            tech_lead_agent_id=leadership_ids.get("tech_lead"),
            architect_agent_id=leadership_ids.get("architect"),
        )
        await self._repo.save_org(org)
        logger.info("Seeded default engineering org for project %s", project_id)
        return org

    async def list_agents(self, project_id: str) -> List[AgentProfile]:
        await self.get_or_create_org(project_id)
        return await self._repo.list_agents(project_id)

    async def get_agent(self, project_id: str, agent_id: str) -> AgentProfile:
        agent = await self._repo.get_agent(project_id, agent_id)
        if not agent:
            raise AgentNotFound(f"No agent {agent_id} in project {project_id}")
        return agent

    # ------------------------------------------------------------------
    # Dynamic agent creation
    # ------------------------------------------------------------------

    async def get_or_create_agent(
        self,
        project_id: str,
        role: str,
        *,
        department: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> Tuple[AgentProfile, bool]:
        """Return (agent, created). Reuses an existing non-retired agent for
        `role` if one exists; otherwise spins up a new specialist and files
        them under `department` (or the default/derived one) permanently."""
        org = await self.get_or_create_org(project_id)

        existing = await self._repo.find_agent_by_role(project_id, role)
        if existing and existing.status != AgentStatus.RETIRED:
            return existing, False

        dept_key = department or department_for_role(role)
        agent = AgentProfile(
            project_id=project_id,
            role=role,
            department=dept_key,
            display_name=display_name or display_name_for_role(role),
        )
        agent.decision_log.append(
            {"event": "created", "reason": "dynamic specialist creation", "at": _now()}
        )
        await self._repo.save_agent(agent)
        await self._attach_to_department(org, dept_key, agent.id)
        logger.info("Created new specialist agent role=%s department=%s project=%s", role, dept_key, project_id)
        return agent, True

    async def _attach_to_department(self, org: EngineeringOrg, dept_key: str, agent_id: str) -> None:
        dept = next((d for d in org.departments if d.key == dept_key), None)
        if dept is None:
            dept = Department(
                key=dept_key,
                name=SPECIALISTS_DEPARTMENT_NAME if dept_key == SPECIALISTS_DEPARTMENT_KEY else dept_key.title(),
            )
            org.departments.append(dept)
        if agent_id not in dept.agent_ids:
            dept.agent_ids.append(agent_id)
        org.updated_at = _now()
        await self._repo.save_org(org)

    # ------------------------------------------------------------------
    # Performance tracking
    # ------------------------------------------------------------------

    async def record_task_result(
        self,
        project_id: str,
        agent_id: str,
        *,
        success: bool,
        tokens: int = 0,
        cost: float = 0.0,
        files_touched: Optional[List[str]] = None,
        review_score: Optional[float] = None,
    ) -> AgentProfile:
        agent = await self._repo.get_agent(project_id, agent_id)
        if not agent:
            raise AgentNotFound(f"No agent {agent_id} in project {project_id}")

        stats = agent.stats
        stats.tasks_completed += 1
        if not success:
            stats.tasks_failed += 1
        completed = stats.tasks_completed
        stats.success_rate = (completed - stats.tasks_failed) / completed if completed else 0.0
        stats.tokens_used += tokens
        stats.cost_incurred += cost
        stats.last_active_at = _now()

        if review_score is not None:
            stats.review_scores.append(review_score)
            stats.review_scores = stats.review_scores[-50:]
            stats.avg_review_score = sum(stats.review_scores) / len(stats.review_scores)

        if files_touched:
            agent.owned_paths = sorted(set(agent.owned_paths) | set(files_touched))

        # Derive strengths/weaknesses from accumulated performance once there's
        # a meaningful sample size. Append-only, like decision_log: a tag is
        # never removed just because a later task nudges the rolling rate back
        # across the threshold.
        if stats.tasks_completed >= COMPETENCE_SAMPLE_SIZE:
            if stats.success_rate >= STRENGTH_SUCCESS_RATE:
                tag = _strength_tag(agent.role)
                if tag not in agent.strengths:
                    agent.strengths.append(tag)
            if stats.success_rate < WEAKNESS_SUCCESS_RATE:
                tag = _weakness_tag(agent.role)
                if tag not in agent.weaknesses:
                    agent.weaknesses.append(tag)

        agent.status = AgentStatus.ACTIVE
        await self._repo.save_agent(agent)

        try:
            agent = await self.promote(project_id, agent_id, reason="auto-promotion", force=False)
        except (PromotionNotEligible, AgentNotFound):
            pass

        return agent

    # ------------------------------------------------------------------
    # Promotion / retirement
    # ------------------------------------------------------------------

    async def promote(
        self,
        project_id: str,
        agent_id: str,
        *,
        reason: str = "",
        force: bool = False,
        approved_by_agent_id: Optional[str] = None,
    ) -> AgentProfile:
        agent = await self._repo.get_agent(project_id, agent_id)
        if not agent:
            raise AgentNotFound(f"No agent {agent_id} in project {project_id}")

        idx = LEVEL_ORDER.index(agent.level)
        if idx == len(LEVEL_ORDER) - 1:
            raise PromotionNotEligible(agent.level, 0, 0.0, agent)

        target_level = LEVEL_ORDER[idx + 1]

        # Promotions into LEAD/PRINCIPAL require the project's CTO to sign
        # off. This is a governance gate, not a performance bar, so `force`
        # never bypasses it.
        if LEVEL_ORDER.index(target_level) >= CTO_APPROVAL_REQUIRED_FROM_INDEX:
            org = await self._repo.get_org(project_id)
            cto_agent_id = org.leadership.cto_agent_id if org else None
            if not cto_agent_id or approved_by_agent_id != cto_agent_id:
                raise PromotionNotEligible(
                    target_level,
                    0,
                    0.0,
                    agent,
                    message="promotion to lead/principal requires CTO approval",
                )

        if not force:
            min_tasks, min_rate = PROMOTION_THRESHOLDS[agent.level]
            if agent.stats.tasks_completed < min_tasks or agent.stats.success_rate < min_rate:
                raise PromotionNotEligible(agent.level, min_tasks, min_rate, agent)

        old_level = agent.level
        agent.level = target_level
        agent.decision_log.append(
            {
                "event": "promoted",
                "from": old_level.value,
                "to": agent.level.value,
                "reason": reason,
                "forced": force,
                "at": _now(),
            }
        )
        await self._repo.save_agent(agent)
        logger.info("Promoted agent %s: %s -> %s", agent_id, old_level.value, agent.level.value)
        return agent

    async def retire(self, project_id: str, agent_id: str, *, reason: str = "") -> AgentProfile:
        agent = await self._repo.get_agent(project_id, agent_id)
        if not agent:
            raise AgentNotFound(f"No agent {agent_id} in project {project_id}")

        agent.status = AgentStatus.RETIRED
        agent.retired_at = _now()
        agent.retired_reason = reason
        agent.decision_log.append({"event": "retired", "reason": reason, "at": agent.retired_at})
        await self._repo.save_agent(agent)
        logger.info("Retired agent %s in project %s: %s", agent_id, project_id, reason)
        return agent


_registry: Optional[AgentRegistry] = None


def get_agent_registry() -> AgentRegistry:
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
    return _registry
