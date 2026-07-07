from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import secrets
import math

from core.models import User
from core.database import get_db
from core.security import validate_webhook_url
from core.audit import record_audit_log
from api.auth import get_current_user

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookCreateRequest(BaseModel):
    url: str
    events: List[str] = []  # e.g., ["build.completed", "build.failed"]
    active: bool = True


class WebhookResponse(BaseModel):
    id: str
    url: str
    events: List[str]
    active: bool
    created_at: datetime
    last_triggered: Optional[datetime]


class PaginatedWebhooks(BaseModel):
    webhooks: List[WebhookResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


def _generate_secret() -> str:
    """Generate webhook signing secret."""
    return secrets.token_urlsafe(32)


@router.post("/", response_model=WebhookResponse)
async def create_webhook(
    req: WebhookCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    valid, error = await validate_webhook_url(req.url)
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    db = await get_db()

    webhook = {
        "id": f"wh_{secrets.token_urlsafe(16)}",
        "user_id": current_user.id,
        "url": req.url,
        "secret": _generate_secret(),
        "events": req.events,
        "active": req.active,
        "created_at": datetime.utcnow(),
        "last_triggered": None,
    }
    
    await db.webhooks.insert_one(webhook)
    await record_audit_log(
        db, request, current_user, "create_webhook", "webhook",
        resource_id=webhook["id"],
        changes={"url": req.url, "events": req.events, "active": req.active},
    )
    
    return WebhookResponse(
        id=webhook["id"],
        url=webhook["url"],
        events=webhook["events"],
        active=webhook["active"],
        created_at=webhook["created_at"],
        last_triggered=None,
    )


@router.get("/", response_model=PaginatedWebhooks)
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    query = {"user_id": current_user.id}
    total = await db.webhooks.count_documents(query)
    webhooks = await db.webhooks.find(
        query,
        {"_id": 0, "secret": 0}
    ).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedWebhooks(
        webhooks=webhooks,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    result = await db.webhooks.delete_one({"id": webhook_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await record_audit_log(
        db, request, current_user, "delete_webhook", "webhook",
        resource_id=webhook_id,
    )
    return {"ok": True}