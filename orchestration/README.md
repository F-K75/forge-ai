# Orchestration System

> **Status: experimental, not on the production build path.**
> User builds run through `backend/core/orchestrator.py` (dispatched by
> `backend/tasks/build_tasks.py`); nothing in `backend/` imports this
> package's Python code. The only production touchpoint is read-only data:
> `backend/api/admin.py` serves this directory's JSON snapshots (metrics,
> dashboard, benchmark) to the Engineering Health page, which is why
> `docker-compose.yml` mounts it into the backend container. Agent-to-agent
> messaging for builds lives in `backend/core/agent_communication.py`, not
> in `engine/event_bus.py`. Kept for its scheduler/retry/recovery ideas;
> don't wire it into the build pipeline without a design review.

## Overview

The orchestration system manages the AI engineering platform's multi-agent pipeline. It provides task management, agent coordination, workflow automation, and comprehensive monitoring.

## Architecture

```
orchestration/
├── helpers.py                 # Core helper functions for state management
├── api.py                     # FastAPI REST endpoints
├── agent_runtime.py           # Agent runtime orchestration
├── benchmark_runner.py        # Performance benchmarking
├── evidence_collector.py      # Evidence collection for audits
├── knowledge_service.py       # Engineering memory / pattern search
├── storage.py                 # JSON file persistence layer
├── tool_gateway.py            # MCP / tool routing
├── engine/                    # Workflow Engine
│   ├── __init__.py
│   ├── workflow_engine.py     # Main engine orchestrator
│   ├── state_machine.py       # Task state transition enforcement
│   ├── event_bus.py           # Publish/subscribe event system
│   ├── dependency_resolver.py # Prerequisite validation
│   ├── dispatcher.py          # Agent assignment and dispatch
│   ├── scheduler.py           # Task prioritization and scheduling
│   ├── retry_engine.py        # Validation failure handling
│   ├── recovery.py            # State recovery and checkpoints
│   ├── metrics.py             # Performance metrics tracking
│   ├── INTEGRATION.md         # Integration guide
│   ├── ARCHITECTURE.md        # Detailed architecture docs
│   └── API_CHANGES.md         # API documentation
├── tests/
│   └── test_storage.py        # Storage layer tests
├── PROJECT_MANIFEST.json      # Project metadata and configuration
├── TASK_REGISTRY.json         # All tasks with status and dependencies
├── TASK_REGISTRY.json.lock    # Task registry write lock
├── CURRENT_TASK.json          # Currently active task
├── ENGINEERING_MEMORY.json    # Reusable patterns and solutions
├── WORKFLOW_STATE.json        # Current workflow phase and queue
├── WORKFLOW_STATE.json.lock   # Workflow state write lock
├── EXECUTION_LOG.json         # Detailed execution history
├── EXECUTION_LOG.json.lock    # Execution log write lock
├── METRICS.json               # Performance and quality metrics
├── AGENT_REGISTRY.json        # Agent definitions and capabilities
├── AGENT_CONTRACT.md          # Agent interface contract
├── AGENT_RUNTIME_SUMMARY.md   # Runtime execution summary
├── BENCHMARK_REPORT.json      # Benchmark results
├── DASHBOARD_DATA.json        # Aggregated dashboard data
├── PLATFORM_ARCHITECTURE.md   # Platform-level architecture
├── PLATFORM_HARDENING_REPORT.md # Security hardening report
├── OPERATIONAL_READINESS.md   # Operational readiness checklist
├── TESTING_PLAN.md            # Testing strategy and plans
├── SPRINT_0_BACKLOG.json      # Sprint 0 task backlog
├── EXECUTION_PLAN_DETAILED.json # Detailed execution plan
├── EVIDENCE_COLLECTOR_REPORT_PHASE_1.json # Phase 1 evidence
├── PHASE_1_COMPLETION_SUMMARY.json # Phase 1 completion summary
├── VALIDATION_SUMMARY_PHASE_1.json # Phase 1 validation summary
├── SCHEDULER_OUTPUT.json      # Scheduler run output
├── recovery_checkpoint.json.lock # Recovery checkpoint lock
└── IMPLEMENTATION_REPORT_*.json # Per-task implementation reports
```

## Quick Start

### Using the Workflow Engine

```python
from orchestration.engine import start_workflow, get_workflow_engine

# Start the engine (begins automatic task execution)
engine = start_workflow()

# Check if running
print(engine.is_running())  # True

# Get statistics
stats = engine.get_stats()
print(f"Tasks processed: {stats.tasks_processed}")

# Stop when done
from orchestration.engine import stop_workflow
stop_workflow()
```

### Using the REST API

```bash
# Start the engine
curl -X POST http://localhost:8000/orchestration/engine/start

# Check engine state
curl http://localhost:8000/orchestration/engine/state

# Get comprehensive stats
curl http://localhost:8000/orchestration/engine/stats

# Get next task to execute
curl http://localhost:8000/orchestration/engine/next-task

# Stop the engine
curl -X POST http://localhost:8000/orchestration/engine/stop
```

## Core Concepts

### Task Lifecycle

Tasks progress through a defined state machine:

```
READY → ASSIGNED → IN_PROGRESS → UNDER_REVIEW → VALIDATING
    ↓           ↓            ↓              ↓
  (skip)    (skip)      FAILED ←────────┘
              ↓            ↓
           REPAIRING ←────┘
              ↓
          REVALIDATING
              ↓
           APPROVED
              ↓
              DONE
```

**States:**
- `READY`: Task is ready for assignment
- `ASSIGNED`: Task assigned to an agent
- `IN_PROGRESS`: Agent is working on the task
- `UNDER_REVIEW`: Implementation complete, awaiting review
- `VALIDATING`: Validation in progress
- `FAILED`: Validation failed
- `REPAIRING`: Repair work in progress
- `REVALIDATING`: Revalidation after repair
- `APPROVED`: Task approved, ready to close
- `DONE`: Task fully complete

### Agent Types

The system includes specialized agents:

| Agent | Role | Can Modify Code | Can Approve |
|-------|------|----------------|-------------|
| `ceo` | Initiates tasks, makes decisions | No | Yes |
| `security-auditor` | Security audits and validation | No | No |
| `task-planner` | Decomposes goals into tasks | No | No |
| `task-dispatcher` | Assigns tasks to agents | No | No |
| `architect` | System design and blueprints | Yes | No |
| `designer` | UI/UX design | Yes | No |
| `developer` | Code implementation | Yes | No |
| `code-reviewer` | Code review | No | No |
| `validator` | Validation and testing | No | No |
| `repair-agent` | Fixes validation failures | Yes | No |
| `cto` | Final approval authority | No | Yes |
| `orchestrator` | Workflow coordination | No | No |

### Event System

The event bus enables loose coupling between components:

**Event Types:**
- `TASK_ASSIGNED` - Task assigned to agent
- `TASK_STARTED` - Implementation begun
- `TASK_COMPLETED` - Implementation complete
- `VALIDATION_FAILED` - Validation check failed
- `REPAIR_REQUIRED` - Repair cycle initiated
- `TASK_APPROVED` - Task approved
- `TASK_DONE` - Task fully complete
- `STATE_TRANSITION` - Task state changed
- `WORKFLOW_ADVANCED` - Workflow stage changed
- `ERROR` - Error occurred
- `RECOVERY_STARTED` - Recovery initiated
- `RECOVERY_COMPLETED` - Recovery finished

**Subscribing to Events:**

```python
from orchestration.engine import get_event_bus
from orchestration.engine.event_bus import EventType

event_bus = get_event_bus()

def on_task_completed(event):
    print(f"Task {event.task_id} completed!")

event_bus.subscribe(EventType.TASK_COMPLETED, on_task_completed)
```

## Workflow Engine Components

### 1. Task Scheduler

Continuously monitors READY tasks and prioritizes based on:
- **Severity** (Critical, High, Medium, Low)
- **Priority** (P0, P1, P2, P3)
- **Business Impact** (number of blocked tasks)
- **Estimated Effort** (inverse of hours)

### 2. Dependency Resolver

Validates prerequisites:
- All dependent tasks are DONE
- Required agents are available
- No blocking validations are pending

### 3. Agent Dispatcher

Automatically selects agents based on:
- Current task state
- Task category (security, implementation, etc.)
- Agent capabilities (can_modify_code, can_approve)

### 4. Retry Engine

Handles validation failures:
- Automatically initiates repair cycles
- Re-validates after repair
- Retries up to configured maximum (3-5 times)
- Escalates if max retries reached

### 5. Recovery Manager

Provides fault tolerance:
- Automatic checkpoints every 5 minutes
- Restores state from last checkpoint
- Resumes execution without data loss
- Handles unexpected shutdowns

### 6. Metrics Updater

Tracks performance:
- **Velocity**: Tasks completed per day
- **Cycle Time**: Start to completion time
- **Lead Time**: Creation to completion time
- **Success Rate**: Percentage of successful tasks
- **Failure Rate**: Percentage of failed tasks
- **Validation Pass Rate**: Percentage passing validation
- **Repair Rate**: Percentage requiring repair
- **Deployment Readiness**: Composite score (0-100)

## File Formats

### TASK_REGISTRY.json

```json
{
  "tasks": [
    {
      "id": "SEC-001",
      "title": "Task title",
      "category": "security",
      "priority": "P0",
      "severity": "Critical",
      "status": "READY",
      "owner": null,
      "dependencies": ["SEC-002"],
      "blocked_by": [],
      "estimated_hours": 24,
      "started_at": null,
      "completed_at": null,
      "validation_status": "pending",
      "approval_status": "pending",
      "artifacts": {
        "affected_files": ["file1.py", "file2.py"],
        "acceptance_criteria": ["Criterion 1", "Criterion 2"],
        "rollback_plan": "How to revert if needed"
      },
      "history": [
        {
          "timestamp": "2026-06-30T04:03:36+05:30",
          "event": "task_created",
          "detail": "Task registered"
        }
      ]
    }
  ]
}
```

### AGENT_REGISTRY.json

```json
{
  "agents": [
    {
      "agent": "developer",
      "role": "Senior Developer - implements code changes",
      "tools": ["read_file", "write_file", "execute_command"],
      "can_modify_code": true,
      "can_approve": false
    }
  ]
}
```

## Helper Functions

### Reading Data

```python
from orchestration.helpers import (
    read_tasks,           # Read tasks with filtering
    get_task_by_id,       # Get single task
    read_agent_registry,  # Read agent definitions
    get_metrics,          # Get current metrics
    read_workflow_state,  # Get workflow state
    load_project_state,   # Load project manifest
)

# Read all READY tasks
ready_tasks = read_tasks(status_filter="READY")

# Get specific task
task = get_task_by_id("SEC-001")

# Filter by category and priority
security_p0 = read_tasks(category="security", priority="P0")
```

### Updating Data

```python
from orchestration.helpers import (
    update_task,      # Update task fields
    assign_task,      # Assign task to agent
    start_task,       # Mark as in progress
    complete_task,    # Mark as complete
    write_log,        # Write to execution log
    update_metrics,   # Update metrics
    update_workflow_state,  # Update workflow state
)

# Update task status
task = update_task(
    task_id="SEC-001",
    updates={"status": "IN_PROGRESS"},
    history_event="task_started",
    history_detail="Implementation begun"
)

# Assign to agent
task = assign_task("SEC-001", "developer")

# Log action
write_log(
    agent="developer",
    task="SEC-001",
    action="file_modified",
    status="IN_PROGRESS",
    detail="Modified backend/api/auth.py"
)
```

### Engineering Memory

```python
from orchestration.helpers import (
    store_engineering_knowledge,  # Store pattern
    find_patterns,                # Search patterns
    validate_pattern,             # Mark as validated
)

# Store a pattern
store_engineering_knowledge(
    pattern="atomic_database_update",
    problem="Race condition in database updates",
    solution=["Use find_one_and_update", "Add guard condition"],
    files=["backend/api/builds.py"],
    created_from_task="SEC-004",
    tags=["database", "concurrency"],
    applicable_categories=["security", "backend"]
)

# Find patterns
patterns = find_patterns(
    tags=["database"],
    category="security",
    query="race condition"
)
```

## API Reference

See [API_CHANGES.md](./engine/API_CHANGES.md) for complete API documentation.

### Existing Endpoints

All existing orchestration endpoints remain unchanged:

- `GET /orchestration/project` - Project manifest
- `GET /orchestration/tasks` - List tasks
- `GET /orchestration/tasks/{task_id}` - Get task
- `PUT /orchestration/tasks/{task_id}` - Update task
- `POST /orchestration/tasks/{task_id}/assign` - Assign task
- `POST /orchestration/log` - Write log entry
- `GET /orchestration/metrics` - Get metrics
- `GET /orchestration/dashboard` - Get dashboard data
- `GET /orchestration/agents` - List agents
- `GET /orchestration/state` - Full state dump

### New Engine Endpoints

- `POST /orchestration/engine/start` - Start engine
- `POST /orchestration/engine/stop` - Stop engine
- `POST /orchestration/engine/pause` - Pause engine
- `POST /orchestration/engine/resume` - Resume engine
- `GET /orchestration/engine/state` - Get engine state
- `GET /orchestration/engine/stats` - Get all stats
- `GET /orchestration/engine/next-task` - Get next task
- `POST /orchestration/engine/tasks/{task_id}/dispatch` - Dispatch task
- `GET /orchestration/engine/tasks/{task_id}/dependencies` - Check dependencies
- `POST /orchestration/engine/recovery/checkpoint` - Create checkpoint
- `POST /orchestration/engine/recovery/trigger` - Trigger recovery
- `GET /orchestration/engine/metrics/summary` - Get metrics summary

## Extensibility

### Adding New Agents

1. Register in `AGENT_REGISTRY.json`:

```json
{
  "agent": "my-agent",
  "role": "My custom agent",
  "tools": ["read_task_registry", "write_log"],
  "can_modify_code": false,
  "can_approve": false
}
```

2. Refresh registry:

```bash
curl -X POST http://localhost:8000/orchestration/engine/agents/refresh
```

3. Agent is automatically discovered and used

### Adding New Metrics

1. Add calculation method to `MetricsUpdater` class
2. Call from `update_all_metrics()`
3. Metric is automatically tracked and trended

## Monitoring

### Key Metrics

- Engine state (RUNNING/PAUSED/ERROR)
- Active task count
- Queue depth (READY tasks)
- Validation pass rate
- Repair rate
- Deployment readiness score

### Health Checks

```bash
# Engine running?
curl http://localhost:8000/orchestration/engine/state

# Component stats?
curl http://localhost:8000/orchestration/engine/stats

# Recent events?
curl http://localhost:8000/orchestration/engine/events

# Checkpoint available?
curl http://localhost:8000/orchestration/engine/recovery/checkpoint
```

## Troubleshooting

### Engine Issues

1. Check engine state: `GET /orchestration/engine/state`
2. Review execution log: `orchestration/EXECUTION_LOG.json`
3. Check event history: `GET /orchestration/engine/events`
4. Verify agent registry: `GET /orchestration/agents`

### Task Issues

1. Check dependencies: `GET /orchestration/engine/tasks/{task_id}/dependencies`
2. Review task history in `TASK_REGISTRY.json`
3. Check retry history: `GET /orchestration/engine/tasks/{task_id}/retry-history`
4. Verify agent capabilities: `GET /orchestration/engine/agents/{agent_name}/capabilities`

### Performance Issues

1. Review metrics: `GET /orchestration/engine/metrics/summary`
2. Check scheduler stats: `GET /orchestration/engine/stats`
3. Monitor validation pass rate
4. Review repair rate trends

## Development

### Running Tests

```bash
# Run all tests
pytest orchestration/

# Run specific component tests
pytest orchestration/engine/test_state_machine.py
pytest orchestration/engine/test_event_bus.py
```

### Adding Features

1. Review architecture: `orchestration/engine/ARCHITECTURE.md`
2. Follow existing patterns in engine components
3. Add comprehensive tests
4. Update API documentation
5. Update this README

## Contributing

When contributing to the orchestration system:

1. Follow the existing architecture patterns
2. Maintain backward compatibility
3. Add comprehensive error handling
4. Log all significant events
5. Update metrics for new features
6. Document API changes
7. Add sequence diagrams for new flows

## License

Part of the forge-ai platform.