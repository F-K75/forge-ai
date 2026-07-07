from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import csv
import io

from core.models import User, BuildStatus, PlanTier, FeatureFlag, AuditLog, PaginationParams
from core.database import get_db, get_redis, cache_get_json, cache_set_json, paginated_query

ADMIN_ANALYTICS_CACHE_TTL = 120
FEATURE_FLAGS_CACHE_KEY = "cache:admin:feature_flags:list"
FEATURE_FLAGS_CACHE_TTL = 300
from core.config import get_settings
from core.security import sanitize_string
from core.ai_usage import get_spending_dashboard
from api.auth import get_current_user
from services.credit_alerts import reset_credit_alerts

settings = get_settings()

router = APIRouter(prefix="/admin", tags=["admin"])


def is_admin(user: User) -> bool:
    admin_emails = settings.admin_emails.split(",") if settings.admin_emails else []
    return user.email in [email.strip() for email in admin_emails]


async def admin_required(user: User = Depends(get_current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # SEC-007: Enforce MFA for admin accounts
    db = await get_db()
    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    if user_doc and not user_doc.get("mfa_enabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts require MFA. Please enable MFA in Settings."
        )
    
    return user


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    plan: PlanTier
    credits: int
    avatar_url: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    plan: Optional[PlanTier] = None
    credits: Optional[int] = None
    banned: Optional[bool] = None


class PaginatedUsers(BaseModel):
    users: List[UserResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class BuildResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    prompt: str
    status: BuildStatus
    credits_used: int
    context_tokens: int
    debug_iterations: int
    created_at: datetime
    completed_at: Optional[datetime] = None


class PaginatedBuilds(BaseModel):
    builds: List[BuildResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class FeatureFlagCreate(BaseModel):
    key: str
    enabled: bool = False
    description: str = ""


class FeatureFlagResponse(BaseModel):
    id: str
    key: str
    enabled: bool
    description: str
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AuditLogResponse(BaseModel):
    id: str
    actor_id: str
    actor_email: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    changes: Dict[str, Any]
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class PaginatedAuditLogs(BaseModel):
    logs: List[AuditLogResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class CreditAdjustRequest(BaseModel):
    user_id: str
    amount: int
    reason: str = ""


class SupportTicketResponse(BaseModel):
    id: str
    user_id: str
    subject: str
    description: str
    status: str
    priority: str
    created_at: datetime


class SecurityEventResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    event_type: str
    severity: str
    ip_address: Optional[str] = None
    metadata: Dict[str, Any]
    created_at: datetime


class PaginatedSecurityEvents(BaseModel):
    events: List[SecurityEventResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class RevenueMetrics(BaseModel):
    date: str
    revenue: float
    subscriptions: int
    credit_purchases: int


class AIUsageMetrics(BaseModel):
    date: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


class SystemHealthResponse(BaseModel):
    status: str
    database: Dict[str, Any]
    redis: Dict[str, Any]
    uptime_seconds: int


class AnalyticsOverview(BaseModel):
    total_users: int
    total_builds: int
    total_revenue: float
    builds_by_status: Dict[str, int]
    users_by_plan: Dict[str, int]
    revenue_today: float
    revenue_month: float
    active_subscriptions: int


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    plan: Optional[PlanTier] = Query(None),
    banned: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    params: PaginationParams = Depends(),
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    query: Dict[str, Any] = {}
    if plan:
        query["plan"] = plan
    if banned is not None:
        query["banned"] = banned
    if search:
        # Sanitize search input to prevent ReDoS attacks
        sanitized = sanitize_string(search, max_length=100)
        query["$or"] = [
            {"email": {"$regex": sanitized, "$options": "i"}},
            {"name": {"$regex": sanitized, "$options": "i"}},
        ]
    
    result = await paginated_query(
        db.users,
        query,
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0, "hashed_password": 0},
    )
    users = [UserResponse(**doc) for doc in result.items]
    
    return PaginatedUsers(
        users=users,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.get("/users/export")
async def export_users(
    plan: Optional[PlanTier] = Query(None),
    banned: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    admin: User = Depends(admin_required),
):
    """CSV export of users, matching list_users' filters. Registered ahead of
    /users/{user_id} so "export" isn't swallowed as a user_id path param.
    Previously this endpoint didn't exist at all (PROD-003)."""
    db = await get_db()

    query: Dict[str, Any] = {}
    if plan:
        query["plan"] = plan
    if banned is not None:
        query["banned"] = banned
    if search:
        sanitized = sanitize_string(search, max_length=100)
        query["$or"] = [
            {"email": {"$regex": sanitized, "$options": "i"}},
            {"name": {"$regex": sanitized, "$options": "i"}},
        ]

    # Capped so a huge user base can't turn this into an unbounded query;
    # matches the export use case (spot review), not full data warehousing.
    MAX_EXPORT_ROWS = 10_000
    cursor = (
        db.users.find(query, {"_id": 0, "hashed_password": 0})
        .sort("created_at", -1)
        .limit(MAX_EXPORT_ROWS)
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "email", "name", "plan", "credits", "banned", "email_verified", "created_at"])
    async for doc in cursor:
        writer.writerow([
            doc.get("id", ""),
            doc.get("email", ""),
            doc.get("name", ""),
            doc.get("plan", ""),
            doc.get("credits", ""),
            doc.get("banned", False),
            doc.get("email_verified", False),
            doc.get("created_at", ""),
        ])
    buffer.seek(0)

    audit_log = AuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="export_users",
        resource_type="user",
        changes={"filters": {"plan": plan, "banned": banned, "search": bool(search)}},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

    filename = f"forge-users-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, admin: User = Depends(admin_required)):
    db = await get_db()
    
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(**user_doc)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    req: UserUpdateRequest,
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data: Dict[str, Any] = {}
    if req.plan is not None:
        update_data["plan"] = req.plan
    if req.credits is not None:
        update_data["credits"] = req.credits
    if req.banned is not None:
        update_data["banned"] = req.banned
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
        
        audit_log = AuditLog(
            actor_id=admin.id,
            actor_email=admin.email,
            action="update_user",
            resource_type="user",
            resource_id=user_id,
            changes={"updated_fields": update_data, "reason": "admin_update"},
        )
        await db.audit_logs.insert_one(audit_log.model_dump())
    
    updated_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return UserResponse(**updated_doc)


@router.get("/builds", response_model=PaginatedBuilds)
async def list_builds(
    status: Optional[BuildStatus] = Query(None),
    user_id: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    params: PaginationParams = Depends(),
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    if date_from:
        query.setdefault("created_at", {})
        query["created_at"]["$gte"] = date_from
    if date_to:
        query.setdefault("created_at", {})
        query["created_at"]["$lte"] = date_to
    
    result = await paginated_query(
        db.builds,
        query,
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    builds = [BuildResponse(**doc) for doc in result.items]
    
    return PaginatedBuilds(
        builds=builds,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages
    )


@router.get("/builds/{build_id}", response_model=BuildResponse)
async def get_build(build_id: str, admin: User = Depends(admin_required)):
    db = await get_db()
    
    build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build_doc:
        raise HTTPException(status_code=404, detail="Build not found")
    
    return BuildResponse(**build_doc)


@router.get("/analytics/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(admin: User = Depends(admin_required)):
    cache_key = "cache:admin:analytics:overview"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        try:
            return AnalyticsOverview(**cached)
        except Exception:
            pass

    db = await get_db()

    total_users = await db.users.estimated_document_count()
    total_builds = await db.builds.estimated_document_count()
    
    revenue_pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    total_revenue_cursor = db.invoices.aggregate(revenue_pipeline)
    total_revenue = 0.0
    async for doc in total_revenue_cursor:
        total_revenue = float(doc.get("total", 0)) / 100
    
    builds_by_status: Dict[str, int] = {}
    status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    async for doc in db.builds.aggregate(status_pipeline):
        builds_by_status[doc["_id"]] = doc["count"]
    
    users_by_plan: Dict[str, int] = {}
    plan_pipeline = [{"$group": {"_id": "$plan", "count": {"$sum": 1}}}]
    async for doc in db.users.aggregate(plan_pipeline):
        users_by_plan[doc["_id"]] = doc["count"]
    
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)
    
    revenue_today_pipeline = [
        {"$match": {"created_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    revenue_today = 0.0
    async for doc in db.invoices.aggregate(revenue_today_pipeline):
        revenue_today = float(doc.get("total", 0)) / 100
    
    revenue_month_pipeline = [
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    revenue_month = 0.0
    async for doc in db.invoices.aggregate(revenue_month_pipeline):
        revenue_month = float(doc.get("total", 0)) / 100
    
    active_subscriptions = await db.subscriptions.count_documents({"status": {"$ne": "canceled"}})
    
    result = AnalyticsOverview(
        total_users=total_users,
        total_builds=total_builds,
        total_revenue=total_revenue,
        builds_by_status=builds_by_status,
        users_by_plan=users_by_plan,
        revenue_today=revenue_today,
        revenue_month=revenue_month,
        active_subscriptions=active_subscriptions
    )
    await cache_set_json(cache_key, result.model_dump(), ttl=ADMIN_ANALYTICS_CACHE_TTL)
    return result


@router.get("/analytics/revenue", response_model=List[RevenueMetrics])
async def get_revenue_metrics(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(admin_required)
):
    cache_key = f"cache:admin:analytics:revenue:{days}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        try:
            return [RevenueMetrics(**d) for d in cached]
        except Exception:
            pass

    db = await get_db()

    date_format = "%Y-%m-%d"
    pipeline = [
        {
            "$group": {
                "_id": {"$dateToString": {"format": date_format, "date": "$created_at"}},
                "revenue": {"$sum": "$amount"},
                "subscription_count": {"$sum": {"$cond": [{"$ne": ["$subscription_id", None]}, 1, 0]}},
                "credit_purchase_count": {"$sum": {"$cond": [{"$ne": ["$credit_purchase_id", None]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": -1}},
        {"$limit": days}
    ]
    
    metrics = []
    async for doc in db.invoices.aggregate(pipeline):
        metrics.append(RevenueMetrics(
            date=doc["_id"],
            revenue=float(doc.get("revenue", 0)) / 100,
            subscriptions=doc.get("subscription_count", 0),
            credit_purchases=doc.get("credit_purchase_count", 0)
        ))

    await cache_set_json(cache_key, [m.model_dump() for m in metrics], ttl=ADMIN_ANALYTICS_CACHE_TTL)
    return metrics


@router.get("/analytics/ai-usage", response_model=List[AIUsageMetrics])
async def get_ai_usage_metrics(
    days: int = Query(30, ge=1, le=365),
    admin: User = Depends(admin_required)
):
    cache_key = f"cache:admin:analytics:ai_usage:{days}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        try:
            return [AIUsageMetrics(**d) for d in cached]
        except Exception:
            pass

    db = await get_db()

    date_format = "%Y-%m-%d"
    pipeline = [
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": date_format, "date": "$created_at"}},
                    "model": "$model"
                },
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "cost_usd": {"$sum": "$cost"},
            }
        },
        {"$sort": {"_id.date": -1}},
        {"$limit": days * 5}
    ]
    
    metrics = []
    async for doc in db.ai_usage.aggregate(pipeline):
        metrics.append(AIUsageMetrics(
            date=doc["_id"]["date"],
            model=doc["_id"].get("model", "unknown"),
            prompt_tokens=doc.get("prompt_tokens", 0),
            completion_tokens=doc.get("completion_tokens", 0),
            cost_usd=float(doc.get("cost_usd", 0))
        ))

    await cache_set_json(cache_key, [m.model_dump() for m in metrics], ttl=ADMIN_ANALYTICS_CACHE_TTL)
    return metrics


@router.get("/fraud/events", response_model=PaginatedSecurityEvents)
async def list_security_events(
    severity: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    params: PaginationParams = Depends(),
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    query: Dict[str, Any] = {}
    if severity:
        query["severity"] = severity
    if event_type:
        query["event_type"] = event_type
    
    result = await paginated_query(
        db.security_events,
        query,
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    events = [SecurityEventResponse(**doc) for doc in result.items]
    
    return PaginatedSecurityEvents(
        events=events,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages
    )


@router.post("/feature-flags", response_model=FeatureFlagResponse)
async def create_or_update_feature_flag(
    req: FeatureFlagCreate,
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    existing = await db.feature_flags.find_one({"key": req.key}, {"_id": 0})
    
    flag_data = {
        "key": req.key,
        "enabled": req.enabled,
        "description": req.description,
        "updated_by": admin.id,
        "updated_at": datetime.utcnow(),
    }
    
    if existing:
        await db.feature_flags.update_one({"key": req.key}, {"$set": flag_data})
        flag_data["id"] = existing["id"]
        flag_data["created_at"] = existing.get("created_at", datetime.utcnow())
    else:
        flag = FeatureFlag(
            key=req.key,
            enabled=req.enabled,
            description=req.description,
            updated_by=admin.id,
        )
        flag_dict = flag.model_dump()
        await db.feature_flags.insert_one(flag_dict)
        flag_data["id"] = flag.id
        flag_data["created_at"] = flag.created_at

    # Invalidate the feature-flags list cache so this mutation is visible
    # immediately instead of waiting out the TTL.
    try:
        redis = await get_redis()
        await redis.delete(FEATURE_FLAGS_CACHE_KEY)
    except Exception:
        pass

    return FeatureFlagResponse(**flag_data)


@router.get("/feature-flags", response_model=List[FeatureFlagResponse])
async def list_feature_flags(admin: User = Depends(admin_required)):
    cached = await cache_get_json(FEATURE_FLAGS_CACHE_KEY)
    if cached is not None:
        try:
            return [FeatureFlagResponse(**d) for d in cached]
        except Exception:
            pass

    db = await get_db()

    flags = []
    cursor = db.feature_flags.find({"_id": 0}).sort("created_at", -1)
    async for doc in cursor:
        flags.append(FeatureFlagResponse(**doc))

    await cache_set_json(FEATURE_FLAGS_CACHE_KEY, [f.model_dump() for f in flags], ttl=FEATURE_FLAGS_CACHE_TTL)
    return flags


@router.get("/audit-logs", response_model=PaginatedAuditLogs)
async def list_audit_logs(
    actor_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    params: PaginationParams = Depends(),
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    query: Dict[str, Any] = {}
    if actor_id:
        query["actor_id"] = actor_id
    if action:
        query["action"] = action
    if resource_type:
        query["resource_type"] = resource_type
    if date_from:
        query.setdefault("created_at", {})
        query["created_at"]["$gte"] = date_from
    if date_to:
        query.setdefault("created_at", {})
        query["created_at"]["$lte"] = date_to
    
    result = await paginated_query(
        db.audit_logs,
        query,
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    logs = [AuditLogResponse(**doc) for doc in result.items]
    
    return PaginatedAuditLogs(
        logs=logs,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages
    )


@router.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(admin: User = Depends(admin_required)):
    db = await get_db()
    redis = await get_redis()
    
    db_status = {"status": "ok", "collections": 0}
    try:
        collections = await db.list_collection_names()
        db_status["collections"] = len(collections)
    except Exception as e:
        db_status = {"status": "error", "error": str(e)}
    
    redis_status = {"status": "ok", "connected": True}
    try:
        await redis.ping()
    except Exception as e:
        redis_status = {"status": "error", "error": str(e), "connected": False}
    
    return SystemHealthResponse(
        status="ok",
        database=db_status,
        redis=redis_status,
        uptime_seconds=0
    )


@router.post("/billing/adjust", response_model=Dict[str, Any])
async def adjust_credits(
    req: CreditAdjustRequest,
    admin: User = Depends(admin_required)
):
    db = await get_db()
    
    user_doc = await db.users.find_one({"id": req.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_credits = user_doc.get("credits", 0)
    new_credits = max(0, current_credits + req.amount)
    
    await db.users.update_one(
        {"id": req.user_id},
        {"$set": {"credits": new_credits}}
    )
    
    audit_log = AuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="adjust_credits",
        resource_type="user",
        resource_id=req.user_id,
        changes={"old_credits": current_credits, "new_credits": new_credits, "adjustment": req.amount, "reason": req.reason},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

    if req.amount > 0:
        await reset_credit_alerts(db, req.user_id)

    return {
        "user_id": req.user_id,
        "old_credits": current_credits,
        "new_credits": new_credits,
        "adjustment": req.amount
    }


@router.get("/support/tickets", response_model=List[SupportTicketResponse])
async def list_support_tickets(
    status_filter: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    admin: User = Depends(admin_required)
) -> List[SupportTicketResponse]:
    db = await get_db()
    
    query: Dict[str, Any] = {}
    if status_filter:
        query["status"] = status_filter
    if priority:
        query["priority"] = priority
    
    tickets = []
    cursor = db.support_tickets.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    async for doc in cursor:
        tickets.append(SupportTicketResponse(**doc))

    return tickets if tickets else []


@router.get("/spending")
async def get_spending(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
    admin: User = Depends(admin_required),
) -> List[Dict[str, Any]]:
    return await get_spending_dashboard(days=days, limit=limit)