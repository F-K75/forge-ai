from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from enum import Enum

from core.models import AnalyticsEvent, User, BuildStatus, PlanTier
from core.database import get_db
from api.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


class EventRequest(BaseModel):
    event_name: str
    project_id: Optional[str] = None
    properties: Dict[str, Any] = {}


class EventResponse(BaseModel):
    event_id: str
    created_at: datetime


class FunnelStep(str, Enum):
    SIGNUP = "signup"
    FIRST_PROJECT = "first_project"
    FIRST_BUILD = "first_build"
    FIRST_SUCCESS = "first_success"


class FunnelMetrics(BaseModel):
    total_signups: int
    total_first_project: int
    total_first_build: int
    total_first_success: int
    conversion_rates: Dict[str, float]


class RetentionMetrics(BaseModel):
    day_1: float
    day_7: float
    day_30: float
    total_users: int


class BuildSuccessRateMetrics(BaseModel):
    period: str
    total_builds: int
    successful_builds: int
    success_rate: float
    daily_breakdown: List[Dict[str, Any]]


class ConversionMetrics(BaseModel):
    total_users: int
    free_users: int
    paid_users: int
    conversion_rate: float
    conversion_value: float


class ChurnMetrics(BaseModel):
    churned_users: int
    churn_rate: float
    potential_churn_users: int
    churn_revenue: float


class AICostData(BaseModel):
    total_tokens: int
    total_cost_usd: float
    cost_by_agent: Dict[str, float]
    cost_by_user: Dict[str, float]
    period: str


class RevenueMetrics(BaseModel):
    mrr: float
    arr: float
    churned_revenue: float
    active_subscriptions: int
    total_revenue: float


class OnboardingMetrics(BaseModel):
    total_users: int
    completed_onboarding: int
    completion_rate: float
    step_completion: Dict[str, int]


class PersonalAnalytics(BaseModel):
    builds_total: int
    builds_successful: int
    builds_failed: int
    success_rate: float
    total_credits_used: int
    total_tokens_consumed: int
    avg_build_time_minutes: float
    favorite_agents: Dict[str, int]
    projects_count: int


@router.post("/event", response_model=EventResponse)
async def track_event(
    req: EventRequest,
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    event = AnalyticsEvent(
        user_id=current_user.id,
        project_id=req.project_id,
        event_name=req.event_name,
        properties=req.properties,
    )
    
    await db.analytics_events.insert_one(event.model_dump())
    
    return EventResponse(
        event_id=event.id,
        created_at=event.created_at,
    )


@router.get("/funnel", response_model=FunnelMetrics)
async def get_funnel_metrics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    signup_pipeline = [
        {"$match": {"event_name": "signup", "created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    total_signups = 0
    async for doc in db.analytics_events.aggregate(signup_pipeline):
        total_signups = doc.get("count", 0)
    
    first_project_pipeline = [
        {"$match": {"event_name": "first_project", "created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    total_first_project = 0
    async for doc in db.analytics_events.aggregate(first_project_pipeline):
        total_first_project = doc.get("count", 0)
    
    first_build_pipeline = [
        {"$match": {"event_name": "first_build", "created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    total_first_build = 0
    async for doc in db.analytics_events.aggregate(first_build_pipeline):
        total_first_build = doc.get("count", 0)
    
    first_success_pipeline = [
        {"$match": {"event_name": "first_success", "created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    total_first_success = 0
    async for doc in db.analytics_events.aggregate(first_success_pipeline):
        total_first_success = doc.get("count", 0)
    
    conversion_rates = {
        "signup_to_project": round(total_first_project / total_signups * 100, 2) if total_signups > 0 else 0,
        "project_to_build": round(total_first_build / total_first_project * 100, 2) if total_first_project > 0 else 0,
        "build_to_success": round(total_first_success / total_first_build * 100, 2) if total_first_build > 0 else 0,
        "overall": round(total_first_success / total_signups * 100, 2) if total_signups > 0 else 0,
    }
    
    return FunnelMetrics(
        total_signups=total_signups,
        total_first_project=total_first_project,
        total_first_build=total_first_build,
        total_first_success=total_first_success,
        conversion_rates=conversion_rates,
    )


@router.get("/retention", response_model=RetentionMetrics)
async def get_retention_metrics(
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    user_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    total_users = 0
    async for doc in db.users.aggregate(user_pipeline):
        total_users = doc.get("count", 0)
    
    day_1_retention = await _calculate_retention(db, 1, days)
    day_7_retention = await _calculate_retention(db, 7, days)
    day_30_retention = await _calculate_retention(db, 30, days)
    
    return RetentionMetrics(
        day_1=day_1_retention,
        day_7=day_7_retention,
        day_30=day_30_retention,
        total_users=total_users,
    )


async def _calculate_retention(db, days_after: int, period_days: int) -> float:
    start_date = datetime.utcnow() - timedelta(days=period_days)
    retention_date = start_date + timedelta(days=days_after)
    
    retained_pipeline = [
        {"$match": {"created_at": {"$lte": start_date}}},
        {"$lookup": {
            "from": "analytics_events",
            "let": {"user_id": "$id"},
            "pipeline": [
                {"$match": {
                    "$expr": {
                        "$and": [
                            {"$eq": ["$user_id", "$$user_id"]},
                            {"$eq": ["$event_name", "return_visitor"]},
                            {"$gte": ["$created_at", retention_date]}
                        ]
                    }
                }}
            ],
            "as": "events"
        }},
        {"$match": {"events.0": {"$exists": True}}},
        {"$group": {"_id": None, "retained": {"$sum": 1}}},
    ]
    
    retained = 0
    async for doc in db.users.aggregate(retained_pipeline):
        retained = doc.get("retained", 0)
    
    cohort_pipeline = [
        {"$match": {"created_at": {"$lte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    cohort_size = 0
    async for doc in db.users.aggregate(cohort_pipeline):
        cohort_size = doc.get("count", 0)
    
    return round((retained / cohort_size) * 100, 2) if cohort_size > 0 else 0.0


@router.get("/builds/success-rate", response_model=BuildSuccessRateMetrics)
async def get_build_success_rate(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    total_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": current_user.id}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "successful": {"$sum": {"$cond": [{"$eq": ["$status", BuildStatus.SUCCESS.value]}, 1, 0]}}}},
    ]
    
    total_builds = 0
    successful_builds = 0
    
    async for doc in db.builds.aggregate(total_pipeline):
        total_builds = doc.get("count", 0)
        successful_builds = doc.get("successful", 0)
    
    success_rate = round((successful_builds / total_builds) * 100, 2) if total_builds > 0 else 0.0
    
    daily_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": current_user.id}},
        {"$group": {
            "_id": {
                "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
            },
            "total": {"$sum": 1},
            "successful": {"$sum": {"$cond": [{"$eq": ["$status", BuildStatus.SUCCESS.value]}, 1, 0]}}}
        },
        {"$sort": {"_id": 1}},
    ]
    
    daily_breakdown = []
    async for doc in db.builds.aggregate(daily_pipeline):
        daily_breakdown.append({
            "date": doc.get("_id"),
            "total": doc.get("total", 0),
            "successful": doc.get("successful", 0),
            "rate": round((doc.get("successful", 0) / doc.get("total", 1)) * 100, 2) if doc.get("total", 0) > 0 else 0.0,
        })
    
    return BuildSuccessRateMetrics(
        period=f"last_{days}_days",
        total_builds=total_builds,
        successful_builds=successful_builds,
        success_rate=success_rate,
        daily_breakdown=daily_breakdown,
    )


@router.get("/conversion", response_model=ConversionMetrics)
async def get_conversion_metrics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    user_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
    ]
    
    total_users = 0
    free_users = 0
    paid_users = 0
    
    async for doc in db.users.aggregate(user_pipeline):
        count = doc.get("count", 0)
        total_users += count
        if doc.get("_id") == PlanTier.FREE.value:
            free_users = count
        else:
            paid_users += count
    
    conversion_rate = round((paid_users / total_users) * 100, 2) if total_users > 0 else 0.0
    
    return ConversionMetrics(
        total_users=total_users,
        free_users=free_users,
        paid_users=paid_users,
        conversion_rate=conversion_rate,
        conversion_value=0.0,
    )


@router.get("/churn", response_model=ChurnMetrics)
async def get_churn_metrics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    churned_pipeline = [
        {"$match": {"status": "canceled", "updated_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    churned_users = 0
    async for doc in db.subscriptions.aggregate(churned_pipeline):
        churned_users = doc.get("count", 0)
    
    total_users_pipeline = [
        {"$match": {"created_at": {"$lt": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    total_users = 0
    async for doc in db.users.aggregate(total_users_pipeline):
        total_users = doc.get("count", 0)
    
    churn_rate = round((churned_users / total_users) * 100, 2) if total_users > 0 else 0.0
    
    potential_churn_pipeline = [
        {"$match": {"status": "past_due", "updated_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    potential_churn_users = 0
    async for doc in db.subscriptions.aggregate(potential_churn_pipeline):
        potential_churn_users = doc.get("count", 0)
    
    churn_revenue = 0.0
    
    return ChurnMetrics(
        churned_users=churned_users,
        churn_rate=churn_rate,
        potential_churn_users=potential_churn_users,
        churn_revenue=churn_revenue,
    )


@router.get("/ai-cost", response_model=AICostData)
async def get_ai_cost_data(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    total_tokens_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": current_user.id}},
        {"$group": {"_id": None, "total_tokens": {"$sum": "$context_tokens"}, "total_credits": {"$sum": "$credits_used"}}},
    ]
    
    total_tokens = 0

    async for doc in db.builds.aggregate(total_tokens_pipeline):
        total_tokens = doc.get("total_tokens", 0)
    
    tokens_per_usd = 1000
    total_cost_usd = round(total_tokens / tokens_per_usd, 4)
    
    cost_by_agent_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": current_user.id}},
        {"$unwind": "$agents"},
        {"$group": {"_id": "$agents.agent", "tokens": {"$sum": 1}}},
    ]
    
    cost_by_agent = {}
    async for doc in db.builds.aggregate(cost_by_agent_pipeline):
        agent = doc.get("_id", "unknown")
        cost_by_agent[agent] = round(doc.get("tokens", 0) / tokens_per_usd, 4)
    
    similar_users_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {"_id": "$user_id", "tokens": {"$sum": "$context_tokens"}}},
        {"$sort": {"tokens": -1}},
        {"$limit": 10},
    ]
    
    cost_by_user = {}
    async for doc in db.builds.aggregate(similar_users_pipeline):
        user_id = doc.get("_id", "unknown")
        cost_by_user[user_id] = round(doc.get("tokens", 0) / tokens_per_usd, 4)
    
    return AICostData(
        total_tokens=total_tokens,
        total_cost_usd=total_cost_usd,
        cost_by_agent=cost_by_agent,
        cost_by_user=cost_by_user,
        period=f"last_{days}_days",
    )


@router.get("/revenue", response_model=RevenueMetrics)
async def get_revenue(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()

    active_subs_pipeline = [
        {"$match": {"status": "active"}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    active_subscriptions = 0
    async for doc in db.subscriptions.aggregate(active_subs_pipeline):
        active_subscriptions = doc.get("count", 0)
    
    mrr_pipeline = [
        {"$match": {"status": "active", "plan": {"$ne": PlanTier.FREE.value}}},
        {"$group": {"_id": "$plan", "count": {"$sum": 1}}},
    ]
    
    mrr = 0.0
    async for doc in db.subscriptions.aggregate(mrr_pipeline):
        plan = doc.get("_id")
        count = doc.get("count", 0)
        if plan == PlanTier.STANDARD.value:
            mrr += count * 29
        elif plan == PlanTier.PRO.value:
            mrr += count * 99
        elif plan == PlanTier.ENTERPRISE.value:
            mrr += count * 999
    
    arr = mrr * 12
    churned_revenue = 0.0
    total_revenue = mrr
    
    return RevenueMetrics(
        mrr=mrr,
        arr=arr,
        churned_revenue=churned_revenue,
        active_subscriptions=active_subscriptions,
        total_revenue=total_revenue,
    )


@router.get("/onboarding", response_model=OnboardingMetrics)
async def get_onboarding_metrics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    total_users_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    total_users = 0
    async for doc in db.users.aggregate(total_users_pipeline):
        total_users = doc.get("count", 0)
    
    completed_onboarding = 0
    completion_rate = round((completed_onboarding / total_users) * 100, 2) if total_users > 0 else 0.0
    
    step_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}}},
        {"$project": {"steps": "$completed_steps"}},
        {"$unwind": {"path": "$steps", "preserveNullAndEmptyArrays": True}},
        {"$group": {"_id": "$steps", "count": {"$sum": 1}}},
    ]
    
    step_completion = {}
    async for doc in db.onboarding_progress.aggregate(step_pipeline):
        step = doc.get("_id")
        if step:
            step_completion[step] = doc.get("count", 0)
    
    return OnboardingMetrics(
        total_users=total_users,
        completed_onboarding=completed_onboarding,
        completion_rate=completion_rate,
        step_completion=step_completion,
    )


@router.get("/me", response_model=PersonalAnalytics)
async def get_personal_analytics(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    builds_pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": current_user.id}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "successful": {"$sum": {"$cond": [{"$eq": ["$status", BuildStatus.SUCCESS.value]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", BuildStatus.FAILED.value]}, 1, 0]}},
            "credits_used": {"$sum": "$credits_used"},
            "tokens": {"$sum": "$context_tokens"},
        }},
    ]
    
    builds_total = 0
    builds_successful = 0
    builds_failed = 0
    total_credits_used = 0
    total_tokens_consumed = 0
    
    async for doc in db.builds.aggregate(builds_pipeline):
        builds_total = doc.get("total", 0)
        builds_successful = doc.get("successful", 0)
        builds_failed = doc.get("failed", 0)
        total_credits_used = doc.get("credits_used", 0)
        total_tokens_consumed = doc.get("tokens", 0)
    
    success_rate = round((builds_successful / builds_total) * 100, 2) if builds_total > 0 else 0.0
    
    avg_build_time = await _get_avg_build_time(db, current_user.id, start_date)
    
    favorite_agents = await _get_favorite_agents(db, current_user.id, start_date)
    
    projects_pipeline = [
        {"$match": {"user_id": current_user.id, "created_at": {"$gte": start_date}}},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]
    
    projects_count = 0
    async for doc in db.projects.aggregate(projects_pipeline):
        projects_count = doc.get("count", 0)
    
    return PersonalAnalytics(
        builds_total=builds_total,
        builds_successful=builds_successful,
        builds_failed=builds_failed,
        success_rate=success_rate,
        total_credits_used=total_credits_used,
        total_tokens_consumed=total_tokens_consumed,
        avg_build_time_minutes=avg_build_time,
        favorite_agents=favorite_agents,
        projects_count=projects_count,
    )


async def _get_avg_build_time(db, user_id: str, start_date: datetime) -> float:
    pipeline = [
        {"$match": {
            "user_id": user_id,
            "created_at": {"$gte": start_date},
            "completed_at": {"$ne": None}
        }},
        {"$project": {
            "duration_minutes": {
                "$divide": [
                    {"$subtract": [{"$toLong": "$completed_at"}, {"$toLong": "$created_at"}]},
                    60000
                ]
            }
        }},
        {"$group": {"_id": None, "avg_duration": {"$avg": "$duration_minutes"}}},
    ]
    
    avg_time = 0.0
    async for doc in db.builds.aggregate(pipeline):
        avg_time = round(doc.get("avg_duration", 0.0), 2)
    
    return avg_time


async def _get_favorite_agents(db, user_id: str, start_date: datetime) -> Dict[str, int]:
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date}, "user_id": user_id}},
        {"$unwind": "$agents"},
        {"$group": {"_id": "$agents.agent", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    
    favorites = {}
    async for doc in db.builds.aggregate(pipeline):
        agent = doc.get("_id", "unknown")
        favorites[agent] = doc.get("count", 0)
    
    return favorites