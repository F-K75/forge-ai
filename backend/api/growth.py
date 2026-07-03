from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import hashlib
import math

import resend

from core.config import get_settings
from core.models import User
from core.database import get_db
from api.auth import get_current_user

settings = get_settings()
if settings.resend_api_key:
    resend.api_key = settings.resend_api_key

router = APIRouter(prefix="/growth", tags=["growth"])


class ReferralCreate(BaseModel):
    referred_email: str


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"


class ReferralResponse(BaseModel):
    id: str
    referrer_id: str
    referred_email: str
    status: str
    created_at: datetime


class NotificationResponse(BaseModel):
    id: str
    title: str
    message: str
    type: str
    created_at: datetime
    read_at: Optional[datetime] = None


class PaginatedReferrals(BaseModel):
    referrals: List[ReferralResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class PaginatedNotifications(BaseModel):
    notifications: List[NotificationResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


async def send_email(to: str, subject: str, html: str):
    if not settings.resend_api_key:
        return {"skipped": "no api key"}
    try:
        params = {
            "from": settings.from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        return resend.Emails.send(params)
    except Exception as e:
        return {"error": str(e)}


@router.post("/referrals", response_model=Dict[str, Any])
async def create_referral(req: ReferralCreate, user: User = Depends(get_current_user)):
    db = await get_db()
    
    referral_code = hashlib.sha256(f"{user.id}{req.referred_email}{datetime.utcnow().timestamp()}".encode()).hexdigest()[:8]
    
    referral = {
        "id": f"ref_{referral_code}",
        "referrer_id": user.id,
        "referred_email": req.referred_email,
        "status": "pending",
        "referral_code": referral_code,
        "created_at": datetime.utcnow(),
    }
    await db.referrals.insert_one(referral)
    
    await send_email(
        req.referred_email,
        f"{user.name} invited you to Forge",
        f'<h2>Join Forge with {user.name}\'s referral</h2><p>Click <a href="{settings.app_url}/signup?ref={referral_code}">here</a> to sign up and get bonus credits!</p>'
    )
    
    return {"ok": True, "referral_code": referral_code}


@router.get("/referrals", response_model=PaginatedReferrals)
async def list_referrals(
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    query = {"referrer_id": user.id}
    total = await db.referrals.count_documents(query)
    referrals = await db.referrals.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedReferrals(
        referrals=referrals,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.post("/notifications", response_model=NotificationResponse)
async def create_notification(req: NotificationCreate, user: User = Depends(get_current_user)):
    db = await get_db()
    
    notification = {
        "id": f"notif_{datetime.utcnow().timestamp()}",
        "user_id": user.id,
        "title": req.title,
        "message": req.message,
        "type": req.type,
        "created_at": datetime.utcnow(),
    }
    await db.notifications.insert_one(notification)
    
    return notification


@router.get("/notifications", response_model=PaginatedNotifications)
async def list_notifications(
    user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    query = {"user_id": user.id}
    total = await db.notifications.count_documents(query)
    notifications = await db.notifications.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedNotifications(
        notifications=notifications,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user: User = Depends(get_current_user)):
    db = await get_db()
    await db.notifications.update_one(
        {"id": notification_id, "user_id": user.id},
        {"$set": {"read_at": datetime.utcnow()}}
    )
    return {"ok": True}


@router.post("/onboarding/track")
async def track_onboarding(user: User = Depends(get_current_user)):
    db = await get_db()
    
    await db.analytics_events.insert_one({
        "id": f"evt_{datetime.utcnow().timestamp()}",
        "user_id": user.id,
        "event_name": "onboarding_view",
        "properties": {},
        "created_at": datetime.utcnow(),
    })
    
    return {"ok": True}