"""Relevance scoring: score and rank context chunks by their relevance to
the current task using configurable scoring criteria.

Combines keyword overlap, semantic similarity (via token overlap heuristic),
recency, source authority, and task alignment into a composite score.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from context_engineer.models import ContextChunk, ContextSource, RelevanceScore


class RelevanceScorer:
    """Scores context chunks for relevance to a given task.

    Uses a weighted combination of keyword matching, recency, source authority,
    and task alignment. The semantic similarity component uses token overlap
    as a heuristic — in production this would use embedding-based similarity.

    Usage::

        scorer = RelevanceScorer()
        scored = scorer.score_all(chunks, task)
        ranked = scorer.rank(scored)
    """

    # Authority weights for each context source (0.0–1.0)
    SOURCE_AUTHORITY: Dict[ContextSource, float] = {
        ContextSource.PROJECT_STATE: 0.95,
        ContextSource.PREVIOUS_OUTPUTS: 0.85,
        ContextSource.FILE_CONTENT: 0.80,
        ContextSource.WORKSPACE_CONFIG: 0.75,
        ContextSource.KNOWLEDGE_BASE: 0.70,
        ContextSource.DOCUMENTATION: 0.60,
        ContextSource.SIMILAR_TASKS: 0.50,
        ContextSource.AGENT_MEMORY: 0.40,
    }

    def __init__(
        self,
        keyword_weight: float = 0.25,
        semantic_weight: float = 0.35,
        recency_weight: float = 0.10,
        authority_weight: float = 0.10,
        task_alignment_weight: float = 0.20,
    ) -> None:
        self.keyword_weight = keyword_weight
        self.semantic_weight = semantic_weight
        self.recency_weight = recency_weight
        self.authority_weight = authority_weight
        self.task_alignment_weight = task_alignment_weight

    def score(self, chunk: ContextChunk, task: str) -> RelevanceScore:
        """Compute a composite relevance score for a single chunk.

        Args:
            chunk: The context chunk to score.
            task: The current task description.

        Returns:
            A RelevanceScore with all component scores and aggregated overall score.
        """
        keyword_score = self._keyword_match(chunk, task)
        semantic_score = self._semantic_similarity(chunk, task)
        recency_score = self._recency(chunk)
        authority_score = self._authority(chunk)
        task_alignment = self._task_alignment(chunk, task)

        score = RelevanceScore(
            keyword_match=keyword_score,
            semantic_similarity=semantic_score,
            recency=recency_score,
            authority=authority_score,
            task_alignment=task_alignment,
        )
        score.aggregate()
        return score

    def score_all(
        self, chunks: List[ContextChunk], task: str
    ) -> List[tuple[ContextChunk, RelevanceScore]]:
        """Score all chunks and return (chunk, score) pairs."""
        return [(chunk, self.score(chunk, task)) for chunk in chunks]

    def rank(
        self, scored: List[tuple[ContextChunk, RelevanceScore]]
    ) -> List[tuple[ContextChunk, RelevanceScore]]:
        """Rank scored chunks by overall relevance descending."""
        return sorted(scored, key=lambda x: -x[1].overall)

    def _keyword_match(self, chunk: ContextChunk, task: str) -> float:
        """Compute keyword overlap between chunk content and task."""
        if not task or not chunk.content:
            return 0.0

        task_tokens = set(task.lower().split())
        chunk_tokens = set(chunk.content.lower().split())

        if not task_tokens:
            return 0.0

        overlap = len(task_tokens & chunk_tokens)
        return overlap / len(task_tokens)

    def _semantic_similarity(self, chunk: ContextChunk, task: str) -> float:
        """Heuristic semantic similarity using token overlap with bigrams.

        In production, this would call an embedding model or vector DB.
        """
        if not task or not chunk.content:
            return 0.0

        # Simple bigram overlap as a proxy for semantic similarity
        task_bigrams = set(self._bigrams(task.lower()))
        chunk_bigrams = set(self._bigrams(chunk.content.lower()))

        if not task_bigrams:
            return 0.0

        overlap = len(task_bigrams & chunk_bigrams)
        return overlap / len(task_bigrams)

    def _recency(self, chunk: ContextChunk) -> float:
        """Score based on recency. Recent chunks get higher scores.

        Uses the chunk's score as a proxy when timestamps aren't available.
        """
        # In production, parse retrieved_at and compute days since retrieval.
        # For now, use the chunk's existing score as a recency proxy.
        return chunk.score

    def _authority(self, chunk: ContextChunk) -> float:
        """Score based on source authority."""
        return self.SOURCE_AUTHORITY.get(chunk.source, 0.5)

    def _task_alignment(self, chunk: ContextChunk, task: str) -> float:
        """Score how well the chunk aligns with the current task role.

        Checks if the chunk's content mentions task-relevant concepts.
        """
        if not task or not chunk.content:
            return 0.0

        # Simple alignment: keyword match + structural indicators
        task_lower = task.lower()
        content_lower = chunk.content.lower()

        # Check for structural alignment (both talk about similar domains)
        domain_indicators = {"api", "auth", "database", "frontend", "backend", "test", "deploy", "config"}
        task_domains = {w for w in task_lower.split() if w in domain_indicators}
        content_domains = {w for w in content_lower.split() if w in domain_indicators}

        if not task_domains:
            return 0.5  # Neutral alignment when task has no domain indicators

        domain_overlap = len(task_domains & content_domains)
        return domain_overlap / len(task_domains)

    def _bigrams(self, text: str) -> List[str]:
        """Generate character bigrams from text."""
        return [text[i:i + 2] for i in range(len(text) - 1)]