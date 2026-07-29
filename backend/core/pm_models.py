"""Domain models for the AI-native Agile Project Management layer.

Kept separate from core/models.py (which owns the "one AI-built app + its
builds" domain) because this is a distinct concept sitting *above* it: an
Initiative is a product/engineering plan (vision -> PRD -> epics -> stories ->
tasks -> sprints) that can spawn one or more core.models.Project app-builds as
execution targets. Same conventions as core/models.py throughout: Pydantic
BaseModel, UUID4 string ids, no ORM -- routes persist via Motor dicts.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from core.models import utcnow
from enum import Enum
import uuid


class InitiativeStatus(str, Enum):
    DRAFT = "draft"
    GENERATING = "generating"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    FAILED = "failed"


class Priority(str, Enum):
    P0 = "p0"
    P1 = "p1"
    P2 = "p2"
    P3 = "p3"


class WorkItemStatus(str, Enum):
    BACKLOG = "backlog"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class TaskStatus(str, Enum):
    """Kanban columns (Module 8)."""
    BACKLOG = "backlog"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    CODE_REVIEW = "code_review"
    TESTING = "testing"
    BLOCKED = "blocked"
    DONE = "done"
    SUPPORT = "support"


class TaskCategory(str, Enum):
    BACKEND = "backend"
    FRONTEND = "frontend"
    DATABASE = "database"
    INFRASTRUCTURE = "infrastructure"
    TESTING = "testing"
    DOCUMENTATION = "documentation"
    SECURITY = "security"
    DEPLOYMENT = "deployment"


class PMAgentRole(str, Enum):
    """Distinct from core.models.AgentType -- that enum is specifically the
    fixed 6-agent app-build pipeline. This is the roster of agents (and the
    human escape hatch) that can own PM work items."""
    BUSINESS_ANALYST = "business_analyst"
    PRODUCT_MANAGER = "product_manager"
    ARCHITECT = "architect_agent"
    SCRUM_MASTER = "scrum_master"
    SPRINT_PLANNER = "sprint_planner"
    BACKEND = "backend_agent"
    FRONTEND = "frontend_agent"
    DATABASE = "database_agent"
    INFRASTRUCTURE = "infrastructure_agent"
    SECURITY = "security_agent"
    QA = "qa_agent"
    DEVOPS = "devops_agent"
    DOCUMENTATION = "documentation_agent"
    HUMAN = "human"


class SprintStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"


class ReleaseStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    RELEASED = "released"


class AgentExecStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# --- Initiative (Module 1) ---


class Initiative(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    org_id: Optional[str] = None
    name: str
    prompt: str
    status: InitiativeStatus = InitiativeStatus.DRAFT
    vision: str = ""
    business_goals: List[str] = []
    product_scope: str = ""
    functional_requirements: List[str] = []
    non_functional_requirements: List[str] = []
    success_metrics: List[str] = []
    roadmap: List[Dict[str, Any]] = []
    tech_stack: List[str] = []
    risks: List[Dict[str, Any]] = []
    estimated_timeline: str = ""
    # Forge app-build Projects (core.models.Project) spawned to execute this plan.
    project_ids: List[str] = []
    generation_error: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# --- PRD (Module 2) ---


class PRD(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    executive_summary: str = ""
    problem_statement: str = ""
    solution: str = ""
    personas: List[Dict[str, Any]] = []
    user_journeys: List[Dict[str, Any]] = []
    functional_requirements: List[str] = []
    non_functional_requirements: List[str] = []
    security: str = ""
    performance: str = ""
    scalability: str = ""
    api_overview: str = ""
    database_overview: str = ""
    release_plan: str = ""
    version: int = 1
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# --- Epic / Story / Task (Modules 3-5) ---


class Epic(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    title: str
    description: str = ""
    priority: Priority = Priority.P2
    story_points: int = 0
    estimated_duration: str = ""
    dependencies: List[str] = []  # other Epic ids
    owner: str = PMAgentRole.HUMAN.value
    status: WorkItemStatus = WorkItemStatus.BACKLOG
    order: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Story(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    epic_id: str
    initiative_id: str
    title: str
    description: str = ""
    acceptance_criteria: List[str] = []
    definition_of_done: List[str] = []
    priority: Priority = Priority.P2
    story_points: int = 0
    business_value: str = ""
    risk: str = "low"
    dependencies: List[str] = []  # other Story ids
    status: WorkItemStatus = WorkItemStatus.BACKLOG
    order: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    story_id: str
    epic_id: str
    initiative_id: str
    title: str
    description: str = ""
    category: TaskCategory = TaskCategory.BACKEND
    estimated_hours: float = 0
    complexity: str = "medium"  # low | medium | high
    required_skills: List[str] = []
    dependencies: List[str] = []  # other Task ids
    assigned_agent: PMAgentRole = PMAgentRole.HUMAN
    status: TaskStatus = TaskStatus.BACKLOG
    labels: List[str] = []
    sprint_id: Optional[str] = None
    kanban_order: int = 0
    generated_files: List[str] = []
    # branch, pr_number, pr_url, commit_shas, review_status, merge_status (Module 13)
    github: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# --- Sprints + Scrum ceremonies (Modules 6-7) ---


class Sprint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    sprint_number: int
    name: str = ""
    goal: str = ""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    task_ids: List[str] = []
    capacity: int = 0
    velocity: int = 0
    story_points_planned: int = 0
    story_points_completed: int = 0
    team_load: Dict[str, int] = {}
    agent_load: Dict[str, int] = {}
    completion_probability: float = 0.0
    status: SprintStatus = SprintStatus.PLANNED
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class StandUp(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sprint_id: str
    initiative_id: str
    date: datetime = Field(default_factory=utcnow)
    yesterday: str = ""
    today: str = ""
    blockers: List[str] = []
    risks: List[str] = []
    sprint_health: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class SprintReview(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sprint_id: str
    initiative_id: str
    summary: str = ""
    completed_tasks: List[str] = []
    demo_notes: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class SprintRetro(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sprint_id: str
    initiative_id: str
    what_went_well: List[str] = []
    what_went_wrong: List[str] = []
    action_items: List[str] = []
    created_at: datetime = Field(default_factory=utcnow)


class RiskReport(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    sprint_id: Optional[str] = None
    risks: List[Dict[str, Any]] = []  # {description, severity, likelihood, mitigation}
    created_at: datetime = Field(default_factory=utcnow)


class TechDebtSummary(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    items: List[Dict[str, Any]] = []  # {description, location, severity, effort_to_fix}
    created_at: datetime = Field(default_factory=utcnow)


# --- Agent execution (Modules 9-10) ---


class AgentExecution(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str
    initiative_id: str
    agent: PMAgentRole
    status: AgentExecStatus = AgentExecStatus.QUEUED
    current_thought: str = ""
    progress: int = 0
    logs: List[str] = []
    generated_files: List[str] = []
    cost_usd: float = 0.0
    tokens_used: int = 0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: float = 0.0
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


# --- Release (Module 12) ---


class Release(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    version: str
    features: List[str] = []
    risks: List[str] = []
    blocked_items: List[str] = []
    qa_status: str = "pending"
    deployment_readiness: str = "not_ready"
    estimated_release_date: Optional[datetime] = None
    confidence_score: int = 0
    status: ReleaseStatus = ReleaseStatus.PLANNED
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


# --- Decision engine audit trail (Module 14) ---


class DecisionLogEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    initiative_id: str
    task_id: Optional[str] = None
    trigger: str = ""
    actions: List[str] = []
    created_at: datetime = Field(default_factory=utcnow)


# --- WebSocket events (separate channel from core.models.WSEvent, which is
# build_id-scoped; this one is initiative_id-scoped) ---


class PMWSEventType(str, Enum):
    GENERATION_START = "generation_start"
    GENERATION_STAGE = "generation_stage"
    EPICS_READY = "epics_ready"
    STORIES_READY = "stories_ready"
    TASKS_READY = "tasks_ready"
    SPRINT_PLAN_READY = "sprint_plan_ready"
    GENERATION_COMPLETE = "generation_complete"
    GENERATION_FAILED = "generation_failed"
    TASK_STATUS_CHANGED = "task_status_changed"
    AGENT_EXEC_START = "agent_exec_start"
    AGENT_EXEC_PROGRESS = "agent_exec_progress"
    AGENT_EXEC_LOG = "agent_exec_log"
    AGENT_EXEC_COMPLETE = "agent_exec_complete"
    AGENT_EXEC_FAILED = "agent_exec_failed"
    SPRINT_UPDATED = "sprint_updated"
    DECISION_MADE = "decision_made"
    ERROR = "error"


class PMWSEvent(BaseModel):
    type: PMWSEventType
    initiative_id: str
    data: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=utcnow)
    version: int = 1
