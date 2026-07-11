from __future__ import annotations

from typing import List

from prompt_builder.models import PromptContext

# Which project_state.extra / previous_outputs keys matter per role. Roles
# not listed pass everything through unfiltered (context.relevant_files and
# previous_outputs are already caller-curated in the common case).
_ROLE_RELEVANT_EXTRA_KEYS: dict[str, List[str]] = {
    "security": ["tech_stack", "dependencies"],
    "devops": ["tech_stack", "dependencies"],
    "qa": ["tech_stack"],
}


class ContextSelector:
    """Filters a PromptContext down to what a given role actually needs,
    so templates never render sections stuffed with irrelevant state."""

    def select(self, context: PromptContext) -> PromptContext:
        allowed_keys = _ROLE_RELEVANT_EXTRA_KEYS.get(context.agent_role)
        if allowed_keys is None:
            return context

        filtered_extra = {k: v for k, v in context.project_state.extra.items() if k in allowed_keys}
        new_state = context.project_state.model_copy(update={"extra": filtered_extra})
        return context.model_copy(update={"project_state": new_state})

    def context_sources(self, context: PromptContext) -> List[str]:
        sources: List[str] = []
        if context.project_state.project_name or context.project_state.tech_stack:
            sources.append("project_state")
        if context.relevant_files:
            sources.append("relevant_files")
        if context.previous_outputs:
            sources.extend(f"previous_output:{role}" for role in context.previous_outputs)
        if context.user_request:
            sources.append("user_request")
        return sources
