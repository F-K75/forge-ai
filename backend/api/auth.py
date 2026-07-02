from fastapi import APIRouter, HTTPException, Depends, Cookie, Response, Request
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timedelta
import uuid
import hashlib
import logging

import resend

from core.models import User, PlanTier, Organization, TeamMember, Invitation, Role, AuditLog
from core.database import get_db
from core.config import get_settings
from core.security import validate_password_strength, check_email_rate_limit
from core.encryption import encrypt_field, decrypt_field
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

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


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    github_token: Optional[str] = Field(None, max_length=200)
    preferences: Optional[dict] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=255)
    new_password: str = Field(max_length=128)


def _get_cookie_kwargs(max_age: int) -> dict:
    is_production = settings.app_url.startswith("https")
    return {
        "httponly": True,
        "secure": is_production,
        "samesite": "strict",
        "max_age": max_age,
    }


def _public_user_dict(user_doc: dict) -> dict:
    """Strip fields that must never leave the server (password hash, raw
    tokens, verification secrets) before a user document is sent to a client."""
    public = {
        k: v
        for k, v in user_doc.items()
        if k
        not in {
            "hashed_password",
            "github_token",
            "verification_token",
            "verification_expires",
        }
    }
    public["github_connected"] = bool(user_doc.get("github_token"))
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


async def get_current_user(
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
    
    return User(**user_data)


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, response: Response):
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

    verification_token = uuid.uuid4().hex
    hashed_token = _hash_token(verification_token)
    expires = datetime.utcnow() + timedelta(hours=24)
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"verification_token": hashed_token, "verification_expires": expires}},
    )

    if settings.resend_api_key:
        try:
            resend.api_key = settings.resend_api_key
            verify_link = f"{settings.app_url}/verify-email?token={verification_token}"
            resend.Emails.send({
                "from": settings.from_email,
                "to": req.email,
                "subject": "Verify your Forge account",
                "html": f"<p>Click <a href=\"{verify_link}\">here</a> to verify your email. This link expires in 24 hours.</p>",
            })
        except Exception:
            logging.exception("Failed to send verification email")

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

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_public_user_dict(user_dict),
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, response: Response):
    db = await get_db()
    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Decrypt sensitive fields before validation
    user_data = {k: v for k, v in user_doc.items() if k in User.model_fields}
    if "github_token" in user_data and user_data["github_token"]:
        user_data["github_token"] = decrypt_field(user_data["github_token"])
    
    user = User(**user_data)
    hashed = user_doc.get("hashed_password", "")
    if not verify_password(req.password, hashed):
        raise HTTPException(status_code=401, detail="Invalid credentials")

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

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=_public_user_dict(user_doc),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, response: Response):
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

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        user=_public_user_dict(user_doc),
    )


@router.post("/logout")
async def logout(
    response: Response,
    access_token: Optional[str] = Cookie(None),
    user: User = Depends(get_current_user),
):
    db = await get_db()
    
    # Blacklist the access token by JTI for immediate revocation
    if access_token:
        payload = decode_token(access_token)
        if payload and payload.get("jti"):
            jti = payload["jti"]
            # Use upsert to avoid duplicate key errors
            await db.token_blacklist.update_one(
                {"jti": jti},
                {"$set": {"jti": jti, "created_at": datetime.utcnow()}},
                upsert=True,
            )
    
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
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
    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0})
    return _public_user_dict(user_doc) if user_doc is not None else None


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

    # Shallow-merge preferences so one toggle's update doesn't clobber others.
    preferences = update.pop("preferences", None)
    if preferences:
        update.update({f"preferences.{k}": v for k, v in preferences.items()})

    await db.users.update_one({"id": user.id}, {"$set": update})
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
        changes={"timestamp": datetime.utcnow().isoformat()},
    )
    await db.audit_logs.insert_one(audit_log.model_dump())
    
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
        expires = datetime.utcnow() + timedelta(hours=1)
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
    if not expires or datetime.utcnow() > expires:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired reset token",
        )
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
async def verify_email(token: str):
    db = await get_db()
    hashed = _hash_token(token)
    user_doc = await db.users.find_one(
        {"verification_token": hashed},
        {"_id": 0},
    )
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    expires = user_doc.get("verification_expires")
    if not expires or datetime.utcnow() > expires:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    await db.users.update_one(
        {"verification_token": hashed},
        {"$set": {"email_verified": True, "verification_token": None, "verification_expires": None}},
    )
    return {"ok": True}


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


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: Role = Role.MEMBER


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
        org_id=org.id, user_id=user.id, role=Role.OWNER, joined_at=datetime.utcnow()
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


@router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(user: User = Depends(get_current_user)):
    db = await get_db()

    memberships = await db.team_members.find({"user_id": user.id}, {"_id": 0}).to_list(
        None
    )
    org_ids = [m["org_id"] for m in memberships]

    if not org_ids:
        return []

    orgs = await db.organizations.find({"id": {"$in": org_ids}}, {"_id": 0}).to_list(
        None
    )

    result = []
    for org in orgs:
        membership = next((m for m in memberships if m["org_id"] == org["id"]), None)
        result.append(
            OrganizationResponse(
                id=org["id"],
                name=org["name"],
                slug=org["slug"],
                plan=org.get("plan", "free"),
                seats=org.get("seats", 1),
                role=membership.get("role", "member") if membership else "member",
                created_at=org.get("created_at"),
            )
        )

    return result


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
            "expires_at": {"$gt": datetime.utcnow()},
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
        joined_at=datetime.utcnow(),
    )
    await db.team_members.insert_one(team_member.model_dump())

    await db.invitations.update_one(
        {"hashed_token": hashed}, {"$set": {"accepted_at": datetime.utcnow()}}
    )

    return {"ok": True}


@router.get("/organizations/{org_id}/members")
async def list_members(org_id: str, user: User = Depends(get_current_user)):
    db = await get_db()

    membership = await db.team_members.find_one(
        {"org_id": org_id, "user_id": user.id}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Organization not found")

    members = await db.team_members.find({"org_id": org_id}, {"_id": 0}).to_list(None)
    user_ids = [m["user_id"] for m in members]

    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "hashed_password": 0}
    ).to_list(None)
    user_map = {u["id"]: u for u in users}

    return [
        {
            "id": m["id"],
            "email": user_map.get(m["user_id"], {}).get("email"),
            "name": user_map.get(m["user_id"], {}).get("name"),
            "role": m["role"],
            "joined_at": m.get("joined_at"),
        }
        for m in members
    ]