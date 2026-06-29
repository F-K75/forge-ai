from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import field_validator


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    default_model: str = "claude-sonnet-4-6"
    mongodb_url: str = "mongodb://localhost:27017/forge"
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = "dev-fallback-64-char-hex-string-do-not-use-in-prod-abcdef1234567890"
    jwt_algorithm: str = "HS256"

    @field_validator("jwt_secret")
    @classmethod
    def check_jwt_secret(cls, v):
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

    # Billing
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""

    # App
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

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

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
