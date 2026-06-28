from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class AgentType(str, Enum):
    ARCHITECT = "architect"
    DESIGNER = "designer"
    DEVELOPER = "developer"
    INTEGRATION = "integration"
    PM = "pm"
    BUSINESS_IMPROVER = "business_improver"
    DEBUGGER = "debugger"


class BuildStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    DEBUGGING = "debugging"


class PlanTier(str, Enum):
    FREE = "free"
    STANDARD = "standard"
    PRO = "pro"
    ENTERPRISE = "enterprise"


# --- User ---

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    avatar_url: Optional[str] = None
    github_token: Optional[str] = None
    plan: PlanTier = PlanTier.FREE
    credits: int = 10
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Project ---

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    description: str = ""
    github_repo: Optional[str] = None
    github_branch: str = "main"
    deployed_url: Optional[str] = None
    tech_stack: Dict[str, str] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# --- Build ---

class AgentStep(BaseModel):
    agent: AgentType
    status: BuildStatus = BuildStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    output: str = ""
    files_changed: List[str] = []
    error: Optional[str] = None


class Build(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    user_id: str
    prompt: str
    status: BuildStatus = BuildStatus.PENDING
    agents: List[AgentStep] = []
    credits_used: int = 0
    context_tokens: int = 0
    files: Dict[str, str] = {}  # path -> content
    debug_iterations: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


# --- Message ---

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    user_id: str
    role: str  # user | assistant
    content: str
    build_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- WebSocket events ---

class WSEventType(str, Enum):
    # Agent lifecycle
    AGENT_START = "agent_start"
    AGENT_UPDATE = "agent_update"
    AGENT_PROGRESS = "agent_progress"
    AGENT_COMPLETE = "agent_complete"

    # Build lifecycle
    BUILD_START = "build_start"
    BUILD_COMPLETE = "build_complete"
    BUILD_FAILED = "build_failed"

    # File + preview updates
    FILE_UPDATE = "file_update"
    PREVIEW_UPDATE = "preview_update"

    # Errors
    ERROR = "error"

    # Existing internal/debug events
    DEBUG_START = "debug_start"
    STREAM_TOKEN = "stream_token"
    CREDITS_UPDATE = "credits_update"



class WSEvent(BaseModel):
    type: WSEventType
    build_id: str
    data: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)
