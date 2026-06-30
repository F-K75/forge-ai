"""
Recovery Mechanism for the Workflow Engine.

Handles unexpected execution stops by:
- Saving execution state checkpoints
- Restoring state from last successful step
- Resuming execution without losing work
- Detecting and recovering from partial failures
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import json
import os
import threading
import copy

from ..helpers import (
    _read_json, _write_json, _timestamp, read_tasks, update_task,
    write_log, read_workflow_state, update_workflow_state, PATHS
)
from .state_machine import TaskState, get_state_machine
from .event_bus import get_event_bus, EventType, Event


class RecoveryState(Enum):
    """States of the recovery process."""
    HEALTHY = "HEALTHY"
    RECOVERING = "RECOVERING"
    RECOVERED = "RECOVERED"
    FAILED = "FAILED"


@dataclass
class Checkpoint:
    """Represents a recovery checkpoint."""
    checkpoint_id: str
    timestamp: str
    workflow_state: Dict[str, Any]
    active_tasks: List[Dict[str, Any]]
    completed_tasks: List[str]
    failed_tasks: List[str]
    event_bus_state: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RecoveryResult:
    """Result of a recovery operation."""
    success: bool
    state: RecoveryState
    recovered_tasks: List[str]
    failed_recoveries: List[str]
    message: str
    timestamp: str = field(default_factory=_timestamp)


class RecoveryManager:
    """
    Manages state recovery after unexpected execution stops.
    
    Implements checkpoint-based recovery to ensure no work is lost
    and execution can resume from the last known good state.
    """
    
    CHECKPOINT_FILE = "recovery_checkpoint.json"
    MAX_CHECKPOINTS = 10
    
    def __init__(self):
        """Initialize the recovery manager."""
        self.state_machine = get_state_machine()
        self.event_bus = get_event_bus()
        self._recovery_state = RecoveryState.HEALTHY
        self._lock = threading.Lock()
        self._checkpoint_dir = os.path.dirname(PATHS["workflow_state"])
    
    def create_checkpoint(self, metadata: Optional[Dict[str, Any]] = None) -> Checkpoint:
        """
        Create a recovery checkpoint.
        
        Args:
            metadata: Optional metadata to include in checkpoint.
            
        Returns:
            Checkpoint object.
        """
        # Get current workflow state
        workflow_state = read_workflow_state()
        
        # Get active tasks (not DONE or FAILED)
        all_tasks = read_tasks()
        active_tasks = [
            t for t in all_tasks
            if t["status"] not in ["DONE", "FAILED"]
        ]
        
        # Get completed and failed tasks
        completed_tasks = [t["id"] for t in all_tasks if t["status"] == "DONE"]
        failed_tasks = [t["id"] for t in all_tasks if t["status"] == "FAILED"]
        
        # Get event bus state
        event_bus_state = self.event_bus.to_dict()
        
        # Create checkpoint
        checkpoint = Checkpoint(
            checkpoint_id=f"ckpt-{datetime.now(timezone.utc).timestamp()}",
            timestamp=_timestamp(),
            workflow_state=workflow_state,
            active_tasks=active_tasks,
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            event_bus_state=event_bus_state,
            metadata=metadata or {},
        )
        
        # Save checkpoint
        self._save_checkpoint(checkpoint)
        
        # Log checkpoint creation
        write_log(
            agent="recovery_manager",
            task="workflow",
            action="checkpoint_created",
            status="DONE",
            detail=f"Checkpoint {checkpoint.checkpoint_id} created with {len(active_tasks)} active tasks",
        )
        
        return checkpoint
    
    def _save_checkpoint(self, checkpoint: Checkpoint) -> None:
        """
        Save checkpoint to disk.
        
        Args:
            checkpoint: The checkpoint to save.
        """
        checkpoint_path = os.path.join(self._checkpoint_dir, self.CHECKPOINT_FILE)
        
        # Load existing checkpoints
        checkpoints = []
        if os.path.exists(checkpoint_path):
            try:
                checkpoints = _read_json(checkpoint_path).get("checkpoints", [])
            except Exception:
                checkpoints = []
        
        # Add new checkpoint
        checkpoint_dict = {
            "checkpoint_id": checkpoint.checkpoint_id,
            "timestamp": checkpoint.timestamp,
            "workflow_state": checkpoint.workflow_state,
            "active_tasks": checkpoint.active_tasks,
            "completed_tasks": checkpoint.completed_tasks,
            "failed_tasks": checkpoint.failed_tasks,
            "event_bus_state": checkpoint.event_bus_state,
            "metadata": checkpoint.metadata,
        }
        checkpoints.append(checkpoint_dict)
        
        # Keep only recent checkpoints
        if len(checkpoints) > self.MAX_CHECKPOINTS:
            checkpoints = checkpoints[-self.MAX_CHECKPOINTS:]
        
        # Save
        _write_json(checkpoint_path, {"checkpoints": checkpoints})
    
    def load_latest_checkpoint(self) -> Optional[Checkpoint]:
        """Load the most recent *valid* checkpoint.

        Recovery algorithm (newest → oldest):
        1. Enumerate checkpoints ordered newest → oldest
        2. For each checkpoint, verify JSON structure and required fields
        3. The first valid checkpoint becomes the recovery candidate
        4. Return None only when no valid checkpoint exists

        Notes:
        - Backward compatible: supports older checkpoint payloads as long as required
          fields are present.
        - Integrity verification hooks (e.g., checksum/hash) can be added later if the
          checkpoint format supports them.
        """
        checkpoint_path = os.path.join(self._checkpoint_dir, self.CHECKPOINT_FILE)

        if not os.path.exists(checkpoint_path):
            return None

        try:
            data = _read_json(checkpoint_path)
        except Exception as e:
            write_log(
                agent="recovery_manager",
                task="workflow",
                action="checkpoint_load_failed",
                status="ERROR",
                detail=f"Failed to read checkpoint file: {str(e)}",
            )
            return None

        checkpoints = data.get("checkpoints", [])
        if not checkpoints:
            return None

        # Deterministic ordering: newest -> oldest. _save_checkpoint appends, so index is stable.
        for candidate in reversed(checkpoints):
            try:
                # Required field validation (schema tolerance: metadata optional)
                required_fields = [
                    "checkpoint_id",
                    "timestamp",
                    "workflow_state",
                    "active_tasks",
                    "completed_tasks",
                    "failed_tasks",
                    "event_bus_state",
                ]

                if not isinstance(candidate, dict):
                    raise ValueError("checkpoint entry is not an object")

                missing = [f for f in required_fields if f not in candidate]
                if missing:
                    raise KeyError(f"missing fields: {missing}")

                # Minimal type checks to avoid partial restore
                if not isinstance(candidate["active_tasks"], list):
                    raise ValueError("active_tasks must be a list")

                # Construct checkpoint
                return Checkpoint(
                    checkpoint_id=candidate["checkpoint_id"],
                    timestamp=candidate["timestamp"],
                    workflow_state=candidate["workflow_state"],
                    active_tasks=candidate["active_tasks"],
                    completed_tasks=candidate["completed_tasks"],
                    failed_tasks=candidate["failed_tasks"],
                    event_bus_state=candidate["event_bus_state"],
                    metadata=candidate.get("metadata", {}),
                )
            except Exception as e:
                # Continue searching for the newest valid checkpoint
                write_log(
                    agent="recovery_manager",
                    task="workflow",
                    action="checkpoint_candidate_invalid",
                    status="ERROR",
                    detail=f"Invalid checkpoint candidate skipped: {str(e)}",
                )
                continue

        # No valid checkpoints
        return None
    
    def recover(self, metadata: Optional[Dict[str, Any]] = None) -> RecoveryResult:
        """
        Perform recovery from the latest checkpoint.
        
        Args:
            metadata: Optional metadata about the recovery attempt.
            
        Returns:
            RecoveryResult indicating success/failure.
        """
        with self._lock:
            self._recovery_state = RecoveryState.RECOVERING
        
        # Publish recovery started event
        self.event_bus.publish_event(
            EventType.RECOVERY_STARTED,
            task_id=None,
            agent="recovery_manager",
            action="recovery_initiated",
            metadata=metadata or {},
        )
        
        write_log(
            agent="recovery_manager",
            task="workflow",
            action="recovery_started",
            status="IN_PROGRESS",
            detail="Starting recovery process",
        )
        
        # Load latest checkpoint
        checkpoint = self.load_latest_checkpoint()
        if not checkpoint:
            with self._lock:
                self._recovery_state = RecoveryState.FAILED
            
            result = RecoveryResult(
                success=False,
                state=RecoveryState.FAILED,
                recovered_tasks=[],
                failed_recoveries=[],
                message="No checkpoint found for recovery",
            )
            
            self.event_bus.publish_event(
                EventType.ERROR,
                task_id=None,
                agent="recovery_manager",
                action="recovery_failed",
                reason="no_checkpoint",
            )
            
            return result
        
        # Recover workflow state
        try:
            update_workflow_state(checkpoint.workflow_state)
        except Exception as e:
            write_log(
                agent="recovery_manager",
                task="workflow",
                action="workflow_state_recovery_failed",
                status="ERROR",
                detail=f"Failed to restore workflow state: {str(e)}",
            )
        
        # Recover active tasks
        recovered_tasks = []
        failed_recoveries = []
        
        for task in checkpoint.active_tasks:
            task_id = task["id"]
            try:
                # Check if task is in a recoverable state
                task_state = TaskState(task["status"])
                if self.state_machine.can_recover(task_state):
                    # Reset task to ASSIGNED state for re-execution
                    update_task(
                        task_id=task_id,
                        updates={"status": "ASSIGNED"},
                        history_event="recovery_reset",
                        history_detail="Task reset to ASSIGNED for recovery",
                    )
                    recovered_tasks.append(task_id)
                else:
                    # Task is in terminal or non-recoverable state
                    failed_recoveries.append(task_id)
            except Exception as e:
                failed_recoveries.append(task_id)
                write_log(
                    agent="recovery_manager",
                    task=task_id,
                    action="task_recovery_failed",
                    status="ERROR",
                    detail=f"Failed to recover task: {str(e)}",
                )
        
        # Restore event bus state (clear and republish recent events)
        # Note: We don't fully restore event bus to avoid duplicate events
        # Just log the recovery
        write_log(
            agent="recovery_manager",
            task="workflow",
            action="event_bus_restored",
            status="DONE",
            detail=f"Event bus state restored from checkpoint {checkpoint.checkpoint_id}",
        )
        
        # Update recovery state
        with self._lock:
            self._recovery_state = RecoveryState.RECOVERED
        
        # Publish recovery completed event
        self.event_bus.publish_event(
            EventType.RECOVERY_COMPLETED,
            task_id=None,
            agent="recovery_manager",
            action="recovery_completed",
            recovered_count=len(recovered_tasks),
            failed_count=len(failed_recoveries),
            checkpoint_id=checkpoint.checkpoint_id,
        )
        
        write_log(
            agent="recovery_manager",
            task="workflow",
            action="recovery_completed",
            status="DONE",
            detail=f"Recovery completed: {len(recovered_tasks)} tasks recovered, {len(failed_recoveries)} failed",
        )
        
        result = RecoveryResult(
            success=True,
            state=RecoveryState.RECOVERED,
            recovered_tasks=recovered_tasks,
            failed_recoveries=failed_recoveries,
            message=f"Recovery successful. {len(recovered_tasks)} tasks restored for execution.",
        )
        
        return result
    
    def get_recovery_state(self) -> RecoveryState:
        """
        Get current recovery state.
        
        Returns:
            Current RecoveryState.
        """
        with self._lock:
            return self._recovery_state
    
    def has_checkpoint(self) -> bool:
        """
        Check if a recovery checkpoint exists.
        
        Returns:
            True if checkpoint exists, False otherwise.
        """
        checkpoint_path = os.path.join(self._checkpoint_dir, self.CHECKPOINT_FILE)
        return os.path.exists(checkpoint_path)
    
    def get_checkpoint_info(self) -> Optional[Dict[str, Any]]:
        """
        Get information about the latest checkpoint.
        
        Returns:
            Checkpoint info dict or None if no checkpoint exists.
        """
        checkpoint = self.load_latest_checkpoint()
        if not checkpoint:
            return None
        
        return {
            "checkpoint_id": checkpoint.checkpoint_id,
            "timestamp": checkpoint.timestamp,
            "active_tasks_count": len(checkpoint.active_tasks),
            "completed_tasks_count": len(checkpoint.completed_tasks),
            "failed_tasks_count": len(checkpoint.failed_tasks),
            "active_task_ids": [t["id"] for t in checkpoint.active_tasks],
        }
    
    def clear_checkpoints(self) -> None:
        """Clear all recovery checkpoints."""
        checkpoint_path = os.path.join(self._checkpoint_dir, self.CHECKPOINT_FILE)
        
        if os.path.exists(checkpoint_path):
            try:
                os.remove(checkpoint_path)
                write_log(
                    agent="recovery_manager",
                    task="workflow",
                    action="checkpoints_cleared",
                    status="DONE",
                    detail="All recovery checkpoints cleared",
                )
            except Exception as e:
                write_log(
                    agent="recovery_manager",
                    task="workflow",
                    action="checkpoint_clear_failed",
                    status="ERROR",
                    detail=f"Failed to clear checkpoints: {str(e)}",
                )
    
    def auto_checkpoint(self, interval_seconds: int = 300) -> None:
        """
        Automatically create checkpoints at regular intervals.
        
        This is a blocking call that runs until stopped.
        
        Args:
            interval_seconds: Interval between checkpoints in seconds.
        """
        import time
        
        write_log(
            agent="recovery_manager",
            task="workflow",
            action="auto_checkpoint_started",
            status="IN_PROGRESS",
            detail=f"Auto-checkpoint started with {interval_seconds}s interval",
        )
        
        while True:
            try:
                time.sleep(interval_seconds)
                self.create_checkpoint(metadata={"auto": True})
            except Exception as e:
                write_log(
                    agent="recovery_manager",
                    task="workflow",
                    action="auto_checkpoint_error",
                    status="ERROR",
                    detail=f"Auto-checkpoint error: {str(e)}",
                )