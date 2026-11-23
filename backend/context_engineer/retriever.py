"""Context retrieval: fetch relevant context from multiple sources for a
given role and task.

Supports retrieval from project state, previous agent outputs, file contents,
knowledge base entries, similar past tasks, and documentation — all within
configurable per-source limits.
"""

from __future__ import annotations

import time
from typing import Dict, List, Optional

from context_engineer.models import (
    ContextChunk,
    ContextSource,
    RetrievalResult,
)

try:
    from retrieval.service import get_semantic_retriever as _get_semantic_retriever
    from retrieval.models import SourceType as _RetrievalSourceType
    _SEMANTIC_AVAILABLE = True
except Exception:
    _SEMANTIC_AVAILABLE = False


class ContextRetriever:
    """Retrieves context chunks from multiple sources for a given role and task.

    In production, this would connect to vector databases, knowledge bases,
    and file indexing services. This implementation provides a functional
    retrieval pipeline with simulated results and a clear extension pattern.

    Usage::

        retriever = ContextRetriever()
        result = await retriever.retrieve(
            role="developer",
            task="Build a todo app with auth",
            sources=[ContextSource.FILE_CONTENT, ContextSource.KNOWLEDGE_BASE],
        )
    """

    def __init__(self) -> None:
        self._source_cache: Dict[str, list] = {}

    def register_source(self, source: ContextSource, data: List[ContextChunk]) -> None:
        """Register pre-fetched data for a source (useful for testing or
        when the caller has already gathered the data)."""
        self._source_cache[source.value] = data

    async def retrieve(
        self,
        role: str,
        task: str,
        sources: Optional[List[ContextSource]] = None,
        max_chunks_per_source: int = 5,
        *,
        org_id: Optional[str] = None,
        project_id: Optional[str] = None,
        build_path: bool = False,
    ) -> RetrievalResult:
        """Retrieve context chunks for a role and task.

        Args:
            role: The agent role requesting context.
            task: The current task description.
            sources: List of sources to query. Defaults to all sources.
            max_chunks_per_source: Max chunks to return per source.
            org_id / project_id: tenant scope for semantic retrieval. Without
                both, semantic retrieval is skipped (BY-10).
            build_path: True for agent context assembly during a build.
                Semantic retrieval there is disabled unless the
                `build_path_retrieval` flag is on (F28); when on, it is
                tenant-scoped and the embedding call passes the processing
                boundary (BYOK content needs consent).

        Returns:
            RetrievalResult with chunks from all queried sources.
        """
        start = time.perf_counter()
        # Passed explicitly, never stored on the instance: the assembler and
        # this retriever are shared by every concurrent build.
        scope = self._semantic_scope_for(org_id, project_id, build_path)

        if sources is None:
            sources = [
                ContextSource.PROJECT_STATE,
                ContextSource.FILE_CONTENT,
                ContextSource.PREVIOUS_OUTPUTS,
                ContextSource.KNOWLEDGE_BASE,
                ContextSource.SIMILAR_TASKS,
                ContextSource.DOCUMENTATION,
                ContextSource.WORKSPACE_CONFIG,
                ContextSource.AGENT_MEMORY,
            ]

        all_chunks: List[ContextChunk] = []
        sources_used: List[ContextSource] = []

        for source in sources:
            chunks = await self._query_source(source, role, task, max_chunks_per_source, scope=scope)
            if chunks:
                all_chunks.extend(chunks)
                sources_used.append(source)

        elapsed_ms = (time.perf_counter() - start) * 1000

        return RetrievalResult(
            query=task,
            role=role,
            chunks=all_chunks,
            total_chunks_found=len(all_chunks),
            retrieval_time_ms=elapsed_ms,
            sources_used=sources_used,
        )

    @staticmethod
    def _semantic_scope_for(
        org_id: Optional[str], project_id: Optional[str], build_path: bool
    ) -> Optional[Dict[str, str]]:
        """The scope semantic retrieval may run under, or None to skip it."""
        if not _SEMANTIC_AVAILABLE or not org_id or not project_id:
            return None
        if build_path:
            from core.config import get_settings

            if not get_settings().build_path_retrieval:
                return None
        return {"org_id": org_id, "project_id": project_id}

    async def _semantic(self, task: str, max_chunks: int, source_type, scope: Optional[Dict[str, str]]) -> list:
        if scope is None:
            return []
        try:
            semantic = _get_semantic_retriever()
            return await semantic.retrieve(
                task, top_k=max_chunks, source_types=[source_type],
                org_id=scope["org_id"], project_id=scope["project_id"],
            )
        except Exception:
            return []

    async def _query_source(
        self,
        source: ContextSource,
        role: str,
        task: str,
        max_chunks: int,
        scope: Optional[Dict[str, str]] = None,
    ) -> List[ContextChunk]:
        """Query a single source for context chunks.

        Each source handler returns chunks from the registered cache or
        generates synthetic chunks for sources without registered data.
        """
        # Check cache first
        cached = self._source_cache.get(source.value, [])
        if cached:
            return cached[:max_chunks]

        # Source-specific handlers
        handler = self._get_handler(source)
        if handler is None:
            return []

        return await handler(role, task, max_chunks, scope=scope)

    def _get_handler(self, source: ContextSource):
        handlers = {
            ContextSource.PROJECT_STATE: self._get_project_state,
            ContextSource.FILE_CONTENT: self._get_file_contents,
            ContextSource.PREVIOUS_OUTPUTS: self._get_previous_outputs,
            ContextSource.KNOWLEDGE_BASE: self._get_knowledge_base,
            ContextSource.SIMILAR_TASKS: self._get_similar_tasks,
            ContextSource.DOCUMENTATION: self._get_documentation,
            ContextSource.WORKSPACE_CONFIG: self._get_workspace_config,
            ContextSource.AGENT_MEMORY: self._get_agent_memory,
        }
        return handlers.get(source)

    async def _get_project_state(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve project state context (tech stack, architecture, tasks)."""
        return [
            ContextChunk(
                chunk_id=f"proj-state-{role}",
                source=ContextSource.PROJECT_STATE,
                content="Project state: current milestone, tech stack, pending tasks",
                priority=10,
                score=0.9,
            )
        ][:max_chunks]

    async def _get_file_contents(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve relevant file contents, using the real semantic retriever
        when available."""
        results = await self._semantic(task, max_chunks, _RetrievalSourceType.CODE, scope) if _SEMANTIC_AVAILABLE else []
        if results:
            return [
                ContextChunk(
                    chunk_id=r.id,
                    source=ContextSource.FILE_CONTENT,
                    content=r.text,
                    priority=7,
                    score=r.score,
                )
                for r in results
            ]
        return [
            ContextChunk(
                chunk_id=f"file-{role}-{i}",
                source=ContextSource.FILE_CONTENT,
                content=f"File content chunk {i} relevant to: {task}",
                priority=7,
                score=0.7,
            )
            for i in range(min(max_chunks, 3))
        ]

    async def _get_previous_outputs(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve outputs from previous agent runs."""
        return [
            ContextChunk(
                chunk_id=f"prev-out-{role}",
                source=ContextSource.PREVIOUS_OUTPUTS,
                content="Previous agent output for context continuity",
                priority=9,
                score=0.85,
            )
        ][:max_chunks]

    async def _get_knowledge_base(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve knowledge base entries, using the real semantic retriever
        for documentation when available."""
        results = await self._semantic(task, max_chunks, _RetrievalSourceType.DOCUMENTATION, scope) if _SEMANTIC_AVAILABLE else []
        if results:
            return [
                ContextChunk(
                    chunk_id=r.id,
                    source=ContextSource.KNOWLEDGE_BASE,
                    content=r.text,
                    priority=5,
                    score=r.score,
                )
                for r in results
            ]
        return [
            ContextChunk(
                chunk_id=f"kb-{role}-{i}",
                source=ContextSource.KNOWLEDGE_BASE,
                content=f"Best practice: For {task}, ensure error handling patterns",
                priority=5,
                score=0.6,
            )
            for i in range(min(max_chunks, 2))
        ]

    async def _get_similar_tasks(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve similar past tasks from conversation history when available."""
        results = await self._semantic(task, max_chunks, _RetrievalSourceType.CONVERSATION, scope) if _SEMANTIC_AVAILABLE else []
        if results:
            return [
                ContextChunk(
                    chunk_id=r.id,
                    source=ContextSource.SIMILAR_TASKS,
                    content=r.text,
                    priority=4,
                    score=r.score,
                )
                for r in results
            ]
        return [
            ContextChunk(
                chunk_id=f"sim-{role}",
                source=ContextSource.SIMILAR_TASKS,
                content="Similar task: previously built auth system with JWT",
                priority=4,
                score=0.5,
            )
        ][:max_chunks]

    async def _get_documentation(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve documentation relevant to the task."""
        return [
            ContextChunk(
                chunk_id=f"doc-{role}",
                source=ContextSource.DOCUMENTATION,
                content="Relevant documentation: API patterns, code standards",
                priority=3,
                score=0.4,
            )
        ][:max_chunks]

    async def _get_workspace_config(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve workspace configuration context."""
        return [
            ContextChunk(
                chunk_id=f"ws-config-{role}",
                source=ContextSource.WORKSPACE_CONFIG,
                content="Workspace config: project structure, environment settings",
                priority=6,
                score=0.75,
            )
        ][:max_chunks]

    async def _get_agent_memory(
        self, role: str, task: str, max_chunks: int, scope: Optional[Dict[str, str]] = None
    ) -> List[ContextChunk]:
        """Retrieve learned patterns from agent memory."""
        return [
            ContextChunk(
                chunk_id=f"memory-{role}",
                source=ContextSource.AGENT_MEMORY,
                content="Agent memory: learned patterns from previous builds",
                priority=2,
                score=0.3,
            )
        ][:max_chunks]