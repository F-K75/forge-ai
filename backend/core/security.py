from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
from datetime import timedelta
import asyncio
import contextvars
import ipaddress
import logging
import re
import time
import secrets
import uuid
import hashlib
import os
from collections import OrderedDict
from urllib.parse import urlparse

from auth import decode_token

from core.database import get_db, get_redis
from core.models import SecurityEvent, utcnow
from core.config import get_settings

settings = get_settings()

# Request/correlation ID (BE-008) -- previously there was no way to tie a
# single request's log lines together, or match a client-reported error back
# to the exact server-side request that caused it.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default="-"
)


class RequestIdLogFilter(logging.Filter):
    """Injects the current request's ID into every LogRecord so log lines
    from the same request can be correlated, even across the different
    modules/functions a single request passes through."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


async def request_id_middleware(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID")
    request_id = incoming if incoming else uuid.uuid4().hex
    token = request_id_var.set(request_id)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = request_id
    return response

DEFAULT_RATE_LIMITS = {
    "auth": {"limit": 10, "window": 60},
    "build": {"limit": 5, "window": 60},
    "api": {"limit": 100, "window": 60},
    "waitlist": {"limit": 5, "window": 60},  # public, unauthenticated signup form
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
    "resend_verification": {"limit": 3, "window": 3600},  # 3/hour, same shape as forgot_password
    "waitlist":        {"limit": 3, "window": 3600},    # 3/hour, public landing-page form
    "login":           {"limit": 10, "window": 3600},   # 10/hour -- blocks credential
                                                          # stuffing against one account
                                                          # regardless of source IP; the
                                                          # existing /auth/* limiter is
                                                          # per-IP only and trivially
                                                          # bypassed by spreading attempts
                                                          # across IPs (SEC-011)
    "mfa_verify":      {"limit": 10, "window": 3600},   # 10/hour -- brute-force
                                                          # protection on the 6-digit
                                                          # TOTP code / backup codes
                                                          # (SEC-007)
}

# Strict account lockout after consecutive failed login attempts.
LOGIN_LOCKOUT_THRESHOLD = 5
LOGIN_LOCKOUT_WINDOW = 900  # 15 minutes


# CSRF tokens are stored exclusively in Redis. If Redis is unavailable,
# CSRF protection fails closed rather than falling back to an in-memory
# store that would not replicate across workers.


def _get_limit_config(path: str) -> tuple[str, dict]:
    if path in ("/waitlist", "/v1/waitlist"):
        return "waitlist", DEFAULT_RATE_LIMITS["waitlist"]
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


# Origins always allowed in addition to settings.allowed_origins.
_EXTRA_CORS_ORIGINS = ["https://forge-frontend-8gr.pages.dev"]


def cors_allowed_origins() -> list[str]:
    """Every origin the API accepts cross-origin requests from.

    Shared by ``main.py``'s CORSMiddleware and :func:`_middleware_error`, so
    the two can't drift apart.
    """
    tunnels = [o.strip() for o in settings.frontend_tunnel_url.split(",") if o.strip()]
    return list(settings.allowed_origins) + tunnels + _EXTRA_CORS_ORIGINS


def _middleware_error(
    request: Request, status_code: int, detail: str, headers: Optional[dict] = None
) -> JSONResponse:
    """Build an error response from inside a function middleware.

    Raising ``HTTPException`` here does not work: function middlewares run
    outside FastAPI's exception handling, so the exception reaches Starlette's
    ServerErrorMiddleware and the client gets a 500 instead of the intended
    status. These middlewares also sit outside CORSMiddleware, so CORS headers
    are added here (for allowed origins only) to let browsers read the error.
    """
    response = JSONResponse(status_code=status_code, content={"detail": detail}, headers=headers)
    origin = request.headers.get("origin")
    if origin and origin in cors_allowed_origins():
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response


async def request_size_limit_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_request_size:
        return _middleware_error(request, 413, "Request body too large")
    
    # Add security headers
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self';"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    return response


# In-memory fallback rate limiter for when Redis is unavailable.
# Uses OrderedDict for LRU eviction instead of clearing everything.
_in_memory_rate_limits: "OrderedDict[str, list[float]]" = OrderedDict()
_IN_MEMORY_MAX_KEYS = 10000  # Prevent unbounded memory growth


async def _check_in_memory_rate_limit(key: str, limit: int, window: int, *, fallback_limit: Optional[int] = None) -> tuple[bool, int]:
    """Check rate limit using in-memory store as fallback when Redis is down.

    When Redis is unavailable, the in-memory fallback is per-process -- each
    worker/replica maintains its own independent counter. To prevent the
    effective limit from scaling with the replica count during an outage, the
    *fallback_limit* (defaulting to ``limit`` for backward compatibility) is
    applied per-process rather than the full Redis limit. Callers should pass
    ``fallback_limit=max(1, limit // 2)`` so a two-replica deployment still
    enforces roughly the same total ceiling as the Redis path.
    """
    effective_limit = fallback_limit if fallback_limit is not None else limit
    now = time.time()

    if key in _in_memory_rate_limits:
        _in_memory_rate_limits.move_to_end(key)
    timestamps = _in_memory_rate_limits.get(key, [])
    timestamps = [t for t in timestamps if now - t < window]

    if len(timestamps) >= effective_limit:
        return False, 0

    timestamps.append(now)
    _in_memory_rate_limits[key] = timestamps

    if len(_in_memory_rate_limits) > _IN_MEMORY_MAX_KEYS:
        _in_memory_rate_limits.popitem(last=False)

    return True, effective_limit - len(timestamps)


async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    client_ip = await get_client_ip(request)
    
    # Skip rate limiting for trusted proxies and health checks
    if path == "/health" or client_ip in settings.trusted_proxies.split(","):
        return await call_next(request)
    
    # Key authenticated requests by the account, not just the source IP, so a
    # logged-in user cannot bypass limits by rotating client IPs (INF-007).
    # Unauthenticated requests fall back to the IP. Decoding the access-token
    # cookie is cheap (no DB) and the cookie is optional, so a missing/invalid
    # token simply stays IP-keyed. The lazy import avoids a circular import with
    # the auth module at import time.
    identity = client_ip
    access_token = request.cookies.get("access_token")
    if access_token:
        try:
            payload = decode_token(access_token)
            uid = (payload or {}).get("sub")
            if uid:
                identity = f"user:{uid}"
        except Exception:
            logging.debug("Failed to decode access token for rate limit identity", exc_info=True)

    zone, config = _get_limit_config(path)
    key = f"rl:{zone}:{identity}"
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
                            metadata={
                            "path": path,
                            "key": key,
                            "count": current,
                            "identity": identity,
                        },
                        ).model_dump()
                    )
                except Exception:
                    logging.warning("Failed to log rate limit security event", exc_info=True)

                return _middleware_error(
                    request, 429, "Rate limit exceeded. Please try again later.",
                    headers={"Retry-After": str(window)},
                )

            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            return response

        except HTTPException:
            raise
        except Exception:
            logging.warning("Redis rate limiter failed, falling back to in-memory", exc_info=True)
    
    # Redis unavailable or error — use in-memory fallback (fail-closed).
    # The in-memory store is per-process, so the effective ceiling scales with
    # the worker/replica count during an outage. Apply a conservative 50 %
    # fallback limit to keep the total traffic roughly bounded (SEC-004).
    fallback_limit = max(1, limit // 2)
    allowed, remaining = await _check_in_memory_rate_limit(
        key, limit, window, fallback_limit=fallback_limit
    )
    if not allowed:
        return _middleware_error(
            request, 429, "Rate limit exceeded. Please try again later.",
            headers={"Retry-After": str(window)},
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
    "/v1/auth/login",
    "/v1/auth/register",
    "/auth/mfa/verify",  # completes login before a session/CSRF token exists
    "/v1/auth/mfa/verify",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/v1/auth/forgot-password",
    "/v1/auth/reset-password",
    "/auth/csrf-token",  # Token generation endpoint
    "/v1/auth/csrf-token",
    "/auth/verify-email",
    "/v1/auth/verify-email",
    "/auth/resend-verification",
    "/v1/auth/resend-verification",
    "/auth/google",
    "/v1/auth/google",
    "/health",
    "/v1/waitlist",  # public landing-page signup; no session exists to forge
    "/billing/webhook",  # Stripe webhook has its own signature verification
    "/billing/webhook/payment",  # Stripe payment webhook — signature-verified, no session cookie
    # NOTE: /api/llm is intentionally NOT excluded. Its mutating admin routes
    # (PUT /api/llm/agent/{agent}, POST /api/llm/reload, POST /api/llm/test)
    # are admin_required and the frontend already sends X-CSRF-Token on them;
    # excluding them would let a logged-in admin be CSRF'd into billed test
    # calls or platform-wide model-assignment changes.
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
        # Exact match, or prefix match followed by a path separator -- a bare
        # startswith() would let "/auth/mfa/verify" also exempt the distinct,
        # authenticated "/auth/mfa/verify-setup" endpoint from CSRF checks.
        if path == excluded or path.startswith(excluded + "/"):
            return await call_next(request)
    
    # Extract session token from the access_token cookie
    access_token = request.cookies.get("access_token")
    if not access_token:
        return _middleware_error(request, 403, "CSRF: No session token")
    
    # Decode the JWT to get the session identifier (jti)
    payload = decode_token(access_token)
    if not payload or not payload.get("jti"):
        return _middleware_error(request, 403, "CSRF: Invalid session")
    
    session_token = payload["jti"]
    csrf_header = request.headers.get("X-CSRF-Token")
    
    if not csrf_header:
        return _middleware_error(
            request, 403, "CSRF token required. Include X-CSRF-Token header."
        )
    
    valid = await validate_csrf_token(session_token, csrf_header)
    if not valid:
        return _middleware_error(
            request, 403, "Invalid or expired CSRF token. Refresh the page."
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
    """Store CSRF token in Redis with expiration.

    Raises RuntimeError if Redis is unavailable so callers know the token
    was not persisted. CSRF validation requires Redis — there is no
    in-memory fallback.
    """
    redis = await get_redis()
    key = f"csrf:{session_token}"
    await redis.setex(key, expires_in_minutes * 60, csrf_token)


async def validate_csrf_token(session_token: str, csrf_token: str) -> bool:
    """Validate CSRF token from Redis.

    Returns False if Redis is unavailable (fail-closed).
    """
    if not session_token or not csrf_token:
        return False

    redis = await get_redis()
    key = f"csrf:{session_token}"
    stored = await redis.get(key)
    if not stored:
        return False
    return secrets.compare_digest(stored, csrf_token)


async def check_anomalies(user_id: str, action: str, db) -> Optional[SecurityEvent]:
    now = utcnow()

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


def _is_blocked_webhook_ip(ip_str: str) -> bool:
    """True if the address is not a safe public-internet destination for a webhook."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local  # includes the 169.254.169.254 cloud metadata endpoint
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def validate_webhook_url(url: str) -> tuple[bool, str]:
    """Validate a user-supplied webhook URL against SSRF.

    Rejects non-http(s) schemes, requires HTTPS outside development, and
    resolves the hostname so DNS names pointing at internal/private/reserved
    addresses are blocked the same as literal IPs (also catches the cloud
    metadata endpoint at 169.254.169.254, which is link-local).
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid webhook URL"

    if parsed.scheme not in ("http", "https"):
        return False, "Webhook URL must use http or https"

    if parsed.scheme == "http" and settings.app_env == "production":
        return False, "Webhook URL must use HTTPS in production"

    hostname = parsed.hostname
    if not hostname:
        return False, "Webhook URL must include a hostname"

    try:
        addrinfo = await asyncio.get_event_loop().getaddrinfo(hostname, None)
    except Exception:
        return False, "Webhook URL hostname could not be resolved"

    if not addrinfo:
        return False, "Webhook URL hostname could not be resolved"

    for family, _type, _proto, _canonname, sockaddr in addrinfo:
        if _is_blocked_webhook_ip(sockaddr[0]):
            return False, "Webhook URL resolves to a private, loopback, or reserved IP address"

    return True, ""


async def validate_byok_base_url(url: str) -> tuple[bool, str]:
    """Validate a user-supplied BYOK ``openai_compatible`` base URL against SSRF.

    This is the endpoint an LLM HTTP client will actually connect to, so a
    malicious or careless user could point it at internal services or the cloud
    metadata endpoint (169.254.169.254) to exfiltrate credentials / pivot
    internally. Unlike ``validate_webhook_url`` this always requires HTTPS
    (a BYOK base URL is an API endpoint, never a plain-http dev callback) and
    resolves the hostname so DNS names pointing at private/reserved addresses
    are blocked exactly like literal IPs.

    Returns (is_valid, error_message)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid base URL"

    if parsed.scheme != "https":
        return False, "BYOK base URL must use https"

    hostname = parsed.hostname
    if not hostname:
        return False, "BYOK base URL must include a hostname"

    try:
        addrinfo = await asyncio.get_event_loop().getaddrinfo(hostname, None)
    except Exception:
        return False, "BYOK base URL hostname could not be resolved"

    if not addrinfo:
        return False, "BYOK base URL hostname could not be resolved"

    for _family, _type, _proto, _canonname, sockaddr in addrinfo:
        if _is_blocked_webhook_ip(sockaddr[0]):
            return False, "BYOK base URL resolves to a private, loopback, or reserved IP address"

    return True, ""


def is_safe_relpath(path: str) -> bool:
    """Return True only if ``path`` is a POSIX/Windows relative path that stays
    inside its intended parent directory.

    AI-generated build-file paths (and any other untrusted path keys) are joined
    onto a temp directory before being written to disk. Without this check a
    path like ``../../etc/cron.d/evil`` or an absolute ``/etc/passwd`` would
    escape the sandbox directory and let a malicious build overwrite arbitrary
    host files (path traversal / arbitrary file write — P0-HIGH-005)."""
    if not path:
        return False
    if os.path.isabs(path):
        return False
    # Normalize and reject any component that escapes the directory tree.
    norm = os.path.normpath(path)
    if norm == os.path.curdir or norm.startswith(os.path.pardir + os.path.sep) or norm == os.path.pardir:
        return False
    return True


def safe_join_path(base_dir: str, path: str) -> Optional[str]:
    """Safely join ``path`` onto ``base_dir``, never escaping ``base_dir``.

    Returns the absolute joined path when ``path`` is a safe relative path,
    otherwise ``None`` so callers can reject the offending entry. Callers MUST
    use the returned path (not a fresh ``os.path.join``) for the actual write."""
    if not is_safe_relpath(path):
        return None
    joined = os.path.abspath(os.path.join(base_dir, path))
    base_abs = os.path.abspath(base_dir)
    if joined != base_abs and not joined.startswith(base_abs + os.path.sep):
        return None
    return joined


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
        # Redis unavailable — fall back to the in-memory limiter with a
        # conservative 50 % limit so a multi-replica outage doesn't silently
        # multiply the effective ceiling (SEC-004).
        fallback_limit = max(1, limit // 2)
        return await _check_in_memory_rate_limit(
            key, limit, window, fallback_limit=fallback_limit
        )


async def check_login_lockout(email: str) -> tuple[bool, int]:
    """Check whether an account is locked out due to too many failed logins.

    Returns (is_locked_out, remaining_seconds). ``is_locked_out`` is True
    when the account has exceeded ``LOGIN_LOCKOUT_THRESHOLD`` consecutive
    failures and the lockout has not yet expired.
    """
    key = f"login_lockout:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    try:
        redis = await get_redis()
        ttl = await redis.ttl(key)
        if ttl > 0:
            return True, ttl
        return False, 0
    except Exception:
        return False, 0


async def record_failed_login(email: str) -> None:
    """Record a failed login attempt. When the threshold is reached, set a
    lockout for ``LOGIN_LOCKOUT_WINDOW`` seconds."""
    key = f"login_attempts:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    lockout_key = f"login_lockout:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    try:
        redis = await get_redis()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, LOGIN_LOCKOUT_WINDOW)
        if current >= LOGIN_LOCKOUT_THRESHOLD:
            await redis.setex(lockout_key, LOGIN_LOCKOUT_WINDOW, "1")
            await redis.delete(key)
    except Exception:
        logging.warning("Failed to record failed login attempt", exc_info=True)


async def clear_login_attempts(email: str) -> None:
    """Clear the failed-login counter and lockout for *email* on success."""
    key = f"login_attempts:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    lockout_key = f"login_lockout:{hashlib.sha256(email.encode()).hexdigest()[:16]}"
    try:
        redis = await get_redis()
        await redis.delete(key, lockout_key)
    except Exception:
        logging.warning("Failed to clear login attempts", exc_info=True)
