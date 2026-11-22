"""Guardrail policy (docs/architecture/agent-collaboration-plan.md §4.4,
§4.5, X12).

Lives in the existing LLM ``policy`` config block (global default, then the
per-org override stored in ``llm_org_policy_overrides``, then per-agent), as
an optional ``guardrail`` sub-block::

    policy:
      guardrails_enabled: true          # existing
      blocked_categories: [...]         # existing, additive to the baseline
      guardrail:
        llm_screen: off | optional | required        # Forge-credential builds
        byok_llm_screen: off | optional | required   # BYOK builds (needs consent)
        stream_mode: preview_after_dtier | buffer_until_screened
        partial_coverage: unverified | accept        # artifact longer than the input cap
        input_classifier: optional | required        # only if the classifier is enabled by config
        byok_input_classifier: optional | required

Shipped default (§4.4, until X12 is decided): D-tier on everything, L-tier
off, previews after D-tier. ``byok_llm_screen`` defaults to ``optional``
when the org asks for any L-tier (so a consenting BYOK owner is screened and
a non-consenting one is recorded ``not_permitted`` with no quality effect),
``off`` otherwise.

GR-9: a policy that *requires* an LLM screen for BYOK builds without a
``platform_model_processing`` consent is rejected at save time
(``validate_guardrail_policy``), so configuration can never force BYOK builds
into ``INCOMPLETE``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional

from core.processing_boundary import ProcessingBoundary

logger = logging.getLogger(__name__)

LLM_SCREEN_MODES = ("off", "optional", "required")
STREAM_MODES = ("preview_after_dtier", "buffer_until_screened")
PARTIAL_COVERAGE_MODES = ("unverified", "accept")
INPUT_CLASSIFIER_MODES = ("optional", "required")

_FIELDS = {
    "llm_screen": LLM_SCREEN_MODES,
    "byok_llm_screen": LLM_SCREEN_MODES,
    "stream_mode": STREAM_MODES,
    "partial_coverage": PARTIAL_COVERAGE_MODES,
    "input_classifier": INPUT_CLASSIFIER_MODES,
    "byok_input_classifier": INPUT_CLASSIFIER_MODES,
}


class GuardrailPolicyError(ValueError):
    """A guardrail policy that may not be saved."""


@dataclass(frozen=True)
class GuardrailPolicy:
    llm_screen: str = "off"
    byok_llm_screen: str = "off"
    stream_mode: str = "preview_after_dtier"
    partial_coverage: str = "unverified"
    input_classifier: str = "optional"
    byok_input_classifier: str = "optional"

    def ltier_mode(self, boundary: ProcessingBoundary) -> str:
        return self.byok_llm_screen if boundary.is_byok else self.llm_screen

    def input_mode(self, boundary: ProcessingBoundary) -> str:
        return self.byok_input_classifier if boundary.is_byok else self.input_classifier


def _raw_block(policy: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    block = (policy or {}).get("guardrail") if isinstance(policy, Mapping) else None
    return dict(block) if isinstance(block, Mapping) else {}


def parse_guardrail_policy(policy: Optional[Mapping[str, Any]]) -> GuardrailPolicy:
    """Runtime read. Saved policies are validated, so an unknown value here
    means a hand-edited document: it falls back to the shipped default for
    that field (and is logged) rather than to an arbitrary mode."""
    raw = _raw_block(policy)
    values: Dict[str, str] = {}
    for name, allowed in _FIELDS.items():
        value = raw.get(name)
        if value is None:
            continue
        if value not in allowed:
            logger.warning("ignoring invalid guardrail policy value %s=%r", name, value)
            continue
        values[name] = value
    if "byok_llm_screen" not in values:
        values["byok_llm_screen"] = "optional" if values.get("llm_screen", "off") != "off" else "off"
    return GuardrailPolicy(**values)


def validate_guardrail_policy(
    block: Optional[Mapping[str, Any]],
    *,
    byok_consent: bool,
) -> Dict[str, Any]:
    """Validate a ``guardrail`` policy block before it is saved. Returns the
    normalized block. ``byok_consent`` says whether the BYOK owners the
    policy governs hold an active ``platform_model_processing`` consent.

    Rejects (GR-9): ``byok_llm_screen: required`` or
    ``byok_input_classifier: required`` without that consent."""
    if block is None:
        return {}
    if not isinstance(block, Mapping):
        raise GuardrailPolicyError("guardrail policy must be an object")
    unknown = set(block) - set(_FIELDS)
    if unknown:
        raise GuardrailPolicyError(f"unknown guardrail policy fields: {sorted(unknown)}")
    normalized: Dict[str, Any] = {}
    for name, value in block.items():
        if value is None:
            continue
        if value not in _FIELDS[name]:
            raise GuardrailPolicyError(f"{name} must be one of {list(_FIELDS[name])}, got {value!r}")
        normalized[name] = value
    effective = parse_guardrail_policy({"guardrail": normalized})
    if not byok_consent:
        if effective.byok_llm_screen == "required":
            raise GuardrailPolicyError(
                "byok_llm_screen cannot be 'required': BYOK content may only be screened by a "
                "Forge-credential model with the owner's platform_model_processing consent. "
                "Use 'optional' (screened when consent exists) or 'off'."
            )
        if effective.byok_input_classifier == "required":
            raise GuardrailPolicyError(
                "byok_input_classifier cannot be 'required' without platform_model_processing consent"
            )
    return normalized


async def org_byok_consent_complete(db, org_id: str) -> bool:
    """Whether a policy requiring BYOK screening may be saved for ``org_id``:
    the org has at least one BYOK member and every BYOK member holds an
    active ``platform_model_processing`` consent. Any lookup failure answers
    False (the stricter outcome: the save is rejected)."""
    from core.data_use_consents import SCOPE_PLATFORM_MODEL_PROCESSING, get_active_consents
    from core.processing_boundary import CredentialMode, credential_mode_for_user_doc

    try:
        member_ids = []
        async for member in db.team_members.find({"org_id": org_id}):
            if member.get("user_id"):
                member_ids.append(member["user_id"])
        byok_members = 0
        for user_id in member_ids:
            user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "plan": 1, "llm_api_key": 1})
            if credential_mode_for_user_doc(user_doc) != CredentialMode.BYOK:
                continue
            byok_members += 1
            active = await get_active_consents(db, user_id)
            if SCOPE_PLATFORM_MODEL_PROCESSING not in active.scopes:
                return False
        return byok_members > 0
    except Exception:
        logger.warning("BYOK consent check failed for org %s; rejecting", org_id, exc_info=True)
        return False


def guardrail_model_config(config: Mapping[str, Any]) -> Dict[str, Any]:
    """The dedicated L-tier model entry (`guardrail_screen` in the LLM
    config). Never the calling agent's model (F26)."""
    entry = config.get("guardrail_screen") if isinstance(config, Mapping) else None
    return dict(entry) if isinstance(entry, Mapping) else {}
