from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import secrets
import hashlib
import math

from core.models import User
from core.database import get_db
from core.audit import record_audit_log
from api.auth import get_current_user

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class ApiKeyCreateRequest(BaseModel):
    name: str
    scopes: List[str] = []
    expires_in_days: Optional[int] = None


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str  # First 8 chars for display
    scopes: List[str]
    expires_at: Optional[datetime]
    created_at: datetime
    last_used_at: Optional[datetime]


class PaginatedApiKeys(BaseModel):
    api_keys: List[ApiKeyResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


def _hash_key(key: str) -> str:
    """Hash API key for storage."""
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_key() -> str:
    """Generate a secure API key."""
    return f"sk_forge_{secrets.token_urlsafe(32)}"


@router.post("/", response_model=ApiKeyResponse)
async def create_api_key(
    req: ApiKeyCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    db = await get_db()
    
    api_key = _generate_key()
    key_hash = _hash_key(api_key)
    
    key_doc = {
        "id": f"key_{secrets.token_urlsafe(16)}",
        "user_id": current_user.id,
        "name": req.name,
        "key_hash": key_hash,
        "key_prefix": api_key[:8],
        "scopes": req.scopes,
        "created_at": datetime.utcnow(),
        "last_used_at": None,
        "expires_at": None,
    }
    
    if req.expires_in_days:
        key_doc["expires_at"] = datetime.utcnow() + timedelta(days=req.expires_in_days)
    
    await db.api_keys.insert_one(key_doc)
    
    await record_audit_log(
        db, request, current_user, "create_api_key", "api_key",
        resource_id=key_doc["id"],
        changes={"name": req.name, "scopes": req.scopes, "expires_at": key_doc.get("expires_at")},
    )
    return ApiKeyResponse(**key_doc)


@router.get("/", response_model=PaginatedApiKeys)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    query = {"user_id": current_user.id}
    total = await db.api_keys.count_documents(query)
    keys = await db.api_keys.find(
        query,
        {"_id": 0, "key_hash": 0}
    ).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page).to_list(per_page)
    return PaginatedApiKeys(
        api_keys=keys,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total else 0,
    )


@router.delete("/{key_id}")
async def delete_api_key(key_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    result = await db.api_keys.delete_one({"id": key_id, "user_id": current_user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")
    await record_audit_log(
        db, request, current_user, "delete_api_key", "api_key",
        resource_id=key_id,
    )
    return {"ok": True}


async def validate_api_key(api_key: str) -> Optional[User]:
    """Validate API key and return user if valid."""
    if not api_key:
        return None
    
    db = await get_db()
    key_hash = _hash_key(api_key)
    
    key_doc = await db.api_keys.find_one({"key_hash": key_hash}, {"_id": 0})
    if not key_doc:
        return None
    
    if key_doc.get("expires_at") and key_doc["expires_at"] < datetime.utcnow():
        return None
    
    user_doc = await db.users.find_one({"id": key_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        return None
    
    # Update last used
    await db.api_keys.update_one(
        {"id": key_doc["id"]},
        {"$set": {"last_used_at": datetime.utcnow()}}
    )
    
    return User(**user_doc)