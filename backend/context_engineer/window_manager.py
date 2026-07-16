"""Context window management: prioritize, truncate, compress, and slide
context windows within token budgets.

Manages the lifecycle of a context window — adding chunks by priority,
handling overflow via truncation or summarization, and sliding the window
for multi-turn conversations.
"""

from __future__ import annotations

from typing import List, Optional

from context_engineer.models import (
    ContextChunk,
    ContextSource,
    ContextWindow,
    TokenBudget,
)


class WindowManager:
    """Manages a context window within a token budget.

    Handles chunk prioritization, overflow strategies, and window sliding
    for multi-turn interactions.

    Usage::

        wm = WindowManager()
        window = ContextWindow(budget=TokenBudget(context_max=4000))

        # Try adding chunks in priority order
        for chunk in retrievet_result.chunks:
            if not wm.add_if_fits(window, chunk):
                break

        # Or let the manager pack them optimally
        packed = wm.pack_by_priority(retrieval_result.chunks, window.budget)
    """

    def add_if_fits(self, window: ContextWindow, chunk: ContextChunk) -> bool:
        """Add a chunk to the window if it fits within the remaining budget.

        Returns True if the chunk was added, False otherwise.
        """
        return window.add_chunk(chunk)

    def pack_by_priority(
        self,
        chunks: List[ContextChunk],
        budget: TokenBudget,
        min_chunk_score: float = 0.1,
    ) -> ContextWindow:
        """Pack as many high-priority chunks as possible into the budget.

        Sorts chunks by priority (descending), then score (descending),
        and fills the window until no more chunks fit.

        Args:
            chunks: All candidate chunks.
            budget: Token budget for the window.
            min_chunk_score: Minimum score threshold for inclusion.

        Returns:
            A ContextWindow containing the best-fit chunks.
        """
        window = ContextWindow(budget=budget)

        # Filter low-score chunks
        candidates = [c for c in chunks if c.score >= min_chunk_score]

        # Sort by priority descending, then score descending
        sorted_chunks = sorted(candidates, key=lambda c: (-c.priority, -c.score, c.chunk_id))

        for chunk in sorted_chunks:
            if not window.add_chunk(chunk):
                break  # Window is full

        return window

    def truncate_to_budget(
        self, window: ContextWindow, max_tokens: Optional[int] = None
    ) -> ContextWindow:
        """Truncate the window to fit within a token budget.

        Removes lowest-priority chunks until the window fits the budget.
        """
        target = max_tokens or window.budget.available

        if window.total_tokens <= target:
            return window

        # Sort by priority ascending (worst first) so we remove lowest first
        sorted_chunks = sorted(window.chunks, key=lambda c: (c.priority, -c.score))

        new_window = ContextWindow(budget=window.budget)
        for chunk in sorted_chunks:
            if new_window.total_tokens + chunk.token_count > target:
                continue
            new_window.add_chunk(chunk)

        return new_window

    def slide(
        self,
        window: ContextWindow,
        new_chunks: List[ContextChunk],
        preserve_priority_threshold: int = 5,
    ) -> ContextWindow:
        """Slide the window to make room for new chunks while preserving
        high-priority context.

        Keeps all chunks with priority >= preserve_priority_threshold,
        then adds new chunks in priority order.

        Args:
            window: The current context window.
            new_chunks: New chunks to add.
            preserve_priority_threshold: Keep all chunks at or above this priority.

        Returns:
            A new ContextWindow with the slided contents.
        """
        budget = window.budget

        # Preserve high-priority existing chunks
        preserved = [c for c in window.chunks if c.priority >= preserve_priority_threshold]

        # Combine preserved with new, sort by priority
        all_candidates = preserved + new_chunks
        sorted_candidates = sorted(all_candidates, key=lambda c: (-c.priority, -c.score, c.chunk_id))

        return self.pack_by_priority(sorted_candidates, budget)

    def estimate_compression(self, window: ContextWindow) -> int:
        """Estimate how many tokens could be saved by compressing the window
        (e.g., removing low-priority chunks or summarizing)."""
        low_priority = [c for c in window.chunks if c.priority < 5]
        return sum(c.token_count for c in low_priority)

    def window_stats(self, window: ContextWindow) -> dict:
        """Return statistics about the current window."""
        return {
            "total_chunks": len(window.chunks),
            "total_tokens": window.total_tokens,
            "budget_available": window.budget.available,
            "usage_pct": window.usage_pct(),
            "estimated_compressible": self.estimate_compression(window),
            "sources": list(set(c.source.value for c in window.chunks)),
            "avg_score": (
                sum(c.score for c in window.chunks) / len(window.chunks)
                if window.chunks else 0.0
            ),
            "overflow_handling": window.overflow_handling,
        }