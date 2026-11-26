"""API surface for the Multi-Agent Orchestration Kernel.

Exposes project-scoped planning, parallel DAG wave execution, run inspection,
cooperative cancellation, and the 9-department autonomous engineering org
blueprint under `/v1/projects/{project_id}/kernel/*`.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.auth import get_current_user
from core.agent_kernel import (
    CycleDetectedError,
    DelegationPolicy,
    KernelExecutionConfig,
    KernelRun,
    KernelTask,
    UnknownDependencyError,
    compute_execution_waves,
    get_agent_kernel,
    get_kernel_run_repository,
    get_org_blueprint_summary,
    plan_objective_dag,
    record_kernel_run_outcomes,
)
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/kernel", tags=["agent-kernel"])


async def _assert_project_access(db, project_id: str, user_id: str) -> Dict[str, Any]:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class KernelPlanRequest(BaseModel):
    objective: str = Field(..., min_length=3, max_length=2000)
    max_agents: int = Field(8, ge=1, le=16)
    include_governance_gates: bool = True
    plan_id: Optional[str] = Field(None, max_length=128)


class CustomTaskInput(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., min_length=1, max_length=64)
    department: str = Field(..., min_length=1, max_length=64)
    description: str = Field(..., min_length=1, max_length=2000)
    depends_on: List[str] = Field(default_factory=list)


class ExecuteKernelRunRequest(BaseModel):
    objective: str = Field(..., min_length=3, max_length=2000)
    max_agents: int = Field(8, ge=1, le=16)
    include_governance_gates: bool = True
    plan_id: Optional[str] = Field(None, max_length=128)
    max_concurrency: int = Field(4, ge=1, le=8)
    task_timeout_seconds: float = Field(60.0, ge=5.0, le=300.0)
    max_retries: int = Field(1, ge=0, le=3)
    fail_fast: bool = False
    max_repair_rounds: int = Field(2, ge=0, le=3)
    require_delivery_approval: bool = False
    approval_timeout_seconds: float = Field(300.0, ge=10.0, le=3600.0)
    max_budget_usd: float = Field(2.50, ge=0.05, le=100.0)
    isolate_worktrees: bool = True
    prefer_local_llm: bool = False
    max_delegations_per_run: int = Field(12, ge=0, le=20)
    max_delegation_depth: int = Field(2, ge=1, le=4)
    tasks: Optional[List[CustomTaskInput]] = None


class GateDecisionRequest(BaseModel):
    note: str = Field("", max_length=1000)


async def _build_org_event_sink(project_id: str):
    async def _sink(event_name: str, payload: Dict[str, Any]) -> None:
        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            event_type = OrgEventType(event_name)
            await get_org_manager().emit(
                OrgEvent(type=event_type, project_id=project_id, data=payload)
            )
        except Exception:
            logger.debug("Org WS event emission skipped for %s", event_name, exc_info=True)

    return _sink


async def _execute_and_persist_run(
    run: KernelRun,
    *,
    user_id: str,
    org_id: Optional[str],
) -> None:
    repo = get_kernel_run_repository()
    kernel = get_agent_kernel()
    sink = await _build_org_event_sink(run.project_id)

    try:
        await repo.save(run)
        await kernel.execute_run(
            run,
            shared_context={"user_id": user_id, "org_id": org_id},
            event_sink=sink,
        )
        await repo.save(run)
        await record_kernel_run_outcomes(run)
    except Exception:
        logger.exception("Kernel run %s crashed unexpectedly", run.id)


@router.get("/org-blueprint")
async def get_org_blueprint(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return the 9-department Autonomous Engineering Org topology & delegation policy."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return get_org_blueprint_summary()


@router.post("/plan")
async def create_kernel_plan(
    project_id: str,
    req: KernelPlanRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a dependency-aware multi-agent DAG and parallel execution waves."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    run = plan_objective_dag(
        project_id,
        req.objective,
        max_agents=req.max_agents,
        include_governance_gates=req.include_governance_gates,
        plan_id=req.plan_id,
    )
    return run.to_dict()


@router.post("/runs")
async def start_kernel_run(
    project_id: str,
    req: ExecuteKernelRunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Launch a governed parallel multi-agent execution run."""
    db = await get_db()
    project = await _assert_project_access(db, project_id, current_user.id)

    exec_config = KernelExecutionConfig(
        max_concurrency=req.max_concurrency,
        task_timeout_seconds=req.task_timeout_seconds,
        max_retries=req.max_retries,
        fail_fast=req.fail_fast,
        max_repair_rounds=req.max_repair_rounds,
        require_delivery_approval=req.require_delivery_approval,
        approval_timeout_seconds=req.approval_timeout_seconds,
        max_budget_usd=req.max_budget_usd,
        isolate_worktrees=req.isolate_worktrees,
        prefer_local_llm=req.prefer_local_llm,
        delegation_policy=DelegationPolicy(
            max_delegations_per_run=req.max_delegations_per_run,
            max_depth=req.max_delegation_depth,
        ),
    )

    if req.tasks:
        tasks = [
            KernelTask(
                id=t.id,
                title=t.title,
                role=t.role,
                department=t.department,
                description=t.description,
                depends_on=list(t.depends_on),
            )
            for t in req.tasks
        ]
        try:
            waves = compute_execution_waves(tasks)
        except (CycleDetectedError, UnknownDependencyError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        run = KernelRun(
            id=plan_objective_dag(project_id, req.objective).id,
            project_id=project_id,
            objective=req.objective,
            tasks=tasks,
            waves=waves,
            config=exec_config,
            plan_id=req.plan_id,
        )
    else:
        run = plan_objective_dag(
            project_id,
            req.objective,
            max_agents=req.max_agents,
            include_governance_gates=req.include_governance_gates,
            plan_id=req.plan_id,
            config=exec_config,
        )

    repo = get_kernel_run_repository()
    await repo.save(run)

    org_id = project.get("org_id")
    background_tasks.add_task(
        _execute_and_persist_run,
        run,
        user_id=current_user.id,
        org_id=org_id,
    )
    return run.to_dict()


@router.get("/runs")
async def list_kernel_runs(
    project_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    repo = get_kernel_run_repository()
    runs = await repo.list_for_project(project_id, limit=limit)
    return {"runs": runs}


@router.get("/runs/{run_id}")
async def get_kernel_run(
    project_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    active = get_agent_kernel().get_active_run(run_id)
    if active is not None and active.project_id == project_id:
        return active.to_dict()
    repo = get_kernel_run_repository()
    run_doc = await repo.get(project_id, run_id)
    if not run_doc:
        raise HTTPException(status_code=404, detail="Kernel run not found")
    return run_doc


@router.get("/runs/{run_id}/artifacts")
async def get_kernel_run_artifacts(
    project_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """Inspect Shared Blackboard artifacts, file conflicts, repair cycles, and approval gates."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    active = get_agent_kernel().get_active_run(run_id)
    if active is not None and active.project_id == project_id:
        run_doc = active.to_dict()
    else:
        repo = get_kernel_run_repository()
        run_doc = await repo.get(project_id, run_id)
        if not run_doc:
            raise HTTPException(status_code=404, detail="Kernel run not found")
    return {
        "run_id": run_id,
        "status": run_doc.get("status"),
        "artifacts": run_doc.get("artifacts", []),
        "conflicts": run_doc.get("conflicts", []),
        "reconciliations": run_doc.get("reconciliations", []),
        "repair_cycles": run_doc.get("repair_cycles", []),
        "approval_gates": run_doc.get("approval_gates", []),
    }


@router.post("/runs/{run_id}/gates/{gate_id}/approve")
async def approve_kernel_gate(
    project_id: str,
    run_id: str,
    gate_id: str,
    req: GateDecisionRequest,
    current_user: User = Depends(get_current_user),
):
    """Approve a pending human-in-the-loop governance gate and resume run execution."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    kernel = get_agent_kernel()
    active = kernel.get_active_run(run_id)
    if active is None or active.project_id != project_id:
        raise HTTPException(status_code=404, detail="Active kernel run not found")

    gate = kernel.resolve_approval_gate(
        run_id,
        gate_id,
        approved=True,
        actor=current_user.email or current_user.id,
        note=req.note,
    )
    if gate is None:
        raise HTTPException(status_code=404, detail="Pending approval gate not found")
    return {"run_id": run_id, "gate": gate.to_dict()}


@router.post("/runs/{run_id}/gates/{gate_id}/reject")
async def reject_kernel_gate(
    project_id: str,
    run_id: str,
    gate_id: str,
    req: GateDecisionRequest,
    current_user: User = Depends(get_current_user),
):
    """Reject a pending human-in-the-loop governance gate and halt downstream waves."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    kernel = get_agent_kernel()
    active = kernel.get_active_run(run_id)
    if active is None or active.project_id != project_id:
        raise HTTPException(status_code=404, detail="Active kernel run not found")

    gate = kernel.resolve_approval_gate(
        run_id,
        gate_id,
        approved=False,
        actor=current_user.email or current_user.id,
        note=req.note,
    )
    if gate is None:
        raise HTTPException(status_code=404, detail="Pending approval gate not found")
    return {"run_id": run_id, "gate": gate.to_dict()}


@router.post("/runs/{run_id}/cancel")
async def cancel_kernel_run(
    project_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    repo = get_kernel_run_repository()
    run_doc = await repo.get(project_id, run_id)
    if not run_doc:
        raise HTTPException(status_code=404, detail="Kernel run not found")

    cancelled = get_agent_kernel().cancel_run(run_id)
    return {"run_id": run_id, "cancel_requested": cancelled}
