"""The reservation formula and the stage price table
(docs/architecture/agent-collaboration-plan.md §13.1, decision "Formula").

This is the single price source of the ledger path (F21). Every number comes
from settings; nothing here is a literal price::

    max_build_cost = p_arch + p_bm + p_des + p_dev + p_int + p_pm
                   + N × (p_dbg + p_pm)
                   + [Q > 0] × Q × p_clar      # question generation is in p_dev (C3)
                   + V × p_rev                 # 0 until a blocking review edge exists

With the shipped settings this is 15 + 9 + 3 + 0 = 27. The quote is stored on
the build at admission with its ``breakdown`` and ``pricing_version`` and is
never recomputed for that build (§18.1 rule 1).

Retries, repairs, guardrail screens and recovery dispatches add 0 customer
credits by rule, so they do not appear in the formula. ``question_pass`` and
``architect_clarify`` are recorded operations with price 0 (C3).

Stage keys (§8.1): ``architect_clarify``, ``architect``, ``business_model``,
``designer``, ``question_pass:<stage>``, ``clarification#<message>``,
``developer``, ``integration``, ``pm#k`` (k = 0…N) and ``debug#k``
(k = 1…N). The *base* of a key is the part before ``#`` or ``:``.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

# Bumped whenever the formula (not a price) changes. Prices are settings and
# are captured per build in `breakdown`.
PRICING_VERSION = "r3-2026-11"

# Base stage -> the settings attribute holding its price.
_PRICE_SETTINGS: Dict[str, str] = {
    "architect": "credits_architect",
    "business_model": "credits_business_model",
    "designer": "credits_designer",
    "developer": "credits_developer",
    "integration": "credits_integration",
    "pm": "credits_pm",
    "debug": "credits_debug",
    "clarification": "credits_clarification",
}

# Recorded operations with no price of their own (C3: question generation
# is part of the Developer stage price; the interactive clarify is part of
# the Architect's).
ZERO_PRICED_STAGES = frozenset({"question_pass", "architect_clarify"})

# Operations whose failure ends the build (§8.1 "Mandatory"). Integration is
# mandatory when the blueprint lists integrations.
MANDATORY_STAGES = frozenset({
    "architect", "business_model", "designer", "developer", "integration", "pm", "debug",
})

# Operations that produce files (I-10; A3 publishes their manifests in W7).
FILE_PRODUCING_STAGES = frozenset({"developer", "integration", "debug"})

_LABELS = {
    "architect": "Architect",
    "business_model": "Business model",
    "designer": "Designer",
    "developer": "Developer (includes question generation)",
    "integration": "Integration",
    "pm": "PM acceptance",
    "debug_loop": "Debug loop",
    "clarifications": "Clarifications",
    "reviews": "Review revisions",
}

_SPLIT = re.compile(r"[#:]")


def base_stage(stage_key: str) -> str:
    """``pm#2`` -> ``pm``; ``question_pass:developer`` -> ``question_pass``."""
    return _SPLIT.split(str(stage_key or ""), 1)[0]


def is_mandatory(stage_key: str) -> bool:
    return base_stage(stage_key) in MANDATORY_STAGES


def is_file_producing(stage_key: str) -> bool:
    return base_stage(stage_key) in FILE_PRODUCING_STAGES


def _settings(settings: Any = None) -> Any:
    if settings is not None:
        return settings
    from core.config import get_settings

    return get_settings()


@dataclass(frozen=True)
class PriceTable:
    """Per-stage credit prices, read from settings."""

    architect: int
    business_model: int
    designer: int
    developer: int
    integration: int
    pm: int
    debug: int
    clarification: int
    # p_rev: per blocking-review revision; 0 until a blocking edge exists.
    review: int = 0

    @classmethod
    def from_settings(cls, settings: Any = None) -> "PriceTable":
        s = _settings(settings)
        values = {stage: int(getattr(s, attr)) for stage, attr in _PRICE_SETTINGS.items()}
        for stage, value in values.items():
            if value < 0:
                raise ValueError(f"negative price for {stage}: {value}")
        return cls(**values)

    @classmethod
    def from_doc(cls, doc: Dict[str, Any]) -> "PriceTable":
        return cls(**{k: int(v) for k, v in doc.items() if k in cls.__dataclass_fields__})

    def to_doc(self) -> Dict[str, int]:
        return asdict(self)

    def price_for(self, stage_key: str) -> int:
        """The credit price of one operation of ``stage_key``."""
        base = base_stage(stage_key)
        if base in ZERO_PRICED_STAGES:
            return 0
        if base not in _PRICE_SETTINGS:
            raise KeyError(f"unknown stage_key {stage_key!r}")
        return int(getattr(self, base))


@dataclass(frozen=True)
class QuoteParams:
    """The formula's multiplicities, read from settings at admission."""

    # N: debug passes the loop may run (each followed by a PM re-validation).
    debug_iterations: int
    # Q: clarification messages that may be charged in this build.
    clarification_questions: int
    # V: revision cycles x enabled blocking edges (0 until enforcement).
    review_cycles: int = 0
    # The collaboration protocol Q was derived for (1 = legacy flow).
    collab_protocol: int = 1

    @classmethod
    def from_settings(cls, settings: Any = None) -> "QuoteParams":
        s = _settings(settings)
        n = max(0, int(getattr(s, "max_debug_iterations", 3)))
        dev_q = max(0, int(getattr(s, "developer_clarification_max_questions", 0)))
        if getattr(s, "collab_protocol_v2", False):
            # v2 routes questions from the Designer, Developer and
            # Integration stages, bounded per build by the message cap.
            stage_q = max(0, int(getattr(s, "collab_stage_max_questions", 0)))
            per_build = max(0, int(getattr(s, "collab_max_messages_per_build", 0)))
            q = min(per_build, dev_q + 2 * stage_q)
            protocol = 2
        else:
            q = dev_q
            protocol = 1
        return cls(debug_iterations=n, clarification_questions=q, review_cycles=0, collab_protocol=protocol)

    @classmethod
    def from_doc(cls, doc: Dict[str, Any]) -> "QuoteParams":
        return cls(**{k: int(v) for k, v in doc.items() if k in cls.__dataclass_fields__})

    def to_doc(self) -> Dict[str, int]:
        return asdict(self)


@dataclass(frozen=True)
class Quote:
    """``max_build_cost`` with how it is made up."""

    max_cost: int
    prices: PriceTable
    params: QuoteParams
    breakdown: Tuple[Dict[str, Any], ...] = field(default_factory=tuple)
    pricing_version: str = PRICING_VERSION

    def breakdown_lines(self) -> List[Dict[str, Any]]:
        """``[{key, label, credits}]``; sums to ``max_cost`` (B1-9)."""
        return [dict(line) for line in self.breakdown]

    def to_doc(self) -> Dict[str, Any]:
        return {
            "max_cost": self.max_cost,
            "prices": self.prices.to_doc(),
            "params": self.params.to_doc(),
            "breakdown": self.breakdown_lines(),
            "pricing_version": self.pricing_version,
        }

    @classmethod
    def from_doc(cls, doc: Dict[str, Any]) -> "Quote":
        return cls(
            max_cost=int(doc["max_cost"]),
            prices=PriceTable.from_doc(doc["prices"]),
            params=QuoteParams.from_doc(doc["params"]),
            breakdown=tuple(dict(x) for x in doc.get("breakdown") or ()),
            pricing_version=str(doc.get("pricing_version") or PRICING_VERSION),
        )


def max_build_cost(prices: PriceTable, params: QuoteParams) -> Quote:
    """The closed-form worst case of user-funded credits for one build."""
    n, q, v = params.debug_iterations, params.clarification_questions, params.review_cycles
    lines: List[Dict[str, Any]] = [
        {"key": stage, "label": _LABELS[stage], "credits": getattr(prices, stage)}
        for stage in ("architect", "business_model", "designer", "developer", "integration", "pm")
    ]
    if n > 0:
        lines.append({
            "key": "debug_loop",
            "label": f"{_LABELS['debug_loop']} ({n} × (debug + PM))",
            "credits": n * (prices.debug + prices.pm),
        })
    if q > 0:
        lines.append({
            "key": "clarifications",
            "label": f"{_LABELS['clarifications']} (up to {q})",
            "credits": q * prices.clarification,
        })
    if v > 0:
        lines.append({"key": "reviews", "label": _LABELS["reviews"], "credits": v * prices.review})
    total = sum(int(line["credits"]) for line in lines)
    return Quote(max_cost=total, prices=prices, params=params, breakdown=tuple(lines))


def quote_from_settings(settings: Any = None) -> Quote:
    s = _settings(settings)
    return max_build_cost(PriceTable.from_settings(s), QuoteParams.from_settings(s))


def mandatory_path(params: QuoteParams, *, integrations: bool = True) -> List[str]:
    """Stage keys of the longest mandatory path, in pipeline order."""
    keys = ["architect", "business_model", "designer", "developer"]
    if integrations:
        keys.append("integration")
    keys.append("pm#0")
    for k in range(1, params.debug_iterations + 1):
        keys.extend([f"debug#{k}", f"pm#{k}"])
    return keys


def closed_form_price(prices: PriceTable, completed_stage_keys: Iterable[str]) -> int:
    """Credits owed for a set of COMPLETED usable operations: each stage_key
    at most once (I-4)."""
    return sum(prices.price_for(k) for k in set(completed_stage_keys))


def remaining_mandatory_worst_case(
    prices: PriceTable,
    params: QuoteParams,
    settled_stage_keys: Iterable[str],
    *,
    integrations: Optional[bool] = None,
) -> int:
    """Credits the mandatory operations not yet settled may still charge.

    ``settled_stage_keys``: keys that can no longer be charged (COMPLETED, or
    closed for good such as a no-op debug pass). ``integrations=None`` means
    not yet known (before the blueprint), so the worst case includes it.
    Optional spend (clarifications) is authorized only out of the
    reservation minus this amount, so it can never crowd out a mandatory
    stage."""
    settled = set(settled_stage_keys)
    path = mandatory_path(params, integrations=True if integrations is None else integrations)
    return sum(prices.price_for(k) for k in path if k not in settled)
