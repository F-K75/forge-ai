"""
Task Scheduler for the Workflow Engine.

Continuously monitors the task registry and prioritizes READY tasks
based on severity, business impact, risk, and estimated effort.
"""

from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading
import time

from ..helpers import read_tasks, update_task, write_log, _timestamp
from .dependency_resolver import DependencyResolver, DependencyResult
from .event_bus import get_event_bus, EventType, Event


class Priority(Enum):
    """Task priority levels."""
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class Severity(Enum):
    """Task severity levels."""
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


@dataclass
class TaskScore:
    """Scoring for task prioritization."""
    task_id: str
    severity_score: int
    business_impact_score: int
    risk_score: int
    effort_score: int
    total_score: int
    priority: str
    severity: str
    estimated_hours: int
    blocking_count: int  # How many tasks this blocks


class TaskScheduler:
    """
    Schedules and prioritizes tasks for execution.
    
    Continuously monitors READY tasks, validates dependencies,
    and prioritizes based on multiple factors.
    """
    
    # Severity weights (higher = more important)
    SEVERITY_WEIGHTS = {
        "Critical": 100,
        "High": 75,
        "Medium": 50,
        "Low": 25,
    }
    
    # Priority weights
    PRIORITY_WEIGHTS = {
        "P0": 100,
        "P1": 75,
        "P2": 50,
        "P3": 25,
    }
    
    def __init__(self, dependency_resolver: Optional[DependencyResolver] = None):
        """
        Initialize the task scheduler.
        
        Args:
            dependency_resolver: Optional dependency resolver instance.
        """
        self.dependency_resolver = dependency_resolver or DependencyResolver()
        self.event_bus = get_event_bus()
        self._running = False
        self._scheduler_thread: Optional[threading.Thread] = None
        self._poll_interval = 5  # seconds
        self._scheduled_tasks: List[str] = []
        self._lock = threading.Lock()
    
    def start(self) -> None:
        """Start the scheduler in a background thread."""
        if self._running:
            return
        
        self._running = True
        self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self._scheduler_thread.start()
        
        write_log(
            agent="scheduler",
            task="workflow",
            action="scheduler_started",
            status="IN_PROGRESS",
            detail="Task scheduler started"
        )
    
    def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=10)
        
        write_log(
            agent="scheduler",
            task="workflow",
            action="scheduler_stopped",
            status="DONE",
            detail="Task scheduler stopped"
        )
    
    def _scheduler_loop(self) -> None:
        """Main scheduler loop (runs in background thread)."""
        while self._running:
            try:
                self.schedule_tasks()
            except Exception as e:
                write_log(
                    agent="scheduler",
                    task="workflow",
                    action="scheduler_error",
                    status="ERROR",
                    detail=f"Scheduler error: {str(e)}"
                )
            
            time.sleep(self._poll_interval)
    
    def schedule_tasks(self) -> List[Dict[str, Any]]:
        """
        Find and prioritize READY tasks.
        
        Returns:
            List of prioritized tasks ready for assignment.
        """
        # Get all READY tasks
        ready_tasks = read_tasks(status_filter="READY")
        
        # Filter to only those with satisfied dependencies
        executable_tasks = []
        for task in ready_tasks:
            can_execute, _ = self.dependency_resolver.can_execute(task["id"])
            if can_execute:
                executable_tasks.append(task)
        
        # Score and prioritize
        scored_tasks = self._score_tasks(executable_tasks)
        prioritized = sorted(scored_tasks, key=lambda x: x.total_score, reverse=True)
        
        # Update scheduled tasks list
        with self._lock:
            self._scheduled_tasks = [t.task_id for t in prioritized]
        
        return [task for task in executable_tasks 
                if any(t.task_id == task["id"] for t in prioritized)]
    
    def _score_tasks(self, tasks: List[Dict[str, Any]]) -> List[TaskScore]:
        """
        Score tasks based on multiple factors.
        
        Args:
            tasks: List of task dicts to score.
            
        Returns:
            List of TaskScore objects sorted by total score.
        """
        scored = []
        
        for task in tasks:
            # Severity score
            severity = task.get("severity", "Low")
            severity_score = self.SEVERITY_WEIGHTS.get(severity, 0)
            
            # Priority score
            priority = task.get("priority", "P3")
            priority_score = self.PRIORITY_WEIGHTS.get(priority, 0)
            
            # Business impact score (based on blocking count)
            blocking_count = self._count_blocking_tasks(task["id"])
            business_impact_score = blocking_count * 20  # +20 per blocked task
            
            # Risk score (inverse of estimated hours - smaller tasks are less risky)
            estimated_hours = task.get("estimated_hours", 1)
            effort_score = max(0, 50 - estimated_hours)  # Lower hours = higher score
            
            # Calculate total score
            total_score = (
                severity_score * 2 +  # Severity is most important
                priority_score * 1.5 +
                business_impact_score +
                effort_score * 0.5
            )
            
            scored.append(TaskScore(
                task_id=task["id"],
                severity_score=severity_score,
                business_impact_score=business_impact_score,
                risk_score=effort_score,
                effort_score=effort_score,
                total_score=int(total_score),
                priority=priority,
                severity=severity,
                estimated_hours=estimated_hours,
                blocking_count=blocking_count,
            ))
        
        return scored
    
    def _count_blocking_tasks(self, task_id: str) -> int:
        """
        Count how many tasks are blocked by this task.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            Number of tasks blocked by this task.
        """
        all_tasks = read_tasks()
        count = 0
        
        for task in all_tasks:
            if task_id in task.get("dependencies", []) or task_id in task.get("blocked_by", []):
                if task["status"] != "DONE":
                    count += 1
        
        return count
    
    def get_next_task(self) -> Optional[Dict[str, Any]]:
        """
        Get the highest priority task ready for execution.
        
        Returns:
            The next task to execute, or None if no tasks are ready.
        """
        prioritized = self.schedule_tasks()
        return prioritized[0] if prioritized else None
    
    def get_scheduled_tasks(self) -> List[str]:
        """
        Get list of currently scheduled task IDs in priority order.
        
        Returns:
            List of task IDs.
        """
        with self._lock:
            return self._scheduled_tasks.copy()
    
    def reprioritize(self, task_id: str, new_priority: str) -> Dict[str, Any]:
        """
        Reprioritize a task.
        
        Args:
            task_id: The task to reprioritize.
            new_priority: New priority level (P0, P1, P2, P3).
            
        Returns:
            The updated task.
        """
        task = update_task(
            task_id=task_id,
            updates={"priority": new_priority},
            history_event="task_reprioritized",
            history_detail=f"Priority changed to {new_priority}",
        )
        
        self.event_bus.publish_event(
            EventType.STATE_TRANSITION,
            task_id=task_id,
            agent="scheduler",
            action="reprioritize",
            new_priority=new_priority,
        )
        
        return task
    
    def get_scheduler_stats(self) -> Dict[str, Any]:
        """
        Get scheduler statistics.
        
        Returns:
            Dict with scheduler stats.
        """
        all_tasks = read_tasks()
        ready_tasks = [t for t in all_tasks if t["status"] == "READY"]
        
        executable_count = 0
        blocked_count = 0
        
        for task in ready_tasks:
            can_execute, _ = self.dependency_resolver.can_execute(task["id"])
            if can_execute:
                executable_count += 1
            else:
                blocked_count += 1
        
        return {
            "running": self._running,
            "total_ready_tasks": len(ready_tasks),
            "executable_tasks": executable_count,
            "blocked_tasks": blocked_count,
            "scheduled_queue_size": len(self._scheduled_tasks),
            "poll_interval_seconds": self._poll_interval,
        }