"""
Agent Runtime
Execution environment for all AI agents in the platform.
Provides lifecycle management, tool orchestration, and state persistence.
"""

import json
import time
import uuid
import hashlib
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable
from enum import Enum
from dataclasses import dataclass, asdict
import threading
import queue


class AgentStatus(Enum):
    INITIALIZING = "INITIALIZING"
    READY = "READY"
    RUNNING = "RUNNING"
    HEARTBEAT = "HEARTBEAT"
    WAITING_FOR_TOOL = "WAITING_FOR_TOOL"
    GENERATING_ARTIFACTS = "GENERATING_ARTIFACTS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class EventType(Enum):
    AGENT_STARTED = "AGENT_STARTED"
    TASK_STARTED = "TASK_STARTED"
    HEARTBEAT = "HEARTBEAT"
    TOOL_STARTED = "TOOL_STARTED"
    TOOL_FINISHED = "TOOL_FINISHED"
    ARTIFACT_CREATED = "ARTIFACT_CREATED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_FAILED = "TASK_FAILED"
    TASK_CANCELLED = "TASK_CANCELLED"
    RUNTIME_ERROR = "RUNTIME_ERROR"
    TASK_LEASE_EXPIRED = "TASK_LEASE_EXPIRED"


@dataclass
class Heartbeat:
    agent_id: str
    task_id: str
    status: str
    progress: float
    cpu_time: float
    memory_usage_mb: float
    tokens_used: int
    estimated_remaining_seconds: int
    timestamp: str

    def to_dict(self):
        return asdict(self)


@dataclass
class ToolUsage:
    tool_name: str
    started_at: str
    finished_at: str
    duration_seconds: float
    success: bool
    error: Optional[str] = None

    def to_dict(self):
        return asdict(self)


@dataclass
class Artifact:
    artifact_id: str
    task_id: str
    agent_id: str
    timestamp: str
    checksum: str
    location: str
    type: str
    version: str

    def to_dict(self):
        return asdict(self)


@dataclass
class ExecutionEvent:
    event_type: str
    timestamp: str
    agent_id: str
    task_id: str
    data: Dict[str, Any]

    def to_dict(self):
        return asdict(self)


class AgentRuntime:
    """
    Runtime environment for executing AI agents.
    Manages lifecycle, state, tools, artifacts, and events.
    """
    
    def __init__(self, runtime_id: str, config: Dict[str, Any]):
        self.runtime_id = runtime_id
        self.config = config
        self.logger = logging.getLogger(f"AgentRuntime.{runtime_id}")
        
        # State
        self.current_agent = None
        self.current_task = None
        self.status = AgentStatus.INITIALIZING
        self.start_time = None
        self.end_time = None
        
        # Metrics
        self.tokens_used = 0
        self.cpu_seconds = 0
        self.memory_mb = 0
        self.files_read = 0
        self.files_modified = 0
        
        # Tracking
        self.heartbeats: List[Heartbeat] = []
        self.tool_usage: List[ToolUsage] = []
        self.artifacts: List[Artifact] = []
        self.events: List[ExecutionEvent] = []
        self.logs: List[str] = []
        self.errors: List[str] = []
        
        # Configuration
        self.heartbeat_interval = config.get("heartbeat_interval_seconds", 30)
        self.max_retries = config.get("max_retries", 3)
        self.retry_delay = config.get("retry_delay_seconds", 5)
        self.lease_duration = config.get("lease_duration_seconds", 3600)
        
        # State persistence
        self.state_file = Path(config.get("state_file", "orchestration/runtime_state.json"))
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Event bus
        self.event_queue = queue.Queue()
        self.event_thread = None
        self.event_handlers: List[Callable] = []
        
        # Cancellation
        self.cancelled = False
        self.cancel_event = threading.Event()
        
        # Tools
        self.initialized_tools = set()
    
    def register_event_handler(self, handler: Callable):
        """Register an event handler."""
        self.event_handlers.append(handler)
    
    def publish_event(self, event_type: EventType, data: Dict[str, Any]):
        """Publish an event to the event bus."""
        event = ExecutionEvent(
            event_type=event_type.value,
            timestamp=datetime.utcnow().isoformat() + "Z",
            agent_id=self.current_agent or "unknown",
            task_id=self.current_task or "unknown",
            data=data
        )
        self.events.append(event)
        self.event_queue.put(event)
        
        # Notify handlers
        for handler in self.event_handlers:
            try:
                handler(event)
            except Exception as e:
                self.logger.error(f"Event handler failed: {e}")
    
    def start_event_processor(self):
        """Start background event processing thread."""
        def process_events():
            while not self.cancel_event.is_set():
                try:
                    event = self.event_queue.get(timeout=1)
                    # Process event (e.g., persist to database, emit to message bus)
                    self.logger.debug(f"Event processed: {event.event_type}")
                except queue.Empty:
                    continue
                except Exception as e:
                    self.logger.error(f"Event processing error: {e}")
        
        self.event_thread = threading.Thread(target=process_events, daemon=True)
        self.event_thread.start()
    
    def initialize(self, agent_id: str, task_id: str, lease_id: str) -> bool:
        """
        Initialize the runtime for a new agent execution.
        
        Returns:
            True if initialization successful, False otherwise
        """
        try:
            self.current_agent = agent_id
            self.current_task = task_id
            self.start_time = datetime.utcnow()
            self.status = AgentStatus.INITIALIZING
            
            self.logger.info(f"Initializing runtime for agent {agent_id}, task {task_id}")
            
            # Verify lease
            if not self._verify_lease(lease_id):
                self.logger.error("Task lease verification failed")
                self.publish_event(EventType.TASK_LEASE_EXPIRED, {
                    "lease_id": lease_id,
                    "reason": "Lease verification failed"
                })
                return False
            
            # Load task context
            if not self._load_task_context(task_id):
                self.logger.error("Failed to load task context")
                return False
            
            # Initialize tools
            self._initialize_tools()
            
            # Start event processor
            self.start_event_processor()
            
            self.status = AgentStatus.READY
            self.publish_event(EventType.AGENT_STARTED, {
                "agent_id": agent_id,
                "task_id": task_id,
                "lease_id": lease_id
            })
            
            self.logger.info(f"Runtime initialized successfully for {agent_id}")
            return True
            
        except Exception as e:
            self.logger.error(f"Initialization failed: {e}")
            self.errors.append(f"Initialization error: {str(e)}")
            return False
    
    def _verify_lease(self, lease_id: str) -> bool:
        """Verify task lease is valid."""
        # In a real implementation, check lease database
        # For now, accept all leases
        return True
    
    def _load_task_context(self, task_id: str) -> bool:
        """Load task context from orchestration files."""
        try:
            # Load current task
            task_file = Path("orchestration/CURRENT_TASK.json")
            if task_file.exists():
                with open(task_file) as f:
                    task_data = json.load(f)
                if task_data.get("task_id") != task_id:
                    self.logger.warning(f"Task ID mismatch: expected {task_id}, got {task_data.get('task_id')}")
                    return False
            else:
                self.logger.warning("CURRENT_TASK.json not found")
                return False
            
            self.files_read += 1
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to load task context: {e}")
            return False
    
    def _initialize_tools(self):
        """Initialize approved tools for the agent."""
        approved_tools = self.config.get("approved_tools", [])
        
        for tool in approved_tools:
            if tool not in self.initialized_tools:
                try:
                    self._initialize_tool(tool)
                    self.initialized_tools.add(tool)
                    self.logger.debug(f"Tool initialized: {tool}")
                except Exception as e:
                    self.logger.error(f"Failed to initialize tool {tool}: {e}")
    
    def _initialize_tool(self, tool_name: str):
        """Initialize a specific tool."""
        # Tool initialization logic
        # In a real implementation, this would initialize actual tool instances
        pass
    
    def execute(self, agent_func: Callable) -> Dict[str, Any]:
        """
        Execute the agent function with full lifecycle management.
        
        Args:
            agent_func: The agent function to execute
            
        Returns:
            Execution result dictionary
        """
        try:
            self.status = AgentStatus.RUNNING
            self.publish_event(EventType.TASK_STARTED, {
                "agent_id": self.current_agent,
                "task_id": self.current_task
            })
            
            # Start heartbeat thread
            heartbeat_thread = self._start_heartbeat_thread()
            
            # Execute with retry logic
            result = self._execute_with_retry(agent_func)
            
            # Stop heartbeat
            self.cancel_event.set()
            if heartbeat_thread:
                heartbeat_thread.join(timeout=5)
            
            # Generate artifacts
            self.status = AgentStatus.GENERATING_ARTIFACTS
            self._register_artifacts(result)
            
            # Complete
            self.status = AgentStatus.COMPLETED
            self.end_time = datetime.utcnow()
            
            self.publish_event(EventType.TASK_COMPLETED, {
                "agent_id": self.current_agent,
                "task_id": self.current_task,
                "duration_seconds": self._get_duration()
            })
            
            return self._build_output(result)
            
        except Exception as e:
            self.status = AgentStatus.FAILED
            self.end_time = datetime.utcnow()
            self.errors.append(f"Execution error: {str(e)}")
            
            self.publish_event(EventType.TASK_FAILED, {
                "agent_id": self.current_agent,
                "task_id": self.current_task,
                "error": str(e)
            })
            
            return self._build_output({"error": str(e)})
    
    def _execute_with_retry(self, agent_func: Callable, attempt: int = 1) -> Dict[str, Any]:
        """Execute agent function with retry logic."""
        try:
            return agent_func(self)
        except Exception as e:
            if attempt < self.max_retries and self._is_retryable_error(e):
                self.logger.warning(f"Retryable error on attempt {attempt}: {e}")
                time.sleep(self.retry_delay)
                return self._execute_with_retry(agent_func, attempt + 1)
            else:
                raise
    
    def _is_retryable_error(self, error: Exception) -> bool:
        """Determine if an error is retryable."""
        retryable_errors = [
            "timeout",
            "network",
            "temporary",
            "rate limit",
            "service unavailable"
        ]
        error_str = str(error).lower()
        return any(retryable in error_str for retryable in retryable_errors)
    
    def _start_heartbeat_thread(self) -> threading.Thread:
        """Start heartbeat reporting thread."""
        def heartbeat_loop():
            while not self.cancel_event.is_set():
                self._send_heartbeat()
                self.cancel_event.wait(self.heartbeat_interval)
        
        thread = threading.Thread(target=heartbeat_loop, daemon=True)
        thread.start()
        return thread
    
    def _send_heartbeat(self):
        """Send heartbeat signal."""
        if self.status == AgentStatus.CANCELLED:
            return
        
        heartbeat = Heartbeat(
            agent_id=self.current_agent or "unknown",
            task_id=self.current_task or "unknown",
            status=self.status.value,
            progress=self._calculate_progress(),
            cpu_time=self.cpu_seconds,
            memory_usage_mb=self.memory_mb,
            tokens_used=self.tokens_used,
            estimated_remaining_seconds=self._estimate_remaining(),
            timestamp=datetime.utcnow().isoformat() + "Z"
        )
        
        self.heartbeats.append(heartbeat)
        self.publish_event(EventType.HEARTBEAT, heartbeat.to_dict())
    
    def _calculate_progress(self) -> float:
        """Calculate execution progress percentage."""
        if self.status == AgentStatus.COMPLETED:
            return 100.0
        elif self.status == AgentStatus.FAILED:
            return 0.0
        else:
            # Estimate based on time elapsed
            if self.start_time:
                elapsed = (datetime.utcnow() - self.start_time).total_seconds()
                estimated_total = 300  # Assume 5 minutes average task time
                progress = min(90.0, (elapsed / estimated_total) * 100)
                return progress
            return 0.0
    
    def _estimate_remaining(self) -> int:
        """Estimate remaining execution time in seconds."""
        progress = self._calculate_progress()
        if progress >= 100:
            return 0
        elif progress > 0:
            elapsed = (datetime.utcnow() - self.start_time).total_seconds()
            return int((elapsed / progress) * (100 - progress))
        return 300  # Default 5 minutes
    
    def _get_duration(self) -> float:
        """Get execution duration in seconds."""
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return 0.0
    
    def _register_artifacts(self, result: Dict[str, Any]):
        """Register artifacts from execution result."""
        # Implementation reports
        if "implementation_report" in result:
            self._register_artifact(
                artifact_type="implementation_report",
                filename=result["implementation_report"],
                location=result["implementation_report"]
            )
        
        # Validation reports
        if "validation_report" in result:
            self._register_artifact(
                artifact_type="validation_report",
                filename=result["validation_report"],
                location=result["validation_report"]
            )
        
        # Modified files
        for filepath in result.get("modified_files", []):
            self._register_artifact(
                artifact_type="source_code",
                filename=Path(filepath).name,
                location=filepath
            )
        
        # Created files
        for filepath in result.get("created_files", []):
            self._register_artifact(
                artifact_type="new_file",
                filename=Path(filepath).name,
                location=filepath
            )
    
    def _register_artifact(
        self,
        artifact_type: str,
        filename: str,
        location: str
    ):
        """Register a single artifact."""
        artifact_id = f"ART-{self.current_task}-{uuid.uuid4().hex[:8]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Calculate checksum
        filepath = Path(location)
        checksum = self._calculate_file_checksum(filepath) if filepath.exists() else ""
        
        artifact = Artifact(
            artifact_id=artifact_id,
            task_id=self.current_task,
            agent_id=self.current_agent,
            timestamp=timestamp,
            checksum=checksum,
            location=location,
            type=artifact_type,
            version="1.0"
        )
        
        self.artifacts.append(artifact)
        self.publish_event(EventType.ARTIFACT_CREATED, artifact.to_dict())
        
        self.logger.debug(f"Artifact registered: {artifact_id}")
    
    def _calculate_file_checksum(self, filepath: Path) -> str:
        """Calculate SHA256 checksum of a file."""
        if not filepath.exists():
            return ""
        
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def _build_output(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Build final execution output."""
        return {
            "runtime": {
                "runtime_id": self.runtime_id,
                "agent": self.current_agent,
                "agent_version": "1.0",
                "task_id": self.current_task,
                "execution_id": str(uuid.uuid4()),
                "status": self.status.value
            },
            "execution": {
                "started_at": self.start_time.isoformat() + "Z" if self.start_time else "",
                "completed_at": self.end_time.isoformat() + "Z" if self.end_time else "",
                "duration_seconds": self._get_duration(),
                "progress": self._calculate_progress()
            },
            "heartbeats": [h.to_dict() for h in self.heartbeats],
            "tool_usage": [t.to_dict() for t in self.tool_usage],
            "artifacts": [a.to_dict() for a in self.artifacts],
            "metrics": {
                "tokens_used": self.tokens_used,
                "cpu_seconds": self.cpu_seconds,
                "memory_mb": self.memory_mb,
                "files_read": self.files_read,
                "files_modified": self.files_modified
            },
            "events": [e.to_dict() for e in self.events],
            "logs": self.logs,
            "errors": self.errors,
            "next_action": "Persist state and release lease"
        }
    
    def cancel(self):
        """Cancel execution gracefully."""
        self.logger.info("Cancellation requested")
        self.cancelled = True
        self.cancel_event.set()
        self.status = AgentStatus.CANCELLED
        
        self.publish_event(EventType.TASK_CANCELLED, {
            "agent_id": self.current_agent,
            "task_id": self.current_task,
            "reason": "User requested cancellation"
        })
    
    def persist_state(self):
        """Persist execution state to disk."""
        state = {
            "runtime_id": self.runtime_id,
            "agent": self.current_agent,
            "task_id": self.current_task,
            "status": self.status.value,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "tokens_used": self.tokens_used,
            "cpu_seconds": self.cpu_seconds,
            "memory_mb": self.memory_mb,
            "artifacts_count": len(self.artifacts),
            "errors": self.errors
        }
        
        try:
            with open(self.state_file, "w") as f:
                json.dump(state, f, indent=2)
            self.logger.debug("State persisted successfully")
        except Exception as e:
            self.logger.error(f"Failed to persist state: {e}")
    
    def log(self, message: str, level: str = "INFO"):
        """Add a log message."""
        timestamp = datetime.utcnow().isoformat() + "Z"
        log_entry = f"[{timestamp}] [{level}] {message}"
        self.logs.append(log_entry)
        
        if level == "ERROR":
            self.logger.error(message)
        elif level == "WARNING":
            self.logger.warning(message)
        else:
            self.logger.info(message)
    
    def track_tool_usage(self, tool_name: str, func: Callable, *args, **kwargs):
        """
        Track tool usage with timing and error handling.
        
        Usage:
            result = runtime.track_tool_usage("git", git_func, arg1, arg2)
        """
        started_at = datetime.utcnow().isoformat() + "Z"
        self.publish_event(EventType.TOOL_STARTED, {
            "tool_name": tool_name,
            "started_at": started_at
        })
        
        try:
            result = func(*args, **kwargs)
            finished_at = datetime.utcnow().isoformat() + "Z"
            duration = (datetime.fromisoformat(finished_at[:-1]) - datetime.fromisoformat(started_at[:-1])).total_seconds()
            
            usage = ToolUsage(
                tool_name=tool_name,
                started_at=started_at,
                finished_at=finished_at,
                duration_seconds=duration,
                success=True
            )
            self.tool_usage.append(usage)
            
            self.publish_event(EventType.TOOL_FINISHED, {
                "tool_name": tool_name,
                "success": True,
                "duration_seconds": duration
            })
            
            return result
            
        except Exception as e:
            finished_at = datetime.utcnow().isoformat() + "Z"
            duration = (datetime.fromisoformat(finished_at[:-1]) - datetime.fromisoformat(started_at[:-1])).total_seconds()
            
            usage = ToolUsage(
                tool_name=tool_name,
                started_at=started_at,
                finished_at=finished_at,
                duration_seconds=duration,
                success=False,
                error=str(e)
            )
            self.tool_usage.append(usage)
            
            self.publish_event(EventType.TOOL_FINISHED, {
                "tool_name": tool_name,
                "success": False,
                "error": str(e),
                "duration_seconds": duration
            })
            
            raise


def create_runtime(runtime_id: str, config: Dict[str, Any]) -> AgentRuntime:
    """Factory function to create an AgentRuntime instance."""
    return AgentRuntime(runtime_id, config)


def main():
    """Main entry point for Agent Runtime."""
    import sys
    
    if len(sys.argv) < 4:
        print("Usage: agent_runtime.py <runtime_id> <agent_id> <task_id> <lease_id>")
        sys.exit(1)
    
    runtime_id = sys.argv[1]
    agent_id = sys.argv[2]
    task_id = sys.argv[3]
    lease_id = sys.argv[4]
    
    # Load configuration
    config = {
        "heartbeat_interval_seconds": 30,
        "max_retries": 3,
        "retry_delay_seconds": 5,
        "lease_duration_seconds": 3600,
        "approved_tools": ["filesystem", "git", "docker"],
        "state_file": "orchestration/runtime_state.json"
    }
    
    runtime = create_runtime(runtime_id, config)
    
    # Initialize
    if not runtime.initialize(agent_id, task_id, lease_id):
        print(json.dumps({"error": "Initialization failed"}, indent=2))
        sys.exit(1)
    
    # Example agent function (in real use, this would be loaded from agent module)
    def example_agent(rt: AgentRuntime) -> Dict[str, Any]:
        rt.log("Example agent executing")
        rt.tokens_used = 1000
        rt.files_read = 5
        return {"status": "completed"}
    
    # Execute
    result = runtime.execute(example_agent)
    
    # Persist state
    runtime.persist_state()
    
    # Output result
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()