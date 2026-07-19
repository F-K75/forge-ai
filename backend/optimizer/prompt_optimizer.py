from __future__ import annotations

import re
from typing import List, Pattern, Tuple

_MULTI_BLANK_RE: Pattern[str] = re.compile(r"\n{3,}")
_TRAILING_WS_RE: Pattern[str] = re.compile(r"[ \t]+\n")
_MULTI_SPACE_RE: Pattern[str] = re.compile(r"[ \t]{2,}")

# Patterns for removing verbose/lengthy boilerplate
_VERBOSE_PATTERNS: List[Tuple[Pattern[str], str]] = [
    # Remove "Important:", "Note:", "Warning:" type prefixes - LLMs infer importance
    (re.compile(r"^\s*(Important|Note|Warning|Caution|Info):\s*", re.MULTILINE | re.IGNORECASE), ""),
    # Remove redundant "Please" and "Kindly" - adds no semantic value
    (re.compile(r"\b(please|kindly)\s+", re.IGNORECASE), ""),
    # Collapse "do not" -> "don't", "cannot" -> "can't" etc (common contractions)
    (re.compile(r"\bdo not\b", re.IGNORECASE), "don't"),
    (re.compile(r"\bcannot\b", re.IGNORECASE), "can't"),
    (re.compile(r"\bwill not\b", re.IGNORECASE), "won't"),
    (re.compile(r"\bshould not\b", re.IGNORECASE), "shouldn't"),
    (re.compile(r"\bwould not\b", re.IGNORECASE), "wouldn't"),
    (re.compile(r"\bcould not\b", re.IGNORECASE), "couldn't"),
    (re.compile(r"\bis not\b", re.IGNORECASE), "isn't"),
    (re.compile(r"\bare not\b", re.IGNORECASE), "aren't"),
    (re.compile(r"\bhas not\b", re.IGNORECASE), "hasn't"),
    (re.compile(r"\bhave not\b", re.IGNORECASE), "haven't"),
    (re.compile(r"\bdid not\b", re.IGNORECASE), "didn't"),
    (re.compile(r"\bdoes not\b", re.IGNORECASE), "doesn't"),
    (re.compile(r"\bit is\b", re.IGNORECASE), "it's"),
    (re.compile(r"\bthat is\b", re.IGNORECASE), "that's"),
    (re.compile(r"\bthere is\b", re.IGNORECASE), "there's"),
    (re.compile(r"\bhere is\b", re.IGNORECASE), "here's"),
    (re.compile(r"\bwhat is\b", re.IGNORECASE), "what's"),
    (re.compile(r"\bhow is\b", re.IGNORECASE), "how's"),
    (re.compile(r"\bwho is\b", re.IGNORECASE), "who's"),
    (re.compile(r"\bwhen is\b", re.IGNORECASE), "when's"),
    (re.compile(r"\bwhere is\b", re.IGNORECASE), "where's"),
    (re.compile(r"\bwhy is\b", re.IGNORECASE), "why's"),
    (re.compile(r"\bI am\b", re.IGNORECASE), "I'm"),
    (re.compile(r"\byou are\b", re.IGNORECASE), "you're"),
    (re.compile(r"\bwe are\b", re.IGNORECASE), "we're"),
    (re.compile(r"\bthey are\b", re.IGNORECASE), "they're"),
]

# Aggressive patterns for compression_level >= 3
_AGGRESSIVE_PATTERNS: List[Tuple[Pattern[str], str]] = [
    # Remove adjectives/adverbs that add no semantic value in instruction context
    (re.compile(r"\b(very|really|quite|extremely|highly|absolutely|strongly|significantly|substantially|dramatically|thoroughly|completely|fully|carefully|importantly|critically|essentially|basically|simply|just|merely|truly|genuinely|seriously|definitely|certainly|absolutely|undoubtedly|indisputably)\b", re.IGNORECASE), ""),
    # Remove redundant qualifying phrases
    (re.compile(r"\bin order to\b", re.IGNORECASE), "to"),
    (re.compile(r"\bas a result of\b", re.IGNORECASE), "due to"),
    (re.compile(r"\bin the event that\b", re.IGNORECASE), "if"),
    (re.compile(r"\bin the case of\b", re.IGNORECASE), "for"),
    (re.compile(r"\bon the other hand\b", re.IGNORECASE), "however"),
    (re.compile(r"\bin addition to\b", re.IGNORECASE), "also"),
    (re.compile(r"\bat this point in time\b", re.IGNORECASE), "now"),
    (re.compile(r"\bin the near future\b", re.IGNORECASE), "soon"),
    (re.compile(r"\ba majority of\b", re.IGNORECASE), "most"),
    (re.compile(r"\ba number of\b", re.IGNORECASE), "some"),
    (re.compile(r"\bthe vast majority of\b", re.IGNORECASE), "most"),
    (re.compile(r"\bwith regard to\b", re.IGNORECASE), "regarding"),
    (re.compile(r"\bin relation to\b", re.IGNORECASE), "for"),
    (re.compile(r"\bwith the exception of\b", re.IGNORECASE), "except"),
    # Remove fluff phrases common in system prompts
    (re.compile(r"\byou should always\b", re.IGNORECASE), "always"),
    (re.compile(r"\byou must always\b", re.IGNORECASE), "always"),
    (re.compile(r"\bplease ensure that\b", re.IGNORECASE), "ensure"),
    (re.compile(r"\bmake sure to\b", re.IGNORECASE), ""),
    (re.compile(r"\bbe sure to\b", re.IGNORECASE), ""),
    (re.compile(r"\bas mentioned above\b", re.IGNORECASE), ""),
    (re.compile(r"\bas previously stated\b", re.IGNORECASE), ""),
    (re.compile(r"\bas follows\b", re.IGNORECASE), ":"),
    (re.compile(r"\bin the following manner\b", re.IGNORECASE), "as"),
]


def _normalize_whitespace(text: str) -> str:
    text = _TRAILING_WS_RE.sub("\n", text)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _MULTI_BLANK_RE.sub("\n\n", text)
    return text.strip()


def _split_sections(text: str) -> list[str]:
    """Split on blank-line boundaries -- the standard section separator used
    by every template in prompt_builder/templates."""
    return [block for block in re.split(r"\n\s*\n", text) if block.strip()]


def _dedupe_sections(sections: list[str]) -> list[str]:
    """Merge exact-duplicate sections (e.g. the same coding-standards block
    appended twice by different context sources), keeping first occurrence
    order so earlier, more relevant placement wins."""
    seen: set = set()
    deduped: list[str] = []
    for section in sections:
        normalized = section.strip()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(section)
    return deduped


def _apply_verbose_patterns(text: str) -> str:
    """Remove verbose boilerplate phrases that add no semantic value."""
    for pattern, replacement in _VERBOSE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _apply_aggressive_compression(text: str) -> str:
    """Apply more aggressive language compression for level 3."""
    for pattern, replacement in _AGGRESSIVE_PATTERNS:
        text = pattern.sub(replacement, text)
    # Clean up double spaces from removed words
    text = _MULTI_SPACE_RE.sub(" ", text)
    return text


def _compress_code_blocks(text: str) -> str:
    """Minimize whitespace inside code blocks to save tokens without changing
    semantics. Code blocks often contain verbose comments and unnecessary
    blank lines that can be safely compressed."""
    def _compress_block(match: re.Match) -> str:
        block = match.group(0)
        # Collapse multiple blank lines to one
        block = re.sub(r'\n{3,}', '\n\n', block)
        # Remove trailing whitespace on each line
        block = re.sub(r'[ \t]+$', '', block, flags=re.MULTILINE)
        return block

    text = re.sub(r'```[\s\S]*?```', _compress_block, text)
    return text


def _trim_list_markers(text: str) -> str:
    """Remove redundant list numbering. LLMs don't need sequential numbering
    in markdown lists - they understand the structure from bullet points
    alone. Saves ~3 chars per list item."""
    # Replace numbered lists (1., 2., etc) with simple dashes
    text = re.sub(r'^\s*\d+\.\s+', '- ', text, flags=re.MULTILINE)
    return text


def optimize_prompt(text: str, *, compression_level: int = 1) -> str:
    """Normalize a rendered prompt: collapse redundant whitespace, standardize
    formatting, and merge duplicate sections. Never rewrites user intent or
    wording -- only removes exact repeats and stray whitespace.

    compression_level:
        0 = no optimization
        1 = basic: whitespace normalization + section deduplication
        2 = standard: + verbose phrase removal + code block whitespace compression
        3 = aggressive: + language compression + list marker trimming
    """
    if not text:
        return text
    if compression_level <= 0:
        return text

    normalized = _normalize_whitespace(text)

    # Level 1: Basic deduplication
    sections = _split_sections(normalized)
    deduped = _dedupe_sections(sections)
    result = "\n\n".join(deduped)

    # Level 2: Standard compression
    if compression_level >= 2:
        result = _apply_verbose_patterns(result)
        result = _compress_code_blocks(result)

    # Level 3: Aggressive compression
    if compression_level >= 3:
        result = _apply_aggressive_compression(result)
        result = _trim_list_markers(result)

    # Final whitespace cleanup after all transformations
    result = _normalize_whitespace(result)

    return result