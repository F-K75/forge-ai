from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from core.models import MarketplaceItem, User
from core.database import get_db
from api.auth import get_current_user

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


class MarketplaceItemCreate(BaseModel):
    type: str = "template"
    title: str
    description: str
    prompt: str
    tags: List[str] = []
    is_public: bool = True


class MarketplaceItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    prompt: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None


class MarketplaceItemResponse(BaseModel):
    id: str
    type: str
    title: str
    description: str
    prompt: str
    rating: float
    rating_count: int
    tags: List[str]
    downloads: int
    is_public: bool
    created_at: str


@router.post("/", response_model=MarketplaceItemResponse)
async def create_item(req: MarketplaceItemCreate, user: User = Depends(get_current_user)):
    db = await get_db()
    
    item = MarketplaceItem(
        type=req.type,
        title=req.title,
        description=req.description,
        prompt=req.prompt,
        author_id=user.id,
        tags=req.tags,
        is_public=req.is_public,
    )
    await db.marketplace_items.insert_one(item.model_dump(mode="json"))

    return item.model_dump(mode="json")


@router.get("/", response_model=List[MarketplaceItemResponse])
async def list_items(
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    db = await get_db()
    
    query: Dict[str, Any] = {"is_public": True}
    if type:
        query["type"] = type
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    
    items = await db.marketplace_items.find(query, {"_id": 0}).sort("downloads", -1).limit(limit).to_list(None)
    return items


@router.get("/{item_id}", response_model=MarketplaceItemResponse)
async def get_item(item_id: str):
    db = await get_db()
    item = await db.marketplace_items.find_one({"id": item_id, "is_public": True}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("/{item_id}/download")
async def download_item(item_id: str, user: User = Depends(get_current_user)):
    db = await get_db()
    item = await db.marketplace_items.find_one({"id": item_id, "is_public": True}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    await db.marketplace_items.update_one({"id": item_id}, {"$inc": {"downloads": 1}})
    
    return {"prompt": item["prompt"]}


@router.post("/{item_id}/rate", response_model=Dict[str, Any])
async def rate_item(item_id: str, rating: int, user: User = Depends(get_current_user)):
    if rating < 1 or rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    db = await get_db()
    await db.marketplace_items.update_one(
        {"id": item_id},
        {"$inc": {"rating": rating, "rating_count": 1}}
    )
    
    item = await db.marketplace_items.find_one({"id": item_id}, {"_id": 0})
    return {"rating": item.get("rating", 0), "rating_count": item.get("rating_count", 0)}