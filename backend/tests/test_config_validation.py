import pytest
from pydantic import ValidationError
from core.config import Settings


def test_jwt_secret_required(monkeypatch):
    """JWT_SECRET must be provided - no default fallback."""
    monkeypatch.delenv("TESTING", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(jwt_secret="")
    
    assert "jwt_secret is required" in str(exc_info.value)


def test_jwt_secret_minimum_length(monkeypatch):
    """JWT_SECRET must be at least 32 characters."""
    monkeypatch.delenv("TESTING", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(jwt_secret="short")
    
    assert "at least 32 characters" in str(exc_info.value)


def test_jwt_secret_valid():
    """Valid JWT_SECRET should be accepted."""
    settings = Settings(jwt_secret="a" * 32)
    assert settings.jwt_secret == "a" * 32


def test_jwt_secret_no_dev_fallback():
    """Ensure the dev fallback string is not accepted as valid production config."""
    # This was the old fallback - should fail validation
    with pytest.raises(ValidationError):
        Settings(jwt_secret="dev-fallback-64-char-hex-string-do-not-use-in-prod-abcdef1234567890")


def test_jwt_secret_blocked_patterns():
    """Ensure blocked patterns are rejected."""
    with pytest.raises(ValidationError):
        Settings(jwt_secret="placeholder-secret-key-do-not-use-in-prod")


def test_production_allows_authenticated_internal_mongodb(monkeypatch):
    """Self-hosted production MongoDB is supported when it is not localhost."""
    monkeypatch.delenv("CI_TEST_MODE", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    settings = Settings(
        mongodb_url="mongodb://forge:secret@mongo:27017/forge?authSource=admin",
        jwt_secret="a" * 32,
        field_encryption_key="b" * 64,
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
    assert settings.mongodb_url.startswith("mongodb://forge:secret@mongo:")


def test_production_rejects_localhost_mongodb(monkeypatch):
    monkeypatch.delenv("CI_TEST_MODE", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ValidationError, match="must not point to localhost"):
        Settings(
            mongodb_url="mongodb://localhost:27017/forge",
            jwt_secret="a" * 32,
            field_encryption_key="b" * 64,
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

