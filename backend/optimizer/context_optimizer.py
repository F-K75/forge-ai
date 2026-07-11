from __future__ import annotations

from typing import Any, Dict, List

from core.ai_usage import estimate_tokens
from optimizer.models import ContextOptimizationResult


def _message_key(message: Dict[str, Any]) -> tuple:
    return (message.get("role"), str(message.get("content", "")).strip())


def dedupe_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop exact-duplicate (role, content) turns, keeping the first
    occurrence and the message order otherwise intact -- duplicate
    conversation history/instructions are the most common source of wasted
    context tokens in multi-turn agent builds."""
    seen: set = set()
    deduped: List[Dict[str, Any]] = []
    for message in messages:
        key = _message_key(message)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(message)
    return deduped


def truncate_to_budget(messages: List[Dict[str, Any]], max_chars: int) -> List[Dict[str, Any]]:
    """Trim oldest non-system messages first if the combined content exceeds
    `max_chars`, preserving the most recent turns and all system messages
    (system messages carry the agent's instructions and must never be
    silently dropped)."""
    total = sum(len(str(m.get("content", ""))) for m in messages)
    if total <= max_chars:
        return messages

    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]

    kept: List[Dict[str, Any]] = []
    running = sum(len(str(m.get("content", ""))) for m in system)
    for message in reversed(rest):
        size = len(str(message.get("content", "")))
        if running + size > max_chars and kept:
            break
        kept.append(message)
        running += size
    kept.reverse()
    return [*system, *kept]


def strip_unused_metadata(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep only the fields providers actually consume (role, content, name,
    tool_call_id) -- drop internal bookkeeping fields (ids, timestamps,
    UI-only flags) that agents sometimes leave on message dicts."""
    allowed = {"role", "content", "name", "tool_call_id", "tool_calls"}
    return [{k: v for k, v in message.items() if k in allowed} for message in messages]


def optimize_context(
    messages: List[Dict[str, Any]], *, max_chars: int = 60_000
) -> tuple[List[Dict[str, Any]], ContextOptimizationResult]:
    """Remove duplicate context/history, unused metadata, and respect a
    configurable char budget while preserving prompt meaning (no content
    rewriting -- only removal of exact repeats and stale metadata)."""
    original_text = "\n".join(str(m.get("content", "")) for m in messages)
    original_tokens = estimate_tokens(original_text)

    optimized = strip_unused_metadata(messages)
    optimized = dedupe_messages(optimized)
    optimized = truncate_to_budget(optimized, max_chars)

    optimized_text = "\n".join(str(m.get("content", "")) for m in optimized)
    optimized_tokens = estimate_tokens(optimized_text)

    ratio = (optimized_tokens / original_tokens) if original_tokens else 1.0
    result = ContextOptimizationResult(
        original_tokens=original_tokens,
        optimized_tokens=optimized_tokens,
        tokens_saved=max(0, original_tokens - optimized_tokens),
        compression_ratio=round(ratio, 4),
    )
    return optimized, result
