from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import hashlib

import resend

from core.config import get_settings
from core.models import User, SecurityEvent
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


@router.get("/referrals", response_model=List[ReferralResponse])
async def list_referrals(user: User = Depends(get_current_user)):
    db = await get_db()
    referrals = await db.referrals.find({"referrer_id": user.id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return referrals


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


@router.get("/notifications", response_model=List[NotificationResponse])
async def list_notifications(user: User = Depends(get_current_user)):
    db = await get_db()
    notifications = await db.notifications.find(
        {"user_id": user.id}, {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(None)
    return notifications


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