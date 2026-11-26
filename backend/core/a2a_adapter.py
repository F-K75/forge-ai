"""P1 A2A (Agent-to-Agent) Protocol Adapter for Forge AI.

Exposes Forge AI's 9-department autonomous engineering organisation via:
1. Dynamic A2A Agent Card (`a2a/0.2`) built from the live org blueprint & SkillRegistry.
2. Governed `tasks/send` dispatch mapping external A2A task requests into scoped
   AgentKernel DAG plans/runs with project isolation and cost budget caps.

Pure-Python stdlib implementation so it runs cleanly in both FastAPI production
and standalone unit tests.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    get_agent_kernel,
    get_org_blueprint_summary,
    plan_objective_dag,
)
from core.skill_engine import get_skill_registry


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class A2ASkillDescriptor:
    id: str
    name: str
    domain: str
    description: str
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class A2AAgentCard:
    name: str
    description: str
    version: str
    protocol: str
    url: str
    capabilities: Dict[str, bool]
    protocols_supported: List[str]
    authentication: Dict[str, Any]
    departments: List[str]
    skills: List[Dict[str, Any]]
    generated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class A2ATaskRequest:
    objective: str
    project_id: str
    task_id: str = field(default_factory=lambda: f"a2a_{uuid.uuid4().hex[:12]}")
    caller_agent: str = "external-a2a-client"
    max_agents: int = 6
    max_budget_usd: float = 1.50
    execute_now: bool = False


@dataclass
class A2ATaskResponse:
    task_id: str
    kernel_run_id: str
    project_id: str
    state: str  # submitted | working | completed | failed
    summary: str
    wave_count: int
    task_count: int
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    evaluations: List[Dict[str, Any]] = field(default_factory=list)
    updated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def build_forge_agent_card(*, project_id: str, base_url: str = "") -> A2AAgentCard:
    """Build Forge AI's dynamic A2A Agent Card from live departments & SkillRegistry."""
    blueprint = get_org_blueprint_summary()
    registry = get_skill_registry()
    raw_skills = registry.list_skills()[:24]
    a2a_skills = [
        A2ASkillDescriptor(
            id=str(s["name"]),
            name=str(s["name"]).replace("-", " ").title(),
            domain=str(s["domain"]),
            description=str(s["description"]),
            tags=list(s.get("keywords", []))[:6],
        ).to_dict()
        for s in raw_skills
    ]
    base = (base_url or "").rstrip("/")
    endpoint = f"{base}/v1/projects/{project_id}/protocols/a2a/tasks/send"
    return A2AAgentCard(
        name="Forge AI Autonomous Engineering OS",
        description=(
            "9-department multi-agent software engineering operating system with DAG wave "
            "scheduling, Shared Blackboard, critique-repair loops, governed MCP tools, and "
            "isolated verification worktrees."
        ),
        version="2.0.0",
        protocol="a2a/0.2",
        url=endpoint,
        capabilities={
            "streaming": True,
            "pushNotifications": False,
            "stateTransitionHistory": True,
            "humanInTheLoopApproval": True,
            "isolatedWorktrees": True,
        },
        protocols_supported=[
            "a2a/0.2",
            "ag-ui/v1",
            "ai-sdk-ui-stream/v1",
            "mcp/2025-03-26",
            "mcp-apps/v1",
            "a2ui/v1",
        ],
        authentication={
            "schemes": ["Bearer"],
            "projectScoped": True,
        },
        departments=[d["key"] for d in blueprint.get("departments", [])],
        skills=a2a_skills,
    )


class A2AGateway:
    """Governed A2A task gateway routing external agent tasks into Forge's AgentKernel."""

    def __init__(self, kernel: Optional[AgentKernel] = None) -> None:
        self._kernel = kernel
        self._tasks: Dict[str, A2ATaskResponse] = {}

    def _get_kernel(self) -> AgentKernel:
        return self._kernel or get_agent_kernel()

    async def send_task(self, req: A2ATaskRequest) -> A2ATaskResponse:
        objective = (req.objective or "").strip()
        if len(objective) < 3:
            raise ValueError("A2A task objective must be at least 3 characters")

        kernel = self._get_kernel()
        config = KernelExecutionConfig(
            max_concurrency=3,
            max_budget_usd=max(0.05, min(25.0, float(req.max_budget_usd))),
            isolate_worktrees=True,
            require_delivery_approval=False,
        )
        run = plan_objective_dag(
            project_id=req.project_id,
            objective=objective,
            max_agents=max(2, min(10, int(req.max_agents))),
            include_governance_gates=True,
            config=config,
        )

        if req.execute_now:
            finished = await kernel.execute_run(
                run, shared_context={"a2a_caller": req.caller_agent}
            )
            status_val = finished.status.value
            a2a_state = "completed" if status_val == "completed" else "failed"
            resp = A2ATaskResponse(
                task_id=req.task_id,
                kernel_run_id=finished.id,
                project_id=req.project_id,
                state=a2a_state,
                summary=(
                    f"Executed {len(finished.tasks)} specialist task(s) across "
                    f"{len(finished.waves)} wave(s) ({status_val})."
                ),
                wave_count=len(finished.waves),
                task_count=len(finished.tasks),
                artifacts=finished.artifacts[-10:],
                evaluations=finished.evaluations[-10:],
            )
        else:
            resp = A2ATaskResponse(
                task_id=req.task_id,
                kernel_run_id=run.id,
                project_id=req.project_id,
                state="submitted",
                summary=(
                    f"Planned {len(run.tasks)} specialist task(s) across {len(run.waves)} DAG wave(s) "
                    f"with ${config.max_budget_usd:.2f} budget cap."
                ),
                wave_count=len(run.waves),
                task_count=len(run.tasks),
            )

        self._tasks[resp.task_id] = resp
        return resp

    def get_task(self, *, project_id: str, task_id: str) -> Optional[A2ATaskResponse]:
        rec = self._tasks.get(task_id)
        if rec is None or rec.project_id != project_id:
            return None
        return rec


_a2a_gateway: Optional[A2AGateway] = None


def get_a2a_gateway() -> A2AGateway:
    global _a2a_gateway
    if _a2a_gateway is None:
        _a2a_gateway = A2AGateway()
    return _a2a_gateway
