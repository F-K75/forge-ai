from __future__ import annotations

from typing import Optional

from prompt_builder.context_selector import ContextSelector
from prompt_builder.models import (
    PromptContext,
    PromptMetadata,
    PromptResult,
    compute_prompt_hash,
    now_ms,
)
from prompt_builder.plugins import run_post_build, run_pre_build
from prompt_builder.registry import TemplateRegistry, get_template_registry
from prompt_builder.token_estimator import estimate_tokens
from prompt_builder.validator import validate


class PromptValidationError(ValueError):
    def __init__(self, message: str, errors):
        super().__init__(message)
        self.errors = errors


class PromptBuilder:
    """Provider-agnostic prompt generation pipeline: load template -> load
    project state/task (already on context) -> select relevant context ->
    render -> validate -> return PromptResult with metadata. Pure in-memory
    work (no I/O, no LLM calls), keeping build() well under 20ms."""

    def __init__(self, registry: Optional[TemplateRegistry] = None):
        self.registry = registry or get_template_registry()
        self.context_selector = ContextSelector()

    def build(self, context: PromptContext, *, role_key: Optional[str] = None) -> PromptResult:
        start = now_ms()

        context = run_pre_build(context)

        template = self.registry.get(role_key or context.agent_role, context.template_version)

        selected = self.context_selector.select(context)

        validation = validate(selected, template)
        hard_errors = [e for e in validation.errors if e.severity == "error"]
        if hard_errors:
            raise PromptValidationError(
                f"Prompt validation failed for role={context.agent_role!r}: "
                f"{'; '.join(e.message for e in hard_errors)}",
                validation.errors,
            )

        prompt = template.render(selected)
        prompt = run_post_build(prompt)

        build_time_ms = now_ms() - start
        metadata = PromptMetadata(
            agent=context.agent_role,
            template_version=template.version,
            estimated_tokens=estimate_tokens(prompt),
            context_sources=self.context_selector.context_sources(selected),
            build_time_ms=build_time_ms,
            prompt_hash=compute_prompt_hash(prompt),
        )
        return PromptResult(prompt=prompt, metadata=metadata)


_builder: Optional[PromptBuilder] = None


def get_prompt_builder() -> PromptBuilder:
    global _builder
    if _builder is None:
        _builder = PromptBuilder()
    return _builder


def build_prompt(context: PromptContext, *, role_key: Optional[str] = None) -> PromptResult:
    return get_prompt_builder().build(context, role_key=role_key)
