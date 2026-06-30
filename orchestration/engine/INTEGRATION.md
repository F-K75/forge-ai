# Workflow Engine Integration Guide

## Overview

This guide shows how to integrate the Workflow Engine with the existing orchestration system and backend API.

## Integration with Existing API

### Option 1: Direct Python Integration

Add the workflow engine to your FastAPI application:

```python
# backend/main.py or orchestration/api.py

from orchestration.engine import get_workflow_engine, start_workflow, stop_workflow
from fastapi import APIRouter

router = APIRouter()

# Engine control endpoints
@router.post("/engine/start")
async def start_engine():
    """Start the workflow engine."""
    engine = start_workflow()
    return {
        "status": "started",
        "engine_state": engine.get_state().value
    }

@router.post("/engine/stop")
async def stop_engine():
    """Stop the workflow engine."""
    stop_workflow()
    return {"status": "stopped"}

@router.get("/engine/state")
async def get_engine_state():
    """Get engine state."""
    engine = get_workflow_engine()
    stats = engine.get_stats()
    return stats.__dict__

@router.get("/engine/stats")
async def get_engine_stats():
    """Get comprehensive engine statistics."""
    engine = get_workflow_engine()
    return engine.get_component_stats()
```

### Option 2: Background Service

Run the engine as a background service:

```python
# backend/services/workflow_service.py

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from orchestration.engine import start_workflow, stop_workflow, get_workflow_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage workflow engine lifecycle."""
    # Startup
    engine = start_workflow()
    print(f"Workflow engine started: {engine.get_state().value}")
    
    yield
    
    # Shutdown
    stop_workflow()
    print("Workflow engine stopped")

app = FastAPI(lifespan=lifespan)

# Your existing routes...
```

### Option 3: Manual Control

Manually control the engine for specific workflows:

```python
from orchestration.engine import WorkflowEngine

# Create engine instance
engine = WorkflowEngine(auto_start=False)

# Manually process tasks
next_task = engine.get_next_task()
if next_task:
    print(f"Next task: {next_task['id']}")
    
    # Dispatch to agent
    from orchestration.engine import get_workflow_engine
    engine = get_workflow_engine()
    result = engine.dispatcher.dispatch(next_task['id'])
    print(f"Dispatched to: {result.agent_name}")

# Update metrics
metrics = engine.update_metrics()
print(f"Deployment readiness: {metrics['deployment_readiness']}%")
```

## Integration with Existing Agents

### Enhancing Existing Agents

Existing agents can subscribe to workflow events:

```python
# backend/agents/developer.py

from orchestration.engine import get_event_bus
from orchestration.engine.event_bus import EventType

class DeveloperAgent:
    def __init__(self):
        self.event_bus = get_event_bus()
        self._setup_event_handlers()
    
    def _setup_event_handlers(self):
        """Subscribe to relevant events."""
        self.event_bus.subscribe(
            EventType.TASK_ASSIGNED,
            self.on_task_assigned
        )
        self.event_bus.subscribe(
            EventType.TASK_STARTED,
            self.on_task_started
        )
    
    def on_task_assigned(self, event):
        """Handle task assignment."""
        if event.task_id:
            print(f"New task assigned: {event.task_id}")
            self.start_work(event.task_id)
    
    def on_task_started(self, event):
        """Handle task start."""
        if event.task_id:
            print(f"Starting work on: {event.task_id}")
```

### Agent Registry Integration

The dispatcher automatically uses agents from `AGENT_REGISTRY.json`:

```python
# No code changes needed!
# Just add your agent to AGENT_REGISTRY.json:

{
  "agent": "custom-agent",
  "role": "My custom agent",
  "tools": ["read_file", "write_file"],
  "can_modify_code": true,
  "can_approve": false
}

# Then refresh:
from orchestration.engine import get_workflow_engine
engine = get_workflow_engine()
engine.dispatcher.refresh_registry()
```

## Integration with Task Registry

### Automatic Task Processing

The engine automatically processes tasks from `TASK_REGISTRY.json`:

```python
# Tasks are automatically:
# 1. Read from TASK_REGISTRY.json
# 2. Filtered by status (READY)
# 3. Validated for dependencies
# 4. Prioritized by score
# 5. Dispatched to agents
# 6. State transitions tracked
# 7. Metrics updated

# You can also manually trigger processing:
from orchestration.engine import get_workflow_engine

engine = get_workflow_engine()

# Get next task
next_task = engine.scheduler.get_next_task()
if next_task:
    print(f"Next: {next_task['id']} - Score: {next_task.get('score')}")
```

### Task Status Updates

When tasks are updated, the engine automatically:
- Validates state transitions
- Publishes events
- Updates metrics
- Logs changes

```python
from orchestration.helpers import update_task

# Update task - engine handles the rest
task = update_task(
    task_id="SEC-001",
    updates={"status": "IN_PROGRESS"},
    history_event="task_started"
)
# Event bus automatically publishes TASK_STARTED
# Metrics updater records timing
# State machine validates transition
```

## Integration with Metrics

### Automatic Metrics Updates

The metrics updater automatically tracks:
- Task completion times
- Validation pass rates
- Repair frequencies
- Overall deployment readiness

```python
from orchestration.engine import get_workflow_engine

engine = get_workflow_engine()

# Get current metrics
summary = engine.metrics_updater.get_metrics_summary()
print(f"Velocity: {summary['velocity']} tasks/day")
print(f"Readiness: {summary['deployment_readiness']}%")

# Manually trigger update
engine.update_metrics()
```

### Custom Metrics

Add custom metrics by extending `MetricsUpdater`:

```python
from orchestration.engine.metrics import MetricsUpdater

class CustomMetricsUpdater(MetricsUpdater):
    def calculate_custom_metric(self):
        """Your custom metric calculation."""
        tasks = read_tasks()
        # Your logic here
        return value
    
    def update_all_metrics(self):
        """Override to add custom metrics."""
        # Call parent
        super().update_all_metrics()
        
        # Add custom metrics
        custom_value = self.calculate_custom_metric()
        update_metrics({"custom_metric": custom_value})
```

## Integration with Event Bus

### Publishing Events

Publish events from your code:

```python
from orchestration.engine import get_event_bus
from orchestration.engine.event_bus import EventType

event_bus = get_event_bus()

# Publish custom event
event_bus.publish_event(
    EventType.TASK_COMPLETED,
    task_id="SEC-001",
    agent="developer",
    files_changed=["file1.py", "file2.py"],
    lines_added=150,
    lines_removed=20
)
```

### Subscribing to Events

Subscribe to events in your application:

```python
event_bus = get_event_bus()

def on_validation_failed(event):
    """Handle validation failures."""
    print(f"Validation failed for {event.task_id}")
    # Send notification
    # Create alert
    # Update dashboard

event_bus.subscribe(
    EventType.VALIDATION_FAILED,
    on_validation_failed
)

def on_task_done(event):
    """Handle task completion."""
    print(f"Task {event.task_id} is done!")
    # Update dashboard
    # Send notification
    # Trigger deployment

event_bus.subscribe(EventType.TASK_DONE, on_task_done)
```

## Integration with Recovery

### Automatic Recovery

The engine automatically recovers on startup if a checkpoint exists:

```python
from orchestration.engine import start_workflow

# If checkpoint exists, recovery happens automatically
engine = start_workflow()

# Check recovery status
stats = engine.get_component_stats()
recovery_info = stats['recovery_manager']
print(f"Recovered: {recovery_info['checkpoint_info']}")
```

### Manual Recovery

Trigger recovery manually:

```python
from orchestration.engine import get_workflow_engine

engine = get_workflow_engine()

# Create checkpoint before risky operation
engine.recovery_manager.create_checkpoint(
    metadata={"reason": "before_deployment"}
)

# ... perform risky operation ...

# If something goes wrong, recover
result = engine.recovery_manager.recover()
print(f"Recovered {len(result.recovered_tasks)} tasks")
```

## Integration with State Machine

### Validating Transitions

Validate state transitions before making changes:

```python
from orchestration.engine import get_state_machine
from orchestration.engine.state_machine import TaskState

sm = get_state_machine()

# Check if transition is valid
is_valid = sm.is_valid_transition(
    TaskState.READY,
    TaskState.ASSIGNED
)
print(f"Valid transition: {is_valid}")

# Get valid transitions from current state
task_status = "READY"
current_state = TaskState[task_status]
transitions = sm.get_valid_transitions(current_state)

for t in transitions:
    print(f"Can go to: {t.to_state.value} via {t.trigger}")
```

### Forcing State Transitions

Force a state transition when needed:

```python
# Transition with auto-detected trigger
sm.transition("SEC-001", TaskState.ASSIGNED)

# Transition with custom trigger
sm.transition(
    "SEC-001",
    TaskState.IN_PROGRESS,
    trigger="manual_start"
)
```

## Complete Integration Example

### Full Application Setup

```python
# main.py

from fastapi import FastAPI
from contextlib import asynccontextmanager
from orchestration.engine import start_workflow, stop_workflow, get_workflow_engine
from orchestration.api import router as orchestration_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan."""
    # Startup
    print("Starting workflow engine...")
    engine = start_workflow()
    print(f"Engine state: {engine.get_state().value}")
    
    # Setup event handlers
    setup_event_handlers()
    
    yield
    
    # Shutdown
    print("Stopping workflow engine...")
    stop_workflow()

def setup_event_handlers():
    """Setup event handlers."""
    from orchestration.engine import get_event_bus
    from orchestration.engine.event_bus import EventType
    
    event_bus = get_event_bus()
    
    def on_task_completed(event):
        if event.task_id:
            print(f"✅ Task {event.task_id} completed!")
    
    def on_validation_failed(event):
        if event.task_id:
            print(f"❌ Validation failed for {event.task_id}")
    
    def on_error(event):
        print(f"⚠️  Error: {event.data.get('error', 'Unknown')}")
    
    event_bus.subscribe(EventType.TASK_COMPLETED, on_task_completed)
    event_bus.subscribe(EventType.VALIDATION_FAILED, on_validation_failed)
    event_bus.subscribe(EventType.ERROR, on_error)

app = FastAPI(lifespan=lifespan)

# Include orchestration routes
app.include_router(orchestration_router, prefix="/orchestration")

# Your other routes...
@app.get("/")
async def root():
    engine = get_workflow_engine()
    stats = engine.get_stats()
    return {
        "message": "AI Engineering Platform",
        "engine_running": engine.is_running(),
        "tasks_processed": stats.tasks_processed,
        "tasks_completed": stats.tasks_completed
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Using with Existing Backend

```python
# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from orchestration.engine import start_workflow, get_workflow_engine

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include your existing routers
from backend.api import projects, builds, auth, billing
app.include_router(projects.router, prefix="/api/projects")
app.include_router(builds.router, prefix="/api/builds")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(billing.router, prefix="/api/billing")

# Include orchestration
from orchestration.api import router as orchestration_router
app.include_router(orchestration_router, prefix="/orchestration")

# Startup event
@app.on_event("startup")
async def startup():
    """Start workflow engine on app startup."""
    engine = start_workflow()
    print(f"Workflow engine started: {engine.get_state().value}")

# Shutdown event
@app.on_event("shutdown")
async def shutdown():
    """Stop workflow engine on app shutdown."""
    from orchestration.engine import stop_workflow
    stop_workflow()
    print("Workflow engine stopped")

# Health check
@app.get("/health")
async def health():
    engine = get_workflow_engine()
    return {
        "status": "healthy",
        "engine_running": engine.is_running(),
        "engine_state": engine.get_state().value
    }
```

## Testing Integration

### Unit Tests

```python
# tests/test_workflow_integration.py

import pytest
from orchestration.engine import get_workflow_engine, start_workflow, stop_workflow
from orchestration.helpers import read_tasks

@pytest.fixture
def engine():
    """Create test engine."""
    engine = get_workflow_engine()
    engine.stop()
    yield engine
    engine.stop()

def test_engine_start_stop(engine):
    """Test engine start/stop."""
    assert not engine.is_running()
    
    engine.start()
    assert engine.is_running()
    
    engine.stop()
    assert not engine.is_running()

def test_task_scheduling(engine):
    """Test task scheduling."""
    engine.start()
    
    # Get next task
    next_task = engine.get_next_task()
    assert next_task is not None
    assert next_task['status'] == 'READY'

def test_dependency_resolution(engine):
    """Test dependency resolution."""
    from orchestration.engine import get_workflow_engine
    engine = get_workflow_engine()
    
    # Check dependencies for a task
    result = engine.dependency_resolver.resolve_dependencies("SEC-003")
    assert result.task_id == "SEC-003"
```

### Integration Tests

```python
# tests/test_full_workflow.py

import pytest
from orchestration.engine import start_workflow, stop_workflow

def test_full_task_lifecycle():
    """Test complete task lifecycle."""
    engine = start_workflow()
    
    # Get next task
    next_task = engine.get_next_task()
    assert next_task is not None
    
    task_id = next_task['id']
    
    # Dispatch task
    result = engine.dispatcher.dispatch(task_id)
    assert result.success
    
    # Check state transition
    from orchestration.helpers import get_task_by_id
    task = get_task_by_id(task_id)
    assert task['status'] in ['ASSIGNED', 'IN_PROGRESS']
    
    # Cleanup
    stop_workflow()
```

## Monitoring Integration

### Prometheus Metrics

```python
# backend/metrics.py

from prometheus_client import Counter, Gauge, Histogram
from orchestration.engine import get_workflow_engine

# Define metrics
tasks_processed = Counter('orchestration_tasks_processed_total', 'Total tasks processed')
tasks_completed = Counter('orchestration_tasks_completed_total', 'Total tasks completed')
tasks_failed = Counter('orchestration_tasks_failed_total', 'Total tasks failed')
active_tasks = Gauge('orchestration_active_tasks', 'Currently active tasks')
deployment_readiness = Gauge('orchestration_deployment_readiness', 'Deployment readiness score')

def update_prometheus_metrics():
    """Update Prometheus metrics from workflow engine."""
    engine = get_workflow_engine()
    stats = engine.get_stats()
    metrics = engine.metrics_updater.get_metrics_summary()
    
    # Update gauges
    active_tasks.set(stats.active_tasks)
    deployment_readiness.set(metrics['deployment_readiness'])
    
    # Note: Counters would need to be incremented differently
    # to avoid resetting on each update
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Workflow Engine Metrics",
    "panels": [
      {
        "title": "Engine State",
        "type": "stat",
        "targets": [
          {
            "expr": "orchestration_active_tasks",
            "legend": "Active Tasks"
          }
        ]
      },
      {
        "title": "Deployment Readiness",
        "type": "gauge",
        "targets": [
          {
            "expr": "orchestration_deployment_readiness",
            "legend": "Readiness %"
          }
        ]
      },
      {
        "title": "Task Velocity",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(orchestration_tasks_completed_total[1h])",
            "legend": "Tasks/hour"
          }
        ]
      }
    ]
  }
}
```

## Troubleshooting Integration

### Common Issues

1. **Engine won't start**
   ```python
   from orchestration.engine import get_workflow_engine
   
   engine = get_workflow_engine()
   print(f"State: {engine.get_state()}")
   print(f"Has checkpoint: {engine.recovery_manager.has_checkpoint()}")
   
   # Try manual recovery
   result = engine.recovery_manager.recover()
   print(f"Recovery: {result.success}")
   ```

2. **Tasks not being processed**
   ```python
   engine = get_workflow_engine()
   
   # Check scheduler
   stats = engine.scheduler.get_scheduler_stats()
   print(f"Scheduler running: {stats['running']}")
   print(f"Ready tasks: {stats['total_ready_tasks']}")
   print(f"Executable: {stats['executable_tasks']}")
   
   # Check next task
   next_task = engine.get_next_task()
   print(f"Next task: {next_task}")
   ```

3. **High failure rate**
   ```python
   # Check retry stats
   retry_stats = engine.retry_engine.get_retry_stats()
   print(f"Tasks with retries: {retry_stats['tasks_with_retries']}")
   
   # Check metrics
   metrics = engine.metrics_updater.get_metrics_summary()
   print(f"Failure rate: {metrics['failure_rate']}%")
   print(f"Repair rate: {metrics['repair_rate']}%")
   ```

## Best Practices

1. **Start engine on application startup**
2. **Subscribe to events for monitoring**
3. **Create checkpoints before risky operations**
4. **Monitor metrics regularly**
5. **Handle errors gracefully**
6. **Log all significant events**
7. **Test recovery procedures**
8. **Keep agent registry updated**

## Next Steps

1. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design
2. Check [API_CHANGES.md](./API_CHANGES.md) for API documentation
3. Read [README.md](../README.md) for general orchestration docs
4. Explore example integrations above
5. Start the engine and monitor via API