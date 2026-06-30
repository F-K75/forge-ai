# API Changes for Workflow Engine

## Overview

This document describes all API changes required to support the new Workflow Engine. The changes include new endpoints for engine control, component management, and monitoring, as well as updates to existing endpoints to integrate with the workflow engine.

## New API Endpoints

### 1. Workflow Engine Control

#### Start Workflow Engine
```http
POST /orchestration/engine/start
```

**Description:** Starts the workflow engine. This begins automatic task scheduling, dispatching, and execution.

**Response:**
```json
{
  "status": "started",
  "engine_state": "RUNNING",
  "message": "Workflow engine started successfully",
  "timestamp": "2026-06-30T04:30:00+05:30"
}
```

**Errors:**
- `409 Conflict`: Engine is already running
- `500 Internal Server Error`: Failed to start engine

---

#### Stop Workflow Engine
```http
POST /orchestration/engine/stop
```

**Description:** Stops the workflow engine gracefully. Creates a final checkpoint before stopping.

**Response:**
```json
{
  "status": "stopped",
  "engine_state": "STOPPED",
  "message": "Workflow engine stopped successfully",
  "timestamp": "2026-06-30T04:35:00+05:30"
}
```

**Errors:**
- `409 Conflict`: Engine is not running
- `500 Internal Server Error`: Failed to stop engine

---

#### Pause Workflow Engine
```http
POST /orchestration/engine/pause
```

**Description:** Pauses the workflow engine. No new tasks will be scheduled, but active tasks continue.

**Response:**
```json
{
  "status": "paused",
  "engine_state": "PAUSED",
  "message": "Workflow engine paused",
  "timestamp": "2026-06-30T04:40:00+05:30"
}
```

---

#### Resume Workflow Engine
```http
POST /orchestration/engine/resume
```

**Description:** Resumes a paused workflow engine.

**Response:**
```json
{
  "status": "resumed",
  "engine_state": "RUNNING",
  "message": "Workflow engine resumed",
  "timestamp": "2026-06-30T04:45:00+05:30"
}
```

---

### 2. Engine Status and Statistics

#### Get Engine State
```http
GET /orchestration/engine/state
```

**Description:** Get the current state of the workflow engine.

**Response:**
```json
{
  "state": "RUNNING",
  "tasks_processed": 42,
  "tasks_completed": 38,
  "tasks_failed": 2,
  "active_tasks": 3,
  "uptime_seconds": 3600.5,
  "last_task_processed": "SEC-004",
  "start_time": "2026-06-30T04:00:00+05:30",
  "current_task": "SEC-005"
}
```

---

#### Get Engine Statistics
```http
GET /orchestration/engine/stats
```

**Description:** Get comprehensive statistics from all engine components.

**Response:**
```json
{
  "engine": {
    "state": "RUNNING",
    "tasks_processed": 42,
    "tasks_completed": 38,
    "tasks_failed": 2,
    "active_tasks": 3,
    "uptime_seconds": 3600.5,
    "last_task_processed": "SEC-004",
    "start_time": "2026-06-30T04:00:00+05:30",
    "current_task": "SEC-005"
  },
  "scheduler": {
    "running": true,
    "total_ready_tasks": 15,
    "executable_tasks": 10,
    "blocked_tasks": 5,
    "scheduled_queue_size": 10,
    "poll_interval_seconds": 5
  },
  "dispatcher": {
    "total_agents": 11,
    "code_modifying_agents": 5,
    "approval_agents": 2,
    "agent_names": [
      "ceo",
      "security-auditor",
      "task-planner",
      "task-dispatcher",
      "architect",
      "designer",
      "developer",
      "code-reviewer",
      "validator",
      "repair-agent",
      "cto"
    ]
  },
  "retry_engine": {
    "tasks_with_retries": 3,
    "total_attempts": 7,
    "repair_attempts": 4,
    "validation_attempts": 3,
    "task_ids": ["SEC-010", "SEC-015", "SEC-020"]
  },
  "recovery_manager": {
    "state": "HEALTHY",
    "has_checkpoint": true,
    "checkpoint_info": {
      "checkpoint_id": "ckpt-1719651234.567",
      "timestamp": "2026-06-30T04:15:00+05:30",
      "active_tasks_count": 8,
      "completed_tasks_count": 2,
      "failed_tasks_count": 0,
      "active_task_ids": ["SEC-001", "SEC-003", "SEC-004"]
    }
  },
  "metrics_updater": {
    "last_update": "2026-06-30T04:30:00+05:30",
    "tracked_tasks": 15,
    "event_subscriptions": 3
  },
  "event_bus": {
    "total_events": 156,
    "subscriber_counts": {
      "TASK_ASSIGNED": 2,
      "TASK_STARTED": 1,
      "TASK_COMPLETED": 3,
      "VALIDATION_FAILED": 2,
      "REPAIR_REQUIRED": 2,
      "TASK_APPROVED": 2,
      "ERROR": 1
    },
    "recent_events": []
  }
}
```

---

### 3. Task Scheduling and Dispatch

#### Get Next Task
```http
GET /orchestration/engine/next-task
```

**Description:** Get the highest priority task ready for execution.

**Response:**
```json
{
  "id": "SEC-001",
  "title": "Remove Docker-in-Docker and unmount Docker socket from production",
  "priority": "P0",
  "severity": "Critical",
  "status": "READY",
  "estimated_hours": 24,
  "blocking_count": 4,
  "score": 285
}
```

**Errors:**
- `404 Not Found`: No tasks are ready for execution

---

#### Dispatch Task
```http
POST /orchestration/engine/tasks/{task_id}/dispatch
```

**Description:** Manually dispatch a task to its assigned agent.

**Response:**
```json
{
  "task_id": "SEC-001",
  "success": true,
  "agent_name": "developer",
  "agent_category": "Senior Developer - implements code changes",
  "action": "assign",
  "timestamp": "2026-06-30T04:50:00+05:30"
}
```

**Errors:**
- `404 Not Found`: Task not found
- `400 Bad Request`: Invalid task state or no suitable agent
- `409 Conflict`: Task is not in READY state

---

#### Get Scheduled Tasks
```http
GET /orchestration/engine/scheduled-tasks
```

**Description:** Get list of tasks in priority order.

**Response:**
```json
{
  "scheduled_tasks": [
    {
      "position": 1,
      "task_id": "SEC-001",
      "priority": "P0",
      "severity": "Critical",
      "score": 285,
      "blocking_count": 4
    },
    {
      "position": 2,
      "task_id": "SEC-004",
      "priority": "P0",
      "severity": "Critical",
      "score": 220,
      "blocking_count": 0
    }
  ],
  "total_count": 10,
  "executable_count": 7,
  "blocked_count": 3
}
```

---

### 4. Dependency Management

#### Check Task Dependencies
```http
GET /orchestration/engine/tasks/{task_id}/dependencies
```

**Description:** Check if a task's dependencies are satisfied.

**Response:**
```json
{
  "task_id": "SEC-001",
  "satisfied": true,
  "missing_dependencies": [],
  "blocking_dependencies": [],
  "warnings": [],
  "timestamp": "2026-06-30T04:55:00+05:30"
}
```

**Example with blocked dependencies:**
```json
{
  "task_id": "SEC-003",
  "satisfied": false,
  "missing_dependencies": [
    {
      "type": "task",
      "target": "SEC-001",
      "required": true,
      "description": "Task SEC-001 is IN_PROGRESS, not DONE"
    }
  ],
  "blocking_dependencies": [
    {
      "type": "task",
      "target": "SEC-001",
      "required": true,
      "description": "Task SEC-001 not completed"
    }
  ],
  "warnings": [],
  "timestamp": "2026-06-30T04:55:00+05:30"
}
```

---

#### Get Dependency Chain
```http
GET /orchestration/engine/tasks/{task_id}/dependency-chain
```

**Description:** Get the full dependency chain for a task.

**Response:**
```json
{
  "task_id": "SEC-003",
  "chain": [
    "SEC-001",
    "SEC-003"
  ],
  "total_depth": 2
}
```

---

### 5. State Machine Management

#### Get Valid Transitions
```http
GET /orchestration/engine/state-machine/transitions/{current_state}
```

**Description:** Get all valid state transitions from a given state.

**Response:**
```json
{
  "current_state": "READY",
  "valid_transitions": [
    {
      "from_state": "READY",
      "to_state": "ASSIGNED",
      "trigger": "assign",
      "description": "Task assigned to agent"
    }
  ]
}
```

---

#### Transition Task State
```http
POST /orchestration/engine/tasks/{task_id}/transition
```

**Description:** Manually transition a task to a new state.

**Request Body:**
```json
{
  "to_state": "ASSIGNED",
  "trigger": "manual_assign"
}
```

**Response:**
```json
{
  "id": "SEC-001",
  "status": "ASSIGNED",
  "owner": "developer",
  "history": [
    {
      "timestamp": "2026-06-30T05:00:00+05:30",
      "event": "state_transition_manual_assign",
      "detail": "Task assigned to agent"
    }
  ]
}
```

**Errors:**
- `400 Bad Request`: Invalid state transition
- `404 Not Found`: Task not found

---

### 6. Retry Management

#### Handle Validation Failure
```http
POST /orchestration/engine/tasks/{task_id}/retry
```

**Description:** Initiate a repair cycle for a failed validation.

**Request Body:**
```json
{
  "validation_result": {
    "status": "FAIL",
    "details": "Security vulnerability not fixed",
    "remaining_risks": ["SQL injection risk remains"]
  },
  "max_retries": 3
}
```

**Response:**
```json
{
  "task_id": "SEC-010",
  "success": false,
  "attempts": [
    {
      "attempt_number": 1,
      "task_id": "SEC-010",
      "action": "repair",
      "status": "initiated",
      "timestamp": "2026-06-30T05:05:00+05:30",
      "detail": "Starting repair attempt 1/3"
    }
  ],
  "final_status": "REPAIR_INITIATED",
  "should_escalate": false,
  "timestamp": "2026-06-30T05:05:00+05:30"
}
```

---

#### Get Retry History
```http
GET /orchestration/engine/tasks/{task_id}/retry-history
```

**Response:**
```json
{
  "task_id": "SEC-010",
  "attempts": [
    {
      "attempt_number": 1,
      "task_id": "SEC-010",
      "action": "repair",
      "status": "completed",
      "timestamp": "2026-06-30T04:30:00+05:30",
      "detail": "Repair completed: Fixed SQL injection"
    },
    {
      "attempt_number": 2,
      "task_id": "SEC-010",
      "action": "validate",
      "status": "failed",
      "timestamp": "2026-06-30T04:35:00+05:30",
      "detail": "Validation failed: XSS vulnerability found"
    }
  ],
  "total_attempts": 2
}
```

---

### 7. Recovery Management

#### Create Checkpoint
```http
POST /orchestration/engine/recovery/checkpoint
```

**Description:** Manually create a recovery checkpoint.

**Request Body:**
```json
{
  "metadata": {
    "reason": "pre_deployment",
    "created_by": "admin"
  }
}
```

**Response:**
```json
{
  "checkpoint_id": "ckpt-1719651234.567",
  "timestamp": "2026-06-30T05:10:00+05:30",
  "active_tasks_count": 8,
  "completed_tasks_count": 2,
  "failed_tasks_count": 0,
  "message": "Checkpoint created successfully"
}
```

---

#### Trigger Recovery
```http
POST /orchestration/engine/recovery/trigger
```

**Description:** Manually trigger recovery from the latest checkpoint.

**Response:**
```json
{
  "success": true,
  "state": "RECOVERED",
  "recovered_tasks": ["SEC-001", "SEC-003", "SEC-004"],
  "failed_recoveries": [],
  "message": "Recovery successful. 3 tasks restored for execution.",
  "timestamp": "2026-06-30T05:15:00+05:30"
}
```

---

#### Get Checkpoint Info
```http
GET /orchestration/engine/recovery/checkpoint
```

**Response:**
```json
{
  "checkpoint_id": "ckpt-1719651234.567",
  "timestamp": "2026-06-30T05:10:00+05:30",
  "active_tasks_count": 8,
  "completed_tasks_count": 2,
  "failed_tasks_count": 0,
  "active_task_ids": [
    "SEC-001",
    "SEC-003",
    "SEC-004",
    "SEC-005",
    "SEC-006",
    "SEC-007",
    "SEC-008",
    "SEC-009"
  ]
}
```

---

### 8. Metrics Management

#### Get Metrics Summary
```http
GET /orchestration/engine/metrics/summary
```

**Response:**
```json
{
  "velocity": 0.25,
  "cycle_time": 0.04,
  "lead_time": 0.92,
  "success_rate": 96.0,
  "failure_rate": 4.0,
  "validation_pass_rate": 85.0,
  "repair_rate": 15.0,
  "deployment_readiness": 15.4,
  "last_updated": "2026-06-30T05:20:00+05:30"
}
```

---

#### Update Metrics
```http
POST /orchestration/engine/metrics/update
```

**Description:** Manually trigger metrics recalculation.

**Response:**
```json
{
  "metrics_version": "1.0.0",
  "updated_at": "2026-06-30T05:25:00+05:30",
  "metrics": {
    "velocity": {
      "value": 0.25,
      "description": "Tasks completed per day",
      "unit": "tasks_per_day"
    },
    "deployment_readiness": {
      "value": 15.4,
      "description": "Overall deployment readiness score",
      "unit": "percentage"
    }
  }
}
```

---

#### Get Metrics Trends
```http
GET /orchestration/engine/metrics/trends/{metric_name}
```

**Query Parameters:**
- `limit` (optional): Maximum number of data points (default: 20)

**Response:**
```json
[
  {
    "timestamp": "2026-06-30T03:53:23+05:30",
    "value": 3.8
  },
  {
    "timestamp": "2026-06-30T04:00:00+05:30",
    "value": 5.2
  },
  {
    "timestamp": "2026-06-30T04:15:00+05:30",
    "value": 8.1
  }
]
```

---

### 9. Event Management

#### Get Event History
```http
GET /orchestration/engine/events
```

**Query Parameters:**
- `event_type` (optional): Filter by event type
- `task_id` (optional): Filter by task ID
- `limit` (optional): Maximum events to return (default: 100)

**Response:**
```json
{
  "events": [
    {
      "event_id": "evt-1719651234.567",
      "event_type": "TASK_ASSIGNED",
      "task_id": "SEC-001",
      "agent": "developer",
      "timestamp": "2026-06-30T05:30:00+05:30",
      "data": {
        "action": "assign"
      }
    }
  ],
  "total_count": 156,
  "filtered_count": 10
}
```

---

#### Subscribe to Events (WebSocket)
```http
WS /orchestration/engine/events/ws
```

**Description:** WebSocket endpoint for real-time event streaming.

**Message Format (Server → Client):**
```json
{
  "event_type": "TASK_ASSIGNED",
  "task_id": "SEC-001",
  "agent": "developer",
  "timestamp": "2026-06-30T05:30:00+05:30",
  "data": {
    "action": "assign"
  }
}
```

**Subscription Request (Client → Server):**
```json
{
  "action": "subscribe",
  "event_types": [
    "TASK_ASSIGNED",
    "TASK_COMPLETED",
    "VALIDATION_FAILED"
  ]
}
```

---

### 10. Agent Management

#### Refresh Agent Registry
```http
POST /orchestration/engine/agents/refresh
```

**Description:** Refresh the agent registry from disk. Use this after adding new agents to AGENT_REGISTRY.json.

**Response:**
```json
{
  "status": "success",
  "total_agents": 12,
  "agent_names": [
    "ceo",
    "security-auditor",
    "task-planner",
    "task-dispatcher",
    "architect",
    "designer",
    "developer",
    "code-reviewer",
    "validator",
    "repair-agent",
    "cto",
    "orchestrator"
  ],
  "timestamp": "2026-06-30T05:35:00+05:30"
}
```

---

#### Get Agent Capabilities
```http
GET /orchestration/engine/agents/{agent_name}/capabilities
```

**Response:**
```json
{
  "agent_name": "developer",
  "can_modify_code": true,
  "can_approve": false,
  "tools": [
    "read_task_registry",
    "read_engineering_memory",
    "write_log",
    "update_task",
    "read_file",
    "list_files",
    "search_files",
    "write_file",
    "replace_in_file",
    "execute_command"
  ],
  "role": "Senior Developer - implements code changes, writes files, patches bugs, refactors code"
}
```

---

## Modified API Endpoints

### 1. Task Status Updates

**Endpoint:** `PUT /orchestration/tasks/{task_id}`

**Change:** Added automatic event publishing when task status changes.

**New Behavior:**
- When task status is updated via this endpoint, the engine automatically:
  - Validates the state transition
  - Publishes appropriate events
  - Updates metrics
  - Logs the change

**Example Request:**
```json
{
  "updates": {
    "status": "IN_PROGRESS"
  },
  "history_event": "task_started",
  "history_detail": "Implementation begun"
}
```

**Example Response:**
```json
{
  "id": "SEC-001",
  "status": "IN_PROGRESS",
  "owner": "developer",
  "started_at": "2026-06-30T05:40:00+05:30",
  "history": [
    {
      "timestamp": "2026-06-30T05:40:00+05:30",
      "event": "task_started",
      "detail": "Implementation begun"
    },
    {
      "timestamp": "2026-06-30T05:40:00+05:30",
      "event": "state_transition_start",
      "detail": "READY → IN_PROGRESS via start"
    }
  ]
}
```

---

### 2. Task Assignment

**Endpoint:** `POST /orchestration/tasks/{task_id}/assign`

**Change:** Now integrates with the dispatcher for intelligent agent selection.

**New Behavior:**
- Validates task is in READY state
- Checks dependencies are satisfied
- Selects appropriate agent based on task category
- Updates task status to ASSIGNED
- Publishes TASK_ASSIGNED event

**Query Parameters:**
- `agent_name` (optional): Override automatic agent selection

**Example:**
```http
POST /orchestration/tasks/SEC-001/assign?agent_name=developer
```

---

### 3. Metrics Recalculation

**Endpoint:** `POST /orchestration/metrics/recalculate`

**Change:** Now triggers event bus notifications.

**New Behavior:**
- Recalculates all metrics
- Publishes METRICS_UPDATED event
- Records trend data
- Notifies all metrics subscribers

**Response:**
```json
{
  "metrics_version": "1.0.0",
  "updated_at": "2026-06-30T05:45:00+05:30",
  "recalculation_triggered": true,
  "events_published": 5
}
```

---

## New Helper Functions

### Engine Control

```python
from orchestration.engine import get_workflow_engine, start_workflow, stop_workflow

# Get engine instance
engine = get_workflow_engine()

# Start engine
engine = start_workflow()

# Stop engine
stop_workflow()

# Check if running
if engine.is_running():
    print("Engine is running")

# Get stats
stats = engine.get_stats()
print(f"Tasks processed: {stats.tasks_processed}")

# Get component stats
all_stats = engine.get_component_stats()
```

---

### Direct Component Access

```python
from orchestration.engine import (
    get_state_machine,
    get_event_bus,
    get_workflow_engine
)

# State machine
sm = get_state_machine()
sm.transition("SEC-001", TaskState.ASSIGNED)

# Event bus
eb = get_event_bus()
eb.subscribe(EventType.TASK_COMPLETED, my_handler)
eb.publish_event(EventType.TASK_COMPLETED, task_id="SEC-001")

# Workflow engine
engine = get_workflow_engine()
engine.pause()
engine.resume()
engine.trigger_recovery()
engine.update_metrics()
```

---

## Breaking Changes

### None

All changes are backward compatible. Existing code will continue to work without modification. The workflow engine is opt-in via the new endpoints and helper functions.

---

## Migration Guide

### For Existing Agents

No changes required. Existing agents continue to work as before. The workflow engine enhances the system without breaking existing functionality.

### To Enable Workflow Engine

1. **Import the engine:**
```python
from orchestration.engine import start_workflow
```

2. **Start the engine:**
```python
engine = start_workflow()
```

3. **Monitor via API:**
```bash
# Check engine state
curl http://localhost:8000/orchestration/engine/state

# Get statistics
curl http://localhost:8000/orchestration/engine/stats
```

### To Add New Agents

1. **Register in AGENT_REGISTRY.json:**
```json
{
  "agent": "my-new-agent",
  "role": "My custom agent",
  "tools": ["read_task_registry", "write_log"],
  "can_modify_code": false,
  "can_approve": false
}
```

2. **Refresh agent registry:**
```bash
curl -X POST http://localhost:8000/orchestration/engine/agents/refresh
```

3. **Agent is automatically discovered** and used by the dispatcher

---

## Rate Limits

All new endpoints have the following rate limits:
- **Read endpoints**: 100 requests/minute
- **Write endpoints**: 30 requests/minute
- **WebSocket connections**: 10 concurrent connections per user

---

## Authentication

All new endpoints require the same authentication as existing orchestration endpoints. See `orchestration/api.py` for authentication details.

---

## Webhooks

The event bus supports webhook notifications for external systems:

```http
POST /orchestration/engine/webhooks
```

**Request Body:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["TASK_COMPLETED", "TASK_FAILED"],
  "secret": "webhook_secret_key"
}
```

The webhook will receive POST requests with event data whenever subscribed events occur.

---

## SDK Support

### Python SDK

```python
from orchestration.engine import WorkflowEngine

# Initialize
engine = WorkflowEngine(auto_start=True)

# Monitor tasks
def on_task_completed(event):
    print(f"Task {event.task_id} completed!")

engine.event_bus.subscribe(
    EventType.TASK_COMPLETED,
    on_task_completed
)

# Get next task
next_task = engine.get_next_task()
if next_task:
    print(f"Next task: {next_task['id']}")
```

### REST API Client

```python
import requests

BASE_URL = "http://localhost:8000/orchestration"

# Start engine
response = requests.post(f"{BASE_URL}/engine/start")

# Get stats
stats = requests.get(f"{BASE_URL}/engine/stats").json()

# Dispatch task
response = requests.post(
    f"{BASE_URL}/engine/tasks/SEC-001/dispatch"
).json()
```

---

## Troubleshooting

### Engine Won't Start

**Check:**
1. Engine state: `GET /orchestration/engine/state`
2. Recovery checkpoint: `GET /orchestration/engine/recovery/checkpoint`
3. Agent registry: `GET /orchestration/agents`
4. Event bus: Check logs for errors

### Tasks Not Being Scheduled

**Check:**
1. Scheduler status: `GET /orchestration/engine/stats`
2. Ready tasks: `GET /orchestration/tasks?status_filter=READY`
3. Dependencies: `GET /orchestration/engine/tasks/{task_id}/dependencies`
4. Engine state: Must be RUNNING

### High Failure Rate

**Check:**
1. Retry history: `GET /orchestration/engine/tasks/{task_id}/retry-history`
2. Validation results: Check task history in TASK_REGISTRY.json
3. Agent capabilities: `GET /orchestration/engine/agents/{agent_name}/capabilities`
4. Metrics: `GET /orchestration/engine/metrics/summary`

---

## Support

For issues or questions:
1. Check the architecture documentation: `orchestration/engine/ARCHITECTURE.md`
2. Review execution logs: `orchestration/EXECUTION_LOG.json`
3. Examine event history: `GET /orchestration/engine/events`
4. Check component stats: `GET /orchestration/engine/stats`