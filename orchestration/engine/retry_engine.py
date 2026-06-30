"""
Retry Engine for the Workflow Engine.

Handles validation failures with automatic repair loops:
Implementation → Repair → Validation

Repeats until:
- PASS (validation succeeds)
- Maximum retry count reached
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading

from ..helpers import (
    read_tasks, get_task_by_id, update_task, write_log, _timestamp
)
from .state_machine import TaskState, get_state_machine
from .event_bus import get_event_bus, EventType, Event


class RetryStrategy(Enum):
    """Retry strategies for failed tasks."""
    LINEAR = "linear"  # Fixed delay between retries
    EXPONENTIAL = "exponential"  # Exponential backoff
    IMMEDIATE = "immediate"  # No delay


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    strategy: RetryStrategy = RetryStrategy.IMMEDIATE
    initial_delay_seconds: int = 0
    max_delay_seconds: int = 60
    backoff_multiplier: float = 2.0


@dataclass
class RetryAttempt:
    """Represents a single retry attempt."""
    attempt_number: int
    task_id: str
    action: str  # "repair" or "validate"
    status: str  # "started", "completed", "failed"
    timestamp: str = field(default_factory=_timestamp)
    detail: str = ""


@dataclass
class RetryResult:
    """Result of a retry operation."""
    task_id: str
    success: bool
    attempts: List[RetryAttempt]
    final_status: str
    should_escalate: bool
    timestamp: str = field(default_factory=_timestamp)


class RetryEngine:
    """
    Manages retry logic for failed validations.
    
    Implements the repair loop:
    - If validation fails, automatically trigger repair
    - Re-validate after repair
    - Repeat until success or max retries reached
    """
    
    # Default retry configurations by task category
    DEFAULT_CONFIGS = {
        "security": RetryConfig(max_retries=5, strategy=RetryStrategy.IMMEDIATE),
        "implementation": RetryConfig(max_retries=3, strategy=RetryStrategy.IMMEDIATE),
        "validation": RetryConfig(max_retries=2, strategy=RetryStrategy.IMMEDIATE),
        "default": RetryConfig(max_retries=3, strategy=RetryStrategy.IMMEDIATE),
    }
    
    def __init__(self):
        """Initialize the retry engine."""
        self.state_machine = get_state_machine()
        self.event_bus = get_event_bus()
        self._retry_history: Dict[str, List[RetryAttempt]] = {}
        self._lock = threading.Lock()
    
    def handle_validation_failure(self, task_id: str, 
                                   validation_result: Dict[str, Any],
                                   config: Optional[RetryConfig] = None) -> RetryResult:
        """
        Handle a validation failure by initiating repair cycle.
        
        Args:
            task_id: The task that failed validation.
            validation_result: The validation result details.
            config: Optional retry configuration.
            
        Returns:
            RetryResult indicating success/failure and escalation needs.
        """
        task = get_task_by_id(task_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        
        # Get retry config
        config = config or self._get_config_for_task(task)
        
        # Get or initialize retry history
        with self._lock:
            if task_id not in self._retry_history:
                self._retry_history[task_id] = []
            attempts = self._retry_history[task_id]
        
        # Check if max retries reached
        current_attempt = len(attempts)
        if current_attempt >= config.max_retries:
            # Max retries reached, escalate
            result = RetryResult(
                task_id=task_id,
                success=False,
                attempts=attempts,
                final_status="MAX_RETRIES_REACHED",
                should_escalate=True,
            )
            
            # Update task status
            self.state_machine.transition(task_id, TaskState.FAILED, trigger="max_retries")
            
            # Publish event
            self.event_bus.publish_event(
                EventType.ERROR,
                task_id=task_id,
                agent="retry_engine",
                action="max_retries_reached",
                attempt_count=current_attempt,
                max_retries=config.max_retries,
            )
            
            return result
        
        # Record repair attempt
        repair_attempt = RetryAttempt(
            attempt_number=current_attempt + 1,
            task_id=task_id,
            action="repair",
            status="started",
            detail=f"Starting repair attempt {current_attempt + 1}/{config.max_retries}",
        )
        attempts.append(repair_attempt)
        
        # Transition to REPAIRING state
        self.state_machine.transition(task_id, TaskState.REPAIRING, trigger="repair")
        
        # Publish repair required event
        self.event_bus.publish_event(
            EventType.REPAIR_REQUIRED,
            task_id=task_id,
            agent="retry_engine",
            action="repair_initiated",
            attempt=current_attempt + 1,
            max_retries=config.max_retries,
            validation_result=validation_result,
        )
        
        # Log repair initiation
        write_log(
            agent="retry_engine",
            task=task_id,
            action="repair_initiated",
            status="REPAIRING",
            detail=f"Repair attempt {current_attempt + 1}/{config.max_retries} initiated",
        )
        
        # Update attempt status
        repair_attempt.status = "initiated"
        
        return RetryResult(
            task_id=task_id,
            success=False,  # Not yet successful, repair needed
            attempts=attempts,
            final_status="REPAIR_INITIATED",
            should_escalate=False,
        )
    
    def record_repair_completion(self, task_id: str, 
                                  repair_result: Dict[str, Any]) -> RetryResult:
        """
        Record that repair is complete and trigger revalidation.
        
        Args:
            task_id: The task that was repaired.
            repair_result: Details of the repair work done.
            
        Returns:
            RetryResult indicating next steps.
        """
        task = get_task_by_id(task_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        
        # Get retry history
        with self._lock:
            attempts = self._retry_history.get(task_id, [])
        
        # Find the last repair attempt
        last_repair = None
        for attempt in reversed(attempts):
            if attempt.action == "repair":
                last_repair = attempt
                break
        
        if last_repair:
            last_repair.status = "completed"
            last_repair.detail = f"Repair completed: {repair_result.get('summary', 'No summary')}"
        
        # Transition to REVALIDATING state
        self.state_machine.transition(task_id, TaskState.REVALIDATING, trigger="revalidate")
        
        # Publish revalidation event
        self.event_bus.publish_event(
            EventType.STATE_TRANSITION,
            task_id=task_id,
            agent="retry_engine",
            action="revalidation_started",
            repair_result=repair_result,
        )
        
        # Log revalidation
        write_log(
            agent="retry_engine",
            task=task_id,
            action="revalidation_started",
            status="REVALIDATING",
            detail="Repair complete, awaiting revalidation",
        )
        
        return RetryResult(
            task_id=task_id,
            success=False,  # Awaiting validation
            attempts=attempts,
            final_status="AWAITING_REVALIDATION",
            should_escalate=False,
        )
    
    def record_validation_result(self, task_id: str, 
                                  passed: bool,
                                  validation_details: Dict[str, Any]) -> RetryResult:
        """
        Record the result of a revalidation attempt.
        
        Args:
            task_id: The task being revalidated.
            passed: Whether validation passed.
            validation_details: Details of the validation.
            
        Returns:
            RetryResult indicating success or need for another repair cycle.
        """
        task = get_task_by_id(task_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        
        # Get retry history
        with self._lock:
            attempts = self._retry_history.get(task_id, [])
        
        if passed:
            # Validation passed!
            # Record validation attempt
            validation_attempt = RetryAttempt(
                attempt_number=len(attempts) + 1,
                task_id=task_id,
                action="validate",
                status="completed",
                detail="Validation passed",
            )
            attempts.append(validation_attempt)
            
            # Transition to APPROVED
            self.state_machine.transition(task_id, TaskState.APPROVED, trigger="approve")
            
            # Publish approval event
            self.event_bus.publish_event(
                EventType.TASK_APPROVED,
                task_id=task_id,
                agent="retry_engine",
                action="validation_passed",
                attempt_count=len(attempts),
            )
            
            # Log success
            write_log(
                agent="retry_engine",
                task=task_id,
                action="validation_passed",
                status="APPROVED",
                detail=f"Task approved after {len(attempts)} attempts",
            )
            
            return RetryResult(
                task_id=task_id,
                success=True,
                attempts=attempts,
                final_status="APPROVED",
                should_escalate=False,
            )
        else:
            # Validation failed again
            # Record validation attempt
            validation_attempt = RetryAttempt(
                attempt_number=len(attempts) + 1,
                task_id=task_id,
                action="validate",
                status="failed",
                detail=f"Validation failed: {validation_details.get('detail', 'No details')}",
            )
            attempts.append(validation_attempt)
            
            # Check if we should retry again
            config = self._get_config_for_task(task)
            repair_count = sum(1 for a in attempts if a.action == "repair")
            
            if repair_count >= config.max_retries:
                # Max retries reached
                self.state_machine.transition(task_id, TaskState.FAILED, trigger="max_retries")
                
                self.event_bus.publish_event(
                    EventType.ERROR,
                    task_id=task_id,
                    agent="retry_engine",
                    action="max_retries_reached",
                    attempt_count=repair_count,
                    max_retries=config.max_retries,
                )
                
                return RetryResult(
                    task_id=task_id,
                    success=False,
                    attempts=attempts,
                    final_status="MAX_RETRIES_REACHED",
                    should_escalate=True,
                )
            else:
                # Initiate another repair cycle
                return self.handle_validation_failure(task_id, validation_details, config)
    
    def _get_config_for_task(self, task: Dict[str, Any]) -> RetryConfig:
        """
        Get retry configuration for a task.
        
        Args:
            task: The task dict.
            
        Returns:
            RetryConfig for the task.
        """
        category = task.get("category", "default")
        return self.DEFAULT_CONFIGS.get(category, self.DEFAULT_CONFIGS["default"])
    
    def get_retry_history(self, task_id: str) -> List[RetryAttempt]:
        """
        Get retry history for a task.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            List of RetryAttempt objects.
        """
        with self._lock:
            return self._retry_history.get(task_id, []).copy()
    
    def clear_retry_history(self, task_id: Optional[str] = None) -> None:
        """
        Clear retry history.
        
        Args:
            task_id: Optional specific task to clear. If None, clears all.
        """
        with self._lock:
            if task_id:
                self._retry_history.pop(task_id, None)
            else:
                self._retry_history.clear()
    
    def get_retry_stats(self) -> Dict[str, Any]:
        """
        Get retry statistics.
        
        Returns:
            Dict with retry stats.
        """
        with self._lock:
            total_tasks = len(self._retry_history)
            total_attempts = sum(len(attempts) for attempts in self._retry_history.values())
            
            # Count by status
            repair_count = 0
            validation_count = 0
            for attempts in self._retry_history.values():
                for attempt in attempts:
                    if attempt.action == "repair":
                        repair_count += 1
                    elif attempt.action == "validate":
                        validation_count += 1
        
        return {
            "tasks_with_retries": total_tasks,
            "total_attempts": total_attempts,
            "repair_attempts": repair_count,
            "validation_attempts": validation_count,
            "task_ids": list(self._retry_history.keys()),
        }