"""
Dependency Resolver for the Workflow Engine.

Validates that all prerequisites are met before a task can be executed:
- All prerequisite tasks are DONE
- Required agents are available
- Blocking validations have passed
"""

from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

from ..helpers import read_tasks, read_agent_registry, get_task_by_id, _timestamp
from .state_machine import TaskState, get_state_machine


class DependencyType(Enum):
    """Types of dependencies a task can have."""
    TASK = "task"  # Depends on another task completing
    AGENT = "agent"  # Depends on a specific agent being available
    RESOURCE = "resource"  # Depends on a resource being available
    VALIDATION = "validation"  # Depends on a validation passing


@dataclass
class Dependency:
    """Represents a single dependency."""
    type: DependencyType
    target: str  # Task ID, agent name, resource name, or validation ID
    required: bool = True  # If False, dependency is optional
    description: str = ""


@dataclass
class DependencyResult:
    """Result of dependency validation."""
    task_id: str
    satisfied: bool
    missing_dependencies: List[Dependency]
    blocking_dependencies: List[Dependency]
    warnings: List[str]
    timestamp: str = field(default_factory=_timestamp)


class DependencyResolver:
    """
    Resolves and validates task dependencies.
    
    Ensures that tasks are only executed when all their prerequisites
    are met, preventing invalid execution order and resource conflicts.
    """
    
    def __init__(self):
        """Initialize the dependency resolver."""
        self.state_machine = get_state_machine()
        self._resolution_cache: Dict[str, DependencyResult] = {}
    
    def resolve_dependencies(self, task_id: str) -> DependencyResult:
        """
        Resolve all dependencies for a task.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            DependencyResult indicating if all dependencies are satisfied.
        """
        task = get_task_by_id(task_id)
        if not task:
            raise ValueError(f"Task '{task_id}' not found")
        
        dependencies = []
        missing = []
        blocking = []
        warnings = []
        
        # Check task dependencies
        task_deps = task.get("dependencies", [])
        for dep_task_id in task_deps:
            dep_task = get_task_by_id(dep_task_id)
            if not dep_task:
                missing.append(Dependency(
                    type=DependencyType.TASK,
                    target=dep_task_id,
                    required=True,
                    description=f"Task {dep_task_id} not found in registry"
                ))
                blocking.append(Dependency(
                    type=DependencyType.TASK,
                    target=dep_task_id,
                    required=True,
                    description=f"Task {dep_task_id} not found"
                ))
            elif dep_task["status"] != "DONE":
                missing.append(Dependency(
                    type=DependencyType.TASK,
                    target=dep_task_id,
                    required=True,
                    description=f"Task {dep_task_id} is {dep_task['status']}, not DONE"
                ))
                blocking.append(Dependency(
                    type=DependencyType.TASK,
                    target=dep_task_id,
                    required=True,
                    description=f"Task {dep_task_id} not completed"
                ))
        
        # Check blocked_by field (explicit blockers)
        blocked_by = task.get("blocked_by", [])
        for blocker_id in blocked_by:
            blocker_task = get_task_by_id(blocker_id)
            if not blocker_task:
                missing.append(Dependency(
                    type=DependencyType.TASK,
                    target=blocker_id,
                    required=True,
                    description=f"Blocker task {blocker_id} not found"
                ))
                blocking.append(Dependency(
                    type=DependencyType.TASK,
                    target=blocker_id,
                    required=True,
                    description=f"Blocker {blocker_id} not found"
                ))
            elif blocker_task["status"] != "DONE":
                missing.append(Dependency(
                    type=DependencyType.TASK,
                    target=blocker_id,
                    required=True,
                    description=f"Blocker {blocker_id} is {blocker_task['status']}"
                ))
                blocking.append(Dependency(
                    type=DependencyType.TASK,
                    target=blocker_id,
                    required=True,
                    description=f"Blocker {blocker_id} not completed"
                ))
        
        # Check agent availability (if task has an owner requirement)
        # This is implicit - we check if the required agent type exists
        category = task.get("category", "")
        if category:
            # Find agents that can handle this category
            agents = read_agent_registry()
            capable_agents = [
                a for a in agents
                if category in a.get("agent", "").lower() or
                category in a.get("role", "").lower()
            ]
            if not capable_agents:
                warnings.append(f"No agents found for category '{category}'")
        
        # Build result
        result = DependencyResult(
            task_id=task_id,
            satisfied=len(blocking) == 0,
            missing_dependencies=missing,
            blocking_dependencies=blocking,
            warnings=warnings,
        )
        
        # Cache result
        self._resolution_cache[task_id] = result
        
        return result
    
    def can_execute(self, task_id: str) -> Tuple[bool, List[str]]:
        """
        Check if a task can be executed.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            Tuple of (can_execute, list of blocking reasons).
        """
        result = self.resolve_dependencies(task_id)
        
        if result.satisfied:
            return True, []
        else:
            reasons = [d.description for d in result.blocking_dependencies]
            return False, reasons
    
    def get_ready_tasks(self, status_filter: str = "READY") -> List[Dict[str, Any]]:
        """
        Get all tasks that are ready to execute (dependencies satisfied).
        
        Args:
            status_filter: Task status to filter by (default: READY).
            
        Returns:
            List of tasks that can be executed.
        """
        tasks = read_tasks(status_filter=status_filter)
        ready_tasks = []
        
        for task in tasks:
            can_run, _ = self.can_execute(task["id"])
            if can_run:
                ready_tasks.append(task)
        
        return ready_tasks
    
    def get_blocked_tasks(self) -> List[Dict[str, Any]]:
        """
        Get all tasks that are currently blocked.
        
        Returns:
            List of blocked tasks with their blocking reasons.
        """
        tasks = read_tasks()
        blocked_tasks = []
        
        for task in tasks:
            if task["status"] in ["READY", "ASSIGNED", "IN_PROGRESS"]:
                can_run, reasons = self.can_execute(task["id"])
                if not can_run:
                    blocked_tasks.append({
                        "task": task,
                        "blocking_reasons": reasons,
                    })
        
        return blocked_tasks
    
    def get_dependency_chain(self, task_id: str) -> List[str]:
        """
        Get the full dependency chain for a task.
        
        Args:
            task_id: The task identifier.
            
        Returns:
            List of task IDs in dependency order (prerequisites first).
        """
        task = get_task_by_id(task_id)
        if not task:
            return []
        
        chain = []
        visited = set()
        
        def build_chain(tid: str):
            if tid in visited:
                return
            visited.add(tid)
            
            t = get_task_by_id(tid)
            if t:
                # Add dependencies first
                for dep_id in t.get("dependencies", []):
                    build_chain(dep_id)
                
                # Add blocked_by tasks
                for blocker_id in t.get("blocked_by", []):
                    build_chain(blocker_id)
                
                chain.append(tid)
        
        build_chain(task_id)
        return chain
    
    def clear_cache(self, task_id: Optional[str] = None) -> None:
        """
        Clear the resolution cache.
        
        Args:
            task_id: Optional specific task to clear. If None, clears all.
        """
        if task_id:
            self._resolution_cache.pop(task_id, None)
        else:
            self._resolution_cache.clear()
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dict with cache size and hit/miss info.
        """
        return {
            "cached_tasks": len(self._resolution_cache),
            "cached_task_ids": list(self._resolution_cache.keys()),
        }