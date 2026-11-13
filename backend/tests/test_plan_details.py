"""The plan table matches the published pricing and the config it reads.

Pricing drifted into four different versions (config, billing code, and two
landing pages). These tests pin PLAN_DETAILS to the decided plans: Free 10
credits at signup and 1 project; Standard $20/mo, 100 credits; Pro $50/mo, 750
credits; Enterprise custom; paid plans have unlimited projects.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import asyncio

from api.billing import PLAN_DETAILS, PlanResponse
from core.config import get_settings
from core.models import PlanTier

PLANS = {p["tier"]: p for p in PLAN_DETAILS}


def test_published_prices_and_credits():
    s = get_settings()
    assert (s.free_credits, s.standard_monthly_price, s.standard_credits, s.pro_monthly_price, s.pro_credits) == (
        10, 20, 100, 50, 750,
    )
    assert (PLANS[PlanTier.FREE]["price_monthly"], PLANS[PlanTier.FREE]["credits"]) == (0, 10)
    assert (PLANS[PlanTier.STANDARD]["price_monthly"], PLANS[PlanTier.STANDARD]["credits"]) == (20, 100)
    assert (PLANS[PlanTier.PRO]["price_monthly"], PLANS[PlanTier.PRO]["credits"]) == (50, 750)


def test_annual_is_ten_months():
    for tier in (PlanTier.STANDARD, PlanTier.PRO):
        assert PLANS[tier]["price_annual"] == PLANS[tier]["price_monthly"] * 10


def test_project_limits():
    assert PLANS[PlanTier.FREE]["max_projects"] == 1
    for tier in (PlanTier.STANDARD, PlanTier.PRO, PlanTier.ENTERPRISE):
        assert PLANS[tier]["max_projects"] == -1  # unlimited


def test_only_enterprise_is_custom_priced():
    assert PLANS[PlanTier.ENTERPRISE].get("custom_pricing") is True
    assert not any(p.get("custom_pricing") for t, p in PLANS.items() if t != PlanTier.ENTERPRISE)


def test_features_state_the_real_numbers():
    assert "10 credits at signup" in PLANS[PlanTier.FREE]["features"]
    assert "1 project" in PLANS[PlanTier.FREE]["features"]
    assert "100 credits/month" in PLANS[PlanTier.STANDARD]["features"]
    assert "750 credits/month" in PLANS[PlanTier.PRO]["features"]
    assert "Bring your own LLM key (BYOK)" in PLANS[PlanTier.PRO]["features"]


def test_plans_endpoint_exposes_custom_pricing(monkeypatch):
    import api.billing as billing

    async def no_cache(key, ttl, build):
        return await build()

    monkeypatch.setattr(billing, "cached_read", no_cache)
    plans = asyncio.run(billing.list_plans())
    by_tier = {p["tier"]: PlanResponse(**p) for p in plans}
    assert by_tier[PlanTier.ENTERPRISE.value].custom_pricing is True
    assert by_tier[PlanTier.PRO.value].custom_pricing is False
    assert by_tier[PlanTier.PRO.value].price_monthly == 50
