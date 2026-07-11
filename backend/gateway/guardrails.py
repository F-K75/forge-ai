from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.llm.router import _strip_obfuscation

# Deterministic backstop, deliberately narrow to minimize false positives on
# legitimate content (e.g. a mental-health app discussing self-harm
# clinically) -- a backstop, not a complete defense, same framing as
# core.llm.router's _INJECTION_PHRASES. Keyed by category name.
_BLOCKED_PHRASES: Dict[str, Tuple[str, ...]] = {
    "self_harm_instructions": (
        "how to commit suicide",
        "how to kill yourself",
        "step by step suicide method",
    ),
    "weapons_instructions": (
        "how to build a bomb",
        "how to make a bomb",
        "instructions for building an explosive device",
    ),
    "csam": (
        "child sexual abuse material",
        "sexual content involving minors",
    ),
    "extremism_recruitment": (
        "join our terrorist organization",
        "how to join a terrorist cell",
    ),
}

BASELINE_CATEGORIES: Tuple[str, ...] = tuple(_BLOCKED_PHRASES.keys())


def _detect_blocked_content(text: str, categories: Iterable[str]) -> List[str]:
    """Deterministic tier: reuses core.llm.router's obfuscation-resistant
    normalization (NFKC, invisible-char stripping, homoglyph mapping) so the
    same evasion techniques defeated for prompt injection are defeated here."""
    if not text:
        return []
    spaced, despaced = _strip_obfuscation(text)
    hits = []
    for category in categories:
        phrases = _BLOCKED_PHRASES.get(category)
        if not phrases:
            continue
        for phrase in phrases:
            phrase_despaced = phrase.replace(" ", "")
            if phrase in spaced or phrase_despaced in despaced:
                hits.append(category)
                break
    return hits


class GuardrailsEngine:
    """Output-side content-safety screen for AIGateway.generate(). Mirrors
    LLMRouter's input-side prompt-injection detector: a deterministic
    phrase-list backstop, then an LLM classifier fallback (fail-open -- a
    transient classifier outage must not block the whole pipeline)."""

    async def screen(
        self,
        text: str,
        *,
        categories: List[str],
        router: Any,
        agent_name: str = "content-guardrail",
    ) -> Dict[str, Any]:
        tier1_hits = _detect_blocked_content(text, categories)
        if tier1_hits:
            return {"blocked": True, "categories": tier1_hits}

        blocked_categories = await self._check_with_llm(text, categories=categories, router=router, agent_name=agent_name)
        if blocked_categories:
            return {"blocked": True, "categories": blocked_categories}
        return {"blocked": False, "categories": []}

    async def _check_with_llm(
        self, text: str, *, categories: List[str], router: Any, agent_name: str
    ) -> List[str]:
        """Secondary LLM-based content classifier. Best-effort: any failure
        (config load, provider unavailable, malformed response) returns []
        (not blocked) -- fail-open, matching
        LLMRouter._check_injection_with_llm's rationale exactly."""
        if not text or not text.strip():
            return []

        classification_messages = [
            {
                "role": "system",
                "content": (
                    "You are a content safety classifier. Determine whether the "
                    "following assistant response violates any of these content "
                    f"categories: {', '.join(categories)}. "
                    "Answer with exactly 'SAFE' if none apply, or a comma-separated "
                    "list of the violated category names."
                ),
            },
            {"role": "user", "content": text},
        ]

        try:
            config = await router.config_loader.load(agent_name=agent_name)
            if not config.get("model") and not config.get("provider"):
                return []
            providers_to_try = router._select_providers(config)
            model = config.get("model") or router._default_model_for_provider(providers_to_try[0])

            for provider_name in providers_to_try:
                provider = router.registry.get_provider(provider_name)
                if provider is None:
                    continue
                try:
                    response = await provider.chat_completion(
                        model=model, messages=classification_messages, max_tokens=16,
                    )
                    answer = (response.text or "").strip()
                    if not answer or answer.upper() == "SAFE":
                        return []
                    # Only trust category names we actually asked about --
                    # an unparseable/garbled answer falls through to "not
                    # blocked" (fail-open) rather than blocking on noise.
                    return [c.strip() for c in answer.split(",") if c.strip() in categories]
                except Exception:
                    continue
            return []
        except Exception:
            return []


_guardrails_engine: Optional[GuardrailsEngine] = None


def get_guardrails_engine() -> GuardrailsEngine:
    global _guardrails_engine
    if _guardrails_engine is None:
        _guardrails_engine = GuardrailsEngine()
    return _guardrails_engine
