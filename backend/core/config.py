from typing import Dict

from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
from pydantic import ConfigDict, field_validator, model_validator
import base64
import re

def _repo_root_env() -> Path | None:
    """The repo-root .env, or None when this isn't running from a checkout.

    The two things that consume this repo's env disagree about where .env
    lives: docker-compose interpolates ${VAR} from the repo-root file, while
    `cd backend && uvicorn main:app` (what the README says to run) makes a bare
    ".env" resolve to backend/.env. So Settings accepts both.

    The identity check matters. backend/core/config.py means parents[2] is the
    repo root in a checkout, but the container image copies backend/ to /app,
    where the same expression resolves to "/" -- which would quietly put /.env
    on the config search path of a service holding the field encryption key.
    Requiring a docker-compose.yml alongside it keeps the second path scoped to
    an actual checkout instead of the filesystem root.
    """
    candidate = Path(__file__).resolve().parents[2]
    return candidate / ".env" if (candidate / "docker-compose.yml").is_file() else None


_REPO_ROOT_ENV = _repo_root_env()


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    together_api_key: str = ""
    mistral_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_api_version: str = "2024-10-21"
    azure_openai_deployment: str = ""
    default_model: str = "claude-sonnet-4-6"
    mongodb_url: str = ""
    redis_url: str = "redis://localhost:6379"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"

    @field_validator("mongodb_url")
    @classmethod
    def check_mongodb_url(cls, v):
        import os
        if os.getenv("CI_TEST_MODE"):
            # Allow tests/CI to use a fallback local DB only when explicitly in CI.
            return v or "mongodb://localhost:27017/forge"

        if not v:
            raise ValueError("MONGODB_URL is required in non-test environments")

        # Atlas/local safety guard: allow localhost only in development.
        app_env = os.getenv("APP_ENV", "development")
        if app_env != "development" and "localhost" in v:
            raise ValueError(
                "MONGODB_URL must not point to localhost outside development"
            )

        # The production MongoDB is deployed as a 3-node replica set (rs0) in
        # k8s/mongodb.yaml. A connection string that omits `replicaSet=rs0`
        # makes the driver treat the seed as a standalone: it never discovers
        # the topology and cannot fail over to a new primary, silently
        # defeating the HA deployment. Require the replicaSet parameter in
        # production/non-dev environments so the app and backup tooling get a
        # correct failover-aware connection.
        if app_env != "development" and "replicaSet=" not in v:
            raise ValueError(
                "MONGODB_URL must include replicaSet=rs0 for the production "
                "replica set (k8s/mongodb.yaml deploys rs0)"
            )

        return v

    @field_validator("jwt_secret")
    @classmethod
    def check_jwt_secret(cls, v):
        import os

        # Unit tests expect strict validation when TESTING is not set.
        # In CI we still need the app to import; only allow a dummy
        # jwt_secret when TESTING is explicitly enabled.
        if os.getenv("CI_TEST_MODE") and os.getenv("TESTING"):
            if not v:
                return "test-secret-key-for-ci-purposes-only-32chars"

        # Production/dev validation
        if not v:
            raise ValueError("jwt_secret is required and must not be empty")

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
    github_webhook_secret: str = ""
    sandbox_host: str = "localhost"
    sandbox_timeout: int = 120
    credits_architect: int = 3
    credits_designer: int = 2
    credits_developer: int = 5
    credits_integration: int = 2
    credits_pm: int = 1
    credits_debug: int = 2
    credits_business_model: int = 2
    credits_initiative_generation: int = 5

    # Pricing Tiers ($USD)
    # Free: 0 credits, Standard: 100 credits/mo @ $20, Pro: 750 credits/mo @ $50
    # Credit packs available for purchase
    standard_monthly_price: int = 20
    pro_monthly_price: int = 50
    enterprise_minimum_annual: int = 5000  # $5K/yr minimum for enterprise
    free_credits: int = 5  # Reduced from 10 to limit abuse
    standard_credits: int = 100
    pro_credits: int = 750

    # Billing
    billing_provider: str = "stripe"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""
    stripe_price_standard_monthly: str = "price_standard_monthly"
    stripe_price_pro_monthly: str = "price_pro_monthly"
    stripe_price_enterprise_monthly: str = "price_enterprise_monthly"
    stripe_price_standard_annual: str = "price_standard_annual"
    stripe_price_pro_annual: str = "price_pro_annual"
    stripe_price_enterprise_annual: str = "price_enterprise_annual"

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_standard_monthly_plan_id: str = ""
    razorpay_pro_monthly_plan_id: str = ""
    razorpay_enterprise_monthly_plan_id: str = ""
    razorpay_standard_annual_plan_id: str = ""
    razorpay_pro_annual_plan_id: str = ""
    razorpay_enterprise_annual_plan_id: str = ""
    razorpay_credit_100_price_id: str = ""
    razorpay_credit_500_price_id: str = ""
    razorpay_credit_1000_price_id: str = ""
    razorpay_credit_5000_price_id: str = ""

    cashfree_app_id: str = ""
    cashfree_secret_key: str = ""
    cashfree_webhook_secret: str = ""
    cashfree_base_url: str = "https://api.cashfree.com/pg/v1"
    cashfree_standard_monthly_plan_id: str = ""
    cashfree_pro_monthly_plan_id: str = ""
    cashfree_enterprise_monthly_plan_id: str = ""
    cashfree_standard_annual_plan_id: str = ""
    cashfree_pro_annual_plan_id: str = ""
    cashfree_enterprise_annual_plan_id: str = ""
    cashfree_credit_100_price_id: str = ""
    cashfree_credit_500_price_id: str = ""
    cashfree_credit_1000_price_id: str = ""
    cashfree_credit_5000_price_id: str = ""

    # App
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    # Public host/IP that deployed-app preview containers are reachable at.
    # Containers are host-network-port-mapped (see api/deployments.py), so
    # this only needs to be a real value in production -- "localhost" is
    # correct when the browser and backend are on the same machine (PROD-004).
    deployment_host: str = "localhost"
    # Union with str lets pydantic-settings fall back to the raw env value when
    # it isn't JSON, so both JSON arrays and comma-separated strings work
    # NOTE: Keep type syntax compatible with older Python versions in CI.
    # (Python 3.9 doesn't support `list[str] | str` reliably.)
    allowed_origins: "list[str]" = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
    ]
    

    allowed_hosts: str = "localhost,127.0.0.1,testserver,*.trycloudflare.com,*.onrender.com"

    frontend_tunnel_url: str = ""

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

    # Celery
    celery_broker_url: str = ""
    celery_result_backend: str = ""

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # Security
    trusted_proxies: str = "127.0.0.1,::1"
    max_request_size: int = 10 * 1024 * 1024
    anthropic_timeout: int = 120
    build_timeout: int = 600  # 10 minutes max per build
    request_timeout: int = 120  # HTTP request timeout in seconds
    # Interactive builds: how long a gate waits for the user before
    # auto-approving and moving on. Must stay well under build_timeout or a
    # walked-away user burns the whole build window on a single gate.
    gate_timeout: int = 180
    gate_poll_interval: float = 2.0
    field_encryption_key: str = ""

    # Observability
    sentry_dsn: str = ""
    app_env: str = "development"

    @model_validator(mode="after")
    def validate_production_billing(self):
        """Fail at process startup instead of failing during customer checkout."""
        if self.app_env != "production":
            return self

        if self.billing_provider == "razorpay":
            if not self.razorpay_key_id or not self.razorpay_key_secret:
                raise ValueError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in production")
            return self

        if self.billing_provider == "cashfree":
            if not self.cashfree_app_id or not self.cashfree_secret_key:
                raise ValueError("CASHFREE_APP_ID and CASHFREE_SECRET_KEY must be set in production")
            return self

        if self.billing_provider != "stripe":
            raise ValueError("billing_provider must be one of: stripe, razorpay, cashfree")

        credential_prefixes = {
            "STRIPE_SECRET_KEY": (self.stripe_secret_key, "sk_live_"),
            "STRIPE_PUBLISHABLE_KEY": (self.stripe_publishable_key, "pk_live_"),
            "STRIPE_WEBHOOK_SECRET": (self.stripe_webhook_secret, "whsec_"),
        }
        for name, (value, prefix) in credential_prefixes.items():
            if not value or not value.startswith(prefix) or len(value) <= len(prefix) + 6:
                raise ValueError(f"{name} must contain a production Stripe value")

        prices = {
            "STRIPE_PRICE_STANDARD_MONTHLY": self.stripe_price_standard_monthly,
            "STRIPE_PRICE_PRO_MONTHLY": self.stripe_price_pro_monthly,
            "STRIPE_PRICE_ENTERPRISE_MONTHLY": self.stripe_price_enterprise_monthly,
            "STRIPE_PRICE_STANDARD_ANNUAL": self.stripe_price_standard_annual,
            "STRIPE_PRICE_PRO_ANNUAL": self.stripe_price_pro_annual,
            "STRIPE_PRICE_ENTERPRISE_ANNUAL": self.stripe_price_enterprise_annual,
        }
        for name, value in prices.items():
            if not re.fullmatch(r"price_[A-Za-z0-9]+", value):
                raise ValueError(f"{name} must contain a real Stripe Price ID")
        if len(set(prices.values())) != len(prices):
            raise ValueError("Production Stripe Price IDs must be unique")
        return self

    @field_validator("field_encryption_key")
    @classmethod
    def check_field_encryption_key(cls, value: str) -> str:
        """Require an independent, correctly sized field-encryption key."""
        import os
        
        if os.getenv("CI_TEST_MODE"):
            # Allow dummy values for CI/testing.
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

    model_config = ConfigDict(
        env_file=tuple(p for p in (_REPO_ROOT_ENV, ".env") if p is not None)
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Data retention policy (DB-003). Maps collection name -> TTL in seconds,
# applied as MongoDB TTL indexes on `created_at` in core.database._ensure_indexes
# (via apply_retention_ttl_indexes). Only ephemeral / high-volume collections are
# auto-expired; core business records (users, projects, builds, subscriptions,
# deployments, support_tickets, marketplace_items, etc.) are retained
# indefinitely. `rate_limits` is intentionally excluded here because its TTL is
# keyed on `reset_at` (see _ensure_indexes). Adjusting a value changes retention
# for newly-expiring documents on the next app start.
RETENTION_TTL_SECONDS: Dict[str, int] = {
    "build_files": 90 * 24 * 3600,       # 90 days
    "analytics_events": 90 * 24 * 3600,  # 90 days
    "audit_logs": 365 * 24 * 3600,       # 1 year (compliance record)
    "security_events": 90 * 24 * 3600,   # 90 days
    "token_blacklist": 24 * 3600,        # 24 hours (JWT revocation)
    "ai_usage": 90 * 24 * 3600,          # 90 days (cost tracking)
    "sessions": 30 * 24 * 3600,          # 30 days (matches refresh-token lifetime)
    "notifications": 90 * 24 * 3600,     # 90 days
}
