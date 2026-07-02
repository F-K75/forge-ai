from fastapi import Request, HTTPException
from typing import Optional
from datetime import datetime, timedelta
import ipaddress
import re
import time
import secrets
import hashlib

from core.database import get_db, get_redis
from core.models import SecurityEvent
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

# Per-email auth rate limits (for unauthenticated endpoints)
EMAIL_RATE_LIMITS = {
    "forgot_password": {"limit": 3, "window": 3600},    # 3/hour
    "register":        {"limit": 5, "window": 3600},    # 5/hour
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


# In-memory fallback rate limiter for when Redis is unavailable
_in_memory_rate_limits: dict[str, list[float]] = {}
_IN_MEMORY_MAX_KEYS = 10000  # Prevent unbounded memory growth


async def _check_in_memory_rate_limit(key: str, limit: int, window: int) -> tuple[bool, int]:
    """Check rate limit using in-memory store as fallback when Redis is down.
    Returns (is_allowed, remaining)."""
    now = time.time()
    # Clean old entries periodically
    if len(_in_memory_rate_limits) > _IN_MEMORY_MAX_KEYS:
        _in_memory_rate_limits.clear()
    
    timestamps = _in_memory_rate_limits.get(key, [])
    # Remove timestamps outside the window
    timestamps = [t for t in timestamps if now - t < window]
    
    if len(timestamps) >= limit:
        return False, 0
    
    timestamps.append(now)
    _in_memory_rate_limits[key] = timestamps
    return True, limit - len(timestamps)


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    client_ip = await get_client_ip(request)
    
    # Skip rate limiting for trusted proxies and health checks
    if path == "/health" or client_ip in settings.trusted_proxies.split(","):
        return await call_next(request)
    
    zone, config = _get_limit_config(path)
    key = f"rl:{zone}:{client_ip}"
    limit = config["limit"]
    window = config["window"]
    
    redis_available = False
    try:
        redis = await get_redis()
        # Test connectivity with a lightweight ping
        await redis.ping()
        redis_available = True
    except Exception:
        redis_available = False
    
    if redis_available:
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
            # Redis error — fall through to in-memory fallback
            pass
    
    # Redis unavailable or error — use in-memory fallback (fail-closed)
    allowed, remaining = await _check_in_memory_rate_limit(key, limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later.",
        )
    
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Fallback"] = "in-memory"
    return response


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


# Endpoints excluded from CSRF protection
_CSRF_EXCLUDED_PATHS = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/csrf-token",  # Token generation endpoint
    "/health",
    "/billing/webhook",  # Stripe webhook has its own signature verification
]


async def csrf_protection_middleware(request: Request, call_next):
    """Validate CSRF token on state-changing requests.
    
    Uses the JWT 'jti' claim as the session identifier for CSRF token storage.
    The CSRF token is fetched by the frontend via GET /auth/csrf-token and
    included in the X-CSRF-Token header on all state-changing requests.
    """
    # Skip CSRF for safe methods and excluded paths
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)
    
    path = request.url.path
    for excluded in _CSRF_EXCLUDED_PATHS:
        if path.startswith(excluded):
            return await call_next(request)
    
    # Extract session token from the access_token cookie
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(status_code=403, detail="CSRF: No session token")
    
    # Decode the JWT to get the session identifier (jti)
    from auth import decode_token
    payload = decode_token(access_token)
    if not payload or not payload.get("jti"):
        raise HTTPException(status_code=403, detail="CSRF: Invalid session")
    
    session_token = payload["jti"]
    csrf_header = request.headers.get("X-CSRF-Token")
    
    if not csrf_header:
        raise HTTPException(
            status_code=403,
            detail="CSRF token required. Include X-CSRF-Token header.",
        )
    
    valid = await validate_csrf_token(session_token, csrf_header)
    if not valid:
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired CSRF token. Refresh the page.",
        )
    
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


async def check_email_rate_limit(email: str, action: str, db) -> tuple[bool, int]:
    """Check per-email rate limit for unauthenticated auth endpoints.
    Returns (is_allowed, remaining)."""
    config = EMAIL_RATE_LIMITS.get(action)
    if not config:
        return True, 0

    key = f"rl:auth:email:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    limit = config["limit"]
    window = config["window"]

    try:
        redis = await get_redis()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window)
        remaining = max(0, limit - current)
        if current > limit:
            return False, 0
        return True, remaining
    except Exception:
        # Fail open if Redis is down
        return True, 0
