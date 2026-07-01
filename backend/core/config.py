from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import field_validator
import base64


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    default_model: str = "claude-sonnet-4-6"
    mongodb_url: str = "mongodb://localhost:27017/forge"
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    @field_validator("jwt_secret")
    @classmethod
    def check_jwt_secret(cls, v):
        import os
        
        # Allow dummy values for CI/testing if explicitly flagged
        if os.getenv("CI_TEST_MODE"):
            if not v:
                return "test-secret-key-for-ci-purposes-only-32chars"
            return v
        
        # Block known dev fallback patterns even in testing
        blocked_patterns = [
            "dev-fallback",
            "do-not-use",
            "placeholder",
            "your_",
        ]
        if v and any(pattern in v for pattern in blocked_patterns):
            raise ValueError(
                "jwt_secret must not contain placeholder or fallback values"
            )

        if not v:
            raise ValueError("jwt_secret is required and must not be empty")
        if len(v) < 32:
            raise ValueError("jwt_secret must be at least 32 characters long")
        return v

    jwt_expire_minutes: int = 10080  # 7 days
    github_client_id: str = ""
    github_client_secret: str = ""
    sandbox_host: str = "localhost"
    sandbox_timeout: int = 120
    credits_architect: int = 3
    credits_designer: int = 2
    credits_developer: int = 5
    credits_integration: int = 2
    credits_pm: int = 1
    credits_debug: int = 2
    credits_business_model: int = 2

    # Billing
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""

    # App
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    # Union with str lets pydantic-settings fall back to the raw env value when
    # it isn't JSON, so both JSON arrays and comma-separated strings work
    allowed_origins: list[str] | str = ["http://localhost:3000", "http://localhost:5173"]
    allowed_hosts: str = "localhost,127.0.0.1,testserver"
    cors_allow_origins: str = (
        ""  # Comma-separated list of allowed CORS origins for production
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_allowed_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Admin
    admin_emails: str = "admin@forge.ai"

    # Growth
    resend_api_key: str = ""
    from_email: str = "noreply@forge.ai"

    # Database credentials (used by docker-compose)
    mongo_password: str = ""
    redis_password: str = ""

    # Security
    trusted_proxies: str = "127.0.0.1,::1"
    max_request_size: int = 10 * 1024 * 1024
    anthropic_timeout: int = 120
    build_timeout: int = 600  # 10 minutes max per build
    field_encryption_key: str = ""

    @field_validator("field_encryption_key")
    @classmethod
    def check_field_encryption_key(cls, value: str) -> str:
        """Require an independent, correctly sized field-encryption key."""
        import os
        
        # Allow dummy values for CI/testing if explicitly flagged
        if os.getenv("CI_TEST_MODE"):
            if not value:
                return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            return value
        
        if not value:
            raise ValueError("FIELD_ENCRYPTION_KEY is required")

        try:
            if len(bytes.fromhex(value)) == 32:
                return value
        except ValueError:
            pass

        try:
            if len(base64.urlsafe_b64decode(value.encode())) == 32:
                return value
        except (ValueError, TypeError):
            pass

        raise ValueError(
            "FIELD_ENCRYPTION_KEY must be 64 hexadecimal characters or a valid Fernet key"
        )

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
