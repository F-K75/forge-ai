# Agent Contract
# Formal interface specification for all platform agents

## Overview

Every agent in the Forge-AI platform must implement this contract. This ensures consistency, enables the Agent Runtime to manage any agent uniformly, and allows the Knowledge Service to provide context to any agent.

## Interface Definition

```typescript
interface Agent {
  // Lifecycle
  initialize(context: AgentContext): Promise<void>;
  canHandle(task: Task): boolean;
  execute(task: Task): Promise<AgentResult>;
  heartbeat(): AgentHealth;
  cancel(): Promise<void>;
  resume(): Promise<void>;
  
  // Artifacts
  collectArtifacts(): Promise<Artifact[]>;
  
  // Metadata
  getCapabilities(): AgentCapabilities;
  getStatus(): AgentStatus;
}
```

## Supporting Types

```typescript
interface AgentContext {
  runtime: AgentRuntime;
  knowledge: KnowledgeService;
  tools: ToolGateway;
  task: Task;
  config: AgentConfig;
}

interface Task {
  taskId: string;
  title: string;
  description: string;
  phase: number;
  priority: Priority;
  acceptanceCriteria: Criterion[];
  dependencies: string[];
  affectedFiles: string[];
  estimatedHours: number;
}

interface AgentResult {
  success: boolean;
  status: AgentStatus;
  output: any;
  artifacts: Artifact[];
  errors: Error[];
  metrics: AgentMetrics;
}

interface Artifact {
  artifactId: string;
  type: ArtifactType;
  filename: string;
  location: string;
  checksum: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
  taskId: string;
  verified: boolean;
}

interface AgentHealth {
  status: AgentStatus;
  progress: number;
  lastHeartbeat: string;
  cpuTime: number;
  memoryUsageMB: number;
  tokensUsed: number;
  estimatedRemainingSeconds: number;
}

interface AgentCapabilities {
  agentId: string;
  agentType: AgentType;
  supportedTaskTypes: string[];
  tools: string[];
  maxConcurrency: number;
  estimatedDuration: number;
}

interface AgentConfig {
  heartbeatIntervalSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  leaseDurationSeconds: number;
  approvedTools: string[];
}

enum AgentStatus {
  INITIALIZING = "INITIALIZING",
  READY = "READY",
  RUNNING = "RUNNING",
  HEARTBEAT = "HEARTBEAT",
  WAITING_FOR_TOOL = "WAITING_FOR_TOOL",
  GENERATING_ARTIFACTS = "GENERATING_ARTIFACTS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED"
}

enum AgentType {
  PLANNER = "planner",
  SCHEDULER = "scheduler",
  IMPLEMENTATION = "implementation",
  VALIDATION = "validation",
  EVIDENCE = "evidence",
  KNOWLEDGE = "knowledge",
  SECURITY = "security",
  DATABASE = "database",
  PERFORMANCE = "performance",
  BUSINESS = "business"
}

enum Priority {
  P0 = "P0",
  P1 = "P1",
  P2 = "P2",
  P3 = "P3"
}

enum ArtifactType {
  IMPLEMENTATION_REPORT = "implementation_report",
  VALIDATION_REPORT = "validation_report",
  SOURCE_CODE = "source_code",
  NEW_FILE = "new_file",
  BUILD_LOG = "build_log",
  TEST_RESULT = "test_result",
  SECURITY_SCAN = "security_scan",
  DOCUMENTATION = "documentation"
}
```

## Python Implementation

```python
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime

class Agent(ABC):
    """
    Base agent interface that all agents must implement.
    """
    
    @abstractmethod
    async def initialize(self, context: Dict[str, Any]) -> bool:
        """
        Initialize agent with context from runtime.
        
        Args:
            context: AgentContext containing runtime, knowledge, tools, task, config
            
        Returns:
            True if initialization successful
        """
        pass
    
    @abstractmethod
    def can_handle(self, task: Dict[str, Any]) -> bool:
        """
        Determine if this agent can handle the given task.
        
        Args:
            task: Task definition
            
        Returns:
            True if agent can handle this task type
        """
        pass
    
    @abstractmethod
    async def execute(self, runtime: 'AgentRuntime') -> Dict[str, Any]:
        """
        Execute the assigned task.
        
        Args:
            runtime: AgentRuntime instance for logging, metrics, artifacts
            
        Returns:
            AgentResult with success status, output, artifacts, errors
        """
        pass
    
    @abstractmethod
    async def heartbeat(self) -> Dict[str, Any]:
        """
        Report agent health and progress.
        
        Returns:
            AgentHealth with status, progress, metrics
        """
        pass
    
    @abstractmethod
    async def cancel(self):
        """
        Gracefully cancel execution.
        """
        pass
    
    @abstractmethod
    async def resume(self):
        """
        Resume from cancelled state.
        """
        pass
    
    @abstractmethod
    async def collect_artifacts(self) -> List[Dict[str, Any]]:
        """
        Collect all artifacts produced during execution.
        
        Returns:
            List of Artifact dictionaries
        """
        pass
    
    @abstractmethod
    def get_capabilities(self) -> Dict[str, Any]:
        """
        Return agent capabilities and metadata.
        
        Returns:
            AgentCapabilities dictionary
        """
        pass
    
    @abstractmethod
    def get_status(self) -> str:
        """
        Return current agent status.
        
        Returns:
            AgentStatus string
        """
        pass
```

## Implementation Example

```python
from orchestration.agent_runtime import AgentRuntime
from orchestration.tool_gateway import ToolGateway
from orchestration.knowledge_service import KnowledgeService

class ImplementationEngineer(Agent):
    """
    Implementation Engineer agent.
    Executes engineering tasks and produces code changes.
    """
    
    def __init__(self):
        self.agent_id = "implementation-engineer"
        self.agent_type = AgentType.IMPLEMENTATION
        self.runtime = None
        self.knowledge = None
        self.tools = None
        self.task = None
        self.status = AgentStatus.INITIALIZING
        self.capabilities = AgentCapabilities(
            agentId=self.agent_id,
            agentType=self.agent_type,
            supportedTaskTypes=["SEC", "DEV", "BE", "FE"],
            tools=["filesystem", "git", "docker", "terminal"],
            maxConcurrency=1,
            estimatedDuration=300
        )
    
    async def initialize(self, context: Dict[str, Any]) -> bool:
        """Initialize agent with context."""
        try:
            self.runtime = context.get("runtime")
            self.knowledge = context.get("knowledge")
            self.tools = context.get("tools")
            self.task = context.get("task")
            self.config = context.get("config")
            
            self.runtime.log(f"Initializing {self.agent_id}")
            
            # Get relevant knowledge
            if self.knowledge:
                knowledge_context = self.knowledge.get_context_for_agent(
                    self.agent_id,
                    self.task.get("taskId"),
                    self.task.get("title")
                )
                self.runtime.log(f"Loaded {len(knowledge_context.get('relevant_knowledge', []))} knowledge items")
            
            self.status = AgentStatus.READY
            return True
            
        except Exception as e:
            self.runtime.log(f"Initialization failed: {e}", "ERROR")
            return False
    
    def can_handle(self, task: Dict[str, Any]) -> bool:
        """Check if this agent can handle the task."""
        task_id = task.get("taskId", "")
        supported_prefixes = ["SEC-", "DEV-", "BE-", "FE-"]
        return any(task_id.startswith(prefix) for prefix in supported_prefixes)
    
    async def execute(self, runtime: AgentRuntime) -> Dict[str, Any]:
        """Execute the task."""
        try:
            self.status = AgentStatus.RUNNING
            runtime.log(f"Executing task: {self.task.get('taskId')}")
            
            # Read affected files
            affected_files = self.task.get("affectedFiles", [])
            for filepath in affected_files:
                if runtime:
                    content = runtime.track_tool_usage(
                        "filesystem",
                        self._read_file,
                        filepath
                    )
                    runtime.files_read += 1
            
            # Implement task (agent-specific logic here)
            result = await self._implement_task(runtime)
            
            # Write modified files
            for filepath in result.get("modified_files", []):
                content = result.get("content", "")
                runtime.track_tool_usage(
                    "filesystem",
                    self._write_file,
                    filepath,
                    content
                )
                runtime.files_modified += 1
            
            # Generate implementation report
            report = self._generate_implementation_report(result)
            runtime.log(f"Task completed: {self.task.get('taskId')}")
            
            self.status = AgentStatus.COMPLETED
            return {
                "success": True,
                "status": self.status.value,
                "output": result,
                "artifacts": [report],
                "errors": [],
                "metrics": {
                    "files_modified": len(result.get("modified_files", [])),
                    "files_created": len(result.get("created_files", []))
                }
            }
            
        except Exception as e:
            self.status = AgentStatus.FAILED
            runtime.log(f"Task failed: {e}", "ERROR")
            return {
                "success": False,
                "status": self.status.value,
                "output": None,
                "artifacts": [],
                "errors": [{"error": str(e)}],
                "metrics": {}
            }
    
    async def _implement_task(self, runtime: AgentRuntime) -> Dict[str, Any]:
        """Implement the task (agent-specific logic)."""
        # This is where the actual implementation happens
        # Different agents will have different implementations
        return {
            "modified_files": [],
            "created_files": [],
            "content": ""
        }
    
    def _read_file(self, filepath: str) -> str:
        """Read file content."""
        with open(filepath) as f:
            return f.read()
    
    def _write_file(self, filepath: str, content: str):
        """Write file content."""
        with open(filepath, "w") as f:
            f.write(content)
    
    def _generate_implementation_report(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Generate implementation report artifact."""
        return {
            "artifactId": f"ART-{self.task.get('taskId')}-IMPL-001",
            "type": "implementation_report",
            "filename": f"IMPLEMENTATION_REPORT_{self.task.get('taskId')}.json",
            "location": f"orchestration/IMPLEMENTATION_REPORT_{self.task.get('taskId')}.json",
            "taskId": self.task.get("taskId")
        }
    
    async def heartbeat(self) -> Dict[str, Any]:
        """Report health."""
        return {
            "agentId": self.agent_id,
            "taskId": self.task.get("taskId") if self.task else "unknown",
            "status": self.status.value,
            "progress": 50.0,  # Implement progress tracking
            "cpuTime": 0.0,
            "memoryUsageMB": 0.0,
            "tokensUsed": 0,
            "estimatedRemainingSeconds": 60
        }
    
    async def cancel(self):
        """Cancel execution."""
        self.status = AgentStatus.CANCELLED
    
    async def resume(self):
        """Resume execution."""
        self.status = AgentStatus.RUNNING
    
    async def collect_artifacts(self) -> List[Dict[str, Any]]:
        """Collect artifacts."""
        return []
    
    def get_capabilities(self) -> Dict[str, Any]:
        """Return capabilities."""
        return self.capabilities.to_dict()
    
    def get_status(self) -> str:
        """Return status."""
        return self.status.value
```

## Agent Registration

```python
class AgentRegistry:
    """
    Registry for all platform agents.
    """
    
    def __init__(self):
        self.agents: Dict[str, Agent] = {}
        self.agent_types: Dict[AgentType, List[Agent]] = {}
    
    def register(self, agent: Agent):
        """Register an agent."""
        self.agents[agent.agent_id] = agent
        
        agent_type = agent.capabilities.agentType
        if agent_type not in self.agent_types:
            self.agent_types[agent_type] = []
        self.agent_types[agent_type].append(agent)
    
    def get_agent(self, agent_id: str) -> Optional[Agent]:
        """Get agent by ID."""
        return self.agents.get(agent_id)
    
    def find_agent_for_task(self, task: Dict[str, Any]) -> Optional[Agent]:
        """Find agent that can handle the task."""
        for agent in self.agents.values():
            if agent.can_handle(task):
                return agent
        return None
    
    def get_agents_by_type(self, agent_type: AgentType) -> List[Agent]:
        """Get all agents of a specific type."""
        return self.agent_types.get(agent_type, [])
```

## Usage with Agent Runtime

```python
from orchestration.agent_runtime import AgentRuntime
from orchestration.knowledge_service import KnowledgeService
from orchestration.tool_gateway import ToolGateway

# Initialize platform services
runtime = AgentRuntime("runtime-001", config)
knowledge = KnowledgeService()
tools = ToolGateway()

# Register agents
registry = AgentRegistry()
registry.register(ImplementationEngineer())
registry.register(ValidationAgent())
registry.register(EvidenceCollectorAgent())

# Find agent for task
task = load_task("SEC-001")
agent = registry.find_agent_for_task(task)

if agent:
    # Initialize agent
    context = {
        "runtime": runtime,
        "knowledge": knowledge,
        "tools": tools,
        "task": task,
        "config": config
    }
    
    await agent.initialize(context)
    
    # Execute with runtime
    result = runtime.execute(agent.execute)
    
    # Collect artifacts
    artifacts = await agent.collect_artifacts()
    
    # Persist state
    runtime.persist_state()
```

## Contract Rules

1. **Never modify source code** — Agents only read/write through approved tools
2. **Never expose secrets** — All sensitive data redacted
3. **Always emit events** — Use runtime.publish_event() for all significant actions
4. **Always register artifacts** — All outputs must be registered with checksums
5. **Always respect cancellation** — Check runtime.cancelled flag regularly
6. **Never retry validation failures** — Only retry transient errors
7. **Always preserve state** — Persist state before completion
8. **Always log actions** — Use runtime.log() for all significant events

## Status

✅ **COMPLETE** — Agent contract defined and documented

## Next Steps

1. Refactor existing agents to implement formal contract
2. Create AgentRegistry for agent discovery
3. Integrate Knowledge Service as shared platform service
4. Update Agent Runtime to use contract interface
5. Create agent capability discovery mechanism