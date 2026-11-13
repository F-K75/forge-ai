from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Cookie, Response, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Union
from datetime import datetime, timedelta
import os
import uuid
import hashlib
import asyncio
import logging
import secrets

import pyotp
import resend

from services.email_templates import render_welcome
from core.models import User, PlanTier, Organization, TeamMember, Invitation, Role, AuditLog, Session, PaginationParams, utcnow
from core.database import get_db, paginated_query
from core.cache import cached_read, invalidate_cache, user_profile_cache_key, USER_PROFILE_CACHE_TTL
from core.config import get_settings
from core.security import validate_password_strength, check_email_rate_limit, get_client_ip, validate_byok_base_url, check_login_lockout, record_failed_login, clear_login_attempts
from core.encryption import encrypt_field, decrypt_field
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from authlib.integrations.requests_client import OAuth2Session

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    name: str = Field(max_length=100)
    password: str = Field(max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class MfaRequiredResponse(BaseModel):
    mfa_required: bool = True
    mfa_token: str


class MfaVerifySetupRequest(BaseModel):
    code: str = Field(max_length=10)


class MfaDisableRequest(BaseModel):
    password: str = Field(max_length=128)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str = Field(max_length=10)


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaVerifySetupResponse(BaseModel):
    ok: bool = True
    backup_codes: List[str]


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    github_token: Optional[str] = Field(None, max_length=200)
    llm_provider: Optional[str] = Field(None, max_length=32)
    llm_api_key: Optional[str] = Field(None, max_length=200)
    llm_base_url: Optional[str] = Field(None, max_length=300)
    llm_model: Optional[str] = Field(None, max_length=100)
    preferences: Optional[dict] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(max_length=255)


class ResendVerificationRequest(BaseModel):
    email: EmailStr = Field(max_length=255)


def _send_verification_email(email: str, verification_token: str) -> None:
    if not settings.resend_api_key:
        return
    try:
        resend.api_key = settings.resend_api_key
        verify_link = f"{settings.app_url}/verify-email?token={verification_token}"
        resend.Emails.send({
            "from": settings.from_email,
            "to": email,
            "subject": "Verify your Forge account",
            "html": f"<p>Click <a href=\"{verify_link}\">here</a> to verify your email. This link expires in 24 hours.</p>",
        })
    except Exception:
        logging.exception("Failed to send verification email")


async def _send_welcome_email_once(user_id: str) -> None:
    """Send the onboarding welcome email, at most once per user.

    Runs as a background task after the response is sent, so a slow or failing
    email provider never affects verification or login. The ``welcome_email_sent``
    flag is claimed atomically before sending, so concurrent verifications (or a
    verify followed by a Google login) can't send it twice.
    """
    if not settings.resend_api_key:
        return
    try:
        db = await get_db()
        user_doc = await db.users.find_one_and_update(
            {"id": user_id, "welcome_email_sent": {"$ne": True}},
            {"$set": {"welcome_email_sent": True, "welcome_email_sent_at": utcnow()}},
            return_document=True,
        )
        if not user_doc:
            return  # already sent, or the user no longer exists
        content = render_welcome(name=user_doc.get("name"), credits=user_doc.get("credits"))
        resend.api_key = settings.resend_api_key
        await asyncio.to_thread(
            resend.Emails.send,
            {"from": settings.from_email, "to": [user_doc["email"]], **content.as_resend_params()},
        )
    except Exception:
        logging.exception("Failed to send welcome email to user %s", user_id)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=255)
    new_password: str = Field(max_length=128)


def _get_cookie_kwargs(max_age: int) -> dict:
    is_dev = settings.app_env != "production"
    return {
        "httponly": True,
        "secure": not is_dev,
        "samesite": "none" if not is_dev else "lax",
        "max_age": max_age,
    }


def _public_user_dict(user_doc: dict) -> dict:
    """Strip fields that must never leave the server (password hash, raw
    tokens, verification secrets) before a user document is sent to a client.

    Also strips `_id`: Motor's `insert_one()` mutates its input dict in place,
    injecting a `bson.ObjectId` — if that same dict is reused to build a
    response (as `register` does), Pydantic's serializer crashes on the
    non-JSON-serializable ObjectId. Stripping it here makes this helper safe
    regardless of whether the caller's dict has been through an insert.
    """
    public = {
        k: v
        for k, v in user_doc.items()
        if k
        not in {
            "_id",
            "hashed_password",
            "github_token",
            "llm_api_key",
            "verification_token",
            "verification_expires",
            "totp_secret",
            "mfa_backup_codes",
        }
    }
    public["github_connected"] = bool(user_doc.get("github_token"))
    public["byok_connected"] = bool(user_doc.get("llm_api_key"))
    return public


def _hash_token(token: str) -> str:
    """Hash a token using PBKDF2-SHA256 (slow hash) to resist brute-force
    if the database is compromised. Uses 600,000 iterations (OWASP 2023
    recommendation for SHA256)."""
    salt = hashlib.sha256(token.encode()).digest()[:16]  # Derive salt from token
    return hashlib.pbkdf2_hmac(
        "sha256",
        token.encode(),
        salt,
        600000,  # OWASP recommended iterations for SHA256
    ).hex()


async def _record_session(
    db,
    user_id: str,
    access_token: str,
    refresh_token: str,
    request: Optional[Request],
    old_refresh_jti: Optional[str] = None,
) -> None:
    """Record (or update, on refresh) a session document tracking which
    device/browser a pair of tokens belongs to. Best-effort: failures here
    must never block login/register/refresh."""
    try:
        access_payload = decode_token(access_token) or {}
        refresh_payload = decode_token(refresh_token) or {}
        jti = access_payload.get("jti")
        refresh_jti = refresh_payload.get("jti")
        if not jti:
            return

        user_agent = request.headers.get("user-agent") if request else None
        ip_address = await get_client_ip(request) if request else None
        now = utcnow()

        if old_refresh_jti:
            result = await db.sessions.update_one(
                {"user_id": user_id, "refresh_jti": old_refresh_jti, "revoked_at": None},
                {
                    "$set": {
                        "jti": jti,
                        "refresh_jti": refresh_jti,
                        "last_active_at": now,
                        "user_agent": user_agent,
                        "ip_address": ip_address,
                    }
                },
            )
            if result.matched_count:
                return

        session = Session(
            user_id=user_id,
            jti=jti,
            refresh_jti=refresh_jti,
            user_agent=user_agent,
            ip_address=ip_address,
            created_at=now,
            last_active_at=now,
        )
        await db.sessions.insert_one(session.model_dump())
    except Exception:
        logging.exception("Failed to record session")


async def _blacklist_jti(db, jti: Optional[str]) -> None:
    if not jti:
        return
    await db.token_blacklist.update_one(
        {"jti": jti},
        {"$set": {"jti": jti, "created_at": utcnow()}},
        upsert=True,
    )


async def get_current_user(
    request: Request,
    response: Response,
    access_token: Optional[str] = Cookie(None),
    refresh_token: Optional[str] = Cookie(None),
) -> User:
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        # Try refresh token
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        refresh_payload = decode_token(refresh_token)
        if not refresh_payload or refresh_payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        user_id = refresh_payload.get("sub")
        db = await get_db()
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")

        # Check if token is blacklisted by JTI
        token_jti = payload.get("jti")
        if token_jti:
            blacklisted = await db.token_blacklist.find_one({"jti": token_jti})
            if blacklisted:
                raise HTTPException(status_code=401, detail="Token revoked")

        # Decrypt sensitive fields
        user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
        if "github_token" in user_data and user_data["github_token"]:
            user_data["github_token"] = decrypt_field(user_data["github_token"])
        user = User(**user_data)
        new_access = create_access_token({"sub": user.id, "email": user.email})
        new_refresh = create_refresh_token({"sub": user.id, "email": user.email})

        response.set_cookie(
            "access_token",
            new_access,
            **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
        )
        response.set_cookie(
            "refresh_token",
            new_refresh,
            **_get_cookie_kwargs(30 * 24 * 60 * 60),
        )
        old_refresh_jti = refresh_payload.get("jti")
        await _record_session(db, user.id, new_access, new_refresh, request, old_refresh_jti)
        new_access_payload = decode_token(new_access) or {}
        request.state.jti = new_access_payload.get("jti")
        return user

    user_id = payload.get("sub")
    db = await get_db()
    
    # Check if access token is blacklisted by JTI
    token_jti = payload.get("jti")
    if token_jti:
        blacklisted = await db.token_blacklist.find_one({"jti": token_jti})
        if blacklisted:
            raise HTTPException(status_code=401, detail="Token revoked")

    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    # Decrypt sensitive fields
    user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
    if "github_token" in user_data and user_data["github_token"]:
        user_data["github_token"] = decrypt_field(user_data["github_token"])

    request.state.jti = token_jti
    return User(**user_data)


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, request: Request, response: Response):
    db = await get_db()

    valid, msg = validate_password_strength(req.password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    allowed, remaining = await check_email_rate_limit(req.email, "register", db)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many registration attempts. Please try again later.",
        )

    user = User(
        email=req.email,
        name=req.name,
        plan=PlanTier.FREE,
        credits=10,
    )
    user_dict = user.model_dump()
    user_dict["hashed_password"] = hash_password(req.password)
    
    # Encrypt sensitive fields if present
    if "github_token" in user_dict and user_dict["github_token"]:
        user_dict["github_token"] = encrypt_field(user_dict["github_token"])
    
    # Use insert_one with a try/except to catch duplicate key errors
    # from the unique index on email, preventing race conditions where
    # two concurrent registrations with the same email both pass the
    # find_one check above.
    try:
        await db.users.insert_one(user_dict)
    except Exception as e:
        if hasattr(e, 'code') and e.code == 11000:
            raise HTTPException(status_code=400, detail="Email already registered")
        if 'duplicate key' in str(e).lower() or 'E11000' in str(e):
            raise HTTPException(status_code=400, detail="Email already registered")
        raise

    admin_emails = [e.strip() for e in (settings.admin_emails or "").split(",") if e.strip()]
    if admin_emails and req.email in admin_emails:
        await db.users.update_one({"id": user.id}, {"$set": {"is_admin": True}})

    if os.getenv("SMOKE_TEST_MODE") == "true":
        await db.users.update_one({"id": user.id}, {"$set": {"email_verified": True}})
        user_dict["email_verified"] = True

    verification_token = uuid.uuid4().hex
    hashed_token = _hash_token(verification_token)
    expires = utcnow() + timedelta(hours=24)
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"verification_token": hashed_token, "verification_expires": expires}},
    )

    _send_verification_email(req.email, verification_token)

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token = create_refresh_token({"sub": user.id, "email": user.email})

    response.set_cookie(
        "access_token",
        access_token,
        **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        **_get_cookie_kwargs(30 * 24 * 60 * 60),
    )

    await _record_session(db, user.id, access_token, refresh_token, request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_public_user_dict(user_dict),
    )


@router.post("/login", response_model=Union[TokenResponse, MfaRequiredResponse])
async def login(req: LoginRequest, request: Request, response: Response):
    db = await get_db()

    allowed, remaining = await check_email_rate_limit(req.email, "login", db)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts for this account. Please try again later.",
        )

    is_locked, lockout_ttl = await check_login_lockout(req.email)
    if is_locked:
        raise HTTPException(
            status_code=429,
            detail=f"Account locked due to too many failed attempts. Try again in {lockout_ttl} seconds.",
        )

    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        await record_failed_login(req.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Decrypt sensitive fields before validation
    user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
    if "github_token" in user_data and user_data["github_token"]:
        user_data["github_token"] = decrypt_field(user_data["github_token"])
    
    user = User(**user_data)
    hashed = user_doc.get("hashed_password", "")
    if not verify_password(req.password, hashed):
        await record_failed_login(req.email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await clear_login_attempts(req.email)

    if user_doc.get("mfa_enabled"):
        # Do not issue real tokens or record a session yet -- the client
        # must complete the TOTP/backup-code challenge at /auth/mfa/verify
        # first (SEC-007).
        mfa_token = create_access_token(
            {"sub": user.id, "email": user.email},
            expires_delta=timedelta(minutes=5),
            token_type="mfa_pending",
        )
        return MfaRequiredResponse(mfa_token=mfa_token)

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token = create_refresh_token({"sub": user.id, "email": user.email})

    response.set_cookie(
        "access_token",
        access_token,
        **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        **_get_cookie_kwargs(30 * 24 * 60 * 60),
    )

    await _record_session(db, user.id, access_token, refresh_token, request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_public_user_dict(user_doc),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, request: Request, response: Response):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    db = await get_db()
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    # Decrypt sensitive fields
    user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
    if "github_token" in user_data and user_data["github_token"]:
        user_data["github_token"] = decrypt_field(user_data["github_token"])
    
    user = User(**user_data)
    access_token = create_access_token({"sub": user.id, "email": user.email})
    new_refresh = create_refresh_token({"sub": user.id, "email": user.email})

    response.set_cookie(
        "access_token",
        access_token,
        **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
    )
    response.set_cookie(
        "refresh_token",
        new_refresh,
        **_get_cookie_kwargs(30 * 24 * 60 * 60),
    )

    old_refresh_jti = payload.get("jti")
    await _record_session(db, user.id, access_token, new_refresh, request, old_refresh_jti)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user=_public_user_dict(user_doc),
    )


@router.post("/logout")
async def logout(
    response: Response,
    access_token: Optional[str] = Cookie(None),
    refresh_token: Optional[str] = Cookie(None),
    user: User = Depends(get_current_user),
):
    db = await get_db()

    # Blacklist the access token by JTI for immediate revocation
    jti = None
    if access_token:
        payload = decode_token(access_token)
        if payload and payload.get("jti"):
            jti = payload["jti"]
            await _blacklist_jti(db, jti)

    refresh_jti = None
    if refresh_token:
        refresh_payload = decode_token(refresh_token)
        if refresh_payload and refresh_payload.get("jti"):
            refresh_jti = refresh_payload["jti"]
            await _blacklist_jti(db, refresh_jti)

    # Mark the matching session as revoked so it drops off the sessions list.
    if jti:
        await db.sessions.update_one(
            {"user_id": user.id, "jti": jti, "revoked_at": None},
            {"$set": {"revoked_at": utcnow()}},
        )

    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


def _generate_backup_codes(count: int = 10) -> List[str]:
    """Generate plaintext backup codes. Callers must hash these before
    storage and only return the plaintext once, in the setup-verification
    response."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


@router.post("/mfa/setup", response_model=MfaSetupResponse)
async def mfa_setup(user: User = Depends(get_current_user)):
    """Begin MFA enrollment: generate a TOTP secret and store it encrypted
    as *pending* -- mfa_enabled stays False until /mfa/verify-setup succeeds."""
    db = await get_db()

    secret = pyotp.random_base32()
    await db.users.update_one(
        {"id": user.id}, {"$set": {"totp_secret": encrypt_field(secret)}}
    )

    otpauth_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name="Forge"
    )
    return MfaSetupResponse(secret=secret, otpauth_uri=otpauth_uri)


@router.post("/mfa/verify-setup", response_model=MfaVerifySetupResponse)
async def mfa_verify_setup(
    req: MfaVerifySetupRequest, user: User = Depends(get_current_user)
):
    """Confirm the user controls the authenticator app, then enable MFA and
    issue one-time backup codes (shown once, hashed thereafter)."""
    db = await get_db()

    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    encrypted_secret = user_doc.get("totp_secret") if user_doc else None
    if not encrypted_secret:
        raise HTTPException(status_code=400, detail="MFA setup not started")

    secret = decrypt_field(encrypted_secret)
    if not pyotp.TOTP(secret).verify(req.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")

    backup_codes = _generate_backup_codes()
    hashed_codes = [hash_password(code) for code in backup_codes]

    await db.users.update_one(
        {"id": user.id},
        {
            "$set": {
                "mfa_enabled": True,
                "mfa_enrolled_at": utcnow(),
                "mfa_backup_codes": hashed_codes,
            }
        },
    )

    return MfaVerifySetupResponse(backup_codes=backup_codes)


@router.post("/mfa/disable")
async def mfa_disable(req: MfaDisableRequest, user: User = Depends(get_current_user)):
    db = await get_db()

    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    hashed = user_doc.get("hashed_password", "") if user_doc else ""
    if not verify_password(req.password, hashed):
        raise HTTPException(status_code=400, detail="Incorrect password")

    await db.users.update_one(
        {"id": user.id},
        {
            "$set": {
                "mfa_enabled": False,
                "totp_secret": None,
                "mfa_backup_codes": [],
                "mfa_enrolled_at": None,
            }
        },
    )
    return {"ok": True}


@router.post("/mfa/verify", response_model=TokenResponse)
async def mfa_verify(req: MfaVerifyRequest, request: Request, response: Response):
    """Complete login after /auth/login returned mfa_required=True. Accepts
    either a live TOTP code or a single-use backup code."""
    payload = decode_token(req.mfa_token)
    if not payload or payload.get("type") != "mfa_pending":
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token")

    db = await get_db()

    jti = payload.get("jti")
    if jti:
        blacklisted = await db.token_blacklist.find_one({"jti": jti})
        if blacklisted:
            raise HTTPException(status_code=401, detail="Invalid or expired MFA token")

    user_id = payload.get("sub")
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    allowed, remaining = await check_email_rate_limit(user_doc["email"], "mfa_verify", db)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many MFA verification attempts. Please try again later.",
        )

    if not user_doc.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account")

    verified = False

    encrypted_secret = user_doc.get("totp_secret")
    if encrypted_secret:
        secret = decrypt_field(encrypted_secret)
        if pyotp.TOTP(secret).verify(req.code, valid_window=1):
            verified = True

    if not verified:
        # Fall back to single-use backup codes -- consume (remove) the
        # matching hash immediately so it can never be reused.
        backup_hashes = user_doc.get("mfa_backup_codes", [])
        for backup_hash in backup_hashes:
            if verify_password(req.code.strip().upper(), backup_hash):
                verified = True
                await db.users.update_one(
                    {"id": user_id},
                    {"$pull": {"mfa_backup_codes": backup_hash}},
                )
                break

    if not verified:
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    # Blacklist the mfa_pending token so it cannot be replayed.
    await _blacklist_jti(db, jti)

    user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
    if "github_token" in user_data and user_data["github_token"]:
        user_data["github_token"] = decrypt_field(user_data["github_token"])
    user = User(**user_data)

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token = create_refresh_token({"sub": user.id, "email": user.email})

    response.set_cookie(
        "access_token",
        access_token,
        **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        **_get_cookie_kwargs(30 * 24 * 60 * 60),
    )

    await _record_session(db, user.id, access_token, refresh_token, request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_public_user_dict(user_doc),
    )


class SessionResponse(BaseModel):
    id: str
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    last_active_at: datetime
    is_current: bool


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(request: Request, user: User = Depends(get_current_user)):
    """List this user's active (non-revoked) sessions/devices (BE-010)."""
    db = await get_db()
    current_jti = getattr(request.state, "jti", None)

    docs = await db.sessions.find(
        {"user_id": user.id, "revoked_at": None}, {"_id": 0}
    ).sort("last_active_at", -1).to_list(None)

    return [
        SessionResponse(
            id=doc["id"],
            user_agent=doc.get("user_agent"),
            ip_address=doc.get("ip_address"),
            created_at=doc["created_at"],
            last_active_at=doc["last_active_at"],
            is_current=doc.get("jti") == current_jti,
        )
        for doc in docs
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str, request: Request, user: User = Depends(get_current_user)
):
    """Revoke a single session (log out that device) and blacklist its
    tokens so they can't be used again before they naturally expire."""
    db = await get_db()

    session_doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session_doc or session_doc.get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_doc.get("revoked_at"):
        return {"ok": True}

    await db.sessions.update_one(
        {"id": session_id}, {"$set": {"revoked_at": utcnow()}}
    )
    await _blacklist_jti(db, session_doc.get("jti"))
    await _blacklist_jti(db, session_doc.get("refresh_jti"))

    return {"ok": True}


@router.delete("/sessions")
async def revoke_all_sessions(request: Request, user: User = Depends(get_current_user)):
    """Log out of all other devices, keeping the current session active."""
    db = await get_db()
    current_jti = getattr(request.state, "jti", None)

    docs = await db.sessions.find(
        {"user_id": user.id, "revoked_at": None}, {"_id": 0}
    ).to_list(None)

    now = utcnow()
    for doc in docs:
        if doc.get("jti") == current_jti:
            continue
        await db.sessions.update_one(
            {"id": doc["id"]}, {"$set": {"revoked_at": now}}
        )
        await _blacklist_jti(db, doc.get("jti"))
        await _blacklist_jti(db, doc.get("refresh_jti"))

    return {"ok": True}


@router.get("/csrf-token")
async def get_csrf_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Generate a CSRF token for the current session.
    
    The token is stored in Redis with a 60-minute TTL and tied to the
    session's JWT 'jti' claim. The frontend must include this token in
    the X-CSRF-Token header on all state-changing requests.
    """
    from core.security import generate_csrf_token, store_csrf_token
    
    # Decode the access token to get the jti (session identifier)
    from auth import decode_token
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    payload = decode_token(access_token)
    if not payload or not payload.get("jti"):
        raise HTTPException(status_code=401, detail="Invalid session")
    
    session_token = payload["jti"]
    csrf_token = generate_csrf_token()
    await store_csrf_token(session_token, csrf_token)
    
    return {"csrf_token": csrf_token}


@router.post("/ws-token")
async def create_ws_token(user: User = Depends(get_current_user)):
    """Generate a short-lived WebSocket token (5 min expiry)."""
    ws_token = create_access_token(
        {"sub": user.id, "email": user.email},
        expires_delta=timedelta(minutes=5),
        token_type="ws",
    )
    return {"token": ws_token}


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    db = await get_db()

    async def _load_profile():
        user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
        return _public_user_dict(user_doc) if user_doc is not None else None

    # Short-TTL profile cache (BE-007): profiles mutate on credit/plan/preference
    # changes, so we only shield repeated reads for a minute. Writes invalidate
    # the key (see update_profile). Fail-open on cache errors.
    return await cached_read(
        user_profile_cache_key(user.id), USER_PROFILE_CACHE_TTL, _load_profile
    )


@router.put("/me")
async def update_profile(
    req: UpdateProfileRequest, user: User = Depends(get_current_user)
):
    db = await get_db()
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update:
        return {"ok": True}

    # Encrypt sensitive fields if being updated (empty string clears the
    # connection and is stored as-is — nothing sensitive to encrypt).
    if update.get("github_token"):
        update["github_token"] = encrypt_field(update["github_token"])

    # Bring-your-own-key is a Pro+ perk (see pricing table) -- gated here,
    # not just hidden in the UI, so a Free-plan user can't skip credit costs
    # by calling this endpoint directly. Clearing a key (empty string) is
    # always allowed so a downgrade doesn't strand it un-removable.
    if update.get("llm_api_key"):
        if user.plan not in (PlanTier.PRO, PlanTier.ENTERPRISE):
            raise HTTPException(
                status_code=403,
                detail="Bring your own key is available on the Pro plan and above.",
            )
        provider = update.get("llm_provider") or "anthropic"
        if provider not in ("anthropic", "openai_compatible"):
            raise HTTPException(status_code=400, detail="Unsupported llm_provider")
        if provider == "openai_compatible" and not update.get("llm_base_url"):
            raise HTTPException(
                status_code=400,
                detail="llm_base_url is required for an openai_compatible provider",
            )
        if provider == "openai_compatible":
            valid, error = await validate_byok_base_url(update["llm_base_url"])
            if not valid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid llm_base_url: {error}",
                )
        update["llm_api_key"] = encrypt_field(update["llm_api_key"])

    # Shallow-merge preferences so one toggle's update doesn't clobber others.
    preferences = update.pop("preferences", None)
    if preferences:
        update.update({f"preferences.{k}": v for k, v in preferences.items()})

    await db.users.update_one({"id": user.id}, {"$set": update})
    # Drop the cached profile so a subsequent GET /auth/me reflects the change
    # immediately instead of serving a stale (up to 60s) cached copy (BE-007).
    await invalidate_cache(user_profile_cache_key(user.id))
    return {"ok": True}


@router.post("/me/password")
async def change_password(
    req: ChangePasswordRequest, user: User = Depends(get_current_user)
):
    db = await get_db()
    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    hashed = user_doc.get("hashed_password", "")
    if not verify_password(req.current_password, hashed):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    valid, msg = validate_password_strength(req.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    new_hashed = hash_password(req.new_password)
    await db.users.update_one(
        {"id": user.id}, {"$set": {"hashed_password": new_hashed}}
    )
    
    # Log password change for audit
    audit_log = AuditLog(
        actor_id=user.id,
        actor_email=user.email,
        action="change_password",
        resource_type="user",
        resource_id=user.id,
        changes={"timestamp": utcnow().isoformat()},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

    # Invalidate the cached profile (BE-007) so GET /auth/me reflects the
    # password change on the next read rather than a stale cached copy.
    await invalidate_cache(user_profile_cache_key(user.id))
    return {"ok": True}


@router.post("/onboarding/complete")
async def complete_onboarding(user: User = Depends(get_current_user)):
    db = await get_db()
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"completed_onboarding": True}},
    )
    await invalidate_cache(user_profile_cache_key(user.id))
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    db = await get_db()

    allowed, remaining = await check_email_rate_limit(req.email, "forgot_password", db)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many password reset attempts. Please try again later.",
        )

    user_doc = await db.users.find_one(
        {"email": req.email},
        {"_id": 0},
    )
    if user_doc:
        reset_token = uuid.uuid4().hex
        hashed = _hash_token(reset_token)
        expires = utcnow() + timedelta(hours=1)
        await db.users.update_one(
            {"email": req.email},
            {
                "$set": {
                    "password_reset_token": hashed,
                    "password_reset_expires": expires,
                }
            },
        )

        if settings.resend_api_key:
            try:
                import resend
                resend.api_key = settings.resend_api_key
                reset_link = f"{settings.app_url}/reset-password?token={reset_token}"
                resend.Emails.send({
                    "from": settings.from_email,
                    "to": req.email,
                    "subject": "Reset your Forge password",
                    "html": f"<p>Click <a href=\"{reset_link}\">here</a> to reset your password. This link expires in 1 hour.</p>",
                })
            except Exception:
                logging.exception("Failed to send password reset email")

    return {"ok": True}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    db = await get_db()
    hashed = _hash_token(req.token)
    user_doc = await db.users.find_one(
        {"password_reset_token": hashed},
        {"_id": 0},
    )
    if not user_doc:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired reset token",
        )
    expires = user_doc.get("password_reset_expires")
    if not expires or utcnow() > expires:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired reset token",
        )

    valid, msg = validate_password_strength(req.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    new_hashed = hash_password(req.new_password)
    await db.users.update_one(
        {"password_reset_token": hashed},
        {
            "$set": {
                "hashed_password": new_hashed,
                "password_reset_token": None,
                "password_reset_expires": None,
            }
        },
    )
    return {"ok": True}


@router.get("/verify-email")
async def verify_email(token: str, background_tasks: BackgroundTasks):
    db = await get_db()
    hashed = _hash_token(token)
    user_doc = await db.users.find_one(
        {"verification_token": hashed},
        {"_id": 0},
    )
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    expires = user_doc.get("verification_expires")
    if not expires or utcnow() > expires:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    await db.users.update_one(
        {"verification_token": hashed},
        {"$set": {"email_verified": True, "verification_token": None, "verification_expires": None}},
    )
    background_tasks.add_task(_send_welcome_email_once, user_doc["id"])
    return {"ok": True}


@router.get("/google")
async def google_login(request: Request):
    """Initiate Google OAuth flow."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")

    client = OAuth2Session(
        settings.google_client_id,
        settings.google_client_secret,
        scope="openid email profile",
        redirect_uri=settings.google_redirect_uri,
    )
    auth_url, _ = client.create_authorization_url("https://accounts.google.com/o/oauth2/v2/auth")
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(request: Request, response: Response, background_tasks: BackgroundTasks):
    """Handle Google OAuth callback and redirect to frontend with tokens."""
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    client = OAuth2Session(
        settings.google_client_id,
        settings.google_client_secret,
        redirect_uri=settings.google_redirect_uri,
    )
    # authlib's requests_client is synchronous: run it in a thread rather than
    # awaiting it directly (awaiting its plain return value raised TypeError,
    # which turned every Google login into a 400).
    try:
        token = await asyncio.to_thread(
            client.fetch_token,
            "https://oauth2.googleapis.com/token",
            code=code,
            grant_type="authorization_code",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch token: {str(e)}")

    # Get user info from Google
    user_info_client = OAuth2Session(settings.google_client_id, token=token)
    user_info = await asyncio.to_thread(
        user_info_client.get, "https://www.googleapis.com/oauth2/v2/userinfo"
    )
    if user_info.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info")
    
    google_user = user_info.json()
    email = google_user.get("email")
    name = google_user.get("name")
    picture = google_user.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="No email provided by Google")

    db = await get_db()
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})

    if user_doc:
        user = User(
            id=user_doc["id"],
            email=user_doc["email"],
            name=user_doc["name"],
            plan=user_doc.get("plan", PlanTier.FREE),
            credits=user_doc.get("credits", 10),
            avatar_url=user_doc.get("avatar_url"),
        )
    else:
        user = User(
            email=email,
            name=name,
            plan=PlanTier.FREE,
            credits=10,
            avatar_url=picture,
        )
        user_dict = user.model_dump()
        user_dict["email_verified"] = True
        try:
            await db.users.insert_one(user_dict)
        except Exception as e:
            if hasattr(e, 'code') and e.code == 11000:
                raise HTTPException(status_code=400, detail="Email already registered")
            raise
        # Google accounts arrive verified and never hit /verify-email.
        background_tasks.add_task(_send_welcome_email_once, user.id)

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token = create_refresh_token({"sub": user.id, "email": user.email})

    await _record_session(db, user.id, access_token, refresh_token, request)

    # Prefer explicit Google frontend app URL if provided; otherwise fall back
    # to settings.app_url. This avoids mismatches when frontend dev server
    # runs on a different port than API/app URL config.
    frontend_base = getattr(settings, "google_frontend_app_url", None) or settings.app_url
    redirect_response = RedirectResponse(url=frontend_base)
    redirect_response.set_cookie(
        "access_token",
        access_token,
        **_get_cookie_kwargs(settings.jwt_expire_minutes * 60),
    )
    redirect_response.set_cookie(
        "refresh_token",
        refresh_token,
        **_get_cookie_kwargs(30 * 24 * 60 * 60),
    )
    return redirect_response


@router.post("/resend-verification")
async def resend_verification(req: ResendVerificationRequest):
    """Send a new verification email. Needed because the original one may
    never have arrived (RESEND_API_KEY unconfigured, spam filter, expired
    24h token) with no other way to get a fresh link -- builds are blocked
    for unverified users with no recovery path otherwise (part of PROD-005).
    """
    db = await get_db()

    # Removed unused variable
    allowed, _ = await check_email_rate_limit(req.email, "resend_verification", db)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many verification requests. Please try again later.",
        )

    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    verification_token = None
    if user_doc and not user_doc.get("email_verified"):
        verification_token = uuid.uuid4().hex
        hashed = _hash_token(verification_token)
        expires = utcnow() + timedelta(hours=24)
        await db.users.update_one(
            {"email": req.email},
            {"$set": {"verification_token": hashed, "verification_expires": expires}},
        )
        _send_verification_email(req.email, verification_token)
    elif os.getenv("SMOKE_TEST_MODE") == "true" and user_doc:
        verification_token = uuid.uuid4().hex
        hashed = _hash_token(verification_token)
        expires = utcnow() + timedelta(hours=24)
        await db.users.update_one(
            {"email": req.email},
            {"$set": {"verification_token": hashed, "verification_expires": expires}},
        )

    # Same response whether the account exists, is already verified, or
    # doesn't exist at all -- avoids leaking which via response differences.
    response_payload: dict = {"ok": True}
    if os.getenv("SMOKE_TEST_MODE") == "true" and user_doc and verification_token:
        response_payload["verification_token"] = verification_token
    return response_payload


# --- Organization Endpoints ---


class CreateOrganizationRequest(BaseModel):
    name: str
    slug: Optional[str] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    seats: int
    role: str
    created_at: datetime


class PaginatedOrganizations(BaseModel):
    organizations: List[OrganizationResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class OrganizationMemberResponse(BaseModel):
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    role: str
    joined_at: Optional[datetime] = None


class PaginatedOrganizationMembers(BaseModel):
    members: List[OrganizationMemberResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: Role = Role.MEMBER


class UpdateMemberRoleRequest(BaseModel):
    role: Role


@router.post("/organizations", response_model=OrganizationResponse)
async def create_organization(
    req: CreateOrganizationRequest, user: User = Depends(get_current_user)
):
    db = await get_db()

    slug = req.slug or req.name.lower().replace(" ", "-")
    existing = await db.organizations.find_one({"slug": slug}, {"_id": 0})
    if existing:
        base_slug = slug
        slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    org = Organization(name=req.name, slug=slug, owner_id=user.id)
    org_dict = org.model_dump()
    await db.organizations.insert_one(org_dict)

    team_member = TeamMember(
        org_id=org.id, user_id=user.id, role=Role.OWNER, joined_at=utcnow()
    )
    await db.team_members.insert_one(team_member.model_dump())

    await db.projects.update_many(
        {"user_id": user.id, "org_id": None}, {"$set": {"org_id": org.id}}
    )

    return OrganizationResponse(
        id=org.id,
        name=org.name,
        slug=org.slug,
        plan=org.plan,
        seats=org.seats,
        role=Role.OWNER,
        created_at=org.created_at,
    )


@router.get("/organizations", response_model=PaginatedOrganizations)
async def list_organizations(
    user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()

    memberships = await db.team_members.find({"user_id": user.id}, {"_id": 0}).to_list(
        None
    )
    org_ids = [m["org_id"] for m in memberships]
    # An empty ``$in`` would match nothing; paginated_query reports
    # ``total == 0`` and ``total_pages == 1`` consistently.
    org_query = {"id": {"$in": org_ids}} if org_ids else {"id": {"$in": []}}

    result = await paginated_query(
        db.organizations,
        org_query,
        page=params.page,
        per_page=params.per_page,
    )
    membership_by_org = {m["org_id"]: m for m in memberships}

    orgs = [
        OrganizationResponse(
            id=org["id"],
            name=org["name"],
            slug=org["slug"],
            plan=org.get("plan", "free"),
            seats=org.get("seats", 1),
            role=membership_by_org.get(org["id"], {}).get("role", "member"),
            created_at=org.get("created_at"),
        )
        for org in result.items
    ]

    return PaginatedOrganizations(
        organizations=orgs,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.get("/organizations/{org_id}", response_model=OrganizationResponse)
async def get_organization(org_id: str, user: User = Depends(get_current_user)):
    db = await get_db()

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Organization not found")

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return OrganizationResponse(
        id=org["id"],
        name=org["name"],
        slug=org["slug"],
        plan=org.get("plan", "free"),
        seats=org.get("seats", 1),
        role=membership.get("role", "member"),
        created_at=org.get("created_at"),
    )


@router.post("/organizations/{org_id}/invite")
async def invite_member(
    org_id: str, req: InviteMemberRequest, user: User = Depends(get_current_user)
):
    db = await get_db()

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not membership or membership["role"] not in (Role.OWNER, Role.ADMIN):
        raise HTTPException(status_code=403, detail="Permission denied")

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    member_count = await db.team_members.count_documents({"org_id": org_id})
    if member_count >= org.get("seats", 1):
        raise HTTPException(status_code=400, detail="Organization seat limit reached")

    # Generate a raw token, hash it for storage, and return the raw token
    # to the inviter so they can share it with the invitee.
    raw_token = uuid.uuid4().hex
    hashed = _hash_token(raw_token)
    
    invite = Invitation(
        org_id=org_id,
        email=req.email,
        role=req.role,
        invited_by=user.id,
        hashed_token=hashed,
    )
    invite_dict = invite.model_dump()
    # Remove the empty hashed_token from model_dump if it was set to None
    # (it's set above, but model_dump includes all fields)
    await db.invitations.insert_one(invite_dict)

    return {"ok": True, "invitation_id": invite.id, "token": raw_token}


@router.post("/organizations/invitations/{token}/accept")
async def accept_invitation(token: str, user: User = Depends(get_current_user)):
    db = await get_db()
    hashed = _hash_token(token)
    invite = await db.invitations.find_one(
        {
            "hashed_token": hashed,
            "accepted_at": None,
            "expires_at": {"$gt": utcnow()},
        },
        {"_id": 0},
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    existing = await db.team_members.find_one(
        {"org_id": invite["org_id"], "user_id": user.id}, {"_id": 0}
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Already a member of this organization"
        )

    team_member = TeamMember(
        org_id=invite["org_id"],
        user_id=user.id,
        role=invite["role"],
        joined_at=utcnow(),
    )
    await db.team_members.insert_one(team_member.model_dump())

    await db.invitations.update_one(
        {"hashed_token": hashed}, {"$set": {"accepted_at": utcnow()}}
    )

    return {"ok": True}


@router.get("/organizations/{org_id}/members", response_model=PaginatedOrganizationMembers)
async def list_members(
    org_id: str,
    user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Organization not found")

    result = await paginated_query(
        db.team_members,
        {"org_id": org_id},
        page=params.page,
        per_page=params.per_page,
    )
    members = result.items
    user_ids = [m["user_id"] for m in members]

    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "hashed_password": 0}
    ).to_list(None)
    user_map = {u["id"]: u for u in users}

    items = [
        {
            "id": m["id"],
            "email": user_map.get(m["user_id"], {}).get("email"),
            "name": user_map.get(m["user_id"], {}).get("name"),
            "role": m["role"],
            "joined_at": m.get("joined_at"),
        }
        for m in members
    ]

    return PaginatedOrganizationMembers(
        members=items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.put("/organizations/{org_id}/members/{member_id}/role")
async def update_member_role(
    org_id: str,
    member_id: str,
    req: UpdateMemberRoleRequest,
    user: User = Depends(get_current_user),
):
    """Change a team member's role. Previously there was no way to do this at
    all -- only invite/list/accept existed -- so a member's permissions could
    never be adjusted after the fact short of removing and re-inviting them
    (BE-018)."""
    db = await get_db()

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not membership or membership["role"] not in (Role.OWNER, Role.ADMIN):
        raise HTTPException(status_code=403, detail="Permission denied")

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    target = await db.team_members.find_one(
        {"id": member_id, "org_id": org_id}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target["user_id"] == org["owner_id"]:
        raise HTTPException(
            status_code=400, detail="Cannot change the organization owner's role"
        )
    if req.role == Role.OWNER:
        raise HTTPException(
            status_code=400,
            detail="Ownership transfer is not supported via this endpoint",
        )

    old_role = target["role"]
    await db.team_members.update_one(
        {"id": member_id}, {"$set": {"role": req.role}}
    )

    audit_log = AuditLog(
        actor_id=user.id,
        actor_email=user.email,
        action="update_member_role",
        resource_type="team_member",
        resource_id=member_id,
        changes={"org_id": org_id, "old_role": old_role, "new_role": req.role},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

    return {"ok": True}


@router.delete("/organizations/{org_id}/members/{member_id}")
async def remove_member(
    org_id: str, member_id: str, user: User = Depends(get_current_user)
):
    """Remove a team member from an organization, or leave it yourself.
    Previously there was no way to revoke a member's access at all short of
    deleting the whole organization -- a compromised or departing team
    member's access could never be revoked via the API (BE-018)."""
    db = await get_db()

    requester_membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not requester_membership:
        raise HTTPException(status_code=404, detail="Organization not found")

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    target = await db.team_members.find_one(
        {"id": member_id, "org_id": org_id}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    is_self_removal = target["user_id"] == user.id
    is_admin_or_owner = requester_membership["role"] in (Role.OWNER, Role.ADMIN)
    if not (is_self_removal or is_admin_or_owner):
        raise HTTPException(status_code=403, detail="Permission denied")

    if target["user_id"] == org["owner_id"]:
        raise HTTPException(
            status_code=400,
            detail="The organization owner cannot be removed; transfer ownership first",
        )

    await db.team_members.delete_one({"id": member_id})

    audit_log = AuditLog(
        actor_id=user.id,
        actor_email=user.email,
        action="leave_organization" if is_self_removal else "remove_member",
        resource_type="team_member",
        resource_id=member_id,
        changes={"org_id": org_id, "removed_user_id": target["user_id"]},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

    return {"ok": True}