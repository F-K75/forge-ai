"""
Main Workflow Engine for the AI Engineering Platform.

This is the central orchestrator that coordinates all workflow components:
- Task Scheduler: Prioritizes and schedules tasks
- Dependency Resolver: Validates prerequisites
- Agent Dispatcher: Assigns tasks to agents
- Retry Engine: Handles validation failures
- Event Bus: Coordinates communication
- State Machine: Enforces valid transitions
- Recovery Manager: Handles failures
- Metrics Updater: Tracks performance

The engine runs continuously, automatically executing tasks through the
complete lifecycle from READY to DONE.
"""

from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading
import time

from .state_machine import TaskState, get_state_machine
from .event_bus import get_event_bus, EventType, Event
from .dependency_resolver import DependencyResolver
from .scheduler import TaskScheduler
from .dispatcher import AgentDispatcher
from .retry_engine import RetryEngine
from .recovery import RecoveryManager
from .metrics import MetricsUpdater

from ..helpers import (
    read_tasks, get_task_by_id, update_task, write_log,
    _timestamp, load_all_state
)


class EngineState(Enum):
    """States of the workflow engine."""
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    RECOVERING = "RECOVERING"
    ERROR = "ERROR"
    SHUTTING_DOWN = "SHUTTING_DOWN"


@dataclass
class EngineStats:
    """Statistics for the workflow engine."""
    state: EngineState
    tasks_processed: int
    tasks_completed: int
    tasks_failed: int
    active_tasks: int
    uptime_seconds: float
    last_task_processed: Optional[str]
    start_time: str
    current_task: Optional[str]


class WorkflowEngine:
    """
    Main workflow engine that orchestrates all task execution.
    
    Continuously monitors the task registry, schedules tasks,
    dispatches to agents, and manages the complete task lifecycle.
    """
    
    def __init__(self, auto_start: bool = False):
        """
        Initialize the workflow engine.
        
        Args:
            auto_start: If True, automatically start the engine.
        """
        # Initialize all components
        self.state_machine = get_state_machine()
        self.event_bus = get_event_bus()
        self.dependency_resolver = DependencyResolver()
        self.scheduler = TaskScheduler(self.dependency_resolver)
        self.dispatcher = AgentDispatcher()
        self.retry_engine = RetryEngine()
        self.recovery_manager = RecoveryManager()
        self.metrics_updater = MetricsUpdater()
        
        # Engine state
        self._state = EngineState.STOPPED
        self._lock = threading.Lock()
        self._engine_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        # Statistics
        self._tasks_processed = 0
        self._tasks_completed = 0
        self._tasks_failed = 0
        self._start_time: Optional[str] = None
        self._last_task_processed: Optional[str] = None
        self._current_task: Optional[str] = None
        
        # Configuration
        self._poll_interval = 2  # seconds
        self._max_concurrent_tasks = 5
        self._auto_checkpoint_interval = 300  # 5 minutes
        
        # Subscribe to events
        self._subscribe_to_events()
        
        # Auto-start if requested
        if auto_start:
            self.start()
    
    def _subscribe_to_events(self) -> None:
        """Subscribe to workflow events."""
        self.event_bus.subscribe(EventType.TASK_ASSIGNED, self._on_task_assigned)
        self.event_bus.subscribe(EventType.TASK_STARTED, self._on_task_started)
        self.event_bus.subscribe(EventType.TASK_COMPLETED, self._on_task_completed)
        self.event_bus.subscribe(EventType.VALIDATION_FAILED, self._on_validation_failed)
        self.event_bus.subscribe(EventType.REPAIR_REQUIRED, self._on_repair_required)
        self.event_bus.subscribe(EventType.TASK_APPROVED, self._on_task_approved)
        self.event_bus.subscribe(EventType.TASK_DONE, self._on_task_done)
        self.event_bus.subscribe(EventType.ERROR, self._on_error)
        self.event_bus.subscribe(EventType.RECOVERY_STARTED, self._on_recovery_started)
        self.event_bus.subscribe(EventType.RECOVERY_COMPLETED, self._on_recovery_completed)
    
    def start(self) -> None:
        """Start the workflow engine."""
        with self._lock:
            if self._state != EngineState.STOPPED:
                return
            
            self._state = EngineState.STARTING
            self._start_time = _timestamp()
        
        # Perform recovery if checkpoint exists
        if self.recovery_manager.has_checkpoint():
            self._perform_recovery()
        
        # Start engine
        self._stop_event.clear()
        self._engine_thread = threading.Thread(target=self._engine_loop, daemon=True)
        self._engine_thread.start()
        
        # Start scheduler
        self.scheduler.start()
        
        # Start auto-checkpoint
        self._start_auto_checkpoint()
        
        with self._lock:
            self._state = EngineState.RUNNING
        
        write_log(
            agent="workflow_engine",
            task="workflow",
            action="engine_started",
            status="IN_PROGRESS",
            detail="Workflow engine started",
        )
        
        self.event_bus.publish_event(
            EventType.WORKFLOW_ADVANCED,
            task_id=None,
            agent="workflow_engine",
            action="engine_started",
        )
    
    def stop(self) -> None:
        """Stop the workflow engine."""
        with self._lock:
            if self._state == EngineState.STOPPED:
                return
            
            self._state = EngineState.SHUTTING_DOWN
        
        # Stop the engine loop
        self._stop_event.set()
        
        # Stop scheduler
        self.scheduler.stop()
        
        # Wait for engine thread to finish
        if self._engine_thread:
            self._engine_thread.join(timeout=10)
        
        # Create final checkpoint
        self.recovery_manager.create_checkpoint(metadata={"final": True})
        
        with self._lock:
            self._state = EngineState.STOPPED
        
        write_log(
            agent="workflow_engine",
            task="workflow",
            action="engine_stopped",
            status="DONE",
            detail="Workflow engine stopped",
        )
    
    def pause(self) -> None:
        """Pause the workflow engine."""
        with self._lock:
            if self._state == EngineState.RUNNING:
                self._state = EngineState.PAUSED
        
        write_log(
            agent="workflow_engine",
            task="workflow",
            action="engine_paused",
            status="IN_PROGRESS",
            detail="Workflow engine paused",
        )
    
    def resume(self) -> None:
        """Resume the workflow engine."""
        with self._lock:
            if self._state == EngineState.PAUSED:
                self._state = EngineState.RUNNING
        
        write_log(
            agent="workflow_engine",
            task="workflow",
            action="engine_resumed",
            status="IN_PROGRESS",
            detail="Workflow engine resumed",
        )
    
    def _engine_loop(self) -> None:
        """Main engine loop (runs in background thread)."""
        while not self._stop_event.is_set():
            try:
                with self._lock:
                    if self._state != EngineState.RUNNING:
                        time.sleep(self._poll_interval)
                        continue
                
                # Process tasks
                self._process_tasks()
                
                # Update metrics periodically
                self.metrics_updater.update_all_metrics()
                
            except Exception as e:
                write_log(
                    agent="workflow_engine",
                    task="workflow",
                    action="engine_error",
                    status="ERROR",
                    detail=f"Engine error: {str(e)}",
                )
                
                self.event_bus.publish_event(
                    EventType.ERROR,
                    task_id=None,
                    agent="workflow_engine",
                    action="engine_error",
                    error=str(e),
                )
            
            time.sleep(self._poll_interval)
    
    def _process_tasks(self) -> None:
        """Process ready tasks."""
        # Get next task from scheduler
        next_task = self.scheduler.get_next_task()
        
        if not next_task:
            return
        
        task_id = next_task["id"]
        
        # Check if we're at max concurrent tasks
        active_count = len([t for t in read_tasks() 
                           if t["status"] in ["ASSIGNED", "IN_PROGRESS", "REPAIRING", "REVALIDATING"]])
        
        if active_count >= self._max_concurrent_tasks:
            return
        
        # Dispatch the task
        with self._lock:
            self._current_task = task_id
            self._tasks_processed += 1
            self._last_task_processed = task_id
        
        result = self.dispatcher.dispatch(task_id)
        
        if result.success:
            write_log(
                agent="workflow_engine",
                task=task_id,
                action="task_dispatched",
                status="ASSIGNED",
                detail=f"Dispatched to {result.agent_name}",
            )
        else:
            write_log(
                agent="workflow_engine",
                task=task_id,
                action="dispatch_failed",
                status="ERROR",
                detail=f"Failed to dispatch: {result.error}",
            )
        
        with self._lock:
            self._current_task = None
    
    def _perform_recovery(self) -> None:
        """Perform recovery from checkpoint."""
        with self._lock:
            self._state = EngineState.RECOVERING
        
        result = self.recovery_manager.recover(metadata={"engine_start": True})
        
        if result.success:
            write_log(
                agent="workflow_engine",
                task="workflow",
                action="recovery_successful",
                status="DONE",
                detail=f"Recovered {len(result.recovered_tasks)} tasks",
            )
        else:
            write_log(
                agent="workflow_engine",
                task="workflow",
                action="recovery_failed",
                status="ERROR",
                detail=result.message,
            )
    
    def _start_auto_checkpoint(self) -> None:
        """Start automatic checkpoint creation in background."""
        def checkpoint_loop():
            while not self._stop_event.is_set():
                time.sleep(self._auto_checkpoint_interval)
                if not self._stop_event.is_set():
                    self.recovery_manager.create_checkpoint(metadata={"auto": True})
        
        checkpoint_thread = threading.Thread(target=checkpoint_loop, daemon=True)
        checkpoint_thread.start()
    
    # Event handlers
    def _on_task_assigned(self, event: Event) -> None:
        """Handle task assigned event."""
        if event.task_id:
            self._tasks_processed += 1
    
    def _on_task_started(self, event: Event) -> None:
        """Handle task started event."""
        pass
    
    def _on_task_completed(self, event: Event) -> None:
        """Handle task completed event."""
        if event.task_id:
            with self._lock:
                self._tasks_completed += 1
    
    def _on_validation_failed(self, event: Event) -> None:
        """Handle validation failed event."""
        if event.task_id:
            # Initiate repair cycle
            self.retry_engine.handle_validation_failure(
                event.task_id,
                event.data.get("validation_result", {})
            )
    
    def _on_repair_required(self, event: Event) -> None:
        """Handle repair required event."""
        pass
    
    def _on_task_approved(self, event: Event) -> None:
        """Handle task approved event."""
        if event.task_id:
            # Transition to DONE
            self.state_machine.transition(event.task_id, TaskState.DONE, trigger="close")
            
            with self._lock:
                self._tasks_completed += 1
    
    def _on_task_done(self, event: Event) -> None:
        """Handle task done event."""
        pass
    
    def _on_error(self, event: Event) -> None:
        """Handle error event."""
        with self._lock:
            self._tasks_failed += 1
    
    def _on_recovery_started(self, event: Event) -> None:
        """Handle recovery started event."""
        with self._lock:
            self._state = EngineState.RECOVERING
    
    def _on_recovery_completed(self, event: Event) -> None:
        """Handle recovery completed event."""
        with self._lock:
            self._state = EngineState.RUNNING
    
    # Public API
    def get_state(self) -> EngineState:
        """
        Get current engine state.
        
        Returns:
            Current EngineState.
        """
        with self._lock:
            return self._state
    
    def get_stats(self) -> EngineStats:
        """
        Get engine statistics.
        
        Returns:
            EngineStats object.
        """
        with self._lock:
            uptime = 0.0
            if self._start_time:
                try:
                    start_dt = datetime.fromisoformat(self._start_time)
                    uptime = (datetime.now(timezone.utc) - start_dt).total_seconds()
                except (ValueError, TypeError):
                    pass
            
            active_tasks = len([t for t in read_tasks() 
                               if t["status"] in ["ASSIGNED", "IN_PROGRESS", "REPAIRING", "REVALIDATING"]])
            
            return EngineStats(
                state=self._state,
                tasks_processed=self._tasks_processed,
                tasks_completed=self._tasks_completed,
                tasks_failed=self._tasks_failed,
                active_tasks=active_tasks,
                uptime_seconds=uptime,
                last_task_processed=self._last_task_processed,
                start_time=self._start_time or "",
                current_task=self._current_task,
            )
    
    def get_component_stats(self) -> Dict[str, Any]:
        """
        Get statistics from all components.
        
        Returns:
            Dict with stats from all components.
        """
        return {
            "engine": self.get_stats().__dict__,
            "scheduler": self.scheduler.get_scheduler_stats(),
            "dispatcher": self.dispatcher.get_dispatcher_stats(),
            "retry_engine": self.retry_engine.get_retry_stats(),
            "recovery_manager": {
                "state": self.recovery_manager.get_recovery_state().value,
                "has_checkpoint": self.recovery_manager.has_checkpoint(),
                "checkpoint_info": self.recovery_manager.get_checkpoint_info(),
            },
            "metrics_updater": self.metrics_updater.get_metrics_stats(),
            "event_bus": self.event_bus.to_dict(),
        }
    
    def trigger_recovery(self) -> RecoveryManager:
        """
        Manually trigger recovery.
        
        Returns:
            RecoveryManager instance.
        """
        return self.recovery_manager
    
    def update_metrics(self) -> Dict[str, Any]:
        """
        Manually trigger metrics update.
        
        Returns:
            Updated metrics.
        """
        return self.metrics_updater.update_all_metrics()
    
    def get_next_task(self) -> Optional[Dict[str, Any]]:
        """
        Get the next task to be processed.
        
        Returns:
            Next task dict or None.
        """
        return self.scheduler.get_next_task()
    
    def is_running(self) -> bool:
        """
        Check if the engine is running.
        
        Returns:
            True if running, False otherwise.
        """
        with self._lock:
            return self._state == EngineState.RUNNING


# Global workflow engine instance
_workflow_engine: Optional[WorkflowEngine] = None


def get_workflow_engine() -> WorkflowEngine:
    """
    Get the global workflow engine instance (singleton pattern).
    
    Returns:
        The WorkflowEngine instance.
    """
    global _workflow_engine
    if _workflow_engine is None:
        _workflow_engine = WorkflowEngine()
    return _workflow_engine


def start_workflow() -> WorkflowEngine:
    """
    Get and start the workflow engine.
    
    Returns:
        The started WorkflowEngine instance.
    """
    engine = get_workflow_engine()
    engine.start()
    return engine


def stop_workflow() -> None:
    """Stop the workflow engine."""
    global _workflow_engine
    if _workflow_engine:
        _workflow_engine.stop()