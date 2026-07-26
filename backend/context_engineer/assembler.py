"""Context assembly: combine retrieved, scored, and windowed context chunks
into a PromptContext ready for the prompt builder pipeline.

The assembler is the final stage in the context engineering pipeline —
it takes retrieval results, scoring, and window management and produces
a fully populated PromptContext that the prompt_builder can render.
"""

from __future__ import annotations

from typing import Dict, Optional

from prompt_builder.models import PromptContext, ProjectStateSlice

from context_engineer.models import (
    AssemblyPlan,
    ContextSource,
    ContextWindow,
)
from context_engineer.retriever import ContextRetriever
from context_engineer.scorer import RelevanceScorer
from context_engineer.window_manager import WindowManager


class ContextAssembler:
    """Assembles a PromptContext from multiple context sources.

    Pipeline: retrieve -> score -> window -> assemble.

    Usage::

        assembler = ContextAssembler()
        context = await assembler.assemble(
            role="developer",
            task="Build a todo app with auth",
            plan=AssemblyPlan(role="developer"),
        )
        result = prompt_builder.build(context)
    """

    def __init__(
        self,
        retriever: Optional[ContextRetriever] = None,
        scorer: Optional[RelevanceScorer] = None,
        window_manager: Optional[WindowManager] = None,
    ) -> None:
        self.retriever = retriever or ContextRetriever()
        self.scorer = scorer or RelevanceScorer()
        self.window_manager = window_manager or WindowManager()

    async def assemble(
        self,
        role: str,
        task: str,
        plan: Optional[AssemblyPlan] = None,
        user_request: str = "",
        previous_outputs: Optional[Dict[str, str]] = None,
        extra_state: Optional[ProjectStateSlice] = None,
    ) -> PromptContext:
        """Assemble a complete PromptContext from all available sources.

        Runs the full pipeline: retrieves from all plan sources, scores for
        relevance, packs into a token-budgeted window, then assembles into
        a PromptContext ready for the prompt builder.

        Args:
            role: The agent role requesting context.
            task: The current task description.
            plan: Assembly plan defining sources, strategy, and budget.
            user_request: Raw user request text.
            previous_outputs: Dict of previous agent outputs (role -> output).
            extra_state: Additional project state to include.

        Returns:
            A fully populated PromptContext ready for prompt_builder.build().
        """
        cfg = plan or AssemblyPlan(plan_id=f"default-{role}", role=role)

        # 1. Retrieve from all configured sources
        retrieval = await self.retriever.retrieve(
            role=role,
            task=task,
            sources=cfg.sources[:cfg.max_sources],
            max_chunks_per_source=5,
        )

        # 2. Score for relevance
        scored = self.scorer.score_all(retrieval.chunks, task)
        ranked = self.scorer.rank(scored)

        # 3. Pack into token-budgeted window
        chunks = [chunk for chunk, _ in ranked]
        window = self.window_manager.pack_by_priority(
            chunks=chunks,
            budget=cfg.token_budget,
        )

        # 4. Assemble into PromptContext
        context = self._build_context(
            role=role,
            task=task,
            window=window,
            user_request=user_request,
            previous_outputs=previous_outputs or {},
            extra_state=extra_state,
        )

        return context

    def _build_context(
        self,
        role: str,
        task: str,
        window: ContextWindow,
        user_request: str,
        previous_outputs: Dict[str, str],
        extra_state: Optional[ProjectStateSlice],
    ) -> PromptContext:
        """Build a PromptContext from window contents and metadata."""
        # Extract relevant files from file_content chunks
        relevant_files = [
            chunk.source_path or chunk.chunk_id
            for chunk in window.chunks
            if chunk.source == ContextSource.FILE_CONTENT
        ]

        # Extract workspace config from workspace_config chunks
        workspace_config: Dict[str, object] = {}
        for chunk in window.chunks:
            if chunk.source == ContextSource.WORKSPACE_CONFIG:
                workspace_config[chunk.chunk_id] = chunk.content

        # Build project state from project_state chunks
        state = extra_state or ProjectStateSlice()
        proj_chunks = [
            c for c in window.chunks if c.source == ContextSource.PROJECT_STATE
        ]
        if proj_chunks:
            # Merge project state chunks into the extra dict
            for c in proj_chunks:
                state.extra[f"ctx_{c.chunk_id}"] = c.content

        # Include knowledge base and similar task content in extra state
        kb_chunks = [
            c for c in window.chunks
            if c.source in (ContextSource.KNOWLEDGE_BASE, ContextSource.SIMILAR_TASKS,
                            ContextSource.DOCUMENTATION, ContextSource.AGENT_MEMORY)
        ]
        for c in kb_chunks:
            state.extra[f"kb_{c.chunk_id}"] = c.content

        # Include the full window stats for observability
        state.extra["context_window_stats"] = str(self.window_manager.window_stats(window))

        return PromptContext(
            agent_role=role,
            task=task,
            project_state=state,
            relevant_files=relevant_files,
            previous_outputs=previous_outputs,
            user_request=user_request,
            workspace_config=workspace_config,
        )