from __future__ import annotations

import re

_MULTI_BLANK_RE = re.compile(r"\n{3,}")
_TRAILING_WS_RE = re.compile(r"[ \t]+\n")
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")


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


def optimize_prompt(text: str, *, compression_level: int = 1) -> str:
    """Normalize a rendered prompt: collapse redundant whitespace, standardize
    formatting, and merge duplicate sections. Never rewrites user intent or
    wording -- only removes exact repeats and stray whitespace."""
    if not text:
        return text
    if compression_level <= 0:
        return text

    normalized = _normalize_whitespace(text)
    sections = _split_sections(normalized)
    deduped = _dedupe_sections(sections)
    return "\n\n".join(deduped)
