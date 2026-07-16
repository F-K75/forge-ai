"""Data models for context engineering: source types, chunks, scores,
token budgets, and assembly plans."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class ContextSource(str, Enum):
    """Supported sources from which context can be retrieved."""
    PROJECT_STATE = "project_state"
    RELEVANT_FILES = "relevant_files"
    PREVIOUS_OUTPUTS = "previous_outputs"
    FILE_CONTENT = "file_content"
    KNOWLEDGE_BASE = "knowledge_base"
    SIMILAR_TASKS = "similar_tasks"
    DOCUMENTATION = "documentation"
    WORKSPACE_CONFIG = "workspace_config"
    AGENT_MEMORY = "agent_memory"


@dataclass
class ContextChunk:
    """A single retrieved unit of context with metadata."""
    chunk_id: str
    source: ContextSource
    content: str
    source_path: str = ""            # File path or knowledge base key
    token_count: int = 0
    score: float = 0.0               # Relevance score 0.0–1.0
    priority: int = 0                # Higher = more important, included first
    metadata: Dict[str, Any] = field(default_factory=dict)
    retrieved_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class RelevanceScore:
    """Composite relevance score for a context chunk."""
    overall: float = 0.0             # 0.0–1.0 aggregated
    keyword_match: float = 0.0
    semantic_similarity: float = 0.0
    recency: float = 0.0             # How recent the source is
    authority: float = 0.0           # Source authority/trustworthiness
    task_alignment: float = 0.0      # How well it aligns with the current task

    def aggregate(self) -> float:
        self.overall = (
            self.keyword_match * 0.25
            + self.semantic_similarity * 0.35
            + self.recency * 0.10
            + self.authority * 0.10
            + self.task_alignment * 0.20
        )
        return self.overall


@dataclass
class TokenBudget:
    """Token budget allocation for context windows."""
    total_budget: int = 8000          # Max tokens for all context
    reserved_system: int = 2000       # Reserved for system prompt
    reserved_user: int = 1000         # Reserved for user message
    context_max: int = 5000           # Max tokens for context chunks
    min_chunk_tokens: int = 50        # Minimum tokens per chunk
    max_chunk_tokens: int = 2000      # Maximum tokens per chunk

    @property
    def available(self) -> int:
        return min(self.context_max, self.total_budget - self.reserved_system - self.reserved_user)


@dataclass
class ContextWindow:
    """A managed window of context chunks within a token budget."""
    chunks: List[ContextChunk] = field(default_factory=list)
    total_tokens: int = 0
    budget: TokenBudget = field(default_factory=TokenBudget)
    overflow_handling: str = "truncate"  # "truncate" | "compress" | "summarize"
    source_priority: List[ContextSource] = field(default_factory=lambda: [
        ContextSource.PREVIOUS_OUTPUTS,
        ContextSource.PROJECT_STATE,
        ContextSource.FILE_CONTENT,
        ContextSource.KNOWLEDGE_BASE,
        ContextSource.SIMILAR_TASKS,
        ContextSource.DOCUMENTATION,
        ContextSource.AGENT_MEMORY,
    ])

    def add_chunk(self, chunk: ContextChunk) -> bool:
        """Try to add a chunk. Returns True if it fit within budget."""
        if chunk.token_count == 0:
            chunk.token_count = len(chunk.content) // 4 + 1

        if self.total_tokens + chunk.token_count > self.budget.available:
            return False

        self.chunks.append(chunk)
        self.total_tokens += chunk.token_count
        return True

    def fits(self, token_count: int) -> bool:
        return self.total_tokens + token_count <= self.budget.available

    def usage_pct(self) -> float:
        if self.budget.available == 0:
            return 100.0
        return (self.total_tokens / self.budget.available) * 100.0

    def sort_by_priority(self) -> None:
        self.chunks.sort(key=lambda c: (-c.priority, -c.score))

    def sort_by_recency(self) -> None:
        self.chunks.sort(key=lambda c: c.retrieved_at, reverse=True)


@dataclass
class RetrievalResult:
    """Result of a context retrieval operation."""
    query: str
    role: str
    chunks: List[ContextChunk] = field(default_factory=list)
    total_chunks_found: int = 0
    retrieval_time_ms: float = 0.0
    sources_used: List[ContextSource] = field(default_factory=list)


@dataclass
class AssemblyPlan:
    """Defines how to assemble context from multiple sources for a role."""
    plan_id: str
    role: str
    sources: List[ContextSource] = field(default_factory=lambda: [
        ContextSource.PROJECT_STATE,
        ContextSource.FILE_CONTENT,
        ContextSource.PREVIOUS_OUTPUTS,
        ContextSource.KNOWLEDGE_BASE,
    ])
    max_sources: int = 4
    strategy: str = "priority"       # "priority" | "relevance" | "recency" | "balanced"
    token_budget: TokenBudget = field(default_factory=TokenBudget)
    include_file_contents: bool = True
    max_files: int = 10
    max_file_tokens: int = 3000