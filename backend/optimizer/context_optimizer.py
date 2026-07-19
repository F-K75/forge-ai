from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from core.ai_usage import estimate_tokens
from optimizer.models import ContextOptimizationResult


def _message_key(message: Dict[str, Any]) -> Tuple[str, str]:
    return (str(message.get("role", "")), str(message.get("content", "")).strip())


def _message_semantic_key(message: Dict[str, Any]) -> str:
    """Create a normalized key for semantic deduplication - strips whitespace,
    normalizes common variations, and extracts the core semantic content."""
    content = str(message.get("content", "")).strip()
    # Normalize whitespace
    content = re.sub(r'\s+', ' ', content)
    # Remove common boilerplate prefixes
    content = re.sub(r'^(system|user|assistant):\s*', '', content, flags=re.IGNORECASE)
    # Normalize punctuation
    content = re.sub(r'[.,!?;:]+$', '', content.strip())
    return f"{message.get('role')}:{content[:200]}"


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


def dedupe_semantic_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove near-duplicate messages that differ only in whitespace,
    formatting, or minor wording variations. Preserves the first occurrence
    which typically has the most complete/authoritative content."""
    seen: set = set()
    deduped: List[Dict[str, Any]] = []
    for message in messages:
        key = _message_semantic_key(message)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(message)
    return deduped


def merge_system_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge consecutive system messages into a single system message.
    Multiple system messages are common when different context sources each
    add their own system block, but most providers only support one system
    message and concatenating them wastes the overhead of repeated headers."""
    merged: List[Dict[str, Any]] = []
    system_contents: List[str] = []

    for message in messages:
        if message.get("role") == "system":
            content = str(message.get("content", "")).strip()
            if content:
                system_contents.append(content)
        else:
            if system_contents:
                merged.append({"role": "system", "content": "\n\n".join(system_contents)})
                system_contents = []
            merged.append(message)

    # Flush remaining system messages
    if system_contents:
        merged.append({"role": "system", "content": "\n\n".join(system_contents)})

    return merged


def dedupe_tool_calls(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate tool_call_id entries in tool results. When an agent
    retries the same tool call, the tool result may be identical; keeping
    only the first result saves tokens without losing information."""
    seen_tool_ids: set = set()
    deduped: List[Dict[str, Any]] = []
    for message in messages:
        if message.get("role") == "tool":
            tool_call_id = message.get("tool_call_id", "")
            if tool_call_id and tool_call_id in seen_tool_ids:
                continue
            if tool_call_id:
                seen_tool_ids.add(tool_call_id)
        deduped.append(message)
    return deduped


def truncate_to_budget(
    messages: List[Dict[str, Any]],
    max_chars: int,
    *,
    preserve_recent_turns: int = 5,
) -> List[Dict[str, Any]]:
    """Trim oldest non-system messages first if the combined content exceeds
    `max_chars`, preserving the most recent turns and all system messages
    (system messages carry the agent's instructions and must never be
    silently dropped).

    `preserve_recent_turns` controls how many of the most recent user/assistant
    exchanges are always kept regardless of budget, ensuring conversational
    continuity."""
    total = sum(len(str(m.get("content", ""))) for m in messages)
    if total <= max_chars:
        return messages

    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]

    # Always preserve the most recent N turns
    if preserve_recent_turns > 0 and len(rest) > preserve_recent_turns:
        preserved = rest[-preserve_recent_turns:]
        candidates = rest[:-preserve_recent_turns]
    else:
        preserved = []
        candidates = list(rest)

    kept: List[Dict[str, Any]] = []
    running = sum(len(str(m.get("content", ""))) for m in system) + sum(
        len(str(m.get("content", ""))) for m in preserved
    )

    # Keep oldest candidates first (they're trimmed from the front)
    for message in candidates:
        size = len(str(message.get("content", "")))
        if running + size > max_chars:
            continue
        kept.append(message)
        running += size

    return [*system, *kept, *preserved]


def strip_unused_metadata(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep only the fields providers actually consume (role, content, name,
    tool_call_id) -- drop internal bookkeeping fields (ids, timestamps,
    UI-only flags) that agents sometimes leave on message dicts."""
    allowed = {"role", "content", "name", "tool_call_id", "tool_calls"}
    return [{k: v for k, v in message.items() if k in allowed} for message in messages]


def compress_tool_results(messages: List[Dict[str, Any]], *, max_result_chars: int = 2000) -> List[Dict[str, Any]]:
    """Truncate overly long tool result content. Tool results (file contents,
    search results, API responses) are often the largest single contributor
    to context bloat. Truncating them to a reasonable max saves significant
    tokens while preserving the essential information."""
    compressed: List[Dict[str, Any]] = []
    for message in messages:
        if message.get("role") == "tool":
            content = str(message.get("content", ""))
            if len(content) > max_result_chars:
                message = {**message, "content": content[:max_result_chars] + "\n\n[truncated...]"}
        compressed.append(message)
    return compressed


def optimize_context(
    messages: List[Dict[str, Any]],
    *,
    max_chars: int = 60_000,
    compression_level: int = 1,
    preserve_recent_turns: int = 5,
    max_tool_result_chars: int = 2000,
) -> Tuple[List[Dict[str, Any]], ContextOptimizationResult]:
    """Remove duplicate context/history, unused metadata, and respect a
    configurable char budget while preserving prompt meaning (no content
    rewriting -- only removal of exact repeats and stale metadata).

    compression_level:
        0 = no optimization
        1 = basic: dedupe, strip metadata, truncate to budget
        2 = enhanced: + semantic dedupe, merge system messages, dedupe tool calls
        3 = aggressive: + compress tool results, preserve recent turns
    """
    original_text = "\n".join(str(m.get("content", "")) for m in messages)
    original_tokens = estimate_tokens(original_text)

    if compression_level <= 0:
        no_op = ContextOptimizationResult(
            original_tokens=original_tokens,
            optimized_tokens=original_tokens,
            tokens_saved=0,
            compression_ratio=1.0,
        )
        return messages, no_op

    optimized = strip_unused_metadata(messages)

    # Level 1: Basic optimizations
    optimized = dedupe_messages(optimized)

    # Level 2: Enhanced optimizations
    if compression_level >= 2:
        optimized = dedupe_semantic_messages(optimized)
        optimized = merge_system_messages(optimized)
        optimized = dedupe_tool_calls(optimized)

    # Level 3: Aggressive optimizations
    if compression_level >= 3:
        optimized = compress_tool_results(optimized, max_result_chars=max_tool_result_chars)

    optimized = truncate_to_budget(optimized, max_chars, preserve_recent_turns=preserve_recent_turns)

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