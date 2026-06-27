from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    default_model: str = "claude-sonnet-4-6"

    # DB
    mongodb_url: str = "mongodb://localhost:27017/forge"
    redis_url: str = "redis://localhost:6379"

    # Auth
    jwt_secret: str = "dev_secret_change_in_prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""

    # Sandbox
    sandbox_host: str = "localhost"
    sandbox_timeout: int = 120  # seconds per build action

    # Credits per action
    credits_architect: int = 3
    credits_designer: int = 2
    credits_developer: int = 5
    credits_integration: int = 2
    credits_pm: int = 1
    credits_debug: int = 2

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
