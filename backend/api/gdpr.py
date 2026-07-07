from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Iterable, List
from datetime import datetime
import asyncio
import hashlib
import json
import stripe

from core.models import User
from core.database import get_db
from core.config import get_settings
from core.audit import record_audit_log
from api.auth import get_current_user

router = APIRouter(prefix="/gdpr", tags=["gdpr"])
settings = get_settings()

# Fields that must never leave the server in an export (password hash, raw
# tokens, verification secrets, MFA secrets). Encrypted secrets are dropped
# rather than exported: they are not reversibly readable by the user and
# exporting ciphertext adds leak surface without portability value.
_EXPORT_STRIP_FIELDS = {
    "_id",
    "hashed_password",
    "github_token",
    "llm_api_key",
    "verification_token",
    "verification_expires",
    "totp_secret",
    "mfa_backup_codes",
}


async def _user_owned_ids(db, user_id: str) -> Dict[str, List[str]]:
    """Resolve the project/build/initiative/sprint id sets that scope a user's
    derived documents. Mirrors the id derivation in delete_user_data_cascade so
    export and deletion cover exactly the same documents."""
    projects = await db.projects.find(
        {"user_id": user_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    project_ids = [p["id"] for p in projects]

    builds = await db.builds.find(
        {"$or": [{"user_id": user_id}, {"project_id": {"$in": project_ids}}]},
        {"_id": 0, "id": 1},
    ).to_list(None)
    build_ids = [b["id"] for b in builds]

    initiatives = await db.initiatives.find(
        {"user_id": user_id}, {"_id": 0, "id": 1}
    ).to_list(None)
    initiative_ids = [i["id"] for i in initiatives]

    sprints = await db.sprints.find(
        {"initiative_id": {"$in": initiative_ids}}, {"_id": 0, "id": 1}
    ).to_list(None)
    sprint_ids = [s["id"] for s in sprints]

    return {
        "project_ids": project_ids,
        "build_ids": build_ids,
        "initiative_ids": initiative_ids,
        "sprint_ids": sprint_ids,
    }


async def _collect_user_data(db, user: User) -> Dict[str, Any]:
    """Gather every data category the deletion cascade erases, so a data-subject
    access request is complete (GDPR Art. 15 / 20)."""
    ids = await _user_owned_ids(db, user.id)

    user_doc = await db.users.find_one(
        {"id": user.id},
        {"_id": 0, **{f: 0 for f in _EXPORT_STRIP_FIELDS}},
    )
    # Also strip defensively in Python so the export is privacy-safe even if
    # the underlying driver/projection doesn't drop the fields.
    if user_doc:
        user_doc = {k: v for k, v in user_doc.items() if k not in _EXPORT_STRIP_FIELDS}

    export: Dict[str, Any] = {
        "user": user_doc,
        "exported_at": datetime.utcnow().isoformat(),
        "projects": await db.projects.find(
            {"id": {"$in": ids["project_ids"]}}, {"_id": 0}
        ).to_list(None),
        "builds": await db.builds.find(
            {"id": {"$in": ids["build_ids"]}}, {"_id": 0}
        ).to_list(None),
        "build_files": await db.build_files.find(
            {"build_id": {"$in": ids["build_ids"]}}, {"_id": 0}
        ).to_list(None),
        "messages": await db.messages.find(
            {
                "$or": [
                    {"user_id": user.id},
                    {"project_id": {"$in": ids["project_ids"]}},
                ]
            },
            {"_id": 0},
        ).to_list(None),
        "initiatives": await db.initiatives.find(
            {"id": {"$in": ids["initiative_ids"]}}, {"_id": 0}
        ).to_list(None),
        "sprints": await db.sprints.find(
            {"id": {"$in": ids["sprint_ids"]}}, {"_id": 0}
        ).to_list(None),
        "sprint_artifacts": await _collect_many(
            db,
            ("standups", "sprint_reviews", "sprint_retros"),
            {"sprint_id": {"$in": ids["sprint_ids"]}},
        ),
        "initiative_artifacts": await _collect_many(
            db,
            (
                "prds", "epics", "stories", "tasks", "releases", "risk_reports",
                "tech_debt_summaries", "agent_executions", "decision_log",
            ),
            {"initiative_id": {"$in": ids["initiative_ids"]}},
        ),
        "direct": await _collect_many(
            db,
            _DIRECT_USER_COLLECTIONS,
            {"user_id": user.id},
        ),
        "marketplace_items": await db.marketplace_items.find(
            {"author_id": user.id}, {"_id": 0}
        ).to_list(None),
        "referrals": await db.referrals.find(
            {"$or": [{"referrer_id": user.id}, {"referred_email": user.email}]},
            {"_id": 0},
        ).to_list(None),
        "team_members": await db.team_members.find(
            {"user_id": user.id}, {"_id": 0}
        ).to_list(None),
        "organizations": await db.organizations.find(
            {"owner_id": user.id}, {"_id": 0}
        ).to_list(None),
    }
    return export


async def _collect_many(db, collection_names: Iterable[str], query: dict) -> Dict[str, List[dict]]:
    out: Dict[str, List[dict]] = {}
    for name in collection_names:
        out[name] = await getattr(db, name).find(query, {"_id": 0}).to_list(None)
    return out


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
    """Export all user-owned data for GDPR right of access / portability.

    Returns a downloadable JSON file containing every category the account
    deletion cascade erases. Password hashes and encrypted secrets are stripped
    before serialization. The payload is streamed so large accounts don't
    buffer entirely in memory.
    """
    db = await get_db()
    export_data = await _collect_user_data(db, current_user)

    async def _stream():
        yield json.dumps(export_data, default=str, indent=2)

    return StreamingResponse(
        _stream(),
        media_type="application/json",
        headers={
            "Content-Disposition": (
                f'attachment; filename="forge-data-export-{current_user.id}.json"'
            )
        },
    )


@router.delete("/delete")
async def delete_user_data(
    confirm: bool,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Delete all user data for GDPR compliance."""
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Must set confirm=true to delete account"
        )
    
    db = await get_db()
    counts = await delete_user_data_cascade(db, current_user.id, current_user.email)
    await record_audit_log(
        db, request, current_user, "delete_account", "user",
        resource_id=current_user.id,
        changes={"deleted": counts},
    )
    return {"ok": True, "message": "Account deleted", "deleted": counts}
