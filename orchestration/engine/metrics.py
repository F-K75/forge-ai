"""
Metrics Updater for the Workflow Engine.

Automatically updates performance metrics:
- Velocity (tasks completed per day)
- Cycle time (task start to completion)
- Lead time (task creation to completion)
- Success rate
- Failure rate
- Validation pass %
- Repair %
- Deployment readiness
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading
from collections import defaultdict

from ..helpers import (
    read_tasks, get_metrics, update_metrics, record_metric_trend,
    write_log, _timestamp, recalculate_metrics
)
from .event_bus import get_event_bus, EventType, Event


@dataclass
class TaskTiming:
    """Timing data for a task."""
    task_id: str
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    lead_time_hours: Optional[float] = None
    cycle_time_hours: Optional[float] = None


class MetricsUpdater:
    """
    Automatically updates workflow metrics.
    
    Tracks and calculates:
    - Velocity: Tasks completed per day
    - Cycle time: Average time from start to completion
    - Lead time: Average time from creation to completion
    - Success/failure rates
    - Validation and repair percentages
    - Deployment readiness score
    """
    
    def __init__(self):
        """Initialize the metrics updater."""
        self.event_bus = get_event_bus()
        self._task_timings: Dict[str, TaskTiming] = {}
        self._lock = threading.Lock()
        self._last_update = _timestamp()
        
        # Subscribe to relevant events
        self._subscribe_to_events()
    
    def _subscribe_to_events(self) -> None:
        """Subscribe to workflow events for automatic metric updates."""
        self.event_bus.subscribe(EventType.TASK_COMPLETED, self._on_task_completed)
        self.event_bus.subscribe(EventType.TASK_APPROVED, self._on_task_approved)
        self.event_bus.subscribe(EventType.TASK_DONE, self._on_task_done)
        self.event_bus.subscribe(EventType.VALIDATION_FAILED, self._on_validation_failed)
        self.event_bus.subscribe(EventType.REPAIR_REQUIRED, self._on_repair_required)
        self.event_bus.subscribe(EventType.ERROR, self._on_error)
    
    def _on_task_completed(self, event: Event) -> None:
        """Handle task completion event."""
        if event.task_id:
            self._record_task_timing(event.task_id)
    
    def _on_task_approved(self, event: Event) -> None:
        """Handle task approval event."""
        if event.task_id:
            self._record_task_timing(event.task_id)
    
    def _on_task_done(self, event: Event) -> None:
        """Handle task done event."""
        if event.task_id:
            self._record_task_timing(event.task_id)
            self.update_all_metrics()
    
    def _on_validation_failed(self, event: Event) -> None:
        """Handle validation failure event."""
        # Metrics will be updated in the next cycle
        pass
    
    def _on_repair_required(self, event: Event) -> None:
        """Handle repair required event."""
        # Metrics will be updated in the next cycle
        pass
    
    def _on_error(self, event: Event) -> None:
        """Handle error event."""
        # Increment error count
        self._increment_metric("error_count", 1)
    
    def _record_task_timing(self, task_id: str) -> None:
        """
        Record timing data for a task.
        
        Args:
            task_id: The task identifier.
        """
        task = read_tasks(task_id=task_id)
        if not task:
            return
        
        task = task[0]
        
        with self._lock:
            self._task_timings[task_id] = TaskTiming(
                task_id=task_id,
                created_at=task.get("created_at"),
                started_at=task.get("started_at"),
                completed_at=task.get("completed_at"),
            )
    
    def _increment_metric(self, metric_name: str, value: float = 1.0) -> None:
        """
        Increment a metric value.
        
        Args:
            metric_name: The metric to increment.
            value: Value to increment by.
        """
        metrics = get_metrics()
        current = metrics.get("metrics", {}).get(metric_name, {})
        current_value = current.get("value", 0)
        
        update_metrics({metric_name: current_value + value})
    
    def calculate_velocity(self, days: int = 7) -> float:
        """
        Calculate task velocity (tasks completed per day).
        
        Args:
            days: Number of days to calculate over.
            
        Returns:
            Tasks per day.
        """
        tasks = read_tasks()
        completed_tasks = [t for t in tasks if t["status"] == "DONE"]
        
        if not completed_tasks:
            return 0.0
        
        # Calculate completion dates
        completion_dates = []
        for task in completed_tasks:
            completed_at = task.get("completed_at")
            if completed_at:
                try:
                    dt = datetime.fromisoformat(completed_at)
                    completion_dates.append(dt)
                except (ValueError, TypeError):
                    pass
        
        if not completion_dates:
            return 0.0
        
        # Calculate time span
        earliest = min(completion_dates)
        latest = max(completion_dates)
        time_span_days = (latest - earliest).total_seconds() / 86400
        
        if time_span_days == 0:
            return len(completed_tasks)  # All completed on same day
        
        velocity = len(completed_tasks) / time_span_days
        return round(velocity, 2)
    
    def calculate_cycle_time(self) -> float:
        """
        Calculate average cycle time (start to completion in days).
        
        Returns:
            Average cycle time in days.
        """
        tasks = read_tasks()
        completed_tasks = [t for t in tasks if t["status"] == "DONE"]
        
        if not completed_tasks:
            return 0.0
        
        cycle_times = []
        for task in completed_tasks:
            started_at = task.get("started_at")
            completed_at = task.get("completed_at")
            
            if started_at and completed_at:
                try:
                    start_dt = datetime.fromisoformat(started_at)
                    complete_dt = datetime.fromisoformat(completed_at)
                    cycle_time = (complete_dt - start_dt).total_seconds() / 86400
                    cycle_times.append(cycle_time)
                except (ValueError, TypeError):
                    pass
        
        if not cycle_times:
            return 0.0
        
        avg_cycle_time = sum(cycle_times) / len(cycle_times)
        return round(avg_cycle_time, 2)
    
    def calculate_lead_time(self) -> float:
        """
        Calculate average lead time (creation to completion in days).
        
        Returns:
            Average lead time in days.
        """
        tasks = read_tasks()
        completed_tasks = [t for t in tasks if t["status"] == "DONE"]
        
        if not completed_tasks:
            return 0.0
        
        lead_times = []
        for task in completed_tasks:
            created_at = task.get("created_at") or task.get("history", [{}])[0].get("timestamp")
            completed_at = task.get("completed_at")
            
            if created_at and completed_at:
                try:
                    create_dt = datetime.fromisoformat(created_at)
                    complete_dt = datetime.fromisoformat(completed_at)
                    lead_time = (complete_dt - create_dt).total_seconds() / 86400
                    lead_times.append(lead_time)
                except (ValueError, TypeError):
                    pass
        
        if not lead_times:
            return 0.0
        
        avg_lead_time = sum(lead_times) / len(lead_times)
        return round(avg_lead_time, 2)
    
    def calculate_success_rate(self) -> float:
        """
        Calculate task success rate.
        
        Returns:
            Success rate percentage (0-100).
        """
        tasks = read_tasks()
        total = len(tasks)
        
        if total == 0:
            return 0.0
        
        completed = len([t for t in tasks if t["status"] == "DONE"])
        failed = len([t for t in tasks if t["status"] == "FAILED"])
        
        successful = completed
        success_rate = (successful / total) * 100
        return round(success_rate, 1)
    
    def calculate_failure_rate(self) -> float:
        """
        Calculate task failure rate.
        
        Returns:
            Failure rate percentage (0-100).
        """
        tasks = read_tasks()
        total = len(tasks)
        
        if total == 0:
            return 0.0
        
        failed = len([t for t in tasks if t["status"] == "FAILED"])
        failure_rate = (failed / total) * 100
        return round(failure_rate, 1)
    
    def calculate_validation_pass_rate(self) -> float:
        """
        Calculate validation pass rate.
        
        Returns:
            Validation pass percentage (0-100).
        """
        tasks = read_tasks()
        
        # Count validation attempts from history
        total_validations = 0
        passed_validations = 0
        
        for task in tasks:
            history = task.get("history", [])
            for event in history:
                event_name = event.get("event", "")
                if "validat" in event_name.lower():
                    total_validations += 1
                    if "pass" in event_name.lower() or "approve" in event_name.lower():
                        passed_validations += 1
        
        if total_validations == 0:
            return 100.0  # No validations yet
        
        pass_rate = (passed_validations / total_validations) * 100
        return round(pass_rate, 1)
    
    def calculate_repair_rate(self) -> float:
        """
        Calculate repair rate (tasks requiring repair / total tasks).
        
        Returns:
            Repair rate percentage (0-100).
        """
        tasks = read_tasks()
        total = len(tasks)
        
        if total == 0:
            return 0.0
        
        # Count tasks that had repair events
        repaired_tasks = 0
        for task in tasks:
            history = task.get("history", [])
            if any("repair" in event.get("event", "").lower() for event in history):
                repaired_tasks += 1
        
        repair_rate = (repaired_tasks / total) * 100
        return round(repair_rate, 1)
    
    def calculate_deployment_readiness(self) -> float:
        """
        Calculate deployment readiness score.
        
        Based on:
        - Percentage of critical tasks completed
        - Security score
        - Test coverage (if available)
        - Validation pass rate
        
        Returns:
            Deployment readiness score (0-100).
        """
        tasks = read_tasks()
        
        if not tasks:
            return 0.0
        
        # Calculate completion percentage
        total = len(tasks)
        completed = len([t for t in tasks if t["status"] == "DONE"])
        completion_rate = (completed / total) * 100
        
        # Get security score
        metrics = get_metrics()
        security_score = metrics.get("metrics", {}).get("security_score", {}).get("value", 0)
        
        # Get validation pass rate
        validation_pass_rate = self.calculate_validation_pass_rate()
        
        # Weighted score
        # Completion: 40%, Security: 35%, Validation: 25%
        readiness_score = (
            completion_rate * 0.40 +
            security_score * 0.35 +
            validation_pass_rate * 0.25
        )
        
        return round(readiness_score, 1)
    
    def update_all_metrics(self) -> Dict[str, Any]:
        """
        Update all metrics based on current state.
        
        Returns:
            Updated metrics dict.
        """
        # Calculate all metrics
        velocity = self.calculate_velocity()
        cycle_time = self.calculate_cycle_time()
        lead_time = self.calculate_lead_time()
        success_rate = self.calculate_success_rate()
        failure_rate = self.calculate_failure_rate()
        validation_pass_rate = self.calculate_validation_pass_rate()
        repair_rate = self.calculate_repair_rate()
        deployment_readiness = self.calculate_deployment_readiness()
        
        # Update metrics
        metric_updates = {
            "velocity": velocity,
            "cycle_time": cycle_time,
            "lead_time": lead_time,
            "success_rate": success_rate,
            "failure_rate": failure_rate,
            "validation_pass_rate": validation_pass_rate,
            "repair_rate": repair_rate,
            "deployment_readiness": deployment_readiness,
        }
        
        updated_metrics = update_metrics(metric_updates)
        
        # Record trends
        record_metric_trend("velocity", velocity)
        record_metric_trend("cycle_time", cycle_time)
        record_metric_trend("lead_time", lead_time)
        record_metric_trend("success_rate", success_rate)
        record_metric_trend("deployment_readiness", deployment_readiness)
        
        # Log update
        write_log(
            agent="metrics_updater",
            task="workflow",
            action="metrics_updated",
            status="DONE",
            detail=f"Metrics updated: velocity={velocity}, readiness={deployment_readiness}%",
        )
        
        self._last_update = _timestamp()
        
        return updated_metrics
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """
        Get a summary of current metrics.
        
        Returns:
            Dict with key metrics.
        """
        metrics = get_metrics()
        metrics_data = metrics.get("metrics", {})
        
        return {
            "velocity": metrics_data.get("velocity", {}).get("value", 0),
            "cycle_time": metrics_data.get("cycle_time", {}).get("value", 0),
            "lead_time": metrics_data.get("lead_time", {}).get("value", 0),
            "success_rate": metrics_data.get("success_rate", {}).get("value", 0),
            "failure_rate": metrics_data.get("failure_rate", {}).get("value", 0),
            "validation_pass_rate": metrics_data.get("validation_pass_rate", {}).get("value", 0),
            "repair_rate": metrics_data.get("repair_rate", {}).get("value", 0),
            "deployment_readiness": metrics_data.get("deployment_readiness", {}).get("value", 0),
            "last_updated": self._last_update,
        }
    
    def get_metrics_trends(self, metric_name: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get trend data for a specific metric.
        
        Args:
            metric_name: The metric name (e.g., "velocity").
            limit: Maximum number of data points.
            
        Returns:
            List of trend data points.
        """
        metrics = get_metrics()
        trends = metrics.get("trends", {})
        trend_key = f"{metric_name}_trend"
        
        trend_data = trends.get(trend_key, [])
        return trend_data[-limit:]
    
    def get_metrics_stats(self) -> Dict[str, Any]:
        """
        Get metrics updater statistics.
        
        Returns:
            Dict with stats.
        """
        return {
            "last_update": self._last_update,
            "tracked_tasks": len(self._task_timings),
            "event_subscriptions": self.event_bus.get_subscriber_count(EventType.TASK_COMPLETED) +
                                   self.event_bus.get_subscriber_count(EventType.TASK_APPROVED) +
                                   self.event_bus.get_subscriber_count(EventType.TASK_DONE),
        }