from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer
from typing import Optional, Dict, Any
import time
from datetime import datetime, timedelta

from core.database import get_db
from core.models import SecurityEvent, RateLimitRule
from core.config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)

# Default rate limits
DEFAULT_RATE_LIMITS = {
    "auth": {"limit": 10, "window": 60},
    "build": {"limit": 5, "window": 60},
    "api": {"limit": 100, "window": 60},
}


async def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit_middleware(request: Request, call_next):
    db = await get_db()
    path = request.url.path
    client_ip = await get_client_ip(request)
    
    # Determine rate limit key and limits
    limit_key = None
    limit_config = None
    
    if path.startswith("/auth"):
        limit_key = f"ip:{client_ip}:auth"
        limit_config = DEFAULT_RATE_LIMITS["auth"]
    elif path.startswith("/builds"):
        limit_key = f"ip:{client_ip}:build"
        limit_config = DEFAULT_RATE_LIMITS["build"]
    elif path.startswith("/api"):
        limit_key = f"ip:{client_ip}:api"
        limit_config = DEFAULT_RATE_LIMITS["api"]
    else:
        limit_key = f"ip:{client_ip}:general"
        limit_config = {"limit": 60, "window": 60}
    
    # Check rate limit
    rule = await db.rate_limits.find_one({"key": limit_key}, {"_id": 0})
    now = datetime.utcnow()
    
    if rule:
        reset_at = rule.get("reset_at")
        if reset_at and now > reset_at:
            # Reset the counter
            await db.rate_limits.update_one(
                {"key": limit_key},
                {"$set": {"remaining": limit_config["limit"] - 1, "reset_at": now + timedelta(seconds=limit_config["window"])}}
            )
        elif rule.get("remaining", 0) <= 0:
            # Rate limited
            await db.security_events.insert_one(
                SecurityEvent(
                    event_type="rate_limit",
                    severity="medium",
                    ip_address=client_ip,
                    metadata={"path": path, "key": limit_key}
                ).model_dump()
            )
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
        else:
            await db.rate_limits.update_one(
                {"key": limit_key},
                {"$inc": {"remaining": -1}}
            )
    else:
        await db.rate_limits.insert_one({
            "key": limit_key,
            "limit": limit_config["limit"],
            "window": limit_config["window"],
            "remaining": limit_config["limit"] - 1,
            "reset_at": now + timedelta(seconds=limit_config["window"]),
        })
    
    # Check for banned users
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from auth import decode_token
        token = auth_header[7:]
        payload = decode_token(token)
        if payload:
            user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
            if user and user.get("banned"):
                raise HTTPException(status_code=403, detail="Account banned")
    
    response = await call_next(request)
    return response


async def check_anomalies(user_id: str, action: str, db) -> Optional[SecurityEvent]:
    now = datetime.utcnow()
    
    # Check for rapid successive actions
    recent_events = await db.analytics_events.find(
        {"user_id": user_id, "event_name": action, "created_at": {"$gte": now - timedelta(seconds=10)}}
    ).to_list(20)
    
    if len(recent_events) > 15:
        event = SecurityEvent(
            user_id=user_id,
            event_type="anomaly",
            severity="high",
            metadata={"action": action, "count": len(recent_events), "window": "10s"}
        )
        await db.security_events.insert_one(event.model_dump())
        return event
    
    return None