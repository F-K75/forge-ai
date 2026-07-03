from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import secrets

from core.models import User
from core.database import get_db
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


def _generate_secret() -> str:
    """Generate webhook signing secret."""
    return secrets.token_urlsafe(32)


@router.post("/", response_model=WebhookResponse)
async def create_webhook(
    req: WebhookCreateRequest,
    current_user: User = Depends(get_current_user)
):
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
    
    return WebhookResponse(
        id=webhook["id"],
        url=webhook["url"],
        events=webhook["events"],
        active=webhook["active"],
        created_at=webhook["created_at"],
        last_triggered=None,
    )


@router.get("/", response_model=List[WebhookResponse])
async def list_webhooks(current_user: User = Depends(get_current_user)):
    db = await get_db()
    webhooks = await db.webhooks.find(
        {"user_id": current_user.id},
        {"_id": 0, "secret": 0}
    ).sort("created_at", -1).to_list(50)
    return webhooks


@router.delete("/{webhook_id}")
async def delete_webhook(webhook_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    result = await db.webhooks.delete_one({"id": webhook_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return {"ok": True}