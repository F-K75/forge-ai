from typing import Optional

from core.models import PlanTier, User

# Flat platform fee for BYOK users. When a paid user has their own API key
# configured, their monthly bill is charged at this price instead of the
# tier's normal rate. (E1: auto-discount engine from /plan-ceo-review)
BYOK_DISCOUNT_PRICE: int = 29

# Any paid plan can enable BYOK: set a key, get the discount, and (for Pro+)
# have builds route through the user's key with zero credit consumption.
BYOK_ELIGIBLE_PLANS = frozenset({
    PlanTier.STANDARD,
    PlanTier.PRO,
    PlanTier.ENTERPRISE,
})

# Credit consumption is skipped for Pro+ only (per CEO review C2). Standard
# users can set a BYOK key and receive the discount, but their builds still
# consume credits through the normal credit system — they pay $29 either way.
BYOK_CREDIT_EXEMPT_PLANS = frozenset({
    PlanTier.PRO,
    PlanTier.ENTERPRISE,
})


def compute_byok_discount(plan: PlanTier) -> Optional[int]:
    """Return the discounted monthly price for a plan when BYOK is active.

    Any paid plan with BYOK enabled pays a flat $29/month platform fee.
    Free plans get no discount (must upgrade to paid).

    Used by: billing checkout (price selection), analytics MRR (revenue).
    """
    if plan in BYOK_ELIGIBLE_PLANS:
        return BYOK_DISCOUNT_PRICE
    return None


def is_byok_eligible(user: "User") -> bool:
    """Check if a user can use BYOK (any paid plan + encrypted key set).

    Used by: SettingsPage visibility (frontend mirrors this logic),
    auth.py key-setting gate, checkout discount application.
    """
    return user.plan in BYOK_ELIGIBLE_PLANS and bool(user.llm_api_key)


def is_byok_credit_exempt(user: "User") -> bool:
    """Check if a user's builds skip credit deduction (Pro+ + key set).

    Per CEO review C2: credit-skip stays Pro+ only. Standard users can
    set BYOK keys and get the discount, but their builds still consume
    credits through the normal credit system.

    Used by: api/builds.py credit reservation bypass, and mirrors the
    existing check in core/orchestrator.py:_is_byok_active and
    agents/base.py:_resolve_byok (which check the same Pro+/Enterprise
    tuple — those functions are unchanged, this is a parallel check for
    the builds.py reservation path).
    """
    return user.plan in BYOK_CREDIT_EXEMPT_PLANS and bool(user.llm_api_key)
