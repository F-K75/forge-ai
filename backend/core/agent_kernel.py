"""Agent Orchestration Kernel — Multi-Agent Planning, DAG Scheduling, Parallel
Wave Execution, and Governed Agent-to-Agent Delegation.

Bridges Forge AI's 9-department Autonomous Engineering Organisation with real
dependency-aware scheduling and parallel execution:

1. **Org Blueprint (9 Departments, 23 Specialist Roles)**:
   Leadership, Business, Architecture, Design, Engineering, Infrastructure,
   Security, Quality, and Delivery — each mapped to an execution stage tier
   and runtime agent/gateway handler.
2. **DAG Planner (`plan_objective`)**:
   Decomposes a free-text engineering objective into role-assigned tasks,
   computes cross-stage dependency edges (`depends_on`), validates acyclicity,
   and groups independent tasks into parallel execution waves (`Wave 0..N`).
3. **Parallel Wave Executor (`AgentKernel.execute_run`)**:
   Executes each wave concurrently via `asyncio.gather` bounded by
   `asyncio.Semaphore(max_concurrency)` with per-task timeouts, bounded
   retries, cooperative cancellation, and downstream `BLOCKED` propagation on
   upstream failures.
4. **Governed Delegation (`DelegationBus`)**:
   Enforces explicit inter-agent routing policy (`DelegationPolicy`), max
   delegation depth (loop prevention), total delegation budget, and full audit
   logging of every request/reply.
5. **Lifecycle Hooks**:
   Optionally emits `OrgEvent`s via `org_manager`, records agent task outcomes
   in `AgentRegistry`, and logs key kernel decisions to `DecisionLogService`
   for the Persistent AI Product Lead.

Designed with zero hard import-time dependencies on FastAPI/Motor/Pydantic so
core scheduling and delegation invariants can be verified standalone as well as
wired into FastAPI/MongoDB in production.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, FrozenSet, List, Optional, Sequence, Set, Tuple

from core.agent_collaboration import (
    AgentBlackboard,
    ApprovalGate,
    ApprovalStatus,
    ArtifactType,
    DEPARTMENT_DEFAULT_ARTIFACT,
    RepairCycleRecord,
    dispatch_specialist_agent,
    extract_blocking_findings,
)
from core.evaluation_engine import (
    ArtifactEvaluator,
    BudgetExceededError,
    CostBudgetGuard,
    ModelRouter,
)
from core.kernel_observability import get_trace_collector
from core.knowledge_fabric import get_knowledge_fabric
from core.skill_marketplace import get_governance_policy_store
from core.execution_sandbox import (
    VerificationSandbox,
    WorktreeLease,
    WorktreeManager,
    get_worktree_manager,
)
from core.protocol_gateway import get_agui_broker
from core.skill_engine import get_skill_router

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# --------------------------------------------------------------------------- #
# 1. Autonomous Engineering Organisation Blueprint (9 Departments)
# --------------------------------------------------------------------------- #


class DepartmentKey(str, Enum):
    LEADERSHIP = "leadership"
    BUSINESS = "business"
    ARCHITECTURE = "architecture"
    DESIGN = "design"
    ENGINEERING = "engineering"
    INFRASTRUCTURE = "infrastructure"
    SECURITY = "security"
    QUALITY = "quality"
    DELIVERY = "delivery"


# Execution stage tiers used to compute deterministic DAG dependencies across
# departments. Tasks in the same tier run in parallel; higher tiers depend on
# lower tiers that are present in the same plan.
DEPARTMENT_STAGE_TIER: Dict[DepartmentKey, int] = {
    DepartmentKey.LEADERSHIP: 0,
    DepartmentKey.BUSINESS: 0,
    DepartmentKey.ARCHITECTURE: 1,
    DepartmentKey.DESIGN: 1,
    DepartmentKey.ENGINEERING: 2,
    DepartmentKey.INFRASTRUCTURE: 2,
    DepartmentKey.SECURITY: 3,
    DepartmentKey.QUALITY: 3,
    DepartmentKey.DELIVERY: 4,
}


@dataclass(frozen=True)
class OrgRoleSpec:
    role: str
    display_name: str
    department: DepartmentKey
    stage_tier: int
    keywords: Tuple[str, ...]
    backend_agent_key: str
    capabilities: Tuple[str, ...]


ORG_BLUEPRINT: Tuple[OrgRoleSpec, ...] = (
    # Leadership (Tier 0)
    OrgRoleSpec(
        role="product_lead",
        display_name="Product Lead",
        department=DepartmentKey.LEADERSHIP,
        stage_tier=0,
        keywords=("roadmap", "vision", "decision", "stakeholder", "priority", "product lead"),
        backend_agent_key="pm",
        capabilities=("decision-memory", "scope-governance", "goal-alignment"),
    ),
    OrgRoleSpec(
        role="engineering_manager",
        display_name="Engineering Manager",
        department=DepartmentKey.LEADERSHIP,
        stage_tier=0,
        keywords=("sprint", "milestone", "capacity", "coordination", "delivery plan"),
        backend_agent_key="scrum_master",
        capabilities=("sprint-planning", "capacity-allocation", "risk-mitigation"),
    ),
    OrgRoleSpec(
        role="orchestrator",
        display_name="Lead Orchestrator",
        department=DepartmentKey.LEADERSHIP,
        stage_tier=0,
        keywords=("orchestrate", "workflow", "multi-agent", "pipeline", "delegate"),
        backend_agent_key="decision_engine",
        capabilities=("dag-scheduling", "delegation", "gate-enforcement"),
    ),
    # Business (Tier 0)
    OrgRoleSpec(
        role="business_strategist",
        display_name="Business Strategist",
        department=DepartmentKey.BUSINESS,
        stage_tier=0,
        keywords=("pricing", "monetiz", "revenue", "business model", "unit economics", "billing"),
        backend_agent_key="business_model",
        capabilities=("monetization", "unit-economics", "gtm-strategy"),
    ),
    OrgRoleSpec(
        role="product_manager",
        display_name="Product Manager",
        department=DepartmentKey.BUSINESS,
        stage_tier=0,
        keywords=("prd", "requirement", "user story", "epic", "acceptance criteria", "spec"),
        backend_agent_key="prd_writer",
        capabilities=("prd-authoring", "backlog-decomposition", "kpi-definition"),
    ),
    OrgRoleSpec(
        role="market_researcher",
        display_name="Market Researcher",
        department=DepartmentKey.BUSINESS,
        stage_tier=0,
        keywords=("market", "competitor", "benchmark", "research", "customer discovery"),
        backend_agent_key="research",
        capabilities=("competitive-analysis", "market-sizing", "icp-validation"),
    ),
    # Architecture (Tier 1)
    OrgRoleSpec(
        role="solution_architect",
        display_name="Solution Architect",
        department=DepartmentKey.ARCHITECTURE,
        stage_tier=1,
        keywords=("architecture", "integration", "protocol", "gateway", "microservice", "contract"),
        backend_agent_key="architect",
        capabilities=("api-contracts", "integration-architecture", "adr-authoring"),
    ),
    OrgRoleSpec(
        role="system_architect",
        display_name="System Architect",
        department=DepartmentKey.ARCHITECTURE,
        stage_tier=1,
        keywords=("scalab", "distributed", "system design", "event-driven", "queue", "topology"),
        backend_agent_key="architect",
        capabilities=("distributed-systems", "fault-tolerance", "data-flow"),
    ),
    # Design (Tier 1)
    OrgRoleSpec(
        role="ui_designer",
        display_name="UI Designer",
        department=DepartmentKey.DESIGN,
        stage_tier=1,
        keywords=("ui", "design system", "component", "layout", "theme", "token", "visual"),
        backend_agent_key="designer",
        capabilities=("design-tokens", "component-specs", "visual-hierarchy"),
    ),
    OrgRoleSpec(
        role="ux_researcher",
        display_name="UX Researcher",
        department=DepartmentKey.DESIGN,
        stage_tier=1,
        keywords=("ux", "usability", "onboarding", "accessibility", "a11y", "wcag", "user flow"),
        backend_agent_key="designer",
        capabilities=("user-flows", "accessibility-audit", "interaction-design"),
    ),
    # Engineering (Tier 2)
    OrgRoleSpec(
        role="frontend_engineer",
        display_name="Frontend Engineer",
        department=DepartmentKey.ENGINEERING,
        stage_tier=2,
        keywords=("frontend", "react", "typescript", "dashboard", "page", "tailwind", "spa"),
        backend_agent_key="developer",
        capabilities=("react-typescript", "state-management", "client-sockets"),
    ),
    OrgRoleSpec(
        role="backend_engineer",
        display_name="Backend Engineer",
        department=DepartmentKey.ENGINEERING,
        stage_tier=2,
        keywords=("backend", "api", "fastapi", "endpoint", "service", "websocket", "worker"),
        backend_agent_key="developer",
        capabilities=("fastapi-rest", "async-workers", "domain-logic"),
    ),
    OrgRoleSpec(
        role="database_engineer",
        display_name="Database Engineer",
        department=DepartmentKey.ENGINEERING,
        stage_tier=2,
        keywords=("database", "mongo", "postgres", "sql", "schema", "migration", "index", "query"),
        backend_agent_key="developer",
        capabilities=("schema-design", "indexing", "migrations"),
    ),
    OrgRoleSpec(
        role="ai_engineer",
        display_name="AI Engineer",
        department=DepartmentKey.ENGINEERING,
        stage_tier=2,
        keywords=("llm", "rag", "embedding", "prompt", "agent", "model router", "evaluation", "context"),
        backend_agent_key="developer",
        capabilities=("llm-orchestration", "context-engineering", "rag-pipelines"),
    ),
    # Infrastructure (Tier 2)
    OrgRoleSpec(
        role="devops_engineer",
        display_name="DevOps Engineer",
        department=DepartmentKey.INFRASTRUCTURE,
        stage_tier=2,
        keywords=("docker", "ci/cd", "github actions", "container", "deploy", "pipeline"),
        backend_agent_key="devops",
        capabilities=("ci-cd", "containers", "release-automation"),
    ),
    OrgRoleSpec(
        role="cloud_engineer",
        display_name="Cloud Engineer",
        department=DepartmentKey.INFRASTRUCTURE,
        stage_tier=2,
        keywords=("kubernetes", "k8s", "cloud", "terraform", "ingress", "autoscal", "gpu"),
        backend_agent_key="devops",
        capabilities=("kubernetes", "cloud-infra", "network-policies"),
    ),
    OrgRoleSpec(
        role="reliability_engineer",
        display_name="Reliability Engineer",
        department=DepartmentKey.INFRASTRUCTURE,
        stage_tier=2,
        keywords=("observability", "prometheus", "latency", "slo", "monitoring", "backup", "failover"),
        backend_agent_key="devops",
        capabilities=("observability", "disaster-recovery", "circuit-breakers"),
    ),
    # Security (Tier 3)
    OrgRoleSpec(
        role="security_engineer",
        display_name="Security Engineer",
        department=DepartmentKey.SECURITY,
        stage_tier=3,
        keywords=("security", "auth", "oauth", "jwt", "csrf", "xss", "rbac", "encrypt", "secret"),
        backend_agent_key="security",
        capabilities=("auth-hardening", "input-validation", "secrets-hygiene"),
    ),
    OrgRoleSpec(
        role="security_auditor",
        display_name="Security Auditor",
        department=DepartmentKey.SECURITY,
        stage_tier=3,
        keywords=("audit", "threat model", "penetration", "compliance", "gdpr", "vulnerability"),
        backend_agent_key="security",
        capabilities=("threat-modeling", "compliance-audit", "adversarial-review"),
    ),
    # Quality (Tier 3)
    OrgRoleSpec(
        role="qa_engineer",
        display_name="QA Engineer",
        department=DepartmentKey.QUALITY,
        stage_tier=3,
        keywords=("test", "pytest", "vitest", "playwright", "e2e", "regression", "coverage"),
        backend_agent_key="qa",
        capabilities=("unit-testing", "integration-testing", "e2e-automation"),
    ),
    OrgRoleSpec(
        role="code_reviewer",
        display_name="Code Reviewer",
        department=DepartmentKey.QUALITY,
        stage_tier=3,
        keywords=("review", "refactor", "lint", "type-check", "maintainability", "clean code"),
        backend_agent_key="qa",
        capabilities=("diff-review", "contract-verification", "static-analysis"),
    ),
    OrgRoleSpec(
        role="independent_reviewer",
        display_name="Independent Reviewer",
        department=DepartmentKey.QUALITY,
        stage_tier=3,
        keywords=("verify", "adversarial", "gate", "sign-off", "independent"),
        backend_agent_key="qa",
        capabilities=("adversarial-verification", "evidence-validation", "gate-signoff"),
    ),
    # Delivery (Tier 4)
    OrgRoleSpec(
        role="release_manager",
        display_name="Release Manager",
        department=DepartmentKey.DELIVERY,
        stage_tier=4,
        keywords=("release", "rollout", "staging", "production", "rollback", "changelog"),
        backend_agent_key="devops",
        capabilities=("release-coordination", "rollback-verification", "canary-rollout"),
    ),
    OrgRoleSpec(
        role="documentation_agent",
        display_name="Documentation Agent",
        department=DepartmentKey.DELIVERY,
        stage_tier=4,
        keywords=("docs", "documentation", "readme", "runbook", "api reference", "guide"),
        backend_agent_key="prd_writer",
        capabilities=("technical-docs", "runbooks", "api-specs"),
    ),
)

ROLE_INDEX: Dict[str, OrgRoleSpec] = {spec.role: spec for spec in ORG_BLUEPRINT}


def get_org_blueprint_summary() -> Dict[str, Any]:
    """Serialize the 9-department Autonomous Engineering Org blueprint."""
    departments: Dict[str, Dict[str, Any]] = {}
    for dept in DepartmentKey:
        roles = [r for r in ORG_BLUEPRINT if r.department == dept]
        departments[dept.value] = {
            "key": dept.value,
            "name": dept.value.replace("_", " ").title(),
            "stage_tier": DEPARTMENT_STAGE_TIER[dept],
            "roles": [
                {
                    "role": r.role,
                    "display_name": r.display_name,
                    "backend_agent_key": r.backend_agent_key,
                    "capabilities": list(r.capabilities),
                }
                for r in roles
            ],
        }
    return {
        "department_count": len(departments),
        "role_count": len(ORG_BLUEPRINT),
        "departments": list(departments.values()),
        "default_delegation_policy": DEFAULT_DELEGATION_POLICY.to_dict(),
    }


# --------------------------------------------------------------------------- #
# 2. Task Graph, Wave Scheduling & Governed Delegation Models
# --------------------------------------------------------------------------- #


class KernelRunStatus(str, Enum):
    PLANNED = "planned"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    PARTIAL_FAILURE = "partial_failure"
    FAILED = "failed"
    CANCELLED = "cancelled"


class KernelTaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class DelegationStatus(str, Enum):
    ANSWERED = "answered"
    REJECTED = "rejected"
    TIMEOUT = "timeout"
    FAILED = "failed"


class KernelError(Exception):
    """Base error for Agent Orchestration Kernel."""


class CycleDetectedError(KernelError):
    """Raised when a task dependency graph contains a cycle."""


class UnknownDependencyError(KernelError):
    """Raised when a task references a non-existent dependency ID."""


@dataclass
class KernelTask:
    id: str
    title: str
    role: str
    department: str
    description: str
    depends_on: List[str] = field(default_factory=list)
    wave_index: int = 0
    status: KernelTaskStatus = KernelTaskStatus.PENDING
    attempts: int = 0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: int = 0
    model_tier: Optional[str] = None
    model_id: Optional[str] = None
    cost_usd: float = 0.0
    activated_skills: List[str] = field(default_factory=list)
    worktree_lease_id: Optional[str] = None
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        return d


@dataclass
class DelegationRecord:
    delegation_id: str
    from_task_id: str
    from_role: str
    to_role: str
    question: str
    depth: int
    status: DelegationStatus
    answer: Optional[str] = None
    reason: Optional[str] = None
    duration_ms: int = 0
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        return d


# Governed department-to-department delegation allowlist.
# Leadership & Architecture can consult anyone; Engineering can consult
# Architecture, Design, Infrastructure, Security, and Leadership; Quality &
# Security can consult Architecture, Engineering, Infrastructure, and Leadership.
DEFAULT_ALLOWED_DEPARTMENT_ROUTES: FrozenSet[Tuple[str, str]] = frozenset(
    {
        # Leadership -> all departments
        *((DepartmentKey.LEADERSHIP.value, d.value) for d in DepartmentKey),
        # Business -> Leadership, Architecture, Design
        (DepartmentKey.BUSINESS.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.BUSINESS.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.BUSINESS.value, DepartmentKey.DESIGN.value),
        # Architecture -> Leadership, Business, Engineering, Infrastructure, Security
        (DepartmentKey.ARCHITECTURE.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.ARCHITECTURE.value, DepartmentKey.BUSINESS.value),
        (DepartmentKey.ARCHITECTURE.value, DepartmentKey.ENGINEERING.value),
        (DepartmentKey.ARCHITECTURE.value, DepartmentKey.INFRASTRUCTURE.value),
        (DepartmentKey.ARCHITECTURE.value, DepartmentKey.SECURITY.value),
        # Design -> Leadership, Business, Architecture, Engineering
        (DepartmentKey.DESIGN.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.DESIGN.value, DepartmentKey.BUSINESS.value),
        (DepartmentKey.DESIGN.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.DESIGN.value, DepartmentKey.ENGINEERING.value),
        # Engineering -> Leadership, Architecture, Design, Engineering, Infrastructure, Security
        (DepartmentKey.ENGINEERING.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.ENGINEERING.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.ENGINEERING.value, DepartmentKey.DESIGN.value),
        (DepartmentKey.ENGINEERING.value, DepartmentKey.ENGINEERING.value),
        (DepartmentKey.ENGINEERING.value, DepartmentKey.INFRASTRUCTURE.value),
        (DepartmentKey.ENGINEERING.value, DepartmentKey.SECURITY.value),
        # Infrastructure -> Leadership, Architecture, Engineering, Security
        (DepartmentKey.INFRASTRUCTURE.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.INFRASTRUCTURE.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.INFRASTRUCTURE.value, DepartmentKey.ENGINEERING.value),
        (DepartmentKey.INFRASTRUCTURE.value, DepartmentKey.SECURITY.value),
        # Security -> Leadership, Architecture, Engineering, Infrastructure
        (DepartmentKey.SECURITY.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.SECURITY.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.SECURITY.value, DepartmentKey.ENGINEERING.value),
        (DepartmentKey.SECURITY.value, DepartmentKey.INFRASTRUCTURE.value),
        # Quality -> Leadership, Architecture, Engineering, Infrastructure, Security
        (DepartmentKey.QUALITY.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.QUALITY.value, DepartmentKey.ARCHITECTURE.value),
        (DepartmentKey.QUALITY.value, DepartmentKey.ENGINEERING.value),
        (DepartmentKey.QUALITY.value, DepartmentKey.INFRASTRUCTURE.value),
        (DepartmentKey.QUALITY.value, DepartmentKey.SECURITY.value),
        # Delivery -> Leadership, Infrastructure, Security, Quality
        (DepartmentKey.DELIVERY.value, DepartmentKey.LEADERSHIP.value),
        (DepartmentKey.DELIVERY.value, DepartmentKey.INFRASTRUCTURE.value),
        (DepartmentKey.DELIVERY.value, DepartmentKey.SECURITY.value),
        (DepartmentKey.DELIVERY.value, DepartmentKey.QUALITY.value),
    }
)


@dataclass(frozen=True)
class DelegationPolicy:
    max_delegations_per_run: int = 12
    max_depth: int = 2
    timeout_seconds: float = 30.0
    max_question_chars: int = 1000
    allowed_department_routes: FrozenSet[Tuple[str, str]] = DEFAULT_ALLOWED_DEPARTMENT_ROUTES

    def is_route_allowed(self, from_role: str, to_role: str) -> bool:
        if from_role == to_role:
            return False
        from_spec = ROLE_INDEX.get(from_role)
        to_spec = ROLE_INDEX.get(to_role)
        if not from_spec or not to_spec:
            return False
        return (from_spec.department.value, to_spec.department.value) in self.allowed_department_routes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "max_delegations_per_run": self.max_delegations_per_run,
            "max_depth": self.max_depth,
            "timeout_seconds": self.timeout_seconds,
            "allowed_department_route_count": len(self.allowed_department_routes),
        }


@dataclass
class KernelExecutionConfig:
    max_concurrency: int = 4
    task_timeout_seconds: float = 60.0
    max_retries: int = 1
    retry_backoff_seconds: float = 0.05
    fail_fast: bool = False
    max_repair_rounds: int = 2
    require_delivery_approval: bool = False
    approval_timeout_seconds: float = 300.0
    max_budget_usd: float = 2.50
    isolate_worktrees: bool = True
    prefer_local_llm: bool = False
    delegation_policy: DelegationPolicy = field(default_factory=DelegationPolicy)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "max_concurrency": self.max_concurrency,
            "task_timeout_seconds": self.task_timeout_seconds,
            "max_retries": self.max_retries,
            "fail_fast": self.fail_fast,
            "max_repair_rounds": self.max_repair_rounds,
            "require_delivery_approval": self.require_delivery_approval,
            "approval_timeout_seconds": self.approval_timeout_seconds,
            "max_budget_usd": self.max_budget_usd,
            "isolate_worktrees": self.isolate_worktrees,
            "prefer_local_llm": self.prefer_local_llm,
            "delegation_policy": self.delegation_policy.to_dict(),
        }


DEFAULT_DELEGATION_POLICY = DelegationPolicy()


@dataclass
class KernelRun:
    id: str
    project_id: str
    objective: str
    status: KernelRunStatus = KernelRunStatus.PLANNED
    tasks: List[KernelTask] = field(default_factory=list)
    waves: List[List[str]] = field(default_factory=list)
    delegations: List[DelegationRecord] = field(default_factory=list)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    conflicts: List[Dict[str, Any]] = field(default_factory=list)
    repair_cycles: List[Dict[str, Any]] = field(default_factory=list)
    approval_gates: List[Dict[str, Any]] = field(default_factory=list)
    skill_activations: List[Dict[str, Any]] = field(default_factory=list)
    worktrees: List[Dict[str, Any]] = field(default_factory=list)
    reconciliations: List[Dict[str, Any]] = field(default_factory=list)
    evaluations: List[Dict[str, Any]] = field(default_factory=list)
    knowledge_hits: List[Dict[str, Any]] = field(default_factory=list)
    policy_enforcements: List[str] = field(default_factory=list)
    trace_summary: Dict[str, Any] = field(default_factory=dict)
    cost_summary: Dict[str, Any] = field(default_factory=dict)
    config: KernelExecutionConfig = field(default_factory=KernelExecutionConfig)
    plan_id: Optional[str] = None
    risk_level: str = "low"
    risk_notes: str = ""
    created_at: str = field(default_factory=_utc_now)
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        avg_quality = (
            round(
                sum(float(e.get("overall_score", 0.0)) for e in self.evaluations) / len(self.evaluations),
                3,
            )
            if self.evaluations
            else 0.0
        )
        total_cost = round(float(self.cost_summary.get("spent_usd", 0.0)), 6)
        remaining_budget = round(
            float(self.cost_summary.get("remaining_usd", self.config.max_budget_usd)), 6
        )
        return {
            "id": self.id,
            "project_id": self.project_id,
            "objective": self.objective,
            "status": self.status.value,
            "tasks": [t.to_dict() for t in self.tasks],
            "waves": [list(w) for w in self.waves],
            "delegations": [d.to_dict() for d in self.delegations],
            "artifacts": list(self.artifacts),
            "conflicts": list(self.conflicts),
            "repair_cycles": list(self.repair_cycles),
            "approval_gates": list(self.approval_gates),
            "skill_activations": list(self.skill_activations),
            "worktrees": list(self.worktrees),
            "reconciliations": list(self.reconciliations),
            "evaluations": list(self.evaluations),
            "knowledge_hits": list(self.knowledge_hits),
            "policy_enforcements": list(self.policy_enforcements),
            "trace_summary": dict(self.trace_summary),
            "cost_summary": dict(self.cost_summary),
            "config": self.config.to_dict(),
            "plan_id": self.plan_id,
            "risk_level": self.risk_level,
            "risk_notes": self.risk_notes,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_ms": self.duration_ms,
            "metrics": {
                "total_tasks": len(self.tasks),
                "wave_count": len(self.waves),
                "max_parallelism": max((len(w) for w in self.waves), default=0),
                "completed_tasks": sum(1 for t in self.tasks if t.status == KernelTaskStatus.COMPLETED),
                "failed_tasks": sum(1 for t in self.tasks if t.status == KernelTaskStatus.FAILED),
                "blocked_tasks": sum(1 for t in self.tasks if t.status == KernelTaskStatus.BLOCKED),
                "delegation_count": len(self.delegations),
                "artifact_count": len(self.artifacts),
                "conflict_count": len(self.conflicts),
                "repair_cycle_count": len(self.repair_cycles),
                "skill_activation_count": len(self.skill_activations),
                "worktree_count": len(self.worktrees),
                "reconciliation_count": len(self.reconciliations),
                "knowledge_hit_count": len(self.knowledge_hits),
                "trace_span_count": int(self.trace_summary.get("span_count", 0)),
                "avg_quality_score": avg_quality,
                "total_cost_usd": total_cost,
                "budget_remaining_usd": remaining_budget,
                "pending_gates": sum(
                    1 for g in self.approval_gates if g.get("status") == ApprovalStatus.PENDING.value
                ),
            },
        }


# --------------------------------------------------------------------------- #
# 3. DAG Topological Wave Scheduler & Objective Planner
# --------------------------------------------------------------------------- #


def compute_execution_waves(tasks: Sequence[KernelTask]) -> List[List[str]]:
    """Compute topological parallel execution waves for a task DAG.

    Validates all dependency IDs and detects cycles via Kahn's algorithm.
    Returns an ordered list of waves where every task inside a wave has all
    dependencies satisfied by strictly earlier waves and can execute in parallel.
    Also mutates each task's ``wave_index`` in place.
    """
    task_map: Dict[str, KernelTask] = {t.id: t for t in tasks}
    in_degree: Dict[str, int] = {t.id: 0 for t in tasks}
    dependents: Dict[str, List[str]] = {t.id: [] for t in tasks}

    for task in tasks:
        seen_deps: Set[str] = set()
        for dep_id in task.depends_on:
            if dep_id == task.id:
                raise CycleDetectedError(f"Task '{task.id}' cannot depend on itself")
            if dep_id not in task_map:
                raise UnknownDependencyError(
                    f"Task '{task.id}' references unknown dependency '{dep_id}'"
                )
            if dep_id in seen_deps:
                continue
            seen_deps.add(dep_id)
            in_degree[task.id] += 1
            dependents[dep_id].append(task.id)

    waves: List[List[str]] = []
    ready: List[str] = [t.id for t in tasks if in_degree[t.id] == 0]
    processed = 0

    while ready:
        wave = list(ready)
        wave_idx = len(waves)
        waves.append(wave)
        next_ready: List[str] = []

        for task_id in wave:
            task_map[task_id].wave_index = wave_idx
            processed += 1
            for child_id in dependents[task_id]:
                in_degree[child_id] -= 1
                if in_degree[child_id] == 0:
                    next_ready.append(child_id)

        ready = next_ready

    if processed != len(tasks):
        cycle_nodes = sorted(tid for tid, deg in in_degree.items() if deg > 0)
        raise CycleDetectedError(f"Dependency cycle detected among tasks: {', '.join(cycle_nodes)}")

    return waves


def plan_objective_dag(
    project_id: str,
    objective: str,
    *,
    max_agents: int = 8,
    include_governance_gates: bool = True,
    plan_id: Optional[str] = None,
    config: Optional[KernelExecutionConfig] = None,
) -> KernelRun:
    """Decompose an engineering objective into a dependency-aware multi-agent DAG.

    Matches specialist roles across the 9-department org blueprint, ensures core
    architecture/verification roles are included when `include_governance_gates`
    is True, links cross-tier dependencies (`depends_on`), and computes parallel
    execution waves.
    """
    text = (objective or "").strip().lower()
    scored: List[Tuple[int, OrgRoleSpec]] = []
    for spec in ORG_BLUEPRINT:
        hits = sum(1 for kw in spec.keywords if kw in text)
        if hits > 0:
            scored.append((hits, spec))

    scored.sort(key=lambda item: (-item[0], item[1].stage_tier, item[1].role))
    selected_specs: List[OrgRoleSpec] = [spec for _, spec in scored[:max_agents]]

    # Always provide a balanced default engineering squad if objective is broad/generic
    if not selected_specs:
        default_roles = [
            "product_lead",
            "solution_architect",
            "frontend_engineer",
            "backend_engineer",
            "qa_engineer",
        ]
        selected_specs = [ROLE_INDEX[r] for r in default_roles if r in ROLE_INDEX]

    if include_governance_gates:
        selected_roles = {s.role for s in selected_specs}
        selected_depts = {s.department for s in selected_specs}
        # Ensure architecture contract exists whenever implementation roles run
        if (
            DepartmentKey.ENGINEERING in selected_depts
            and DepartmentKey.ARCHITECTURE not in selected_depts
            and len(selected_specs) < max_agents
        ):
            selected_specs.append(ROLE_INDEX["solution_architect"])
            selected_roles.add("solution_architect")
        # Ensure independent verification/QA gate runs after engineering/infra
        if (
            (DepartmentKey.ENGINEERING in selected_depts or DepartmentKey.INFRASTRUCTURE in selected_depts)
            and DepartmentKey.QUALITY not in selected_depts
            and len(selected_specs) < max_agents
        ):
            selected_specs.append(ROLE_INDEX["qa_engineer"])
            selected_roles.add("qa_engineer")

    # Sort deterministically by stage tier then role slug
    selected_specs.sort(key=lambda s: (s.stage_tier, s.role))

    # Build tasks and group by stage tier so each tier depends on the immediately
    # preceding non-empty tier (creating natural parallel fan-out/fan-in waves).
    tasks: List[KernelTask] = []
    tier_task_ids: Dict[int, List[str]] = {}

    for spec in selected_specs:
        tid = _new_id("ktask")
        task = KernelTask(
            id=tid,
            title=f"{spec.display_name}: {spec.department.value.title()} Execution",
            role=spec.role,
            department=spec.department.value,
            description=f"[{spec.display_name}] Execute scope for objective: {objective}",
            depends_on=[],
        )
        tasks.append(task)
        tier_task_ids.setdefault(spec.stage_tier, []).append(tid)

    present_tiers = sorted(tier_task_ids.keys())
    for idx in range(1, len(present_tiers)):
        prev_tier = present_tiers[idx - 1]
        curr_tier = present_tiers[idx]
        upstream_ids = list(tier_task_ids[prev_tier])
        for task in tasks:
            if task.id in tier_task_ids[curr_tier]:
                task.depends_on = list(upstream_ids)

    waves = compute_execution_waves(tasks)

    departments_touched = sorted({t.department for t in tasks})
    if len(departments_touched) >= 4 or DepartmentKey.SECURITY.value in departments_touched:
        risk_level = "high"
    elif len(departments_touched) >= 2:
        risk_level = "medium"
    else:
        risk_level = "low"
    risk_notes = (
        f"Spans {len(departments_touched)} department(s) ({', '.join(departments_touched)}) "
        f"across {len(waves)} execution wave(s)."
    )

    return KernelRun(
        id=_new_id("krun"),
        project_id=project_id,
        objective=objective,
        status=KernelRunStatus.PLANNED,
        tasks=tasks,
        waves=waves,
        config=config or KernelExecutionConfig(),
        plan_id=plan_id,
        risk_level=risk_level,
        risk_notes=risk_notes,
    )


# --------------------------------------------------------------------------- #
# 4. Governed Delegation Bus & Task Executor Interface
# --------------------------------------------------------------------------- #


TaskExecutorFn = Callable[
    [KernelTask, Dict[str, Any], "DelegationContext"],
    Awaitable[Dict[str, Any]],
]
DelegationResponderFn = Callable[
    [str, str, Dict[str, Any]],
    Awaitable[str],
]
EventSinkFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


class DelegationContext:
    """Scoped delegation handle passed to an executing task."""

    def __init__(
        self,
        bus: "DelegationBus",
        task: KernelTask,
        depth: int = 0,
    ) -> None:
        self._bus = bus
        self._task = task
        self._depth = depth

    async def ask(
        self,
        to_role: str,
        question: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> DelegationRecord:
        return await self._bus.delegate(
            from_task=self._task,
            to_role=to_role,
            question=question,
            context=context or {},
            depth=self._depth + 1,
        )


class DelegationBus:
    """Enforces DelegationPolicy, loop-depth caps, and audit logging."""

    def __init__(
        self,
        run: KernelRun,
        responder: DelegationResponderFn,
        policy: DelegationPolicy,
        event_sink: Optional[EventSinkFn] = None,
    ) -> None:
        self._run = run
        self._responder = responder
        self._policy = policy
        self._event_sink = event_sink
        self._lock = asyncio.Lock()

    async def delegate(
        self,
        *,
        from_task: KernelTask,
        to_role: str,
        question: str,
        context: Dict[str, Any],
        depth: int = 1,
    ) -> DelegationRecord:
        clean_q = (question or "").strip()[: self._policy.max_question_chars]
        started = time.monotonic()

        async with self._lock:
            if not clean_q:
                rec = self._record(
                    from_task, to_role, clean_q, depth, DelegationStatus.REJECTED, reason="empty_question"
                )
                return rec
            if depth > self._policy.max_depth:
                rec = self._record(
                    from_task, to_role, clean_q, depth, DelegationStatus.REJECTED, reason="max_depth_exceeded"
                )
                return rec
            if len(self._run.delegations) >= self._policy.max_delegations_per_run:
                rec = self._record(
                    from_task, to_role, clean_q, depth, DelegationStatus.REJECTED, reason="delegation_limit_reached"
                )
                return rec
            if not self._policy.is_route_allowed(from_task.role, to_role):
                rec = self._record(
                    from_task, to_role, clean_q, depth, DelegationStatus.REJECTED, reason="route_not_allowed"
                )
                return rec

            # Reserve slot inside lock so concurrent tasks respect max_delegations_per_run
            rec = DelegationRecord(
                delegation_id=_new_id("del"),
                from_task_id=from_task.id,
                from_role=from_task.role,
                to_role=to_role,
                question=clean_q,
                depth=depth,
                status=DelegationStatus.FAILED,
            )
            self._run.delegations.append(rec)

        try:
            answer = await asyncio.wait_for(
                self._responder(to_role, clean_q, context),
                timeout=self._policy.timeout_seconds,
            )
            answer = (answer or "").strip()
            if not answer:
                rec.status = DelegationStatus.FAILED
                rec.reason = "empty_answer"
            else:
                rec.status = DelegationStatus.ANSWERED
                rec.answer = answer
        except asyncio.TimeoutError:
            rec.status = DelegationStatus.TIMEOUT
            rec.reason = "timeout"
        except Exception as exc:
            rec.status = DelegationStatus.FAILED
            rec.reason = str(exc)[:300] or type(exc).__name__
        finally:
            rec.duration_ms = int((time.monotonic() - started) * 1000)

        await self._emit_delegation(rec)
        return rec

    def _record(
        self,
        from_task: KernelTask,
        to_role: str,
        question: str,
        depth: int,
        status: DelegationStatus,
        reason: str,
    ) -> DelegationRecord:
        rec = DelegationRecord(
            delegation_id=_new_id("del"),
            from_task_id=from_task.id,
            from_role=from_task.role,
            to_role=to_role,
            question=question,
            depth=depth,
            status=status,
            reason=reason,
        )
        self._run.delegations.append(rec)
        return rec

    async def _emit_delegation(self, rec: DelegationRecord) -> None:
        if self._event_sink:
            try:
                await self._event_sink("kernel_delegation", rec.to_dict())
            except Exception:
                logger.debug("Delegation event sink error", exc_info=True)


# --------------------------------------------------------------------------- #
# 5. Core Agent Orchestration Kernel
# --------------------------------------------------------------------------- #


class AgentKernel:
    """Executes planned multi-agent DAGs in bounded parallel waves."""

    def __init__(
        self,
        task_executor: Optional[TaskExecutorFn] = None,
        delegation_responder: Optional[DelegationResponderFn] = None,
        event_sink: Optional[EventSinkFn] = None,
    ) -> None:
        self._task_executor = task_executor or _default_gateway_task_executor
        self._delegation_responder = delegation_responder or _default_gateway_delegation_responder
        self._event_sink = event_sink
        self._cancel_events: Dict[str, asyncio.Event] = {}
        self._active_runs: Dict[str, KernelRun] = {}
        self._approval_waiters: Dict[Tuple[str, str], Tuple[ApprovalGate, asyncio.Event]] = {}

    def get_active_run(self, run_id: str) -> Optional[KernelRun]:
        return self._active_runs.get(run_id)

    def cancel_run(self, run_id: str) -> bool:
        ev = self._cancel_events.get(run_id)
        if ev is not None:
            ev.set()
            return True
        return False

    def resolve_approval_gate(
        self,
        run_id: str,
        gate_id: str,
        *,
        approved: bool,
        actor: str,
        note: str = "",
    ) -> Optional[ApprovalGate]:
        """Resolve a pending human-in-the-loop approval gate and wake the paused run."""
        entry = self._approval_waiters.get((run_id, gate_id))
        if entry is None:
            return None
        gate, gate_event = entry
        if gate.status != ApprovalStatus.PENDING:
            return None
        gate.status = ApprovalStatus.APPROVED if approved else ApprovalStatus.REJECTED
        gate.decided_by = actor
        gate.note = (note or "")[:1000]
        gate.decided_at = _utc_now()
        active_run = self._active_runs.get(run_id)
        if active_run is not None:
            self._sync_gate_on_run(active_run, gate)
        gate_event.set()
        return gate

    def _sync_gate_on_run(self, run: KernelRun, gate: ApprovalGate) -> None:
        gate_dict = gate.to_dict()
        for idx, existing in enumerate(run.approval_gates):
            if existing.get("gate_id") == gate.gate_id:
                run.approval_gates[idx] = gate_dict
                return
        run.approval_gates.append(gate_dict)

    async def execute_run(
        self,
        run: KernelRun,
        *,
        shared_context: Optional[Dict[str, Any]] = None,
        event_sink: Optional[EventSinkFn] = None,
    ) -> KernelRun:
        """Execute all DAG waves in `run`, respecting dependencies, blackboard,
        autonomous critique-repair loops, and human-in-the-loop approval gates."""
        # Re-validate DAG invariants before starting execution
        run.waves = compute_execution_waves(run.tasks)
        task_map: Dict[str, KernelTask] = {t.id: t for t in run.tasks}
        active_sink = event_sink or self._event_sink

        cancel_event = asyncio.Event()
        self._cancel_events[run.id] = cancel_event
        self._active_runs[run.id] = run

        run.status = KernelRunStatus.RUNNING
        run.started_at = _utc_now()
        run_start = time.monotonic()

        await self._emit(
            "kernel_run_started",
            {
                "run_id": run.id,
                "project_id": run.project_id,
                "objective": run.objective,
                "wave_count": len(run.waves),
                "total_tasks": len(run.tasks),
            },
            sink=active_sink,
        )

        # Milestone #3: Enforce Tenant Governance Policy before initializing guards
        _, enforcements = get_governance_policy_store().evaluate_run_config(
            run.project_id, run.config
        )
        run.policy_enforcements = list(enforcements)

        # Milestone #2: Retrieve Cross-Run Knowledge & Episodic Memory Context
        knowledge_fabric = get_knowledge_fabric()
        knowledge_hits = knowledge_fabric.retrieve_context(
            project_id=run.project_id,
            query=run.objective,
            top_k=5,
        )
        run.knowledge_hits = [h.to_dict() for h in knowledge_hits]

        # Milestone #3: OpenTelemetry-compatible W3C Trace Collector
        trace_collector = get_trace_collector()
        run_trace, root_span = trace_collector.start_run_trace(
            project_id=run.project_id,
            run_id=run.id,
            attributes={
                "forge.wave_count": len(run.waves),
                "forge.task_count": len(run.tasks),
                "forge.knowledge_hits": len(run.knowledge_hits),
                "forge.policy_enforcements": len(run.policy_enforcements),
            },
        )

        semaphore = asyncio.Semaphore(max(1, run.config.max_concurrency))
        blackboard = AgentBlackboard()
        skill_router = get_skill_router()
        worktree_mgr: WorktreeManager = get_worktree_manager()
        model_router = ModelRouter()
        budget_guard = CostBudgetGuard(max_budget_usd=run.config.max_budget_usd)
        evaluator = ArtifactEvaluator()
        run.cost_summary = budget_guard.summary()
        active_leases: List[WorktreeLease] = []

        delegation_bus = DelegationBus(
            run=run,
            responder=self._delegation_responder,
            policy=run.config.delegation_policy,
            event_sink=active_sink,
        )

        upstream_outputs: Dict[str, Dict[str, Any]] = {}
        base_context: Dict[str, Any] = {
            "project_id": run.project_id,
            "run_id": run.id,
            "objective": run.objective,
            "blackboard": blackboard,
            "model_router": model_router,
            "budget_guard": budget_guard,
            "evaluator": evaluator,
            "knowledge_context": run.knowledge_hits,
            "trace_id": run_trace.trace_id,
            **(shared_context or {}),
        }

        try:
            for wave_idx, wave_task_ids in enumerate(run.waves):
                if cancel_event.is_set():
                    self._mark_remaining_cancelled(run.tasks)
                    break

                wave_span = trace_collector.start_child_span(
                    run_trace,
                    parent_span_id=root_span.span_id,
                    name="kernel.wave",
                    attributes={"wave.index": wave_idx, "wave.tasks": len(wave_task_ids)},
                )

                # Human-in-the-loop Pre-Delivery Approval Gate
                has_delivery_task = any(
                    task_map[tid].department == DepartmentKey.DELIVERY.value
                    and task_map[tid].status == KernelTaskStatus.PENDING
                    for tid in wave_task_ids
                )
                if run.config.require_delivery_approval and has_delivery_task:
                    approved = await self._await_approval_gate(
                        run=run,
                        gate_name="pre_delivery_approval",
                        reason="Human sign-off required before Delivery / Release wave executes",
                        wave_index=wave_idx,
                        cancel_event=cancel_event,
                        event_sink=active_sink,
                    )
                    if cancel_event.is_set():
                        self._mark_remaining_cancelled(run.tasks)
                        break
                    if not approved:
                        self._block_remaining_pending(
                            run.tasks,
                            "Blocked: pre-delivery approval gate was rejected or timed out",
                        )
                        for t in run.tasks:
                            if t.status == KernelTaskStatus.BLOCKED:
                                await self._emit(
                                    "kernel_task_updated",
                                    t.to_dict(),
                                    sink=active_sink,
                                    project_id=run.project_id,
                                    run_id=run.id,
                                )
                        break

                await self._emit(
                    "kernel_wave_started",
                    {
                        "run_id": run.id,
                        "wave_index": wave_idx,
                        "task_ids": list(wave_task_ids),
                    },
                    sink=active_sink,
                    project_id=run.project_id,
                    run_id=run.id,
                )

                wave_leases: List[WorktreeLease] = []

                async def _run_one(tid: str) -> None:
                    task = task_map[tid]
                    if cancel_event.is_set():
                        task.status = KernelTaskStatus.CANCELLED
                        return

                    # Check upstream dependency health
                    failed_deps = [
                        dep_id
                        for dep_id in task.depends_on
                        if task_map[dep_id].status != KernelTaskStatus.COMPLETED
                    ]
                    if failed_deps:
                        task.status = KernelTaskStatus.BLOCKED
                        task.error = f"Blocked by upstream dependencies: {', '.join(failed_deps)}"
                        await self._emit(
                            "kernel_task_updated",
                            task.to_dict(),
                            sink=active_sink,
                            project_id=run.project_id,
                            run_id=run.id,
                        )
                        return

                    # Route skills for this task via Intelligent Skill Engine
                    activations = skill_router.route_for_task(
                        role=task.role,
                        department=task.department,
                        objective=run.objective,
                        task_description=task.description,
                        top_k=3,
                    )
                    task.activated_skills = [a.skill_name for a in activations]
                    for act in activations:
                        act_record = {"task_id": task.id, "role": task.role, **act.to_dict()}
                        run.skill_activations.append(act_record)
                        await self._emit(
                            "kernel_skill_activated",
                            {"run_id": run.id, **act_record},
                            sink=active_sink,
                            project_id=run.project_id,
                            run_id=run.id,
                        )

                    # Role-based model routing + Cost budget check
                    route_decision = model_router.select_model(
                        department=task.department,
                        role=task.role,
                        repair_round=0,
                        budget_remaining_usd=budget_guard.remaining_usd,
                        prefer_local=run.config.prefer_local_llm,
                    )
                    task.model_tier = route_decision.tier
                    task.model_id = route_decision.model_id
                    try:
                        budget_guard.check_can_spend(route_decision.estimated_cost_per_call_usd)
                    except BudgetExceededError as exc:
                        task.status = KernelTaskStatus.BLOCKED
                        task.error = str(exc)
                        await self._emit(
                            "kernel_task_updated",
                            task.to_dict(),
                            sink=active_sink,
                            project_id=run.project_id,
                            run_id=run.id,
                        )
                        return

                    # Isolated worktree lease for parallel engineering / infrastructure tasks
                    lease: Optional[WorktreeLease] = None
                    if run.config.isolate_worktrees and task.department in (
                        DepartmentKey.ENGINEERING.value,
                        DepartmentKey.INFRASTRUCTURE.value,
                    ):
                        lease = await worktree_mgr.acquire(
                            run_id=run.id,
                            task_id=task.id,
                            role=task.role,
                            department=task.department,
                        )
                        active_leases.append(lease)
                        wave_leases.append(lease)
                        task.worktree_lease_id = lease.lease_id
                        run.worktrees = [l.to_dict() for l in active_leases]

                    async with semaphore:
                        if cancel_event.is_set():
                            task.status = KernelTaskStatus.CANCELLED
                            return
                        task_span = trace_collector.start_child_span(
                            run_trace,
                            parent_span_id=wave_span.span_id,
                            name="kernel.task",
                            attributes={
                                "agent.role": task.role,
                                "agent.department": task.department,
                                "llm.model": route_decision.model_id,
                                "llm.tier": route_decision.tier,
                                "skills.count": len(activations),
                                "worktree.lease_id": lease.lease_id if lease else "",
                            },
                        )
                        try:
                            await self._execute_task_with_retries(
                                run=run,
                                task=task,
                                context={
                                    **base_context,
                                    "blackboard_snapshot": blackboard.snapshot(),
                                    "skill_context": [a.to_dict() for a in activations],
                                    "model_route": route_decision.to_dict(),
                                    "worktree_lease": lease.to_dict() if lease else None,
                                    "worktree_manager": worktree_mgr if lease else None,
                                    "upstream_outputs": {
                                        dep_id: upstream_outputs.get(dep_id)
                                        for dep_id in task.depends_on
                                    },
                                },
                                delegation_ctx=DelegationContext(delegation_bus, task, depth=0),
                                upstream_outputs=upstream_outputs,
                                cancel_event=cancel_event,
                                event_sink=active_sink,
                            )
                        finally:
                            task_span.finish(
                                status="OK" if task.status == KernelTaskStatus.COMPLETED else "ERROR",
                                extra_attributes={
                                    "task.status": task.status.value,
                                    "task.attempts": task.attempts,
                                },
                            )
                        if task.status == KernelTaskStatus.COMPLETED:
                            raw_out = task.output or {}
                            usage_source: Dict[str, Any] = {}
                            if isinstance(raw_out.get("usage"), dict):
                                usage_source.update(raw_out["usage"])
                            for k in (
                                "cost_usd",
                                "input_tokens",
                                "output_tokens",
                                "prompt_tokens",
                                "completion_tokens",
                            ):
                                if raw_out.get(k) is not None and k not in usage_source:
                                    usage_source[k] = raw_out[k]
                            actual_cost = ModelRouter.compute_actual_cost(
                                usage_source or None, route_decision
                            )
                            task.cost_usd = round(task.cost_usd + actual_cost, 6)
                            task_span.attributes["llm.cost_usd"] = actual_cost
                            budget_guard.record_cost(task.id, actual_cost)
                            run.cost_summary = budget_guard.summary()
                            await self._publish_task_artifact(
                                run=run,
                                blackboard=blackboard,
                                task=task,
                                wave_index=wave_idx,
                                evaluator=evaluator,
                                event_sink=active_sink,
                            )

                await asyncio.gather(*(_run_one(tid) for tid in wave_task_ids))

                # Wave-level Git Worktree Patch Reconciliation
                if wave_leases and not cancel_event.is_set():
                    rec_span = trace_collector.start_child_span(
                        run_trace,
                        parent_span_id=wave_span.span_id,
                        name="kernel.reconcile",
                        attributes={"wave.index": wave_idx, "reconcile.leases": len(wave_leases)},
                    )
                    declared_files_by_task: Dict[str, List[str]] = {}
                    for tid in wave_task_ids:
                        t_out = task_map[tid].output or {}
                        raw_f = t_out.get("touched_files")
                        if raw_f is None:
                            raw_f = t_out.get("files")
                        if isinstance(raw_f, list):
                            declared_files_by_task[tid] = [str(f) for f in raw_f]
                    reconciliation = await worktree_mgr.reconcile_wave_patches(
                        wave_index=wave_idx,
                        leases=wave_leases,
                        declared_files_by_task=declared_files_by_task,
                    )
                    rec_span.finish(
                        status="OK",
                        extra_attributes={
                            "reconcile.status": reconciliation.status,
                            "reconcile.conflicts": len(reconciliation.conflicting_files),
                        },
                    )
                    run.reconciliations.append(reconciliation.to_dict())
                    await self._emit(
                        "kernel_wave_reconciled",
                        {"run_id": run.id, "reconciliation": reconciliation.to_dict()},
                        sink=active_sink,
                        project_id=run.project_id,
                        run_id=run.id,
                    )

                # Autonomous Critique -> Remediation -> Re-Verification Loops
                if not cancel_event.is_set() and run.config.max_repair_rounds > 0:
                    halted = await self._run_critique_repair_loops(
                        run=run,
                        wave_idx=wave_idx,
                        wave_task_ids=wave_task_ids,
                        task_map=task_map,
                        blackboard=blackboard,
                        base_context=base_context,
                        delegation_bus=delegation_bus,
                        upstream_outputs=upstream_outputs,
                        cancel_event=cancel_event,
                        event_sink=active_sink,
                    )
                    if halted:
                        wave_span.finish(status="ERROR", extra_attributes={"wave.halted": True})
                        break

                wave_failed = any(
                    task_map[tid].status == KernelTaskStatus.FAILED for tid in wave_task_ids
                )
                wave_span.finish(status="ERROR" if wave_failed else "OK")

                if run.config.fail_fast and wave_failed:
                    for task in run.tasks:
                        if task.status == KernelTaskStatus.PENDING:
                            task.status = KernelTaskStatus.BLOCKED
                            task.error = "Halted by fail-fast policy after upstream wave failure"
                            await self._emit(
                                "kernel_task_updated",
                                task.to_dict(),
                                sink=active_sink,
                                project_id=run.project_id,
                                run_id=run.id,
                            )
                    break

            # Determine terminal run status
            if cancel_event.is_set():
                run.status = KernelRunStatus.CANCELLED
            else:
                failed = sum(1 for t in run.tasks if t.status == KernelTaskStatus.FAILED)
                completed = sum(1 for t in run.tasks if t.status == KernelTaskStatus.COMPLETED)
                if failed == 0 and completed == len(run.tasks):
                    run.status = KernelRunStatus.COMPLETED
                elif completed > 0:
                    run.status = KernelRunStatus.PARTIAL_FAILURE
                else:
                    run.status = KernelRunStatus.FAILED
        finally:
            for lease in active_leases:
                await worktree_mgr.release(lease.lease_id)
            if active_leases:
                run.worktrees = [l.to_dict() for l in active_leases]
            run.cost_summary = budget_guard.summary()
            run.finished_at = _utc_now()
            run.duration_ms = int((time.monotonic() - run_start) * 1000)
            root_span.finish(
                status="OK" if run.status == KernelRunStatus.COMPLETED else "ERROR",
                extra_attributes={
                    "forge.status": run.status.value,
                    "forge.total_cost_usd": run.cost_summary.get("spent_usd", 0.0),
                },
            )
            run.trace_summary = run_trace.summary()
            try:
                await trace_collector.finalize_trace(run_trace)
            except Exception:
                logger.debug("Trace finalization failed open", exc_info=True)
            try:
                await knowledge_fabric.ingest_kernel_run(run.to_dict())
            except Exception:
                logger.debug("KnowledgeFabric run ingestion failed open", exc_info=True)
            self._cancel_events.pop(run.id, None)
            self._active_runs.pop(run.id, None)
            for key in [k for k in self._approval_waiters if k[0] == run.id]:
                self._approval_waiters.pop(key, None)

        await self._emit(
            "kernel_run_completed",
            run.to_dict(),
            sink=active_sink,
            project_id=run.project_id,
            run_id=run.id,
        )
        return run

    async def _publish_task_artifact(
        self,
        *,
        run: KernelRun,
        blackboard: AgentBlackboard,
        task: KernelTask,
        wave_index: int,
        evaluator: Optional[ArtifactEvaluator] = None,
        event_sink: Optional[EventSinkFn],
    ) -> None:
        output = task.output or {}
        raw_type = output.get("artifact_type")
        artifact_type = DEPARTMENT_DEFAULT_ARTIFACT.get(task.department, ArtifactType.REVIEW_NOTE)
        if isinstance(raw_type, str):
            try:
                artifact_type = ArtifactType(raw_type)
            except ValueError:
                pass
        raw_files = output.get("touched_files")
        if raw_files is None:
            raw_files = output.get("files")
        touched_files = raw_files if isinstance(raw_files, list) else []
        summary = str(output.get("summary") or f"{task.role} completed {task.title}")

        artifact, new_conflicts = await blackboard.publish(
            key=str(output.get("artifact_key") or task.role),
            artifact_type=artifact_type,
            producer_task_id=task.id,
            producer_role=task.role,
            department=task.department,
            wave_index=wave_index,
            summary=summary,
            touched_files=touched_files,
            payload=output,
        )
        run.artifacts = [a.to_dict() for a in blackboard.artifacts]
        run.conflicts = [c.to_dict() for c in blackboard.conflicts]

        # Score artifact quality via Evaluation Engine & feed back into Skill Telemetry
        active_eval = evaluator or ArtifactEvaluator()
        blocking_present = bool(extract_blocking_findings(output))
        ev = active_eval.evaluate(
            artifact.to_dict(),
            active_conflicts=run.conflicts,
            has_blocking_findings=blocking_present,
        )
        run.evaluations.append(ev.to_dict())
        if task.activated_skills:
            from core.skill_engine import get_skill_registry

            registry = get_skill_registry()
            per_skill_cost = task.cost_usd / max(1, len(task.activated_skills))
            for skill_name in task.activated_skills:
                registry.record_outcome(
                    skill_name,
                    quality_score=ev.overall_score,
                    latency_ms=task.duration_ms,
                    cost_usd=per_skill_cost,
                    passed=ev.passed,
                )

        await self._emit(
            "kernel_artifact_published",
            {"run_id": run.id, "artifact": artifact.to_dict(), "evaluation": ev.to_dict()},
            sink=event_sink,
            project_id=run.project_id,
            run_id=run.id,
        )
        for conflict in new_conflicts:
            await self._emit(
                "kernel_conflict_detected",
                {"run_id": run.id, "conflict": conflict.to_dict()},
                sink=event_sink,
                project_id=run.project_id,
                run_id=run.id,
            )

    async def _await_approval_gate(
        self,
        *,
        run: KernelRun,
        gate_name: str,
        reason: str,
        wave_index: int,
        cancel_event: asyncio.Event,
        event_sink: Optional[EventSinkFn],
    ) -> bool:
        gate = ApprovalGate(
            gate_id=_new_id("gate"),
            gate_name=gate_name,
            reason=reason,
            wave_index=wave_index,
        )
        gate_event = asyncio.Event()
        self._approval_waiters[(run.id, gate.gate_id)] = (gate, gate_event)
        self._sync_gate_on_run(run, gate)
        run.status = KernelRunStatus.WAITING_APPROVAL

        await self._emit(
            "kernel_approval_required",
            {"run_id": run.id, "gate": gate.to_dict()},
            sink=event_sink,
        )

        wait_gate_task = asyncio.create_task(gate_event.wait())
        wait_cancel_task = asyncio.create_task(cancel_event.wait())
        try:
            done, pending = await asyncio.wait(
                {wait_gate_task, wait_cancel_task},
                timeout=max(0.05, run.config.approval_timeout_seconds),
                return_when=asyncio.FIRST_COMPLETED,
            )
            for p in pending:
                p.cancel()
            if gate.status == ApprovalStatus.PENDING:
                gate.status = ApprovalStatus.REJECTED
                gate.decided_by = "system"
                gate.note = (
                    "Run cancelled while awaiting approval"
                    if cancel_event.is_set()
                    else f"Approval gate timed out after {run.config.approval_timeout_seconds}s"
                )
                gate.decided_at = _utc_now()
        finally:
            self._approval_waiters.pop((run.id, gate.gate_id), None)
            self._sync_gate_on_run(run, gate)

        await self._emit(
            "kernel_approval_resolved",
            {"run_id": run.id, "gate": gate.to_dict()},
            sink=event_sink,
        )
        if gate.status == ApprovalStatus.APPROVED and not cancel_event.is_set():
            run.status = KernelRunStatus.RUNNING
            return True
        return False

    def _select_repair_target(
        self,
        *,
        run: KernelRun,
        reviewer_task: KernelTask,
        findings: Sequence[Any],
    ) -> Optional[KernelTask]:
        # 1. Explicit target_role requested by finding
        for finding in findings:
            target_role = getattr(finding, "target_role", None)
            if target_role:
                for t in run.tasks:
                    if t.role == target_role and t.id != reviewer_task.id and t.status == KernelTaskStatus.COMPLETED:
                        return t
        # 2. Direct upstream engineering/infrastructure dependency
        dep_set = set(reviewer_task.depends_on)
        for t in reversed(run.tasks):
            if (
                t.id in dep_set
                and t.department in (DepartmentKey.ENGINEERING.value, DepartmentKey.INFRASTRUCTURE.value)
                and t.status == KernelTaskStatus.COMPLETED
            ):
                return t
        # 3. Most recent completed engineering/infrastructure task
        for t in reversed(run.tasks):
            if (
                t.id != reviewer_task.id
                and t.department in (DepartmentKey.ENGINEERING.value, DepartmentKey.INFRASTRUCTURE.value)
                and t.status == KernelTaskStatus.COMPLETED
            ):
                return t
        return None

    async def _run_critique_repair_loops(
        self,
        *,
        run: KernelRun,
        wave_idx: int,
        wave_task_ids: Sequence[str],
        task_map: Dict[str, KernelTask],
        blackboard: AgentBlackboard,
        base_context: Dict[str, Any],
        delegation_bus: DelegationBus,
        upstream_outputs: Dict[str, Dict[str, Any]],
        cancel_event: asyncio.Event,
        event_sink: Optional[EventSinkFn],
    ) -> bool:
        """Run bounded autonomous repair rounds when security/quality tasks emit blocking findings.

        Returns True if execution should halt (e.g., escalation gate rejected).
        """
        reviewer_depts = {DepartmentKey.SECURITY.value, DepartmentKey.QUALITY.value}
        for tid in wave_task_ids:
            if cancel_event.is_set():
                return False
            reviewer_task = task_map[tid]
            if (
                reviewer_task.department not in reviewer_depts
                or reviewer_task.status != KernelTaskStatus.COMPLETED
            ):
                continue

            findings = extract_blocking_findings(reviewer_task.output)
            if not findings:
                continue

            unresolved = findings
            for round_num in range(1, run.config.max_repair_rounds + 1):
                if cancel_event.is_set():
                    return False

                target_task = self._select_repair_target(
                    run=run, reviewer_task=reviewer_task, findings=unresolved
                )
                if target_task is None:
                    break

                cycle = RepairCycleRecord(
                    cycle_id=_new_id("rep"),
                    round_number=round_num,
                    reviewer_task_id=reviewer_task.id,
                    reviewer_role=reviewer_task.role,
                    target_task_id=target_task.id,
                    target_role=target_task.role,
                    findings=[f.to_dict() for f in unresolved],
                    outcome="retrying",
                )

                # Step 1: Re-run target agent with blocking findings for remediation
                await self._execute_task_with_retries(
                    run=run,
                    task=target_task,
                    context={
                        **base_context,
                        "blackboard_snapshot": blackboard.snapshot(),
                        "repair_round": round_num,
                        "repair_findings": [f.to_dict() for f in unresolved],
                        "upstream_outputs": {
                            dep_id: upstream_outputs.get(dep_id)
                            for dep_id in target_task.depends_on
                        },
                    },
                    delegation_ctx=DelegationContext(delegation_bus, target_task, depth=0),
                    upstream_outputs=upstream_outputs,
                    cancel_event=cancel_event,
                    event_sink=event_sink,
                )

                if target_task.status != KernelTaskStatus.COMPLETED:
                    cycle.outcome = "failed"
                    cycle.finished_at = _utc_now()
                    run.repair_cycles.append(cycle.to_dict())
                    await self._emit(
                        "kernel_repair_cycle",
                        {"run_id": run.id, "cycle": cycle.to_dict()},
                        sink=event_sink,
                    )
                    break

                await self._publish_task_artifact(
                    run=run,
                    blackboard=blackboard,
                    task=target_task,
                    wave_index=target_task.wave_index,
                    event_sink=event_sink,
                )

                # Step 2: Re-run reviewer agent to verify remediation
                await self._execute_task_with_retries(
                    run=run,
                    task=reviewer_task,
                    context={
                        **base_context,
                        "blackboard_snapshot": blackboard.snapshot(),
                        "repair_round": round_num,
                        "reverification": True,
                        "upstream_outputs": {
                            dep_id: upstream_outputs.get(dep_id)
                            for dep_id in reviewer_task.depends_on
                        },
                    },
                    delegation_ctx=DelegationContext(delegation_bus, reviewer_task, depth=0),
                    upstream_outputs=upstream_outputs,
                    cancel_event=cancel_event,
                    event_sink=event_sink,
                )

                if reviewer_task.status == KernelTaskStatus.COMPLETED:
                    await self._publish_task_artifact(
                        run=run,
                        blackboard=blackboard,
                        task=reviewer_task,
                        wave_index=wave_idx,
                        event_sink=event_sink,
                    )

                remaining = extract_blocking_findings(reviewer_task.output)
                if not remaining:
                    cycle.outcome = "resolved"
                    cycle.finished_at = _utc_now()
                    run.repair_cycles.append(cycle.to_dict())
                    await self._emit(
                        "kernel_repair_cycle",
                        {"run_id": run.id, "cycle": cycle.to_dict()},
                        sink=event_sink,
                    )
                    unresolved = []
                    break

                unresolved = remaining
                if round_num == run.config.max_repair_rounds:
                    cycle.outcome = "escalated"
                cycle.finished_at = _utc_now()
                run.repair_cycles.append(cycle.to_dict())
                await self._emit(
                    "kernel_repair_cycle",
                    {"run_id": run.id, "cycle": cycle.to_dict()},
                    sink=event_sink,
                )

            if unresolved and run.config.require_delivery_approval:
                approved = await self._await_approval_gate(
                    run=run,
                    gate_name="escalation_review",
                    reason=(
                        f"{len(unresolved)} blocking finding(s) from {reviewer_task.role} "
                        f"remained unresolved after {run.config.max_repair_rounds} autonomous repair round(s)"
                    ),
                    wave_index=wave_idx,
                    cancel_event=cancel_event,
                    event_sink=event_sink,
                )
                if not approved:
                    self._block_remaining_pending(
                        run.tasks,
                        "Blocked: escalation gate rejected due to unresolved blocking findings",
                    )
                    for t in run.tasks:
                        if t.status == KernelTaskStatus.BLOCKED:
                            await self._emit("kernel_task_updated", t.to_dict(), sink=event_sink)
                    return True
        return False

    async def _execute_task_with_retries(
        self,
        *,
        run: KernelRun,
        task: KernelTask,
        context: Dict[str, Any],
        delegation_ctx: DelegationContext,
        upstream_outputs: Dict[str, Dict[str, Any]],
        cancel_event: asyncio.Event,
        event_sink: Optional[EventSinkFn] = None,
    ) -> None:
        max_attempts = 1 + max(0, run.config.max_retries)
        task.status = KernelTaskStatus.RUNNING
        task.started_at = _utc_now()
        t0 = time.monotonic()
        await self._emit("kernel_task_updated", task.to_dict(), sink=event_sink)

        last_error: Optional[str] = None
        for attempt in range(1, max_attempts + 1):
            if cancel_event.is_set():
                task.status = KernelTaskStatus.CANCELLED
                task.finished_at = _utc_now()
                task.duration_ms = int((time.monotonic() - t0) * 1000)
                await self._emit("kernel_task_updated", task.to_dict(), sink=event_sink)
                return

            task.attempts = attempt
            try:
                output = await asyncio.wait_for(
                    self._task_executor(task, context, delegation_ctx),
                    timeout=run.config.task_timeout_seconds,
                )
                task.output = output if isinstance(output, dict) else {"result": output}
                task.error = None
                task.status = KernelTaskStatus.COMPLETED
                task.finished_at = _utc_now()
                task.duration_ms = int((time.monotonic() - t0) * 1000)
                upstream_outputs[task.id] = task.output
                await self._emit(
                    "kernel_task_updated",
                    task.to_dict(),
                    sink=event_sink,
                    project_id=run.project_id,
                    run_id=run.id,
                )
                return
            except asyncio.TimeoutError:
                last_error = f"Task timed out after {run.config.task_timeout_seconds}s"
            except Exception as exc:
                last_error = str(exc)[:400] or type(exc).__name__

            if attempt < max_attempts:
                await asyncio.sleep(run.config.retry_backoff_seconds * attempt)

        task.status = KernelTaskStatus.FAILED
        task.error = last_error or "Unknown execution error"
        task.finished_at = _utc_now()
        task.duration_ms = int((time.monotonic() - t0) * 1000)
        await self._emit(
            "kernel_task_updated",
            task.to_dict(),
            sink=event_sink,
            project_id=run.project_id,
            run_id=run.id,
        )

    def _mark_remaining_cancelled(self, tasks: Sequence[KernelTask]) -> None:
        for t in tasks:
            if t.status in (KernelTaskStatus.PENDING, KernelTaskStatus.RUNNING):
                t.status = KernelTaskStatus.CANCELLED

    def _block_remaining_pending(self, tasks: Sequence[KernelTask], reason: str) -> None:
        for t in tasks:
            if t.status == KernelTaskStatus.PENDING:
                t.status = KernelTaskStatus.BLOCKED
                t.error = reason

    async def _emit(
        self,
        event_type: str,
        payload: Dict[str, Any],
        *,
        sink: Optional[EventSinkFn] = None,
        project_id: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> None:
        # Always publish to the server-authoritative AG-UI Stream Broker when run_id is known
        resolved_run_id = run_id or (payload.get("run_id") if isinstance(payload, dict) else None)
        if resolved_run_id:
            resolved_project = project_id or (
                payload.get("project_id") if isinstance(payload, dict) else ""
            )
            try:
                await get_agui_broker().publish(
                    project_id=str(resolved_project or ""),
                    run_id=str(resolved_run_id),
                    kernel_event=event_type,
                    payload=payload if isinstance(payload, dict) else {"value": payload},
                )
            except Exception:
                logger.debug("AG-UI broker publish error for %s", event_type, exc_info=True)

        target = sink or self._event_sink
        if target:
            try:
                await target(event_type, payload)
            except Exception:
                logger.debug("Kernel event sink error for %s", event_type, exc_info=True)


# --------------------------------------------------------------------------- #
# 6. Production Gateway, Persistence, Org Registry & Product Lead Bridges
# --------------------------------------------------------------------------- #


async def _default_gateway_task_executor(
    task: KernelTask,
    context: Dict[str, Any],
    delegation_ctx: DelegationContext,
) -> Dict[str, Any]:
    """Execute a specialist role task via Forge's specialist agents or AIGateway.

    Attempts to dispatch to real specialist agent classes (SecurityAgent,
    QAAgent, DevOpsAgent) first, then falls back to `get_ai_gateway().generate`
    so guardrails, BYOK, rate limits, and token/cost telemetry apply uniformly.
    """
    spec = ROLE_INDEX.get(task.role)
    capabilities = ", ".join(spec.capabilities) if spec else "general-engineering"
    upstream = context.get("upstream_outputs") or {}
    upstream_summary = (
        "\n".join(f"- {k}: {str(v)[:300]}" for k, v in upstream.items() if v)
        or "None (initial wave)"
    )

    blackboard_snapshot = context.get("blackboard_snapshot") or {}
    artifacts = blackboard_snapshot.get("artifacts") or []
    blackboard_summary = (
        "\n".join(
            f"- [{a.get('artifact_type')}] {a.get('key')} v{a.get('version')} ({a.get('producer_role')}): "
            f"{str(a.get('summary', ''))[:200]}"
            for a in artifacts[-10:]
        )
        or "No prior blackboard artifacts."
    )
    repair_findings = context.get("repair_findings") or []

    # 1. Try real specialist agent dispatch (SecurityAgent, QAAgent, DevOpsAgent)
    specialist_result = await dispatch_specialist_agent(
        role=task.role,
        department=task.department,
        objective=str(context.get("objective", "")),
        task_description=task.description,
        blackboard_context=blackboard_summary,
        repair_findings=repair_findings or None,
        user_id=context.get("user_id"),
        project_id=context.get("project_id"),
        org_id=context.get("org_id"),
    )
    if specialist_result is not None:
        return specialist_result

    # 2. Fallback to unified AIGateway role prompt with Knowledge Fabric & Worktree integration
    system_prompt = (
        f"You are Forge AI's {spec.display_name if spec else task.role} "
        f"in the {task.department} department. Capabilities: {capabilities}. "
        "Provide a concise, actionable engineering artifact: decisions, concrete "
        "deliverables, risks, and verification criteria. When producing code changes "
        "for an isolated worktree, you may return JSON with keys: "
        "`summary` (string), `files_to_write` (object mapping relative path -> file content), "
        "and optional `verification_profile` (`python_syntax`, `python_unittest`, `js_syntax`, or `static_security`)."
    )
    skill_context = context.get("skill_context") or []
    skill_summary = (
        "\n".join(
            f"- {s.get('skill_name')} ({s.get('domain')}): {str(s.get('instructions_excerpt', ''))[:180]}"
            for s in skill_context
        )
        or "None"
    )
    knowledge_context = context.get("knowledge_context") or []
    knowledge_summary = (
        "\n".join(
            f"- [{k.get('node_type')}] {k.get('label')} (score {k.get('score')}): {str(k.get('summary', ''))[:180]}"
            for k in knowledge_context[:6]
        )
        or "None"
    )
    user_prompt = (
        f"Objective: {context.get('objective', '')}\n"
        f"Assigned Task: {task.description}\n"
        f"Activated Skills:\n{skill_summary}\n"
        f"Prior Cross-Run Knowledge Memory:\n{knowledge_summary}\n"
        f"Upstream Outputs:\n{upstream_summary}\n"
        f"Shared Blackboard:\n{blackboard_summary}\n"
    )
    if repair_findings:
        user_prompt += f"\nBlocking Findings to Remediate (Round {context.get('repair_round', 1)}):\n{repair_findings}\n"

    from gateway import GatewayRequest, get_ai_gateway

    route = context.get("model_route") or {}
    provider_pref = route.get("provider_preference")
    provider_names = (
        [str(p) for p in provider_pref if p]
        if isinstance(provider_pref, (list, tuple)) and provider_pref
        else None
    )
    usage_out: Dict[str, Any] = {}

    gateway = get_ai_gateway()
    response = await gateway.generate(
        GatewayRequest(
            agent_name=spec.backend_agent_key if spec else task.role,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            user_id=context.get("user_id"),
            project_id=context.get("project_id"),
            org_id=context.get("org_id"),
            model=route.get("model_id"),
            task_complexity=route.get("task_complexity"),
            provider_names=provider_names,
            usage_out=usage_out,
            max_tokens=1024,
            temperature=0.2,
        )
    )

    parsed_payload = _extract_structured_executor_json(response.content)
    summary_text = str(parsed_payload.get("summary") or response.content)
    files_to_write = parsed_payload.get("files_to_write")
    written_files: List[str] = []
    rejected_paths: List[str] = []
    verification_report: Optional[Dict[str, Any]] = None

    lease_dict = context.get("worktree_lease") or {}
    worktree_mgr = context.get("worktree_manager")
    lease_id = lease_dict.get("lease_id") if isinstance(lease_dict, dict) else None
    worktree_dir = lease_dict.get("worktree_path") if isinstance(lease_dict, dict) else None

    if isinstance(files_to_write, dict) and worktree_mgr is not None and lease_id:
        for rel_path, file_content in list(files_to_write.items())[:25]:
            if not isinstance(rel_path, str) or not isinstance(file_content, str):
                continue
            try:
                worktree_mgr.record_workspace_write(lease_id, rel_path, file_content)
                written_files.append(rel_path)
            except (ValueError, KeyError) as exc:
                logger.warning("Rejected unsafe worktree file write %r: %s", rel_path, exc)
                rejected_paths.append(rel_path)

    verify_profile = parsed_payload.get("verification_profile")
    if (
        isinstance(verify_profile, str)
        and verify_profile in VerificationSandbox.ALLOWED_PROFILES
        and worktree_dir
        and written_files
    ):
        try:
            from pathlib import Path as _Path

            v_result = await VerificationSandbox().run_profile(
                profile=verify_profile,
                target_files=written_files,
                cwd=_Path(str(worktree_dir)),
                timeout_seconds=15.0,
            )
            verification_report = v_result.to_dict()
        except Exception:
            logger.debug("Live worktree verification skipped", exc_info=True)

    result_payload: Dict[str, Any] = {
        "role": task.role,
        "department": task.department,
        "summary": summary_text,
        "provider": response.provider,
        "model": response.model,
        "usage": response.usage or usage_out,
        "cost_usd": response.cost_usd,
        "latency_ms": response.latency_ms,
        "request_id": response.request_id,
        "knowledge_hits_used": len(knowledge_context),
    }
    if written_files:
        result_payload["touched_files"] = written_files
        result_payload["files_written"] = written_files
    if rejected_paths:
        result_payload["rejected_file_paths"] = rejected_paths
    if verification_report is not None:
        result_payload["verification"] = verification_report
    return result_payload


def _extract_structured_executor_json(raw_text: str) -> Dict[str, Any]:
    """Best-effort parse of JSON or ```json fenced payload from a live LLM response."""
    import json as _json

    text = (raw_text or "").strip()
    if not text:
        return {}
    candidates = [text]
    if "```json" in text:
        candidates.insert(0, text.split("```json", 1)[1].split("```", 1)[0].strip())
    elif text.startswith("```") and text.endswith("```"):
        candidates.insert(0, text[3:-3].strip())
    for candidate in candidates:
        if not candidate.startswith("{"):
            continue
        try:
            parsed = _json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    return {}


async def _default_gateway_delegation_responder(
    to_role: str,
    question: str,
    context: Dict[str, Any],
) -> str:
    spec = ROLE_INDEX.get(to_role)
    from gateway import GatewayRequest, get_ai_gateway

    gateway = get_ai_gateway()
    response = await gateway.generate(
        GatewayRequest(
            agent_name=spec.backend_agent_key if spec else to_role,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are Forge AI's {spec.display_name if spec else to_role}. "
                        "Answer the delegating agent's technical question directly and concisely."
                    ),
                },
                {"role": "user", "content": question},
            ],
            user_id=context.get("user_id"),
            project_id=context.get("project_id"),
            org_id=context.get("org_id"),
            max_tokens=512,
            temperature=0.1,
        )
    )
    return response.content


KERNEL_RUN_COLLECTION = "kernel_runs"


class KernelRunRepository:
    """MongoDB persistence for KernelRun documents."""

    async def save(self, run: KernelRun) -> None:
        from core.database import get_db

        db = await get_db()
        await db[KERNEL_RUN_COLLECTION].update_one(
            {"id": run.id, "project_id": run.project_id},
            {"$set": run.to_dict()},
            upsert=True,
        )

    async def get(self, project_id: str, run_id: str) -> Optional[Dict[str, Any]]:
        from core.database import get_db

        db = await get_db()
        return await db[KERNEL_RUN_COLLECTION].find_one(
            {"id": run_id, "project_id": project_id},
            {"_id": 0},
        )

    async def list_for_project(
        self, project_id: str, *, limit: int = 50
    ) -> List[Dict[str, Any]]:
        from core.database import get_db

        db = await get_db()
        cursor = (
            db[KERNEL_RUN_COLLECTION]
            .find({"project_id": project_id}, {"_id": 0})
            .sort("created_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)


async def record_kernel_run_outcomes(run: KernelRun) -> None:
    """Best-effort bridge into AgentRegistry & DecisionLogService after a run."""
    try:
        from agent_registry import get_agent_registry

        registry = get_agent_registry()
        for task in run.tasks:
            agent, _ = await registry.get_or_create_agent(
                run.project_id, task.role, department=task.department
            )
            await registry.record_task_result(
                run.project_id,
                agent.id,
                success=(task.status == KernelTaskStatus.COMPLETED),
                cost=float((task.output or {}).get("cost_usd", 0.0) or 0.0),
            )
    except Exception:
        logger.debug("AgentRegistry experience bridge skipped", exc_info=True)

    try:
        from services.decision_log import DecisionLogService

        decision_service = DecisionLogService()
        await decision_service.record_decision(
            {
                "id": _new_id("dec"),
                "project_id": run.project_id,
                "trigger": f"kernel_run:{run.id}",
                "category": "architecture",
                "rationale": (
                    f"Multi-agent kernel executed '{run.objective}' across "
                    f"{len(run.waves)} wave(s) ({run.status.value})."
                ),
                "actions": [
                    f"{t.role} ({t.department}): {t.status.value}" for t in run.tasks
                ],
                "status": "accepted" if run.status == KernelRunStatus.COMPLETED else "pending",
                "confidence_score": 0.9 if run.status == KernelRunStatus.COMPLETED else 0.5,
                "source_ref": run.id,
                "source_type": "agent_kernel",
            }
        )
    except Exception:
        logger.debug("DecisionLog bridge skipped", exc_info=True)


_kernel_singleton: Optional[AgentKernel] = None
_kernel_repo_singleton: Optional[KernelRunRepository] = None


def get_agent_kernel() -> AgentKernel:
    global _kernel_singleton
    if _kernel_singleton is None:
        _kernel_singleton = AgentKernel()
    return _kernel_singleton


def get_kernel_run_repository() -> KernelRunRepository:
    global _kernel_repo_singleton
    if _kernel_repo_singleton is None:
        _kernel_repo_singleton = KernelRunRepository()
    return _kernel_repo_singleton
