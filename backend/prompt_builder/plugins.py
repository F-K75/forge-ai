from __future__ import annotations

from enum import Enum
from typing import Callable, Dict, List, Optional

from prompt_builder.models import PromptContext


class PluginHook(str, Enum):
    PRE_BUILD = "pre_build"
    POST_BUILD = "post_build"


PreBuildPlugin = Callable[[PromptContext], PromptContext]
PostBuildPlugin = Callable[[str], str]

_plugins: Dict[PluginHook, List[Callable]] = {hook: [] for hook in PluginHook}


def register_plugin(hook: PluginHook, fn: Callable) -> None:
    """Extension point for future capabilities (compression, semantic
    retrieval, caching, model routing, budget/guardrail checks) without
    touching PromptBuilder itself. No plugins are registered by default."""
    _plugins[hook].append(fn)


def clear_plugins(hook: Optional[PluginHook] = None) -> None:
    if hook is None:
        for h in _plugins:
            _plugins[h].clear()
    else:
        _plugins[hook].clear()


def run_pre_build(context: PromptContext) -> PromptContext:
    for fn in _plugins[PluginHook.PRE_BUILD]:
        context = fn(context)
    return context


def run_post_build(prompt: str) -> str:
    for fn in _plugins[PluginHook.POST_BUILD]:
        prompt = fn(prompt)
    return prompt
