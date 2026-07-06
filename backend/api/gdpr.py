from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Iterable
from datetime import datetime
import asyncio
import hashlib
import stripe

from core.models import User
from core.database import get_db
from core.config import get_settings
from api.auth import get_current_user

router = APIRouter(prefix="/gdpr", tags=["gdpr"])
settings = get_settings()


_DIRECT_USER_COLLECTIONS = (
    "agent_executions",
    "ai_usage",
    "analytics_events",
    "api_keys",
    "credit_purchases",
    "deployments",
    "invoices",
    "notifications",
    "onboarding_progress",
    "security_events",
    "sessions",
    "subscriptions",
    "support_tickets",
    "webhooks",
)


async def _delete_many(db, collection_names: Iterable[str], query: dict) -> int:
    deleted = 0
    for name in collection_names:
        result = await getattr(db, name).delete_many(query)
        deleted += result.deleted_count
    return deleted


async def delete_user_data_cascade(db, user_id: str, email: str) -> Dict[str, int]:
    """Idempotently erase one user's data without orphaning shared tenants.

    Descendants are removed before their parent IDs disappear. The user row
    is deliberately last so a retry remains authenticated after any transient
    database failure before completion.
    """
    owned_orgs = await db.organizations.find(
        {"owner_id": user_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    owned_org_ids = [org["id"] for org in owned_orgs]
    if owned_org_ids:
        other_member = await db.team_members.find_one(
            {"org_id": {"$in": owned_org_ids}, "user_id": {"$ne": user_id}},
            {"_id": 0, "id": 1},
        )
        if other_member:
            raise HTTPException(
                status_code=409,
                detail="Transfer ownership of shared organizations before deleting your account",
            )

    user_document = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "stripe_customer_id": 1}
    )
    stripe_customer_id = (user_document or {}).get("stripe_customer_id")
    if stripe_customer_id:
        if not settings.stripe_secret_key:
            raise HTTPException(
                status_code=503,
                detail="Billing cleanup is unavailable; account deletion was not started",
            )
        try:
            await asyncio.to_thread(stripe.Customer.delete, stripe_customer_id)
        except stripe.InvalidRequestError as exc:
            if getattr(exc, "code", None) != "resource_missing":
                raise HTTPException(
                    status_code=502,
                    detail="Stripe customer deletion failed; account deletion was not started",
                ) from exc
        except stripe.StripeError as exc:
            raise HTTPException(
                status_code=502,
                detail="Stripe customer deletion failed; account deletion was not started",
            ) from exc

    projects = await db.projects.find(
        {"user_id": user_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    project_ids = [project["id"] for project in projects]
    builds = await db.builds.find(
        {"$or": [{"user_id": user_id}, {"project_id": {"$in": project_ids}}]},
        {"_id": 0, "id": 1},
    ).to_list(None)
    build_ids = [build["id"] for build in builds]

    initiatives = await db.initiatives.find(
        {"user_id": user_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    initiative_ids = [initiative["id"] for initiative in initiatives]
    sprints = await db.sprints.find(
        {"initiative_id": {"$in": initiative_ids}}, {"_id": 0, "id": 1}
    ).to_list(None)
    sprint_ids = [sprint["id"] for sprint in sprints]

    counts: Dict[str, int] = {}
    counts["build_files"] = (
        await db.build_files.delete_many({"build_id": {"$in": build_ids}})
    ).deleted_count
    counts["messages"] = (
        await db.messages.delete_many(
            {"$or": [{"user_id": user_id}, {"project_id": {"$in": project_ids}}]}
        )
    ).deleted_count

    counts["sprint_artifacts"] = await _delete_many(
        db, ("standups", "sprint_reviews", "sprint_retros"),
        {"sprint_id": {"$in": sprint_ids}},
    )
    counts["initiative_artifacts"] = await _delete_many(
        db,
        (
            "prds", "epics", "stories", "tasks", "sprints", "risk_reports",
            "tech_debt_summaries", "agent_executions", "releases", "decision_log",
        ),
        {"initiative_id": {"$in": initiative_ids}},
    )
    counts["initiatives"] = (
        await db.initiatives.delete_many({"id": {"$in": initiative_ids}})
    ).deleted_count

    counts["builds"] = (
        await db.builds.delete_many(
            {"$or": [{"user_id": user_id}, {"project_id": {"$in": project_ids}}]}
        )
    ).deleted_count
    counts["projects"] = (
        await db.projects.delete_many({"user_id": user_id})
    ).deleted_count
    counts["direct"] = await _delete_many(
        db, _DIRECT_USER_COLLECTIONS, {"user_id": user_id}
    )
    counts["marketplace_items"] = (
        await db.marketplace_items.delete_many({"author_id": user_id})
    ).deleted_count
    counts["referrals"] = (
        await db.referrals.delete_many(
            {"$or": [{"referrer_id": user_id}, {"referred_email": email}]}
        )
    ).deleted_count
    counts["invitations"] = (
        await db.invitations.delete_many(
            {
                "$or": [
                    {"email": email},
                    {"invited_by": user_id},
                    {"org_id": {"$in": owned_org_ids}},
                ]
            }
        )
    ).deleted_count
    counts["team_members"] = (
        await db.team_members.delete_many(
            {"$or": [{"user_id": user_id}, {"org_id": {"$in": owned_org_ids}}]}
        )
    ).deleted_count
    counts["organizations"] = (
        await db.organizations.delete_many({"id": {"$in": owned_org_ids}})
    ).deleted_count

    anonymized_id = "deleted:" + hashlib.sha256(user_id.encode()).hexdigest()[:16]
    await db.audit_logs.update_many(
        {"actor_id": user_id},
        {"$set": {"actor_id": anonymized_id, "actor_email": "[deleted]"}},
    )
    await db.audit_logs.update_many(
        {"resource_id": user_id}, {"$set": {"resource_id": anonymized_id}}
    )
    await db.feature_flags.update_many(
        {"updated_by": user_id}, {"$set": {"updated_by": None}}
    )
    counts["users"] = (await db.users.delete_one({"id": user_id})).deleted_count
    return counts


@router.get("/export")
async def export_user_data(current_user: User = Depends(get_current_user)):
    """Export all user data for GDPR compliance."""
    db = await get_db()
    
    export_data: Dict[str, Any] = {
        "user": {},
        "projects": [],
        "builds": [],
        "exported_at": datetime.utcnow().isoformat(),
    }
    
    # Get user data (without sensitive fields)
    user_doc = await db.users.find_one(
        {"id": current_user.id},
        {"_id": 0, "hashed_password": 0}
    )
    if user_doc:
        export_data["user"] = user_doc
    
    # Get projects
    projects_cursor = db.projects.find({"user_id": current_user.id}, {"_id": 0})
    async for doc in projects_cursor:
        export_data["projects"].append(doc)
    
    # Get builds (without file contents to reduce size)
    builds_cursor = db.builds.find(
        {"user_id": current_user.id},
        {"_id": 0, "files": 0}
    )
    async for doc in builds_cursor:
        export_data["builds"].append(doc)
    
    return export_data


@router.delete("/delete")
async def delete_user_data(
    confirm: bool,
    current_user: User = Depends(get_current_user)
):
    """Delete all user data for GDPR compliance."""
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must set confirm=true to delete account"
        )
    
    counts = await delete_user_data_cascade(
        await get_db(), current_user.id, current_user.email
    )
    return {"ok": True, "message": "Account deleted", "deleted": counts}
