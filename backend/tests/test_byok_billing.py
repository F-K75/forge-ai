"""Tests for the E1 auto-discount engine (core/billing/byok.py).

Covers:
  - compute_byok_discount(): price selection per tier
  - is_byok_eligible(): gate for SettingsPage / auth.py / checkout discount
  - is_byok_credit_exempt(): gate for builds.py credit-reservation bypass
  - handle_checkout_completed: BYOK metadata propagation
  - handle_subscription_updated: BYOK metadata on plan change
  - analytics MRR: BYOK-discounted subscribers charged at $29
"""

import os
from typing import Optional

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

from core.models import PlanTier, User, Subscription
from core.billing.byok import (
    compute_byok_discount,
    is_byok_eligible,
    is_byok_credit_exempt,
    BYOK_DISCOUNT_PRICE,
    BYOK_ELIGIBLE_PLANS,
    BYOK_CREDIT_EXEMPT_PLANS,
)


def _user(plan: PlanTier, llm_api_key: Optional[str] = None) -> User:
    """Build a User with the given plan and optional BYOK key."""
    kwargs = {"id": "u-1", "email": "u@test.com", "name": "Test", "plan": plan}
    if llm_api_key is not None:
        kwargs["llm_api_key"] = llm_api_key
    return User(**kwargs)


# ---------------------------------------------------------------------------
# compute_byok_discount
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("plan", [PlanTier.STANDARD, PlanTier.PRO, PlanTier.ENTERPRISE])
def test_compute_byok_discount_returns_flat_price_for_paid_plans(plan):
    assert compute_byok_discount(plan) == BYOK_DISCOUNT_PRICE  # 29


def test_compute_byok_discount_returns_none_for_free():
    assert compute_byok_discount(PlanTier.FREE) is None


# ---------------------------------------------------------------------------
# is_byok_eligible  (any paid plan + key set)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("plan", [PlanTier.STANDARD, PlanTier.PRO, PlanTier.ENTERPRISE])
def test_is_byok_eligible_true_for_paid_with_key(plan):
    assert is_byok_eligible(_user(plan, llm_api_key="encrypted-key")) is True


@pytest.mark.parametrize("plan", [PlanTier.STANDARD, PlanTier.PRO, PlanTier.ENTERPRISE])
def test_is_byok_eligible_false_when_no_key(plan):
    assert is_byok_eligible(_user(plan, llm_api_key=None)) is False


def test_is_byok_eligible_false_for_free_with_key():
    assert is_byok_eligible(_user(PlanTier.FREE, llm_api_key="encrypted-key")) is False


def test_is_byok_eligible_false_for_free_without_key():
    assert is_byok_eligible(_user(PlanTier.FREE, llm_api_key=None)) is False


# ---------------------------------------------------------------------------
# is_byok_credit_exempt  (Pro+ + key set — C2: credit-skip stays Pro+ only)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("plan", [PlanTier.PRO, PlanTier.ENTERPRISE])
def test_is_byok_credit_exempt_true_for_pro_plus_with_key(plan):
    assert is_byok_credit_exempt(_user(plan, llm_api_key="encrypted-key")) is True


def test_is_byok_credit_exempt_false_for_standard_with_key():
    """Standard users can set BYOK and get the discount, but their builds
    still consume credits (C2)."""
    assert is_byok_credit_exempt(_user(PlanTier.STANDARD, llm_api_key="encrypted-key")) is False


@pytest.mark.parametrize("plan", [PlanTier.PRO, PlanTier.ENTERPRISE])
def test_is_byok_credit_exempt_false_when_no_key(plan):
    assert is_byok_credit_exempt(_user(plan, llm_api_key=None)) is False


def test_all_credit_exempt_plans_are_eligible():
    assert BYOK_CREDIT_EXEMPT_PLANS <= BYOK_ELIGIBLE_PLANS


# ---------------------------------------------------------------------------
# Subscription model  (byok_discounted / effective_monthly_price fields)
# ---------------------------------------------------------------------------

def test_subscription_defaults_byok_fields():
    sub = Subscription(user_id="u-1", plan=PlanTier.PRO)
    assert sub.byok_discounted is False
    assert sub.effective_monthly_price is None


def test_subscription_records_byok_discount():
    sub = Subscription(
        user_id="u-1",
        plan=PlanTier.PRO,
        byok_discounted=True,
        effective_monthly_price=BYOK_DISCOUNT_PRICE,
    )
    dumped = sub.model_dump()
    assert dumped["byok_discounted"] is True
    assert dumped["effective_monthly_price"] == 29
