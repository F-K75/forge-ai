from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from core.database import get_db
from retrieval.models import Chunk, RetrievedChunk, SourceType

# Hard cap on how many candidate documents a brute-force cosine scan will
# pull per query. Fine at the scale a single org/project's indexed
# code+docs+conversation history reaches; the intended upgrade path at
# larger scale is swapping `_candidates()` for a MongoDB Atlas
# `$vectorSearch` aggregation stage against the same `semantic_chunks`
# collection and schema -- callers of `SemanticIndex.search()` wouldn't
# need to change.
_MAX_CANDIDATES = 2000


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class SemanticIndex:
    """Mongo-backed vector store for indexed chunks. Brute-force cosine
    ranking in Python -- correct at moderate scale, not the long-term
    answer for a large corpus (see `_MAX_CANDIDATES` note above)."""

    collection_name = "semantic_chunks"

    async def _collection(self):
        db = await get_db()
        return db[self.collection_name]

    async def upsert(self, chunk: Chunk, embedding: List[float]) -> None:
        collection = await self._collection()
        doc = {
            **chunk.model_dump(mode="json"),
            "embedding": embedding,
        }
        await collection.update_one({"id": chunk.id}, {"$set": doc}, upsert=True)

    async def delete_source(self, source_id: str, *, org_id: Optional[str] = None) -> int:
        collection = await self._collection()
        query: Dict[str, Any] = {"source_id": source_id}
        if org_id:
            query["org_id"] = org_id
        result = await collection.delete_many(query)
        return result.deleted_count

    async def search(
        self,
        query_embedding: List[float],
        *,
        top_k: int = 5,
        source_types: Optional[List[SourceType]] = None,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
        keyword_filter: Optional[str] = None,
        min_score: float = 0.0,
    ) -> List[RetrievedChunk]:
        collection = await self._collection()

        query: Dict[str, Any] = {}
        if source_types:
            query["source_type"] = {"$in": [st.value for st in source_types]}
        if org_id:
            query["org_id"] = org_id
        if project_id:
            query["project_id"] = project_id
        if keyword_filter:
            query["text"] = {"$regex": keyword_filter, "$options": "i"}

        candidates = []
        cursor = collection.find(query, {"_id": 0}).limit(_MAX_CANDIDATES)
        async for doc in cursor:
            candidates.append(doc)

        scored = []
        for doc in candidates:
            score = _cosine(query_embedding, doc.get("embedding") or [])
            if score < min_score:
                continue
            scored.append(
                RetrievedChunk(
                    id=doc["id"],
                    source_type=doc["source_type"],
                    source_id=doc["source_id"],
                    text=doc["text"],
                    metadata=doc.get("metadata") or {},
                    org_id=doc.get("org_id"),
                    project_id=doc.get("project_id"),
                    score=score,
                )
            )

        scored.sort(key=lambda c: c.score, reverse=True)
        return scored[:top_k]
