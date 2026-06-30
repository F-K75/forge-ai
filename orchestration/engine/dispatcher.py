"""
Agent Dispatcher for the Workflow Engine.

Automatically invokes the appropriate agent based on task state:
- Audit: Security audit tasks
- Planner: Task planning
- Implementation: Code implementation
- Review: Code review
- Validation: Task validation
- Repair: Fix validation failures
- CTO: Final approval

Agents are discovered automatically from AGENT_REGISTRY.
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import threading

from ..helpers import (
    read_tasks, get_task_by_id, update_task, assign_task, start_task,
    complete_task, read_agent_registry, write_log, _timestamp
)
from .state_machine import TaskState, get_state_machine
from .event_bus import get_event_bus, EventType, Event


class AgentCategory(Enum):
    """Categories of agents in the system."""
    AUDIT = "audit"
    PLANNER = "planner"
    IMPLEMENTATION = "implementation"
    REVIEW = "review"
    VALIDATION = "validation"
    REPAIR = "repair"
    CTO = "cto"
    ORCHESTRATOR = "orchestrator"


@dataclass
class AgentCapability:
    """Represents an agent's capabilities."""
    agent_name: str
    can_modify_code: bool
    can_approve: bool
    tools: List[str]
    role: str


@dataclass
class DispatchResult:
    """Result of agent dispatch."""
    task_id: str
    success: bool
    agent_name: str
    agent_category: str
    action: str
    error: Optional[str] = None
    timestamp: str = field(default_factory=_timestamp)


class AgentDispatcher:
    """
    Dispatches tasks to appropriate agents based on task state.
    
    Automatically selects and invokes the correct agent type
    based on the current task state and category.
    """
    
    # Map task states to agent categories
    STATE_TO_AGENT_MAP = {
        TaskState.READY: AgentCategory.ORCHESTRATOR,  # Orchestrator assigns
        TaskState.ASSIGNED: AgentCategory.IMPLEMENTATION,  # Developer implements
        TaskState.IN_PROGRESS: AgentCategory.IMPLEMENTATION,  # Developer continues
        TaskState.UNDER_REVIEW: AgentCategory.REVIEW,  # Code reviewer reviews
        TaskState.VALIDATING: AgentCategory.VALIDATION,  # Validator validates
        TaskState.FAILED: AgentCategory.REPAIR,  # Repair agent fixes
        TaskState.REPAIRING: AgentCategory.REPAIR,  # Repair agent continues
        TaskState.REVALIDATING: AgentCategory.VALIDATION,  # Validator revalidates
        TaskState.APPROVED: AgentCategory.CTO,  # CTO approves
        TaskState.DONE: AgentCategory.ORCHESTRATOR,  # Orchestrator closes
    }
    
    # Map task categories to preferred agent names
    CATEGORY_AGENT_MAP = {
        "security": "security-auditor",
        "audit": "security-auditor",
        "planning": "task-planner",
        "implementation": "developer",
        "development": "developer",
        "review": "code-reviewer",
        "validation": "validator",
        "repair": "repair-agent",
        "approval": "cto",
    }
    
    def __init__(self):
        """Initialize the agent dispatcher."""
        self.state_machine = get_state_machine()
        self.event_bus = get_event_bus()
        self._agent_cache: Dict[str, AgentCapability] = {}
        self._lock = threading.Lock()
        self._load_agent_registry()
    
    def _load_agent_registry(self) -> None:
        """Load and cache agent registry."""
        agents = read_agent_registry()
        with self._lock:
            self._agent_cache = {
                agent["agent"]: AgentCapability(
                    agent_name=agent["agent"],
                    can_modify_code=agent.get("can_modify_code", False),
                    can_approve=agent.get("can_approve", False),
                    tools=agent.get("tools", []),
                    role=agent.get("role", ""),
                )
                for agent in agents
            }
    
    def get_agent_for_task(self, task_id: str) -> Optional[AgentCapability]:
        """
        Get the appropriate agent for a task based on its state and category.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            AgentCapability if a suitable agent is found, None otherwise.
        """
        task = get_task_by_id(task_id)
        if not task:
            return None
        
        # Get task state and category
        try:
            task_state = TaskState(task["status"])
        except ValueError:
            return None
        
        category = task.get("category", "")
        
        # Get agent category from state
        agent_category = self.STATE_TO_AGENT_MAP.get(task_state)
        if not agent_category:
            return None
        
        # Find best matching agent
        preferred_agent_name = self.CATEGORY_AGENT_MAP.get(category)
        
        # Try preferred agent first
        if preferred_agent_name and preferred_agent_name in self._agent_cache:
            return self._agent_cache[preferred_agent_name]
        
        # Fall back to any agent in the category
        with self._lock:
            for agent_name, capability in self._agent_cache.items():
                if agent_category.value in agent_name.lower() or agent_category.value in capability.role.lower():
                    return capability
        
        return None
    
    def dispatch(self, task_id: str, force_state: Optional[TaskState] = None) -> DispatchResult:
        """
        Dispatch a task to the appropriate agent.
        
        Args:
            task_id: The task identifier.
            force_state: Optional state to use instead of current task state.
            
        Returns:
            DispatchResult indicating success/failure.
        """
        task = get_task_by_id(task_id)
        if not task:
            return DispatchResult(
                task_id=task_id,
                success=False,
                agent_name="",
                agent_category="",
                action="dispatch",
                error=f"Task '{task_id}' not found",
            )
        
        # Get current state
        try:
            current_state = force_state or TaskState(task["status"])
        except ValueError:
            return DispatchResult(
                task_id=task_id,
                success=False,
                agent_name="",
                agent_category="",
                action="dispatch",
                error=f"Invalid task state: {task['status']}",
            )
        
        # Get appropriate agent
        agent = self.get_agent_for_task(task_id)
        if not agent:
            return DispatchResult(
                task_id=task_id,
                success=False,
                agent_name="",
                agent_category="",
                action="dispatch",
                error=f"No suitable agent found for task state {current_state.value}",
            )
        
        # Determine action based on state
        action = self._get_action_for_state(current_state)
        
        # Execute dispatch based on action
        try:
            if action == "assign":
                updated_task = assign_task(task_id, agent.agent_name)
                self.event_bus.publish_event(
                    EventType.TASK_ASSIGNED,
                    task_id=task_id,
                    agent=agent.agent_name,
                    action="assign",
                )
            
            elif action == "start":
                updated_task = start_task(task_id)
                self.event_bus.publish_event(
                    EventType.TASK_STARTED,
                    task_id=task_id,
                    agent=agent.agent_name,
                    action="start",
                )
            
            elif action == "complete":
                updated_task = complete_task(task_id)
                self.event_bus.publish_event(
                    EventType.TASK_COMPLETED,
                    task_id=task_id,
                    agent=agent.agent_name,
                    action="complete",
                )
            
            else:
                # For other states, just log the dispatch
                updated_task = task
                self.event_bus.publish_event(
                    EventType.STATE_TRANSITION,
                    task_id=task_id,
                    agent=agent.agent_name,
                    action=action,
                    from_state=current_state.value,
                )
            
            return DispatchResult(
                task_id=task_id,
                success=True,
                agent_name=agent.agent_name,
                agent_category=agent.role,
                action=action,
            )
        
        except Exception as e:
            return DispatchResult(
                task_id=task_id,
                success=False,
                agent_name=agent.agent_name,
                agent_category=agent.role,
                action=action,
                error=str(e),
            )
    
    def _get_action_for_state(self, state: TaskState) -> str:
        """
        Get the appropriate action for a task state.
        
        Args:
            state: The task state.
            
        Returns:
            Action string.
        """
        action_map = {
            TaskState.READY: "assign",
            TaskState.ASSIGNED: "start",
            TaskState.IN_PROGRESS: "continue",
            TaskState.UNDER_REVIEW: "review",
            TaskState.VALIDATING: "validate",
            TaskState.FAILED: "repair",
            TaskState.REPAIRING: "repair",
            TaskState.REVALIDATING: "revalidate",
            TaskState.APPROVED: "approve",
            TaskState.DONE: "close",
        }
        return action_map.get(state, "unknown")
    
    def get_available_agents(self, category: Optional[str] = None) -> List[AgentCapability]:
        """
        Get list of available agents, optionally filtered by category.
        
        Args:
            category: Optional category filter.
            
        Returns:
            List of AgentCapability objects.
        """
        with self._lock:
            agents = list(self._agent_cache.values())
        
        if category:
            agents = [
                a for a in agents
                if category.lower() in a.agent_name.lower() or
                category.lower() in a.role.lower()
            ]
        
        return agents
    
    def get_agent_capabilities(self, agent_name: str) -> Optional[AgentCapability]:
        """
        Get capabilities of a specific agent.
        
        Args:
            agent_name: The agent name.
            
        Returns:
            AgentCapability if found, None otherwise.
        """
        with self._lock:
            return self._agent_cache.get(agent_name)
    
    def can_agent_handle_task(self, agent_name: str, task_id: str) -> bool:
        """
        Check if an agent can handle a specific task.
        
        Args:
            agent_name: The agent name.
            task_id: The task identifier.
            
        Returns:
            True if the agent can handle the task, False otherwise.
        """
        agent = self._agent_cache.get(agent_name)
        if not agent:
            return False
        
        task = get_task_by_id(task_id)
        if not task:
            return False
        
        # Check if agent can modify code when needed
        if task.get("category") in ["implementation", "security", "backend", "frontend"]:
            if not agent.can_modify_code:
                return False
        
        return True
    
    def refresh_registry(self) -> None:
        """Refresh the agent registry from disk."""
        self._load_agent_registry()
        
        write_log(
            agent="dispatcher",
            task="workflow",
            action="registry_refreshed",
            status="DONE",
            detail=f"Agent registry refreshed, {len(self._agent_cache)} agents loaded",
        )
    
    def get_dispatcher_stats(self) -> Dict[str, Any]:
        """
        Get dispatcher statistics.
        
        Returns:
            Dict with dispatcher stats.
        """
        with self._lock:
            total_agents = len(self._agent_cache)
            code_agents = sum(1 for a in self._agent_cache.values() if a.can_modify_code)
            approval_agents = sum(1 for a in self._agent_cache.values() if a.can_approve)
        
        return {
            "total_agents": total_agents,
            "code_modifying_agents": code_agents,
            "approval_agents": approval_agents,
            "agent_names": list(self._agent_cache.keys()),
        }