"""
FastAPI router exposing orchestration functionality as REST API endpoints.

This module provides a small API layer so every future agent can:
- Load project state
- Read tasks
- Update tasks
- Write logs
- Store engineering knowledge
- Update metrics
- Retrieve dashboard data

Usage:
    from orchestration.api import router as orchestration_router
    app.include_router(orchestration_router, prefix="/orchestration")
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Union
from datetime import datetime

from .helpers import (
    load_project_state,
    read_tasks,
    get_task_by_id,
    update_task,
    assign_task,
    start_task,
    complete_task,
    write_log,
    store_engineering_knowledge,
    validate_pattern,
    find_patterns,
    update_metrics,
    get_metrics,
    record_metric_trend,
    retrieve_dashboard_data,
    read_workflow_state,
    update_workflow_state,
    advance_workflow_stage,
    read_agent_registry,
    load_all_state,
    recalculate_metrics,
)

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


# =============================================================================
# Request/Response Models
# =============================================================================

class TaskUpdateRequest(BaseModel):
    updates: Dict[str, Any] = Field(..., description="Fields to update on the task")
    history_event: Optional[str] = Field(None, description="Event name to append to history")
    history_detail: Optional[str] = Field(None, description="Detail string for history entry")


class LogEntryRequest(BaseModel):
    agent: str = Field(..., description="Agent performing the action")
    task: str = Field(..., description="Task ID being worked on")
    action: str = Field(..., description="Action being performed")
    status: str = Field(..., description="Status after the action")
    duration_seconds: int = Field(0, description="Duration in seconds")
    detail: str = Field("", description="Human-readable detail")


class PatternStoreRequest(BaseModel):
    pattern: str = Field(..., description="Pattern name")
    problem: str = Field(..., description="Problem this pattern solves")
    solution: List[str] = Field(..., description="Step-by-step solution")
    files: List[str] = Field(..., description="Files involved")
    created_from_task: str = Field(..., description="Task ID that generated this pattern")
    tags: Optional[List[str]] = Field(None, description="Tags for categorization")
    applicable_categories: Optional[List[str]] = Field(None, description="Applicable categories")


class MetricsUpdateRequest(BaseModel):
    metric_updates: Dict[str, Union[int, float]] = Field(..., description="Metric name -> new value")


class WorkflowUpdateRequest(BaseModel):
    updates: Dict[str, Any] = Field(..., description="Fields to update in workflow state")


class TaskFilterRequest(BaseModel):
    status_filter: Optional[Union[str, List[str]]] = Field(None, description="Filter by status")
    task_id: Optional[str] = Field(None, description="Filter by exact task ID")
    category: Optional[str] = Field(None, description="Filter by category")
    priority: Optional[str] = Field(None, description="Filter by priority")


# =============================================================================
# 1. PROJECT STATE
# =============================================================================

@router.get("/project", response_model=Dict[str, Any])
async def get_project_state():
    """
    Load the complete project manifest.

    Returns project metadata, tech stack, architecture, services,
    directory map, and repository metadata.
    """
    return load_project_state()


# =============================================================================
# 2. TASKS
# =============================================================================

@router.get("/tasks", response_model=List[Dict[str, Any]])
async def get_tasks(
    status_filter: Optional[str] = None,
    task_id: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
):
    """
    Read tasks from the task registry with optional filtering.

    Query parameters:
    - status_filter: Comma-separated list of statuses (e.g., "READY,ASSIGNED")
    - task_id: Exact task ID to retrieve
    - category: Filter by category (e.g., "security")
    - priority: Filter by priority (e.g., "P0")
    """
    # Parse comma-separated status filter
    sf = None
    if status_filter:
        sf = [s.strip() for s in status_filter.split(",")]

    return read_tasks(
        status_filter=sf,
        task_id=task_id,
        category=category,
        priority=priority,
    )


@router.get("/tasks/{task_id}", response_model=Dict[str, Any])
async def get_task(task_id: str):
    """
    Get a single task by its ID.

    Args:
        task_id: The task identifier (e.g., "SEC-001").
    """
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")
    return task


@router.put("/tasks/{task_id}", response_model=Dict[str, Any])
async def update_task_endpoint(task_id: str, request: TaskUpdateRequest):
    """
    Update a task's fields and optionally append a history entry.

    Args:
        task_id: The task identifier to update.
        request: Update request containing fields to update and optional history event.
    """
    try:
        return update_task(
            task_id=task_id,
            updates=request.updates,
            history_event=request.history_event,
            history_detail=request.history_detail,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/{task_id}/assign", response_model=Dict[str, Any])
async def assign_task_endpoint(task_id: str, agent_name: str):
    """
    Assign a task to an agent.

    Args:
        task_id: The task to assign.
        agent_name: The agent to assign the task to (query parameter).
    """
    try:
        return assign_task(task_id=task_id, agent_name=agent_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/{task_id}/start", response_model=Dict[str, Any])
async def start_task_endpoint(task_id: str):
    """
    Mark a task as in progress.

    Args:
        task_id: The task to start.
    """
    try:
        return start_task(task_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/{task_id}/complete", response_model=Dict[str, Any])
async def complete_task_endpoint(
    task_id: str,
    validation_status: str = "pending",
    approval_status: str = "pending",
):
    """
    Mark a task as complete and move to review.

    Args:
        task_id: The task to complete.
        validation_status: Initial validation status.
        approval_status: Initial approval status.
    """
    try:
        return complete_task(
            task_id=task_id,
            validation_status=validation_status,
            approval_status=approval_status,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# 3. EXECUTION LOG
# =============================================================================

@router.post("/log", response_model=Dict[str, Any])
async def create_log_entry(request: LogEntryRequest):
    """
    Append an entry to the execution log.

    Args:
        request: Log entry details including agent, task, action, status, etc.
    """
    return write_log(
        agent=request.agent,
        task=request.task,
        action=request.action,
        status=request.status,
        duration_seconds=request.duration_seconds,
        detail=request.detail,
    )


@router.get("/log", response_model=List[Dict[str, Any]])
async def get_log_entries(
    agent: Optional[str] = None,
    task: Optional[str] = None,
    limit: int = 100,
):
    """
    Retrieve execution log entries with optional filtering.

    Query parameters:
    - agent: Filter by agent name
    - task: Filter by task ID
    - limit: Maximum number of entries to return (default: 100)
    """
    from .helpers import _read_json, PATHS

    log = _read_json(PATHS["execution_log"])
    entries = log.get("entries", [])

    if agent:
        entries = [e for e in entries if e.get("agent") == agent]
    if task:
        entries = [e for e in entries if e.get("task") == task]

    # Return most recent entries first
    entries = list(reversed(entries[-limit:]))
    return entries


# =============================================================================
# 4. ENGINEERING MEMORY
# =============================================================================

@router.post("/memory/patterns", response_model=Dict[str, Any])
async def create_pattern(request: PatternStoreRequest):
    """
    Store a reusable engineering pattern in ENGINEERING_MEMORY.json.

    Args:
        request: Pattern details including name, problem, solution, files, etc.
    """
    return store_engineering_knowledge(
        pattern=request.pattern,
        problem=request.problem,
        solution=request.solution,
        files=request.files,
        created_from_task=request.created_from_task,
        tags=request.tags,
        applicable_categories=request.applicable_categories,
    )


@router.post("/memory/patterns/{pattern_name}/validate", response_model=Dict[str, Any])
async def validate_pattern_endpoint(pattern_name: str):
    """
    Mark a stored engineering pattern as validated.

    Args:
        pattern_name: The name of the pattern to validate.
    """
    pattern = validate_pattern(pattern_name)
    if not pattern:
        raise HTTPException(status_code=404, detail=f"Pattern '{pattern_name}' not found")
    return pattern


@router.get("/memory/patterns", response_model=List[Dict[str, Any]])
async def search_patterns(
    tags: Optional[str] = None,
    category: Optional[str] = None,
    query: Optional[str] = None,
):
    """
    Find engineering patterns by tags, category, or text search.

    Query parameters:
    - tags: Comma-separated list of tags
    - category: Filter by applicable category
    - query: Text search against pattern name and problem description
    """
    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    return find_patterns(tags=tag_list, category=category, query=query)


# =============================================================================
# 5. METRICS
# =============================================================================

@router.get("/metrics", response_model=Dict[str, Any])
async def get_metrics_endpoint():
    """Get the current metrics data."""
    return get_metrics()


@router.put("/metrics", response_model=Dict[str, Any])
async def update_metrics_endpoint(request: MetricsUpdateRequest):
    """
    Update specific metric values.

    Args:
        request: Dict mapping metric names to new values.
    """
    return update_metrics(request.metric_updates)


@router.post("/metrics/trends/{metric_name}", response_model=Dict[str, Any])
async def record_trend_endpoint(metric_name: str, value: Union[int, float]):
    """
    Record a data point in a metric's trend history.

    Args:
        metric_name: The trend name (e.g., "security_score").
        value: The value to record.
    """
    record_metric_trend(metric_name, value)
    return {"status": "recorded", "metric": metric_name, "value": value}


@router.post("/metrics/recalculate", response_model=Dict[str, Any])
async def recalculate_metrics_endpoint():
    """Recalculate all metrics from the current task registry state."""
    return recalculate_metrics()


# =============================================================================
# 6. DASHBOARD
# =============================================================================

@router.get("/dashboard", response_model=Dict[str, Any])
async def get_dashboard():
    """
    Get the aggregated dashboard data for visualization.

    Returns overall score, per-category scores, task progress,
    sprint progress, recent activity, and alerts.
    """
    return retrieve_dashboard_data()


# =============================================================================
# 7. WORKFLOW STATE
# =============================================================================

@router.get("/workflow", response_model=Dict[str, Any])
async def get_workflow_state():
    """
    Get the current workflow state.

    Returns current phase, running agent, queue, blocked tasks,
    completed tasks, next task, and sprint status.
    """
    return read_workflow_state()


@router.put("/workflow", response_model=Dict[str, Any])
async def update_workflow_endpoint(request: WorkflowUpdateRequest):
    """
    Update the workflow state.

    Args:
        request: Dict of fields to update in the workflow state.
    """
    return update_workflow_state(request.updates)


@router.post("/workflow/advance", response_model=Dict[str, Any])
async def advance_workflow():
    """
    Advance the workflow to the next stage in the pipeline.

    Stages: CEO Initiation → Security Audit → Task Planning → Task Dispatch
            → Implementation → Code Review → Validation → Repair
            → Revalidation → CTO Approval
    """
    return advance_workflow_stage()


# =============================================================================
# 8. AGENT REGISTRY
# =============================================================================

@router.get("/agents", response_model=List[Dict[str, Any]])
async def get_agents(
    agent_name: Optional[str] = None,
    can_modify_code: Optional[bool] = None,
    can_approve: Optional[bool] = None,
):
    """
    Read agent definitions from the agent registry.

    Query parameters:
    - agent_name: Filter by specific agent name
    - can_modify_code: Filter by code modification capability (true/false)
    - can_approve: Filter by approval capability (true/false)
    """
    return read_agent_registry(
        agent_name=agent_name,
        can_modify_code=can_modify_code,
        can_approve=can_approve,
    )


# =============================================================================
# 9. FULL STATE DUMP
# =============================================================================

@router.get("/state", response_model=Dict[str, Any])
async def get_full_state():
    """
    Load all orchestration state into a single response.

    Useful for agents that need a complete picture of the project state.
    Returns all orchestration data under their respective keys.
    """
    return load_all_state()


# =============================================================================
# 10. HEALTH CHECK
# =============================================================================

@router.get("/health", response_model=Dict[str, str])
async def health_check():
    """Health check endpoint for the orchestration API."""
    return {"status": "ok", "service": "orchestration-api"}