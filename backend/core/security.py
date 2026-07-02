from fastapi import Request, HTTPException
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from typing import Optional
from datetime import datetime, timedelta
import ipaddress
import re
import time
import secrets
import hashlib

from core.database import get_db, get_redis
from core.models import SecurityEvent, User
from core.config import get_settings

settings = get_settings()

DEFAULT_RATE_LIMITS = {
    "auth": {"limit": 10, "window": 60},
    "build": {"limit": 5, "window": 60},
    "api": {"limit": 100, "window": 60},
}

# User-based rate limits
USER_RATE_LIMITS = {
    "build": 100,  # max builds per hour
    "api": 1000,   # max API calls per hour
}

# CSRF token storage (in production, use Redis)
_csrf_tokens: dict[str, tuple[str, datetime]] = {}


def _get_limit_config(path: str) -> tuple[str, dict]:
    if path.startswith("/auth"):
        return "auth", DEFAULT_RATE_LIMITS["auth"]
    elif path.startswith("/builds"):
        return "build", DEFAULT_RATE_LIMITS["build"]
    elif path.startswith("/api"):
        return "api", DEFAULT_RATE_LIMITS["api"]
    else:
        return "general", {"limit": 60, "window": 60}


def _is_trusted_proxy(host: str) -> bool:
    try:
        peer = ipaddress.ip_address(host)
    except ValueError:
        return False
    for entry in settings.trusted_proxies.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            if peer in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


async def get_client_ip(request: Request) -> str:
    # Use X-Forwarded-For only if request is from trusted proxy
    if request.client and _is_trusted_proxy(request.client.host):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    # Direct connection IP
    return request.client.host if request.client else "unknown"


async def request_size_limit_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_size:
        raise HTTPException(status_code=413, detail="Request body too large")
    
    # Add security headers
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    return response


async def rate_limit_middleware(request: Request, call_next):
    redis = None
    try:
        redis = await get_redis()
    except Exception:
        # Redis unavailable — fall through to bypass rate limiting
        return await call_next(request)

    path = request.url.path
    client_ip = await get_client_ip(request)
    
    # Skip rate limiting for trusted proxies and health checks
    if path == "/health" or client_ip in settings.trusted_proxies.split(","):
        return await call_next(request)
    
    zone, config = _get_limit_config(path)
    key = f"rl:{zone}:{client_ip}"
    limit = config["limit"]
    window = config["window"]

    try:
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window)

        remaining = max(0, limit - current)

        if current > limit:
            # Log rate limit event
            try:
                db = await get_db()
                await db.security_events.insert_one(
                    SecurityEvent(
                        event_type="rate_limit",
                        severity="medium",
                        ip_address=client_ip,
                        metadata={"path": path, "key": key, "count": current},
                    ).model_dump()
                )
            except Exception:
                pass

            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later.",
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

    except HTTPException:
        raise
    except Exception:
        # Redis error — fall through to avoid breaking the app
        return await call_next(request)


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validate password meets minimum security requirements."""
    if len(password) < 12:
        return False, "Password must be at least 12 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    return True, ""


async def csrf_protection_middleware(request: Request, call_next):
    """Validate CSRF token on state-changing requests."""
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_header:
            # For endpoints using cookies, CSRF is required
            if not request.url.path.startswith("/auth/login") and not request.url.path.startswith("/auth/register"):
                raise HTTPException(status_code=403, detail="CSRF token required")
    
    response = await call_next(request)
    return response


def sanitize_prompt(value: str, max_length: int = 50000) -> str:
    """Sanitize user prompt for LLM injection attacks."""
    if not isinstance(value, str):
        raise ValueError("Input must be a string")
    
    # Remove null bytes and control characters
    value = value.replace("\x00", "")
    value = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", value)
    
    # Limit length
    if len(value) > max_length:
        value = value[:max_length]
    
    return value


def sanitize_string(value: str, max_length: int = 200) -> str:
    """Sanitize free-text input for safe use in a MongoDB $regex query.

    Strips control characters and escapes regex metacharacters so the
    caller-supplied value can't be used for ReDoS or regex injection.
    """
    if not isinstance(value, str):
        raise ValueError("Input must be a string")

    value = value.replace("\x00", "")
    value = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", value)

    if len(value) > max_length:
        value = value[:max_length]

    return re.escape(value)


def generate_csrf_token() -> str:
    """Generate a secure CSRF token."""
    return secrets.token_urlsafe(32)


async def store_csrf_token(session_token: str, csrf_token: str, expires_in_minutes: int = 60) -> None:
    """Store CSRF token in Redis with expiration."""
    try:
        redis = await get_redis()
        key = f"csrf:{session_token}"
        await redis.setex(key, expires_in_minutes * 60, csrf_token)
    except Exception:
        pass


async def validate_csrf_token(session_token: str, csrf_token: str) -> bool:
    """Validate CSRF token from Redis."""
    if not session_token or not csrf_token:
        return False
    
    try:
        redis = await get_redis()
        key = f"csrf:{session_token}"
        stored = await redis.get(key)
        if not stored:
            return False
        return secrets.compare_digest(stored, csrf_token)
    except Exception:
        return False


async def check_anomalies(user_id: str, action: str, db) -> Optional[SecurityEvent]:
    now = datetime.utcnow()

    # Check for rapid successive actions
    recent_events = await db.analytics_events.find(
        {
            "user_id": user_id,
            "event_name": action,
            "created_at": {"$gte": now - timedelta(seconds=10)},
        }
    ).to_list(20)

    if len(recent_events) > 15:
        event = SecurityEvent(
            user_id=user_id,
            event_type="anomaly",
            severity="high",
            ip_address=None,
            metadata={
                "action": action,
                "count": len(recent_events),
                "window": "10s",
            },
        )
        try:
            await db.security_events.insert_one(event.model_dump())
        except Exception:
            # Fallback to logging if DB insert fails
            import logging
            logging.error(f"Failed to log security event: {event.model_dump()}")
        return event

    return None
