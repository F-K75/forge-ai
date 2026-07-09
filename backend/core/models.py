from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import uuid

from fastapi import Query


class PaginationParams:
    """Reusable pagination dependency (BE-003).

    Injects consistent, clamped ``page`` / ``per_page`` query params and pairs
    naturally with :func:`core.database.paginated_query`, which performs the
    actual skip/limit math and returns the standard envelope.

    Usage::

        params: PaginationParams = Depends()
        result = await paginated_query(coll, query, page=params.page,
                                        per_page=params.per_page)
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-indexed page number"),
        per_page: int = Query(
            20, ge=1, le=100, description="Items per page (clamped to 100)"
        ),
    ):
        self.page = page
        self.per_page = per_page


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


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    INCOMPLETE = "incomplete"
    TRIALING = "trialing"


class DeploymentStatus(str, Enum):
    PENDING = "pending"
    BUILDING = "building"
    DEPLOYING = "deploying"
    LIVE = "live"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Role(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


# --- User ---


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    avatar_url: Optional[str] = None
    github_token: Optional[str] = None
    # Bring-your-own-key (Pro+ only) -- llm_api_key is Fernet-encrypted at
    # rest, same pattern as github_token. When set, the user's own key is
    # used for their builds instead of Forge's shared key, and per-agent
    # credit deduction is skipped (see core/orchestrator.py's byok_active
    # check). llm_provider selects which SDK agents/base.py uses to call it:
    # "anthropic" (default, same shape as Forge's own key) or
    # "openai_compatible" (any provider exposing an OpenAI-style chat
    # completions endpoint -- Groq, OpenRouter, local Ollama, etc.), which
    # requires llm_base_url and llm_model to also be set.
    llm_provider: str = "anthropic"
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    preferences: dict = Field(default_factory=dict)
    plan: PlanTier = PlanTier.FREE
    credits: int = 50
    stripe_customer_id: Optional[str] = None
    banned: bool = False
    trial_ends_at: Optional[datetime] = None
    downgraded_to: Optional[PlanTier] = None
    email_verified: bool = False
    # Admin role — persisted in the DB (AUTH-001). ``is_admin`` replaces the
    # previous email-string-match in ``api/admin.py`` and is the single source
    # of truth for admin authorization. Defaults to False; set exclusively via
    # the PUT /admin/users/{user_id}/admin endpoint or startup migration v3.
    is_admin: bool = False
    # Dedup state for low-credit alert emails (PROD-039); cleared whenever
    # credits are granted/increased so the user is warned again next time.
    credit_alerts_sent: List[str] = Field(default_factory=list)
    # Dedup state for daily token budget alert emails (AI-001); cleared
    # daily at midnight UTC when the budget resets.
    # Values: "daily_50", "daily_80", "daily_100"
    token_budget_alerts_sent: List[str] = Field(default_factory=list)
    # TOTP-based multi-factor auth (SEC-007). totp_secret is Fernet-encrypted
    # at rest, same pattern as github_token. mfa_backup_codes holds bcrypt
    # hashes only -- plaintext codes are shown once at enrollment and never
    # stored or logged.
    mfa_enabled: bool = False
    totp_secret: Optional[str] = None
    mfa_backup_codes: List[str] = Field(default_factory=list)
    mfa_enrolled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Organization ---


class Organization(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str
    owner_id: str
    plan: PlanTier = PlanTier.FREE
    seats: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TeamMember(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    user_id: str
    role: Role = Role.MEMBER
    invited_by: Optional[str] = None
    joined_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Invitation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    org_id: str
    email: str
    role: Role = Role.MEMBER
    invited_by: str
    # NOTE: token is generated at creation time and hashed before storage.
    # The plaintext token is returned in the API response but NEVER stored.
    # Only hashed_token is persisted in the database.
    hashed_token: Optional[str] = None
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(days=7)
    )
    accepted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Project ---


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    org_id: Optional[str] = None
    name: str
    description: str = ""
    github_repo: Optional[str] = None
    github_branch: str = "main"
    deployed_url: Optional[str] = None
    tech_stack: Dict[str, str] = {}
    template: Optional[str] = None  # Onboarding template ID (e.g., "saas-starter", "ecommerce")
    template_data: Dict[str, Any] = {}  # Template-specific configuration
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
    idempotency_key: Optional[str] = None
    status: BuildStatus = BuildStatus.PENDING
    agents: List[AgentStep] = []
    credits_used: int = 0
    context_tokens: int = 0
    debug_iterations: int = 0
    business_model: Optional[Dict[str, Any]] = None
    # Interactive builds pause between agents and wait for the user to
    # approve each stage (and to answer the architect's clarifying
    # questions). pending_gate holds the gate the pipeline is currently
    # blocked on; POST /builds/{id}/gate writes its "response" key.
    interactive: bool = False
    pending_gate: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


class BuildFile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    build_id: str
    path: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BuildDeadLetter(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    build_id: str
    user_id: str
    project_id: str
    prompt: str
    error: str
    failure_reason: str
    retry_count: int = 0
    credits_used: int = 0
    created_at: datetime
    dead_lettered_at: datetime = Field(default_factory=datetime.utcnow)


# --- Message ---


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    user_id: str
    role: str  # user | assistant
    content: str
    build_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Billing ---


class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    stripe_subscription_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    provider: str = "stripe"
    razorpay_subscription_id: Optional[str] = None
    razorpay_plan_id: Optional[str] = None
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    plan: PlanTier = PlanTier.FREE
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    stripe_invoice_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    amount: int
    currency: str = "inr"
    status: str = "draft"
    hosted_invoice_url: Optional[str] = None
    provider: str = "stripe"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CreditPurchase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    stripe_payment_intent_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    credits: int
    amount: int
    currency: str = "inr"
    status: str = "pending"
    provider: str = "stripe"
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Deployment ---


class Deployment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    user_id: str
    build_id: Optional[str] = None
    status: DeploymentStatus = DeploymentStatus.PENDING
    provider: str = "docker"
    url: Optional[str] = None
    logs: str = ""
    env_vars: Dict[str, str] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deployed_at: Optional[datetime] = None


# --- Analytics ---


class AnalyticsEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    project_id: Optional[str] = None
    event_name: str
    properties: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OnboardingProgress(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    step: str = "signup"
    completed_steps: List[str] = []
    current_step: str = "signup"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# --- Marketplace ---


class MarketplaceItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # prompt | template
    title: str
    description: str
    prompt: str
    author_id: str
    rating: float = 0.0
    rating_count: int = 0
    tags: List[str] = []
    downloads: int = 0
    is_public: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Admin ---


class FeatureFlag(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str
    enabled: bool = False
    description: str = ""
    updated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    actor_id: str
    actor_email: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    changes: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# --- Session ---


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    jti: str
    refresh_jti: Optional[str] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)
    revoked_at: Optional[datetime] = None


# --- Security ---


class RateLimitRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    key: str  # user_id | ip | endpoint
    limit: int
    window: int  # seconds
    remaining: int = 0
    reset_at: Optional[datetime] = None


class SecurityEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    event_type: str  # login_failed | rate_limit | anomaly | etc
    severity: str = "low"  # low | medium | high | critical
    ip_address: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SupportTicket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    subject: str
    description: str
    status: str = "open"  # open | in_progress | resolved | closed
    priority: str = "normal"  # low | normal | high | urgent
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# --- API Keys ---


class ApiKey(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    key_hash: str
    key_prefix: str
    scopes: List[str] = []
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None


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

    # File updates
    FILE_UPDATE = "file_update"

    # Errors
    ERROR = "error"

    # Existing internal/debug events
    DEBUG_START = "debug_start"
    STREAM_TOKEN = "stream_token"
    CREDITS_UPDATE = "credits_update"

    # Interactive builds: per-agent structured output for the workspace's
    # center panel, plus pause/resume gates between agents (see
    # core/orchestrator.py::Orchestrator._wait_for_gate).
    AGENT_OUTPUT = "agent_output"
    GATE_REQUEST = "gate_request"
    GATE_RESOLVED = "gate_resolved"


class WSEvent(BaseModel):
    type: WSEventType
    build_id: str
    data: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)
