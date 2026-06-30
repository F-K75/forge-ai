"""
Task State Machine for the Workflow Engine.

Implements valid state transitions for tasks in the orchestration pipeline.
Prevents invalid transitions and enforces the workflow lifecycle.

State Flow:
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
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from ..helpers import update_task, write_log, _timestamp


class TaskState(Enum):
    """Enumeration of all possible task states."""
    READY = "READY"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    UNDER_REVIEW = "UNDER_REVIEW"
    VALIDATING = "VALIDATING"
    FAILED = "FAILED"
    REPAIRING = "REPAIRING"
    REVALIDATING = "REVALIDATING"
    APPROVED = "APPROVED"
    DONE = "DONE"


@dataclass
class StateTransition:
    """Represents a valid state transition."""
    from_state: TaskState
    to_state: TaskState
    trigger: str
    description: str


class TaskStateMachine:
    """
    Manages valid state transitions for tasks.
    
    Ensures that tasks only transition through valid states and
    records all transitions in the task history.
    """
    
    # Define all valid state transitions
    VALID_TRANSITIONS: Dict[TaskState, List[StateTransition]] = {
        TaskState.READY: [
            StateTransition(TaskState.READY, TaskState.ASSIGNED, "assign", "Task assigned to agent"),
        ],
        TaskState.ASSIGNED: [
            StateTransition(TaskState.ASSIGNED, TaskState.IN_PROGRESS, "start", "Implementation started"),
        ],
        TaskState.IN_PROGRESS: [
            StateTransition(TaskState.IN_PROGRESS, TaskState.UNDER_REVIEW, "complete", "Implementation complete, pending review"),
        ],
        TaskState.UNDER_REVIEW: [
            StateTransition(TaskState.UNDER_REVIEW, TaskState.VALIDATING, "validate", "Validation started"),
        ],
        TaskState.VALIDATING: [
            StateTransition(TaskState.VALIDATING, TaskState.UNDER_REVIEW, "fail", "Validation failed, back to review"),
            StateTransition(TaskState.VALIDATING, TaskState.APPROVED, "approve", "Validation passed, approved"),
        ],
        TaskState.FAILED: [
            StateTransition(TaskState.FAILED, TaskState.REPAIRING, "repair", "Repair started"),
        ],
        TaskState.REPAIRING: [
            StateTransition(TaskState.REPAIRING, TaskState.REVALIDATING, "revalidate", "Repair complete, revalidating"),
        ],
        TaskState.REVALIDATING: [
            StateTransition(TaskState.REVALIDATING, TaskState.REPAIRING, "fail", "Revalidation failed, back to repair"),
            StateTransition(TaskState.REVALIDATING, TaskState.APPROVED, "approve", "Revalidation passed, approved"),
        ],
        TaskState.APPROVED: [
            StateTransition(TaskState.APPROVED, TaskState.DONE, "close", "Task fully completed and closed"),
        ],
        TaskState.DONE: [],  # Terminal state
    }
    
    # Map states to their allowed incoming transitions
    INCOMING_TRANSITIONS: Dict[TaskState, List[StateTransition]] = {}
    
    def __init__(self):
        """Initialize the state machine and build reverse lookup."""
        self._build_reverse_lookup()
    
    def _build_reverse_lookup(self) -> None:
        """Build the incoming transitions lookup for validation."""
        self.INCOMING_TRANSITIONS = {state: [] for state in TaskState}
        for from_state, transitions in self.VALID_TRANSITIONS.items():
            for transition in transitions:
                self.INCOMING_TRANSITIONS[transition.to_state].append(transition)
    
    def get_valid_transitions(self, current_state: TaskState) -> List[StateTransition]:
        """
        Get all valid transitions from a given state.
        
        Args:
            current_state: The current task state.
            
        Returns:
            List of valid StateTransition objects.
        """
        return self.VALID_TRANSITIONS.get(current_state, [])
    
    def is_valid_transition(self, from_state: TaskState, to_state: TaskState) -> bool:
        """
        Check if a state transition is valid.
        
        Args:
            from_state: The current state.
            to_state: The target state.
            
        Returns:
            True if the transition is valid, False otherwise.
        """
        valid_transitions = self.get_valid_transitions(from_state)
        return any(t.to_state == to_state for t in valid_transitions)
    
    def get_transition(self, from_state: TaskState, to_state: TaskState) -> Optional[StateTransition]:
        """
        Get the specific transition between two states.
        
        Args:
            from_state: The current state.
            to_state: The target state.
            
        Returns:
            The StateTransition if found, None otherwise.
        """
        valid_transitions = self.get_valid_transitions(from_state)
        for transition in valid_transitions:
            if transition.to_state == to_state:
                return transition
        return None
    
    def transition(self, task_id: str, to_state: TaskState, 
                   trigger: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a state transition for a task.
        
        Args:
            task_id: The task identifier.
            to_state: The target state.
            trigger: Optional trigger name (if not provided, will be auto-detected).
            
        Returns:
            The updated task dict.
            
        Raises:
            ValueError: If the transition is invalid.
        """
        # Get current task state
        from ..helpers import get_task_by_id
        task = get_task_by_id(task_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        
        current_state = TaskState(task["status"])
        
        # Validate transition
        transition = self.get_transition(current_state, to_state)
        if not transition:
            raise ValueError(
                f"Invalid state transition: {current_state.value} → {to_state.value}"
            )
        
        # Use provided trigger or auto-detected one
        actual_trigger = trigger or transition.trigger
        
        # Update task status
        updated_task = update_task(
            task_id=task_id,
            updates={"status": to_state.value},
            history_event=f"state_transition_{actual_trigger}",
            history_detail=transition.description,
        )
        
        # Log the transition
        write_log(
            agent="state_machine",
            task=task_id,
            action="state_transition",
            status=to_state.value,
            detail=f"{current_state.value} → {to_state.value} via {actual_trigger}",
        )
        
        return updated_task
    
    def get_all_states(self) -> List[TaskState]:
        """Get list of all possible task states."""
        return list(TaskState)
    
    def get_terminal_states(self) -> List[TaskState]:
        """Get list of terminal states (no outgoing transitions)."""
        return [state for state, transitions in self.VALID_TRANSITIONS.items() 
                if not transitions]
    
    def can_recover(self, state: TaskState) -> bool:
        """
        Check if a task in the given state can be recovered.
        
        Args:
            state: The task state to check.
            
        Returns:
            True if the task can be recovered, False otherwise.
        """
        # Tasks in FAILED, REPAIRING, or REVALIDATING can be recovered
        return state in {TaskState.FAILED, TaskState.REPAIRING, TaskState.REVALIDATING}


# Global state machine instance
_state_machine: Optional[TaskStateMachine] = None


def get_state_machine() -> TaskStateMachine:
    """
    Get the global state machine instance (singleton pattern).
    
    Returns:
        The TaskStateMachine instance.
    """
    global _state_machine
    if _state_machine is None:
        _state_machine = TaskStateMachine()
    return _state_machine