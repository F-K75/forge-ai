"""
Helper functions for reading and updating orchestration state files.

Every agent in the multi-agent pipeline uses these functions to:
- Load project state
- Read tasks
- Update tasks
- Write logs
- Store engineering knowledge
- Update metrics
- Retrieve dashboard data

All functions use ISO-8601 timestamps and preserve backward compatibility.

Concurrency Safety:
    All file I/O is delegated to the storage backend (orchestration.storage),
    which provides advisory file locking and atomic writes. helpers.py remains
    storage-agnostic and does not contain any locking logic.
"""

import json
import os
import copy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from .storage import get_storage, StorageError, LockTimeoutError

# --- Paths ---
ORCHESTRATION_DIR = os.path.dirname(os.path.abspath(__file__))

PATHS = {
    "project_manifest": os.path.join(ORCHESTRATION_DIR, "PROJECT_MANIFEST.json"),
    "task_registry": os.path.join(ORCHESTRATION_DIR, "TASK_REGISTRY.json"),
    "engineering_memory": os.path.join(ORCHESTRATION_DIR, "ENGINEERING_MEMORY.json"),
    "metrics": os.path.join(ORCHESTRATION_DIR, "METRICS.json"),
    "execution_log": os.path.join(ORCHESTRATION_DIR, "EXECUTION_LOG.json"),
    "agent_registry": os.path.join(ORCHESTRATION_DIR, "AGENT_REGISTRY.json"),
    "workflow_state": os.path.join(ORCHESTRATION_DIR, "WORKFLOW_STATE.json"),
    "dashboard_data": os.path.join(ORCHESTRATION_DIR, "DASHBOARD_DATA.json"),
}

# Get the default storage backend on demand (supports test injection)
def _read_json(path: str) -> Dict[str, Any]:
    try:
        return get_storage().read(path)
    except FileNotFoundError:
        return {}


def _write_json(path: str, data: Dict[str, Any]) -> None:
    get_storage().write(path, data)


def _update_json(path: str, modifier) -> Dict[str, Any]:
    return get_storage().update(path, modifier)


def _timestamp() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _update_timestamp(data: Dict[str, Any]) -> Dict[str, Any]:
    """Update the 'updated_at' field in a data dict."""
    data["updated_at"] = _timestamp()
    return data


# =============================================================================
# 1. LOAD PROJECT STATE
# =============================================================================

def load_project_state() -> Dict[str, Any]:
    """
    Load the complete project manifest.

    Returns the PROJECT_MANIFEST.json contents including project metadata,
    tech stack, architecture, services, directory map, and repository metadata.

    Returns:
        dict: The full project manifest.
    """
    return _read_json(PATHS["project_manifest"])


# =============================================================================
# 2. READ TASKS
# =============================================================================

def read_tasks(
    status_filter: Optional[Union[str, List[str]]] = None,
    task_id: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Read tasks from the task registry with optional filtering.

    Args:
        status_filter: Filter by task status. Can be a single status string
                      (e.g., "READY") or a list of statuses.
        task_id: Return only the task with this exact ID.
        category: Filter by task category (e.g., "security").
        priority: Filter by priority (e.g., "P0").

    Returns:
        list: Matching task dicts. Each task has the schema:
              {id, title, category, priority, severity, status, owner,
               dependencies, blocked_by, estimated_hours, started_at,
               completed_at, validation_status, approval_status,
               artifacts, history}
    """
    registry = _read_json(PATHS["task_registry"])
    tasks = registry.get("tasks", [])

    if task_id:
        tasks = [t for t in tasks if t["id"] == task_id]

    if status_filter:
        if isinstance(status_filter, str):
            status_filter = [status_filter]
        tasks = [t for t in tasks if t.get("status") in status_filter]

    if category:
        tasks = [t for t in tasks if t.get("category") == category]

    if priority:
        tasks = [t for t in tasks if t.get("priority") == priority]

    return tasks


def get_task_by_id(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Get a single task by its ID.

    Args:
        task_id: The task identifier (e.g., "SEC-001").

    Returns:
        dict or None: The task dict if found, None otherwise.
    """
    tasks = read_tasks(task_id=task_id)
    return tasks[0] if tasks else None


# =============================================================================
# 3. UPDATE TASK
# =============================================================================

def update_task(
    task_id: str,
    updates: Dict[str, Any],
    history_event: Optional[str] = None,
    history_detail: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a task's fields and optionally append a history entry.

    Validates that the status transition is valid if status is being changed.

    Args:
        task_id: The task identifier to update.
        updates: Dict of fields to update (e.g., {"status": "IN_PROGRESS", "owner": "developer"}).
        history_event: Optional event name to append to task history (e.g., "task_started").
        history_detail: Optional detail string for the history entry.

    Returns:
        dict: The updated task.

    Raises:
        ValueError: If task_id is not found or status transition is invalid.
        LockTimeoutError: If the storage lock cannot be acquired within timeout.
        StorageError: On other storage failures.
    """
    def modifier(registry):
        task_found = False

        valid_statuses = [
            "READY", "ASSIGNED", "IN_PROGRESS", "UNDER_REVIEW",
            "VALIDATING", "FAILED", "REPAIRING", "REVALIDATING",
            "APPROVED", "DONE"
        ]

        for task in registry["tasks"]:
            if task["id"] == task_id:
                task_found = True

                # Validate status if being changed
                if "status" in updates:
                    new_status = updates["status"]
                    if new_status not in valid_statuses:
                        raise ValueError(
                            f"Invalid status '{new_status}'. Must be one of: {valid_statuses}"
                        )

                # Apply updates
                for key, value in updates.items():
                    if key in task or key == "status":  # Allow setting any known field
                        task[key] = value

                # Auto-set timestamps based on status
                if updates.get("status") == "IN_PROGRESS" and not task.get("started_at"):
                    task["started_at"] = _timestamp()
                if updates.get("status") in ("DONE", "APPROVED") and not task.get("completed_at"):
                    task["completed_at"] = _timestamp()

                # Append history event if provided
                if history_event:
                    task.setdefault("history", []).append({
                        "timestamp": _timestamp(),
                        "event": history_event,
                        "detail": history_detail or f"Task updated: {json.dumps(updates)}"
                    })

                break

        if not task_found:
            raise ValueError(f"Task '{task_id}' not found in registry.")

        _update_timestamp(registry)
        return registry

    registry = _update_json(PATHS["task_registry"], modifier)

    for task in registry["tasks"]:
        if task["id"] == task_id:
            return task

    raise ValueError(f"Task '{task_id}' not found after update.")


def assign_task(task_id: str, agent_name: str) -> Dict[str, Any]:
    """
    Convenience function to assign a task to an agent.

    Sets status to ASSIGNED and records the owner.

    Args:
        task_id: The task to assign.
        agent_name: The agent to assign the task to.

    Returns:
        dict: The updated task.
    """
    return update_task(
        task_id=task_id,
        updates={"status": "ASSIGNED", "owner": agent_name},
        history_event="task_assigned",
        history_detail=f"Assigned to {agent_name}"
    )


def start_task(task_id: str) -> Dict[str, Any]:
    """
    Convenience function to mark a task as in progress.

    Args:
        task_id: The task to start.

    Returns:
        dict: The updated task.
    """
    return update_task(
        task_id=task_id,
        updates={"status": "IN_PROGRESS"},
        history_event="task_started",
        history_detail="Implementation begun"
    )


def complete_task(
    task_id: str,
    validation_status: str = "pending",
    approval_status: str = "pending",
) -> Dict[str, Any]:
    """
    Convenience function to mark a task as complete.

    Args:
        task_id: The task to complete.
        validation_status: Initial validation status ("pending", "passed", "failed").
        approval_status: Initial approval status ("pending", "approved", "rejected").

    Returns:
        dict: The updated task.
    """
    return update_task(
        task_id=task_id,
        updates={
            "status": "UNDER_REVIEW",
            "validation_status": validation_status,
            "approval_status": approval_status,
        },
        history_event="task_completed",
        history_detail="Implementation complete, pending review"
    )


# =============================================================================
# 4. WRITE LOGS
# =============================================================================

def write_log(
    agent: str,
    task: str,
    action: str,
    status: str,
    duration_seconds: int = 0,
    detail: str = "",
) -> Dict[str, Any]:
    """
    Append an entry to the execution log.

    Args:
        agent: The agent performing the action (e.g., "developer", "validator").
        task: The task ID being worked on (e.g., "SEC-001").
        action: The action being performed (e.g., "file_modified", "validation_check").
        status: The status after the action (e.g., "IN_PROGRESS", "PASS").
        duration_seconds: How long the action took in seconds.
        detail: Human-readable detail about the action.

    Returns:
        dict: The newly created log entry.
    """
    entry = {
        "timestamp": _timestamp(),
        "agent": agent,
        "task": task,
        "action": action,
        "status": status,
        "duration_seconds": duration_seconds,
        "detail": detail,
    }

    def modifier(log):
        log.setdefault("entries", []).append(entry)
        _update_timestamp(log)
        return log

    _update_json(PATHS["execution_log"], modifier)

    return entry


# =============================================================================
# 5. STORE ENGINEERING KNOWLEDGE
# =============================================================================

def store_engineering_knowledge(
    pattern: str,
    problem: str,
    solution: List[str],
    files: List[str],
    created_from_task: str,
    tags: Optional[List[str]] = None,
    applicable_categories: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Store a reusable engineering pattern in ENGINEERING_MEMORY.json.

    Args:
        pattern: A short, descriptive name for the pattern.
        problem: The problem this pattern solves.
        solution: Step-by-step solution instructions.
        files: List of files involved in this pattern.
        created_from_task: The task ID that generated this pattern.
        tags: Optional list of tags for categorization.
        applicable_categories: Optional list of categories this pattern applies to.

    Returns:
        dict: The newly created pattern entry.
    """
    entry = {
        "pattern": pattern,
        "problem": problem,
        "solution": solution,
        "files": files,
        "validated": False,
        "created_from_task": created_from_task,
        "tags": tags or [],
        "applicable_categories": applicable_categories or [],
    }

    def modifier(memory):
        memory.setdefault("patterns", []).append(entry)
        _update_timestamp(memory)
        return memory

    _update_json(PATHS["engineering_memory"], modifier)

    return entry


def validate_pattern(pattern_name: str) -> Optional[Dict[str, Any]]:
    """
    Mark a stored engineering pattern as validated.

    Args:
        pattern_name: The name of the pattern to validate.

    Returns:
        dict or None: The updated pattern if found, None otherwise.
    """
    def modifier(memory):
        for p in memory.get("patterns", []):
            if p["pattern"] == pattern_name:
                p["validated"] = True
                _update_timestamp(memory)
                return memory
        return memory

    memory = _update_json(PATHS["engineering_memory"], modifier)

    for p in memory.get("patterns", []):
        if p["pattern"] == pattern_name:
            return p

    return None


def find_patterns(
    tags: Optional[List[str]] = None,
    category: Optional[str] = None,
    query: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Find engineering patterns by tags, category, or text search.

    Args:
        tags: Filter by tags (matches any of the provided tags).
        category: Filter by applicable category.
        query: Text search against pattern name and problem description.

    Returns:
        list: Matching pattern dicts.
    """
    memory = _read_json(PATHS["engineering_memory"])
    patterns = memory.get("patterns", [])

    if tags:
        patterns = [
            p for p in patterns
            if any(t in p.get("tags", []) for t in tags)
        ]

    if category:
        patterns = [
            p for p in patterns
            if category in p.get("applicable_categories", [])
        ]

    if query:
        query_lower = query.lower()
        patterns = [
            p for p in patterns
            if query_lower in p.get("pattern", "").lower()
            or query_lower in p.get("problem", "").lower()
        ]

    return patterns


# =============================================================================
# 6. UPDATE METRICS
# =============================================================================

def update_metrics(
    metric_updates: Dict[str, Union[int, float]],
) -> Dict[str, Any]:
    """
    Update specific metric values in METRICS.json.

    Args:
        metric_updates: Dict mapping metric names to new values.
                       Example: {"security_score": 25.0, "completed": 2}

    Returns:
        dict: The full updated metrics data.
    """
    def modifier(metrics):
        for metric_name, value in metric_updates.items():
            if metric_name in metrics.get("metrics", {}):
                metrics["metrics"][metric_name]["value"] = value

        _update_timestamp(metrics)
        return metrics

    return _update_json(PATHS["metrics"], modifier)


def get_metrics() -> Dict[str, Any]:
    """
    Get the current metrics data.

    Returns:
        dict: All metrics with values, descriptions, and units.
    """
    return _read_json(PATHS["metrics"])


def record_metric_trend(metric_name: str, value: Union[int, float]) -> None:
    """
    Record a data point in a metric's trend history.

    Args:
        metric_name: The trend name (e.g., "security_score_trend").
        value: The value to record.
    """
    def modifier(metrics):
        trends = metrics.setdefault("trends", {})
        trend_key = f"{metric_name}_trend" if not metric_name.endswith("_trend") else metric_name
        trend_list = trends.setdefault(trend_key, [])
        trend_list.append({
            "timestamp": _timestamp(),
            "value": value,
        })

        _update_timestamp(metrics)
        return metrics

    _update_json(PATHS["metrics"], modifier)


# =============================================================================
# 7. RETRIEVE DASHBOARD DATA
# =============================================================================

def retrieve_dashboard_data() -> Dict[str, Any]:
    """
    Get the aggregated dashboard data for visualization.

    Returns:
        dict: Dashboard data including overall score, per-category scores,
              task progress, sprint progress, recent activity, and alerts.
    """
    return _read_json(PATHS["dashboard_data"])


# =============================================================================
# 8. WORKFLOW STATE MANAGEMENT
# =============================================================================

def read_workflow_state() -> Dict[str, Any]:
    """
    Get the current workflow state.

    Returns:
        dict: Current phase, running agent, queue, blocked tasks,
              completed tasks, next task, and sprint status.
    """
    return _read_json(PATHS["workflow_state"])


def update_workflow_state(updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update the workflow state.

    Args:
        updates: Dict of fields to update in the workflow state.
                Example: {"running_agent": "developer", "current_stage_index": 4}

    Returns:
        dict: The updated workflow state.
    """
    def modifier(state):
        for key, value in updates.items():
            if key in state:
                state[key] = value

        _update_timestamp(state)
        return state

    return _update_json(PATHS["workflow_state"], modifier)


def advance_workflow_stage() -> Dict[str, Any]:
    """
    Advance the workflow to the next stage in the pipeline.

    Stages: CEO Initiation → Security Audit → Task Planning → Task Dispatch
            → Implementation → Code Review → Validation → Repair
            → Revalidation → CTO Approval

    Returns:
        dict: The updated workflow state.
    """
    def modifier(state):
        workflow = state.get("workflow", {})
        stages = workflow.get("stages", [])
        current_index = workflow.get("current_stage_index", 0)

        if current_index < len(stages) - 1:
            new_index = current_index + 1
            workflow["current_stage_index"] = new_index
            workflow["current_stage"] = stages[new_index]
            state["workflow"] = workflow
            _update_timestamp(state)

        return state

    state = _update_json(PATHS["workflow_state"], modifier)

    workflow = state.get("workflow", {})
    stages = workflow.get("stages", [])
    current_index = workflow.get("current_stage_index", 0)

    if current_index > 0:
        write_log(
            agent="orchestrator",
            task="workflow",
            action="stage_advanced",
            status="IN_PROGRESS",
            detail=f"Workflow advanced to stage {current_index}: {stages[current_index]}"
        )

    return state


# =============================================================================
# 9. AGENT REGISTRY ACCESS
# =============================================================================

def read_agent_registry(
    agent_name: Optional[str] = None,
    can_modify_code: Optional[bool] = None,
    can_approve: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """
    Read agent definitions from the agent registry.

    Args:
        agent_name: Filter by specific agent name.
        can_modify_code: Filter by code modification capability.
        can_approve: Filter by approval capability.

    Returns:
        list: Matching agent definition dicts.
    """
    registry = _read_json(PATHS["agent_registry"])
    agents = registry.get("agents", [])

    if agent_name:
        agents = [a for a in agents if a["agent"] == agent_name]

    if can_modify_code is not None:
        agents = [a for a in agents if a.get("can_modify_code") == can_modify_code]

    if can_approve is not None:
        agents = [a for a in agents if a.get("can_approve") == can_approve]

    return agents


# =============================================================================
# 10. COMPREHENSIVE STATE LOADER
# =============================================================================

def load_all_state() -> Dict[str, Any]:
    """
    Load all orchestration state into a single dict.

    Useful for agents that need a complete picture of the project state.

    Returns:
        dict: Contains all orchestration data under their respective keys.
    """
    return {
        "project_manifest": load_project_state(),
        "task_registry": _read_json(PATHS["task_registry"]),
        "engineering_memory": _read_json(PATHS["engineering_memory"]),
        "metrics": get_metrics(),
        "execution_log": _read_json(PATHS["execution_log"]),
        "agent_registry": _read_json(PATHS["agent_registry"]),
        "workflow_state": read_workflow_state(),
        "dashboard_data": retrieve_dashboard_data(),
    }


# =============================================================================
# 11. RECALCULATE METRICS FROM TASK REGISTRY
# =============================================================================

def recalculate_metrics() -> Dict[str, Any]:
    """
    Recalculate all metrics from the current task registry state.

    This is useful after bulk task updates to ensure metrics are accurate.

    Returns:
        dict: The updated metrics data.
    """
    tasks = read_tasks()
    total = len(tasks)
    completed = len([t for t in tasks if t["status"] == "DONE"])
    failed = len([t for t in tasks if t["status"] == "FAILED"])
    in_progress = len([t for t in tasks if t["status"] in ("ASSIGNED", "IN_PROGRESS")])
    ready = len([t for t in tasks if t["status"] == "READY"])

    security_tasks = [t for t in tasks if t["category"] == "security"]
    security_completed = len([t for t in security_tasks if t["status"] == "DONE"])
    security_score = (security_completed / len(security_tasks) * 100) if security_tasks else 0

    total_estimated = sum(t.get("estimated_hours", 0) for t in tasks)
    completed_estimated = sum(
        t.get("estimated_hours", 0) for t in tasks if t["status"] == "DONE"
    )

    # Count validation and repair attempts
    validation_attempts = []
    repair_attempts = []
    for t in tasks:
        history = t.get("history", [])
        validation_count = len([h for h in history if "validat" in h.get("event", "").lower()])
        repair_count = len([h for h in history if "repair" in h.get("event", "").lower()])
        if validation_count > 0:
            validation_attempts.append(validation_count)
        if repair_count > 0:
            repair_attempts.append(repair_count)

    avg_validation = (
        sum(validation_attempts) / len(validation_attempts)
        if validation_attempts else 0
    )
    avg_repair = (
        sum(repair_attempts) / len(repair_attempts)
        if repair_attempts else 0
    )

    return update_metrics({
        "total_tasks": total,
        "completed": completed,
        "failed": failed,
        "in_progress": in_progress,
        "ready": ready,
        "security_score": round(security_score, 1),
        "average_validation_attempts": round(avg_validation, 1),
        "average_repair_attempts": round(avg_repair, 1),
        "estimated_hours_remaining": total_estimated - completed_estimated,
        "completed_hours": completed_estimated,
    })