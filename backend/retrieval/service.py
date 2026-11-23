from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional

from retrieval.embeddings import embed_text, embed_texts
from retrieval.index import SemanticIndex
from retrieval.models import Chunk, RetrievedChunk, SourceType

# Simple fixed-size character chunking with overlap. Good enough for code
# and docs; a syntax-aware chunker (split on function/class boundaries) is
# the natural upgrade for the "code embeddings" source type specifically,
# but adds a per-language parser dependency this pass doesn't take on.
_CHUNK_SIZE = 1500
_CHUNK_OVERLAP = 200


def _split_text(text: str) -> List[str]:
    if len(text) <= _CHUNK_SIZE:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - _CHUNK_OVERLAP
    return chunks


class RetrievalScopeError(ValueError):
    """A retrieval request without the tenant scope it requires."""


def _chunk_id(source_id: str, index: int) -> str:
    return hashlib.sha256(f"{source_id}:{index}".encode("utf-8")).hexdigest()


class SemanticRetriever:
    """Indexes and retrieves chunks (code, docs, conversation history,
    strategy SDK, architecture documents) for context selection. Composes
    `retrieval.embeddings` (OpenAI embeddings API) and `retrieval.index`
    (Mongo-backed cosine search) -- callers should go through this class,
    not the two lower-level modules directly.

    Embedding failures (no API key configured, provider error) are
    swallowed and logged rather than raised: retrieval is a context
    *optimization*, not something that should break indexing or a request
    if the embeddings API is unavailable.
    """

    def __init__(self, *, index: Optional[SemanticIndex] = None) -> None:
        self.index = index or SemanticIndex()

    async def index_source(
        self,
        *,
        source_type: SourceType,
        source_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> int:
        """Chunk `text`, embed each chunk, and upsert into the index.
        Returns the number of chunks indexed (0 if embeddings are
        unavailable)."""
        from retrieval.embeddings import EmbeddingUnavailable

        pieces = _split_text(text)
        try:
            embeddings = await embed_texts(pieces)
        except EmbeddingUnavailable:
            return 0

        for i, (piece, embedding) in enumerate(zip(pieces, embeddings)):
            chunk = Chunk(
                id=_chunk_id(source_id, i),
                source_type=source_type,
                source_id=source_id,
                text=piece,
                metadata=metadata or {},
                org_id=org_id,
                project_id=project_id,
            )
            await self.index.upsert(chunk, embedding)
        return len(pieces)

    async def delete_source(self, source_id: str, *, org_id: Optional[str] = None) -> int:
        return await self.index.delete_source(source_id, org_id=org_id)

    async def retrieve(
        self,
        query: str,
        *,
        org_id: str,
        project_id: str,
        top_k: int = 5,
        source_types: Optional[List[SourceType]] = None,
        keyword_filter: Optional[str] = None,
        min_score: float = 0.0,
    ) -> List[RetrievedChunk]:
        """Return the top-k most relevant chunks for `query` within one
        organization's project. Combines vector similarity with an optional
        keyword filter (hybrid search): `keyword_filter` narrows the
        candidate set to chunks containing that substring before ranking by
        cosine similarity, rather than blending two separate scores --
        simpler and avoids needing a weighting knob between the two signals.

        `org_id` and `project_id` are mandatory (BY-10, F28): an unscoped
        search would rank every organization's indexed sources. Missing ids
        raise `RetrievalScopeError` before anything is embedded.

        Returns an empty list (not an error) if embeddings are unavailable or
        not permitted by the processing boundary, so callers can always
        treat retrieval as best-effort context enrichment."""
        if not org_id or not project_id:
            raise RetrievalScopeError("semantic retrieval requires both org_id and project_id")
        return await self._search(
            query, top_k=top_k, source_types=source_types, org_id=org_id,
            project_id=project_id, keyword_filter=keyword_filter, min_score=min_score,
        )

    async def retrieve_org_wide(
        self,
        query: str,
        *,
        org_id: str,
        top_k: int = 5,
        source_types: Optional[List[SourceType]] = None,
        keyword_filter: Optional[str] = None,
        min_score: float = 0.0,
    ) -> List[RetrievedChunk]:
        """Organization-wide knowledge-base search for the authenticated,
        membership-checked `/api/retrieval/search` endpoint. Still
        tenant-scoped: `org_id` is mandatory. Never used by the build path."""
        if not org_id:
            raise RetrievalScopeError("org-wide retrieval requires org_id")
        return await self._search(
            query, top_k=top_k, source_types=source_types, org_id=org_id,
            project_id=None, keyword_filter=keyword_filter, min_score=min_score,
        )

    async def _search(
        self,
        query: str,
        *,
        top_k: int,
        source_types: Optional[List[SourceType]],
        org_id: str,
        project_id: Optional[str],
        keyword_filter: Optional[str],
        min_score: float,
    ) -> List[RetrievedChunk]:
        from retrieval.embeddings import EmbeddingUnavailable

        try:
            query_embedding = await embed_text(query)
        except EmbeddingUnavailable:
            return []

        return await self.index.search(
            query_embedding,
            top_k=top_k,
            source_types=source_types,
            org_id=org_id,
            project_id=project_id,
            keyword_filter=keyword_filter,
            min_score=min_score,
        )


_retriever: Optional[SemanticRetriever] = None


def get_semantic_retriever() -> SemanticRetriever:
    global _retriever
    if _retriever is None:
        _retriever = SemanticRetriever()
    return _retriever
