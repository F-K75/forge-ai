"""Tests for BUS-002: Stripe Price ID validation in production.

Verifies that:
1. Development/test environments can start with placeholder price IDs
2. Production environments fail at startup if placeholders are present
3. Production environments fail if price IDs are missing/invalid
4. Production environments succeed with real price_xxx values
"""

import pytest
from unittest.mock import patch

from core.config import Settings


class TestStripePriceValidation:
    """Production Stripe price ID validation tests."""

    def test_development_allows_placeholder_price_ids(self):
        """In development, placeholder price IDs should be allowed."""
        with patch.dict("os.environ", {"APP_ENV": "development"}):
            settings = Settings(
                stripe_price_standard_monthly="price_standard_monthly",
                stripe_price_pro_monthly="price_pro_monthly",
                stripe_price_enterprise_monthly="price_enterprise_monthly",
                stripe_price_standard_annual="price_standard_annual",
                stripe_price_pro_annual="price_pro_annual",
                stripe_price_enterprise_annual="price_enterprise_annual",
            )
            assert settings.stripe_price_standard_monthly == "price_standard_monthly"

    def test_production_rejects_placeholder_price_ids(self):
        """In production, placeholder price IDs should raise ValueError."""
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            with pytest.raises(ValueError) as exc_info:
                Settings(
                    stripe_secret_key="sk_live_1234567890abcdef",
                    stripe_publishable_key="pk_live_1234567890abcdef",
                    stripe_webhook_secret="whsec_1234567890abcdef",
                    stripe_price_standard_monthly="price_standard_monthly",
                    stripe_price_pro_monthly="price_pro_monthly",
                    stripe_price_enterprise_monthly="price_enterprise_monthly",
                    stripe_price_standard_annual="price_standard_annual",
                    stripe_price_pro_annual="price_pro_annual",
                    stripe_price_enterprise_annual="price_enterprise_annual",
                )
            # Placeholder IDs with underscores fail the regex check
            assert "real Stripe Price ID" in str(exc_info.value)

    def test_production_accepts_real_price_ids(self):
        """In production, real price_xxx values should be accepted."""
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            settings = Settings(
                stripe_secret_key="sk_live_1234567890abcdef",
                stripe_publishable_key="pk_live_1234567890abcdef",
                stripe_webhook_secret="whsec_1234567890abcdef",
                stripe_price_standard_monthly="price_1ABC123xyz",
                stripe_price_pro_monthly="price_1DEF456uvw",
                stripe_price_enterprise_monthly="price_1GHI789rst",
                stripe_price_standard_annual="price_1JKL012opq",
                stripe_price_pro_annual="price_1MNO345lmn",
                stripe_price_enterprise_annual="price_1PQR678ijk",
            )
            assert settings.stripe_price_standard_monthly == "price_1ABC123xyz"

    def test_production_rejects_invalid_price_format(self):
        """In production, price IDs must match price_xxx pattern."""
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            with pytest.raises(ValueError) as exc_info:
                Settings(
                    stripe_secret_key="sk_live_1234567890abcdef",
                    stripe_publishable_key="pk_live_1234567890abcdef",
                    stripe_webhook_secret="whsec_1234567890abcdef",
                    stripe_price_standard_monthly="invalid_price_id",
                    stripe_price_pro_monthly="price_pro_monthly",
                    stripe_price_enterprise_monthly="price_enterprise_monthly",
                    stripe_price_standard_annual="price_standard_annual",
                    stripe_price_pro_annual="price_pro_annual",
                    stripe_price_enterprise_annual="price_enterprise_annual",
                )
            assert "real Stripe Price ID" in str(exc_info.value)

    def test_production_rejects_duplicate_price_ids(self):
        """In production, all price IDs must be unique."""
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            with pytest.raises(ValueError) as exc_info:
                Settings(
                    stripe_secret_key="sk_live_1234567890abcdef",
                    stripe_publishable_key="pk_live_1234567890abcdef",
                    stripe_webhook_secret="whsec_1234567890abcdef",
                    stripe_price_standard_monthly="price_1ABC123xyz",
                    stripe_price_pro_monthly="price_1ABC123xyz",  # Duplicate
                    stripe_price_enterprise_monthly="price_1GHI789rst",
                    stripe_price_standard_annual="price_1JKL012opq",
                    stripe_price_pro_annual="price_1MNO345lmn",
                    stripe_price_enterprise_annual="price_1PQR678ijk",
                )
            assert "unique" in str(exc_info.value).lower()

    def test_production_rejects_empty_price_ids(self):
        """In production, empty price IDs should be rejected."""
        with patch.dict("os.environ", {"APP_ENV": "production"}):
            with pytest.raises(ValueError) as exc_info:
                Settings(
                    stripe_secret_key="sk_live_1234567890abcdef",
                    stripe_publishable_key="pk_live_1234567890abcdef",
                    stripe_webhook_secret="whsec_1234567890abcdef",
                    stripe_price_standard_monthly="",
                    stripe_price_pro_monthly="price_pro_monthly",
                    stripe_price_enterprise_monthly="price_enterprise_monthly",
                    stripe_price_standard_annual="price_standard_annual",
                    stripe_price_pro_annual="price_pro_annual",
                    stripe_price_enterprise_annual="price_enterprise_annual",
                )
            # Empty string fails the regex check
            assert "real Stripe Price ID" in str(exc_info.value)

    def test_testing_env_allows_placeholders(self):
        """In test/CI environments, placeholders should be allowed."""
        with patch.dict("os.environ", {"APP_ENV": "test", "CI_TEST_MODE": "1"}):
            settings = Settings(
                stripe_price_standard_monthly="price_standard_monthly",
                stripe_price_pro_monthly="price_pro_monthly",
                stripe_price_enterprise_monthly="price_enterprise_monthly",
                stripe_price_standard_annual="price_standard_annual",
                stripe_price_pro_annual="price_pro_annual",
                stripe_price_enterprise_annual="price_enterprise_annual",
            )
            assert settings.stripe_price_standard_monthly == "price_standard_monthly"