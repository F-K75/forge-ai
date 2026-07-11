def estimate_tokens(text: str) -> int:
    """Heuristic token estimate (~4 chars/token). Deliberately avoids a real
    tokenizer dependency to keep build() fast and provider-agnostic."""
    if not text:
        return 0
    return max(1, len(text) // 4)
