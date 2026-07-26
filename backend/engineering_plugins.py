"""Plugin registration for the four engineering disciplines.

Wires prompt_engineer, context_engineer, harness, and loop_engineer into
the prompt_builder plugin system and the agent lifecycle so they run
automatically without requiring changes to individual agent code.

Plugins registered:
  PRE_BUILD:
    - few_shot_injection:   Injects relevant few-shot examples into context
    - context_budget_tag:   Tags context with token budget metadata

  POST_BUILD:
    - version_tracker:      Records prompt version for traceability
    - metrics_annotation:   Appends quality metrics as invisible annotations
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from prompt_builder.plugins import PluginHook, register_plugin
from prompt_builder.models import PromptContext

from prompt_engineer import FewShotManager, VersionManager

logger = logging.getLogger(__name__)

# Shared lazy instances
_few_shot_manager: Optional[FewShotManager] = None
_version_manager: Optional[VersionManager] = None


def _get_fsm() -> FewShotManager:
    global _few_shot_manager
    if _few_shot_manager is None:
        _few_shot_manager = FewShotManager()
    return _few_shot_manager


def _get_vm() -> VersionManager:
    global _version_manager
    if _version_manager is None:
        _version_manager = VersionManager()
    return _version_manager


# ---------------------------------------------------------------------------
# PRE_BUILD plugins (transform PromptContext before template rendering)
# ---------------------------------------------------------------------------

def few_shot_injection(context: PromptContext) -> PromptContext:
    """Injects relevant few-shot examples into the task/extra context.

    Registered as a PRE_BUILD plugin so examples are available during
    template rendering. Runs after context_selector.select().
    """
    try:
        fsm = _get_fsm()
        examples = fsm.select(
            role=context.agent_role,
            task=context.task,
            strategy="semantic",
            max_examples=2,
        )
        if examples:
            formatted = fsm.format_examples(examples, include_rationale=False)
            # Append examples to the user_request field so templates can
            # optionally render them
            if formatted:
                context.user_request += f"\n\n{formatted}"
    except Exception as exc:
        logger.debug("few_shot_injection plugin skipped: %s", exc)
    return context


def context_budget_tag(context: PromptContext) -> PromptContext:
    """Tags the context with token budget metadata for observability.

    Adds estimated token counts to project_state.extra so downstream
    tools can track context window utilization.
    """
    try:
        # Estimate token usage from current context
        task_tokens = len(context.task) // 4 + 1
        files_tokens = sum(len(f) // 4 + 1 for f in context.relevant_files)
        prev_tokens = sum(len(v) // 4 + 1 for v in context.previous_outputs.values())
        request_tokens = len(context.user_request) // 4 + 1

        context.project_state.extra["_plugin_context_stats"] = json.dumps({
            "task_tokens": task_tokens,
            "files_tokens": files_tokens,
            "previous_outputs_tokens": prev_tokens,
            "user_request_tokens": request_tokens,
            "total_estimated": task_tokens + files_tokens + prev_tokens + request_tokens,
        })
    except Exception as exc:
        logger.debug("context_budget_tag plugin skipped: %s", exc)
    return context


# ---------------------------------------------------------------------------
# POST_BUILD plugins (transform the rendered prompt string)
# ---------------------------------------------------------------------------

def version_tracker(prompt: str) -> str:
    """Records prompt version metadata into the prompt as a comment.

    Registered as POST_BUILD so it captures the final rendered output.
    """
    try:
        # The version_manager.record() call requires a PromptTemplate, which
        # isn't available in the POST_BUILD plugin context. Version tracking
        # is handled at the agent level in BaseAgent._resolve_system_prompt.
        # This plugin adds a lightweight trace comment instead.
        import hashlib
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()[:8]
        # Append an invisible HTML comment with version metadata
        prompt += f"\n<!-- prompt_hash={prompt_hash} -->\n"
    except Exception:
        pass
    return prompt


def metrics_annotation(prompt: str) -> str:
    """Appends quality metric annotations to the prompt for observability.

    This enables downstream harness evaluation to trace which prompt
    version and configuration produced the output.
    """
    try:
        token_estimate = len(prompt) // 4 + 1
        # Simple annotation — in production this would carry richer data
        prompt += f"\n<!-- _forge_metrics: tokens_est={token_estimate} -->\n"
    except Exception:
        pass
    return prompt


# ---------------------------------------------------------------------------
# Registration entrypoint — called once at app startup
# ---------------------------------------------------------------------------

def register_engineering_plugins() -> None:
    """Register all engineering plugins into the prompt_builder plugin system.

    Call this during application startup (main.py lifespan) to enable
    automatic engineering capabilities across all agents.

    Safe to call multiple times — subsequent calls are idempotent.
    """
    register_plugin(PluginHook.PRE_BUILD, few_shot_injection)
    register_plugin(PluginHook.PRE_BUILD, context_budget_tag)
    register_plugin(PluginHook.POST_BUILD, version_tracker)
    register_plugin(PluginHook.POST_BUILD, metrics_annotation)
    logger.info(
        "Engineering plugins registered: few_shot_injection, context_budget_tag, "
        "version_tracker, metrics_annotation"
    )


def unregister_engineering_plugins() -> None:
    """Remove all engineering plugins. Useful for testing isolation."""
    from prompt_builder.plugins import clear_plugins
    clear_plugins()
    logger.info("Engineering plugins unregistered")