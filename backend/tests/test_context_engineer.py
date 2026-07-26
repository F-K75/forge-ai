"""Tests for the context engineering module."""

from context_engineer.models import (
    ContextChunk,
    ContextSource,
    ContextWindow,
    RelevanceScore,
    TokenBudget,
)
from context_engineer.scorer import RelevanceScorer
from context_engineer.window_manager import WindowManager


class TestRelevanceScorer:
    def test_score_returns_relevance_score(self):
        scorer = RelevanceScorer()
        chunk = ContextChunk(
            chunk_id="test1",
            source=ContextSource.PROJECT_STATE,
            content="Building a todo app with FastAPI and React",
            priority=10,
            score=0.9,
        )
        score = scorer.score(chunk, "Build a todo app with React frontend")
        assert isinstance(score, RelevanceScore)
        assert 0.0 <= score.overall <= 1.0

    def test_score_all_and_rank(self):
        scorer = RelevanceScorer()
        chunks = [
            ContextChunk(chunk_id="c1", source=ContextSource.PROJECT_STATE, content="React frontend app", priority=5, score=0.8),
            ContextChunk(chunk_id="c2", source=ContextSource.FILE_CONTENT, content="Django backend API", priority=3, score=0.5),
            ContextChunk(chunk_id="c3", source=ContextSource.KNOWLEDGE_BASE, content="React hooks best practices", priority=4, score=0.6),
        ]
        scored = scorer.score_all(chunks, "Build a React app")
        ranked = scorer.rank(scored)
        assert len(ranked) == 3
        # First should be most relevant
        assert ranked[0][1].overall >= ranked[-1][1].overall

    def test_keyword_match(self):
        scorer = RelevanceScorer()
        chunk = ContextChunk(
            chunk_id="t1", source=ContextSource.FILE_CONTENT,
            content="JWT authentication middleware for FastAPI",
            priority=1, score=0.5,
        )
        score = scorer.score(chunk, "authentication with JWT")
        assert score.keyword_match > 0

    def test_authority_weights(self):
        scorer = RelevanceScorer()
        proj = ContextChunk(chunk_id="p1", source=ContextSource.PROJECT_STATE, content="x", priority=1, score=0.5)
        mem = ContextChunk(chunk_id="m1", source=ContextSource.AGENT_MEMORY, content="x", priority=1, score=0.5)
        proj_score = scorer.score(proj, "test")
        mem_score = scorer.score(mem, "test")
        assert proj_score.authority > mem_score.authority


class TestWindowManager:
    def test_pack_by_priority(self):
        wm = WindowManager()
        budget = TokenBudget(context_max=1000)
        chunks = [
            ContextChunk(chunk_id="h1", source=ContextSource.PROJECT_STATE, content="High priority content", priority=10, score=0.9, token_count=200),
            ContextChunk(chunk_id="m1", source=ContextSource.FILE_CONTENT, content="Medium priority", priority=5, score=0.6, token_count=300),
            ContextChunk(chunk_id="l1", source=ContextSource.AGENT_MEMORY, content="Low priority", priority=1, score=0.2, token_count=400),
        ]
        window = wm.pack_by_priority(chunks, budget)
        assert len(window.chunks) > 0
        assert window.total_tokens <= budget.available

    def test_truncate_to_budget(self):
        wm = WindowManager()
        budget = TokenBudget(context_max=500)
        chunks = [
            ContextChunk(chunk_id="c1", source=ContextSource.PROJECT_STATE, content="x", priority=10, score=0.9, token_count=300),
            ContextChunk(chunk_id="c2", source=ContextSource.FILE_CONTENT, content="y", priority=5, score=0.6, token_count=300),
        ]
        window = wm.pack_by_priority(chunks, budget)
        truncated = wm.truncate_to_budget(window, max_tokens=400)
        assert truncated.total_tokens <= 400

    def test_slide_preserves_high_priority(self):
        wm = WindowManager()
        budget = TokenBudget(context_max=2000)
        existing = [
            ContextChunk(chunk_id="e1", source=ContextSource.PROJECT_STATE, content="Important", priority=10, score=0.9, token_count=200),
            ContextChunk(chunk_id="e2", source=ContextSource.FILE_CONTENT, content="Less important", priority=2, score=0.3, token_count=200),
        ]
        window = wm.pack_by_priority(existing, budget)
        new_chunks = [
            ContextChunk(chunk_id="n1", source=ContextSource.KNOWLEDGE_BASE, content="New info", priority=8, score=0.8, token_count=200),
        ]
        slided = wm.slide(window, new_chunks, preserve_priority_threshold=5)
        # High-priority existing chunk should be preserved
        chunk_ids = [c.chunk_id for c in slided.chunks]
        assert "e1" in chunk_ids

    def test_window_stats(self):
        wm = WindowManager()
        budget = TokenBudget(context_max=1000)
        chunks = [
            ContextChunk(chunk_id="s1", source=ContextSource.PROJECT_STATE, content="stats test", priority=5, score=0.8, token_count=100),
        ]
        window = wm.pack_by_priority(chunks, budget)
        stats = wm.window_stats(window)
        assert stats["total_chunks"] == 1
        assert stats["total_tokens"] > 0
        assert "sources" in stats


class TestContextWindow:
    def test_add_chunk_within_budget(self):
        budget = TokenBudget(context_max=1000)
        window = ContextWindow(budget=budget)
        chunk = ContextChunk(chunk_id="c1", source=ContextSource.PROJECT_STATE, content="test", token_count=200)
        assert window.add_chunk(chunk) is True
        assert window.total_tokens == 200

    def test_add_chunk_exceeds_budget(self):
        budget = TokenBudget(context_max=100)
        window = ContextWindow(budget=budget)
        chunk = ContextChunk(chunk_id="c1", source=ContextSource.PROJECT_STATE, content="x" * 500, token_count=500)
        assert window.add_chunk(chunk) is False

    def test_usage_pct(self):
        budget = TokenBudget(context_max=1000)
        window = ContextWindow(budget=budget)
        chunk = ContextChunk(chunk_id="c1", source=ContextSource.PROJECT_STATE, content="test", token_count=250)
        window.add_chunk(chunk)
        assert window.usage_pct() == 25.0

    def test_sort_by_priority(self):
        window = ContextWindow()
        window.add_chunk(ContextChunk(chunk_id="low", source=ContextSource.FILE_CONTENT, content="low", priority=1, score=0.3, token_count=10))
        window.add_chunk(ContextChunk(chunk_id="high", source=ContextSource.PROJECT_STATE, content="high", priority=10, score=0.9, token_count=10))
        window.sort_by_priority()
        assert window.chunks[0].chunk_id == "high"