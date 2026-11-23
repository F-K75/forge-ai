from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import get_db
from core.models import User
from core.permissions import is_org_member
from api.auth import get_current_user
from retrieval.models import SourceType
from retrieval.service import get_semantic_retriever

router = APIRouter(prefix="/api/retrieval", tags=["retrieval"])


class IndexRequest(BaseModel):
    source_type: SourceType
    source_id: str
    text: str
    metadata: Optional[Dict[str, Any]] = None
    org_id: str
    project_id: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    source_types: Optional[List[SourceType]] = None
    org_id: str
    project_id: Optional[str] = None
    keyword_filter: Optional[str] = None


async def _require_org_membership(user: User, org_id: str) -> None:
    """`org_id` on retrieval requests is the only tenant boundary this data
    has (see `retrieval/models.py::Chunk`) -- without this check, any
    authenticated user could pass any org's id and read/write/delete that
    org's indexed knowledge base."""
    db = await get_db()
    if not await is_org_member(db, user_id=user.id, org_id=org_id):
        raise HTTPException(status_code=403, detail="Not a member of this organization")


@router.post("/index")
async def index_source(request: IndexRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await _require_org_membership(user, request.org_id)
    retriever = get_semantic_retriever()
    chunks_indexed = await retriever.index_source(
        source_type=request.source_type,
        source_id=request.source_id,
        text=request.text,
        metadata=request.metadata,
        org_id=request.org_id,
        project_id=request.project_id,
    )
    return {"indexed": chunks_indexed > 0, "chunks": chunks_indexed}


@router.delete("/source/{source_id}")
async def delete_source(
    source_id: str, org_id: str = Query(...), user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    await _require_org_membership(user, org_id)
    retriever = get_semantic_retriever()
    deleted = await retriever.delete_source(source_id, org_id=org_id)
    return {"deleted_chunks": deleted}


@router.post("/search")
async def search(request: SearchRequest, user: User = Depends(get_current_user)) -> Dict[str, Any]:
    await _require_org_membership(user, request.org_id)
    retriever = get_semantic_retriever()
    if request.project_id:
        results = await retriever.retrieve(
            request.query,
            top_k=request.top_k,
            source_types=request.source_types,
            org_id=request.org_id,
            project_id=request.project_id,
            keyword_filter=request.keyword_filter,
        )
    else:
        results = await retriever.retrieve_org_wide(
            request.query,
            top_k=request.top_k,
            source_types=request.source_types,
            org_id=request.org_id,
            keyword_filter=request.keyword_filter,
        )
    return {"results": [r.model_dump(mode="json") for r in results]}
