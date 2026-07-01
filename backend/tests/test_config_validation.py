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