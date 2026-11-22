from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.llm.router import _HOMOGLYPH_MAP, _INVISIBLE_RE, _strip_obfuscation
from core.processing_boundary import Purpose, check_platform_model_allowed

logger = logging.getLogger(__name__)

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

BLOCKED_MESSAGE = "This response was blocked by content safety guardrails."


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


# --------------------------------------------------------------------------- #
# D-tier v2: incremental, linear-time scanning for streams (§4.2, GR-1/GR-2)
# --------------------------------------------------------------------------- #

_SEPARATORS_RE = re.compile(r"[\s\-_]+")


def _prenormalize(text: str) -> str:
    """The per-character part of ``_strip_obfuscation``: NFKC, invisible
    characters removed, homoglyphs mapped, lower-cased."""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _INVISIBLE_RE.sub("", normalized)
    normalized = "".join(_HOMOGLYPH_MAP.get(ch, ch) for ch in normalized)
    return normalized.lower()


class IncrementalDTierScanner:
    """Scans a stream window by window at linear cost.

    Detection works on the *de-spaced* normalized stream (whitespace, ``-``
    and ``_`` removed). That is exactly equivalent to the legacy check
    ``phrase in spaced or despaced_phrase in despaced``: the spaced form with
    its single spaces removed *is* the de-spaced form, so a spaced match
    always implies a de-spaced one. De-spacing also makes the transform
    concatenation-safe, so each window is scanned together with only a tail
    of the previous de-spaced text, ``overlap`` = longest pattern + 32
    characters, which is enough for any phrase split across a window
    boundary (in plain text, or obfuscated with homoglyphs, zero-width
    characters or letter spacing, which the normalization removes before the
    overlap is applied). One raw character is carried into the next window
    so NFKC can compose a base character with a combining mark that arrives
    in the next chunk.

    Work per window is ``len(tail) + len(window)``; the total is bounded by
    ``stream length + overlap x windows``, never a full-prefix rescan."""

    def __init__(self, categories: Iterable[str]):
        self._patterns: List[Tuple[str, str]] = []
        for category in categories:
            for phrase in _BLOCKED_PHRASES.get(category, ()):
                self._patterns.append((category, _SEPARATORS_RE.sub("", phrase)))
        longest = max((len(p) for _, p in self._patterns), default=0)
        self.overlap = longest + 32
        self._tail = ""
        self._carry = ""
        self.chars_scanned = 0
        self.windows = 0
        self.raw_chars = 0
        self.hits: List[str] = []

    def scan(self, raw: str, *, final: bool = False) -> List[str]:
        """Scan the next window. Returns the categories newly hit."""
        self.raw_chars += len(raw)
        text = self._carry + raw
        if final:
            self._carry = ""
        else:
            self._carry, text = text[-1:], text[:-1]
        segment = _SEPARATORS_RE.sub("", _prenormalize(text)) if text else ""
        window = self._tail + segment
        self.windows += 1
        self.chars_scanned += len(window)
        new_hits: List[str] = []
        for category, pattern in self._patterns:
            if category in self.hits or category in new_hits:
                continue
            if pattern and pattern in window:
                new_hits.append(category)
        self.hits.extend(new_hits)
        self._tail = window[-self.overlap:] if self.overlap else ""
        return new_hits


# --------------------------------------------------------------------------- #
# Guardrail outcome (exposed to the orchestrator; B2 maps it to quality)
# --------------------------------------------------------------------------- #

# L-tier status values (§4.3, §4.5).
LTIER_NOT_REQUIRED = "not_required"
LTIER_PASSED = "passed"
LTIER_BLOCKED = "blocked"
LTIER_UNVERIFIED = "unverified"      # required, but could not complete -> INCOMPLETE
LTIER_SKIPPED = "skipped"            # optional, could not complete -> no quality effect
LTIER_NOT_PERMITTED = "not_permitted"  # optional, boundary refused -> no quality effect


@dataclass
class GuardrailOutcome:
    """Per-artifact guardrail result. ``quality_effect`` is the hint B2 maps
    to ``quality_status`` (``incomplete`` -> ``INCOMPLETE`` with reason
    ``guardrail_unverified``); ``withheld`` is the version A3 must not
    publish (previous version stays active, ``artifact_withheld`` event)."""

    request_id: Optional[str] = None
    operation_id: Optional[str] = None
    build_id: Optional[str] = None
    agent: Optional[str] = None
    credential_mode: Optional[str] = None
    dtier: str = "passed"            # passed | blocked | disabled
    dtier_categories: List[str] = field(default_factory=list)
    ltier_mode: str = "off"          # off | optional | required
    ltier: str = LTIER_NOT_REQUIRED
    ltier_reason: Optional[str] = None
    ltier_categories: List[str] = field(default_factory=list)
    ltier_calls: int = 0
    ltier_model: Optional[str] = None
    coverage: str = "none"           # none | full | partial
    stream_mode: Optional[str] = None
    dtier_chars_scanned: int = 0
    dtier_windows: int = 0

    @property
    def blocked(self) -> bool:
        return self.dtier == "blocked" or self.ltier == LTIER_BLOCKED

    @property
    def unverified(self) -> bool:
        return self.ltier == LTIER_UNVERIFIED and not self.blocked

    @property
    def withheld(self) -> bool:
        return self.blocked

    @property
    def quality_effect(self) -> str:
        if self.blocked:
            return "withheld"
        if self.unverified:
            return "incomplete"
        return "none"

    @property
    def reason_code(self) -> Optional[str]:
        if self.blocked:
            return "blocked_by_guardrail"
        if self.unverified:
            return "guardrail_unverified"
        return None

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data.update({
            "blocked": self.blocked,
            "unverified": self.unverified,
            "withheld": self.withheld,
            "quality_effect": self.quality_effect,
            "reason_code": self.reason_code,
        })
        return data


@dataclass
class LTierResult:
    status: str
    reason: Optional[str] = None
    categories: List[str] = field(default_factory=list)
    calls: int = 0
    truncated: bool = False
    model: Optional[str] = None


_LTIER_SYSTEM_PROMPT = (
    "You are a content safety classifier. Determine whether the following "
    "assistant response violates any of these content categories: {categories}. "
    "Answer with exactly 'SAFE' if none apply, or a comma-separated list of the "
    "violated category names."
)


def parse_ltier_verdict(answer: Optional[str], categories: List[str]) -> Tuple[str, List[str]]:
    """Strict parse (F29): ``SAFE``, or a list made only of the category
    names asked about. Anything else is ``invalid`` -- never a pass."""
    text = (answer or "").strip()
    if not text:
        return "invalid", []
    if text.upper().rstrip(".") == "SAFE":
        return "safe", []
    lookup = {c.lower(): c for c in categories}
    names = [part.strip().strip(".").lower() for part in text.split(",")]
    if not names or any(not n or n not in lookup for n in names):
        return "invalid", []
    found: List[str] = []
    for n in names:
        if lookup[n] not in found:
            found.append(lookup[n])
    return "blocked", found


class GuardrailsEngine:
    """Output-side content-safety screen. Two generations:

    - ``screen`` (legacy, ``guardrail_v2`` off): deterministic phrases, then
      an LLM classifier on the calling agent's config, fail-open. Kept as
      the rollback path, but the LLM step is now behind the processing
      boundary (no Forge-credential screen of BYOK content without consent)
      and is recorded when unified usage recording is on.
    - ``screen_artifact_ltier`` (v2): at most one bounded call per artifact on
      the dedicated policy model, budgeted, fail-closed when required."""

    async def screen(
        self,
        text: str,
        *,
        categories: List[str],
        router: Any,
        agent_name: str = "content-guardrail",
        accounting: Any = None,
    ) -> Dict[str, Any]:
        tier1_hits = _detect_blocked_content(text, categories)
        if tier1_hits:
            return {"blocked": True, "categories": tier1_hits}

        blocked_categories = await self._check_with_llm(
            text, categories=categories, router=router, agent_name=agent_name, accounting=accounting,
        )
        if blocked_categories:
            return {"blocked": True, "categories": blocked_categories}
        return {"blocked": False, "categories": []}

    async def _check_with_llm(
        self, text: str, *, categories: List[str], router: Any, agent_name: str, accounting: Any = None,
    ) -> List[str]:
        """Legacy secondary LLM-based content classifier. Best-effort: any
        failure (config load, provider unavailable, malformed response)
        returns [] (not blocked) -- the rollback state's fail-open
        behaviour. Refused by the processing boundary for BYOK content
        without consent."""
        import time

        from core.llm.accounting import AttemptAccounting

        if not text or not text.strip():
            return []

        acct = (accounting or AttemptAccounting.create()).derive(Purpose.GUARDRAIL_OUTPUT, agent=agent_name)
        if not check_platform_model_allowed(acct.boundary, Purpose.GUARDRAIL_OUTPUT).allowed:
            return []

        classification_messages = [
            {"role": "system", "content": _LTIER_SYSTEM_PROMPT.format(categories=", ".join(categories))},
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
                started = time.perf_counter()
                try:
                    response = await provider.chat_completion(
                        model=model, messages=classification_messages, max_tokens=16,
                    )
                except Exception as exc:
                    await acct.record(
                        outcome="error", credential="forge", provider=provider_name, model=model,
                        error_class=exc, latency_ms=(time.perf_counter() - started) * 1000,
                    )
                    continue
                usage = getattr(response, "usage", None) or {}
                await acct.record(
                    outcome="success", credential="forge", provider=provider_name, model=model,
                    prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                    completion_tokens=int(usage.get("completion_tokens", 0) or 0),
                    latency_ms=(time.perf_counter() - started) * 1000,
                )
                answer = (response.text or "").strip()
                if not answer or answer.upper() == "SAFE":
                    return []
                # Only trust category names we actually asked about --
                # an unparseable/garbled answer falls through to "not
                # blocked" (fail-open) rather than blocking on noise.
                return [c.strip() for c in answer.split(",") if c.strip() in categories]
            return []
        except Exception:
            return []

    async def screen_artifact_ltier(
        self,
        text: str,
        *,
        categories: List[str],
        router: Any,
        accounting: Any,
        mode: str,
        partial_coverage: str,
        config: Dict[str, Any],
    ) -> LTierResult:
        """Guardrail v2 L-tier: one bounded screen of a complete artifact
        (§4.2). ``mode`` is the artifact policy (``off``/``optional``/
        ``required``). A required screen that cannot complete is
        ``unverified`` -- never a pass (§4.5, F29)."""
        from core.config import get_settings
        from core.llm.guardrail_policy import guardrail_model_config
        from core.llm.screening import run_bounded_screen

        if mode not in ("optional", "required"):
            return LTierResult(status=LTIER_NOT_REQUIRED)
        required = mode == "required"
        settings = get_settings()
        entry = guardrail_model_config(config)
        acct = accounting.derive(Purpose.GUARDRAIL_OUTPUT, agent="output-guardrail")

        def _incomplete(reason: str, *, calls: int = 0, truncated: bool = False, model=None) -> LTierResult:
            if required:
                status = LTIER_UNVERIFIED
            elif reason == "not_permitted":
                status = LTIER_NOT_PERMITTED
            else:
                status = LTIER_SKIPPED
            return LTierResult(status=status, reason=reason, calls=calls, truncated=truncated, model=model)

        try:
            result = await run_bounded_screen(
                router=router,
                accounting=acct,
                provider_name=entry.get("provider"),
                model=entry.get("model"),
                system_prompt=_LTIER_SYSTEM_PROMPT.format(categories=", ".join(categories)),
                text=text,
                max_input_tokens=int(settings.guardrail_llm_max_input_tokens),
                max_output_tokens=int(settings.guardrail_llm_max_output_tokens),
                timeout_seconds=float(settings.guardrail_llm_timeout_seconds),
            )
        except Exception:
            logger.exception("output L-tier screen raised")
            return _incomplete("error")
        if not result.completed:
            return _incomplete(result.reason, calls=result.calls, truncated=result.truncated, model=result.model)
        verdict, blocked = parse_ltier_verdict(result.answer, categories)
        if verdict == "blocked":
            return LTierResult(status=LTIER_BLOCKED, reason="blocked", categories=blocked,
                               calls=result.calls, truncated=result.truncated, model=result.model)
        if verdict == "invalid":
            return _incomplete("invalid_verdict", calls=result.calls, truncated=result.truncated, model=result.model)
        if result.truncated and partial_coverage != "accept":
            return _incomplete("partial_coverage", calls=result.calls, truncated=True, model=result.model)
        return LTierResult(status=LTIER_PASSED, reason="safe", calls=result.calls,
                           truncated=result.truncated, model=result.model)


_guardrails_engine: Optional[GuardrailsEngine] = None


def get_guardrails_engine() -> GuardrailsEngine:
    global _guardrails_engine
    if _guardrails_engine is None:
        _guardrails_engine = GuardrailsEngine()
    return _guardrails_engine
