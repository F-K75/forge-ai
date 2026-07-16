"""Context Engineering: semantic retrieval, window management, relevance
scoring, and multi-source context assembly.

Extends the prompt_builder's ContextSelector with advanced context sourcing —
project files, documentation, similar past tasks, and knowledge bases —
managed within a token budget for efficient LLM usage.
"""

from context_engineer.models import (
    ContextSource,
    ContextChunk,
    RelevanceScore,
    ContextWindow,
    TokenBudget,
    RetrievalResult,
    AssemblyPlan,
)
from context_engineer.retriever import ContextRetriever
from context_engineer.window_manager import WindowManager
from context_engineer.scorer import RelevanceScorer
from context_engineer.assembler import ContextAssembler

__all__ = [
    "ContextSource",
    "ContextChunk",
    "RelevanceScore",
    "ContextWindow",
    "TokenBudget",
    "RetrievalResult",
    "AssemblyPlan",
    "ContextRetriever",
    "WindowManager",
    "RelevanceScorer",
    "ContextAssembler",
]