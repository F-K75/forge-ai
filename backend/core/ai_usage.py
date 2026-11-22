"""LLM cost tracking and budget management for AI pipeline."""

import uuid
import logging
import re
from typing import Any, Dict, List, Optional
from datetime import timedelta
from core.models import utcnow

from core.database import get_db

logger = logging.getLogger(__name__)

# cost per 1K tokens, in USD.
# NOTE: OpenRouter-namespaced model IDs (e.g. "anthropic/claude-opus-4.8")
# are priced here at the same rate as their underlying Anthropic model,
# using standard Anthropic list-pricing tiers as the basis. OpenRouter may
# add its own margin on top -- verify against https://openrouter.ai/models
# before relying on this for real billing/invoicing.
MODEL_COSTS = {
    "claude-sonnet-4-6": {"input": 0.003, "output": 0.015, "provider": "anthropic"},
    "claude-opus-3": {"input": 0.015, "output": 0.075, "provider": "anthropic"},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03, "provider": "openai"},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006, "provider": "openai"},
    "gpt-4.1": {"input": 0.002, "output": 0.008, "provider": "openai"},
    "anthropic/claude-opus-4.8": {"input": 0.015, "output": 0.075, "provider": "openrouter"},
    "anthropic/claude-sonnet-5": {"input": 0.003, "output": 0.015, "provider": "openrouter"},
    "anthropic/claude-haiku-4.5": {"input": 0.0008, "output": 0.004, "provider": "openrouter"},
    "openrouter/auto": {"input": 0.003, "output": 0.015, "provider": "openrouter"},
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005, "provider": "gemini"},
    "llama-3.1-8b": {"input": 0.00005, "output": 0.00008, "provider": "groq"},
    "meta-llama/Llama-3-8b-chat-hf": {"input": 0.0002, "output": 0.0002, "provider": "together"},
    "llama3.2": {"input": 0.0, "output": 0.0, "provider": "ollama"},
    "mistral-small-latest": {"input": 0.0002, "output": 0.0006, "provider": "mistral"},
    # Retrieval embeddings (retrieval/embeddings.py): input-only pricing.
    "text-embedding-3-small": {"input": 0.00002, "output": 0.0, "provider": "openai"},
}
DEFAULT_MODEL = "claude-sonnet-4-6"


def is_priced_model(model: Optional[str]) -> bool:
    """True when ``model`` has an explicit ``MODEL_COSTS`` entry. Platform
    budgets (the guardrail L-tier) refuse unpriced models rather than
    silently pricing them at the default model's rate (§4.6)."""
    return bool(model) and model in MODEL_COSTS

# Anthropic prompt-cache reads are billed at ~10% of the input rate
CACHED_INPUT_DISCOUNT = 0.1

DEFAULT_DAILY_TOKEN_BUDGETS = {
    "free": 10_000,
    "standard": 100_000,
    "pro": 500_000,
    "enterprise": 2_000_000,
}

# Token budget alert thresholds (percentage of daily limit)
BUDGET_ALERT_THRESHOLDS = [50, 80, 100]


class BudgetExceeded(Exception):
    def __init__(self, message: str, used: int, limit: int):
        self.message = message
        self.used = used
        self.limit = limit
        super().__init__(message)


def estimate_tokens(text: str) -> int:
    """Estimate the number of tokens in a text string using a character-count
    heuristic. ~4 characters per token for English text, ~1.5 characters per
    token for code-heavy content. Rounds up to be conservative (over-estimation
    is safer than under-estimation for budget enforcement).

    This is a pre-call estimate only; exact token counts from the provider
    response override it after the call completes.
    """
    if not text:
        return 0

    # Count code-like characters (non-alphanumeric symbols common in code)
    code_chars = len(re.findall(r'[{}[\]();:.,<>=+\-*/&|!~^%#@`\'\"\\]', text))
    total_chars = len(text)

    # Heuristic: code chars are denser (~1.5 chars/token), text is ~4 chars/token
    # Weighted average: assume code_chars proportion of the text is code
    if total_chars == 0:
        return 0

    code_ratio = min(code_chars / total_chars, 1.0)
    text_ratio = 1.0 - code_ratio

    # Conservative estimates (round up)
    code_tokens = int((total_chars * code_ratio) / 1.5) + 1
    text_tokens = int((total_chars * text_ratio) / 4.0) + 1

    return code_tokens + text_tokens


def get_model_provider(model: str) -> str:
    return MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])["provider"]


def calculate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
) -> float:
    """Cost in USD for one LLM call. `cached_tokens` is a subset of prompt_tokens billed at a discount."""
    costs = MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])
    cached_tokens = min(cached_tokens, prompt_tokens)
    billable_prompt = prompt_tokens - cached_tokens
    cost = (
        billable_prompt * costs["input"]
        + cached_tokens * costs["input"] * CACHED_INPUT_DISCOUNT
        + completion_tokens * costs["output"]
    ) / 1000
    return cost


async def _effective_daily_limit(db, user_id: str, org_id: Optional[str]) -> int:
    plan = "free"
    if org_id:
        org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "plan": 1})
        if org and org.get("plan"):
            plan = org["plan"]
    else:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "plan": 1})
        if user and user.get("plan"):
            plan = user["plan"]
    plan = getattr(plan, "value", plan)
    return DEFAULT_DAILY_TOKEN_BUDGETS.get(plan, DEFAULT_DAILY_TOKEN_BUDGETS["free"])


async def get_user_budget(user_id: str, org_id: Optional[str] = None) -> Dict[str, Any]:
    """Aggregate today's (UTC) token usage for a user or organization against its plan's daily limit."""
    db = await get_db()
    limit = await _effective_daily_limit(db, user_id, org_id)
    day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    match: Dict[str, Any] = {"created_at": {"$gte": day_start}}
    match["org_id" if org_id else "user_id"] = org_id if org_id else user_id

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "cost": {"$sum": "$cost"},
            }
        },
    ]
    agg = [doc async for doc in db.ai_usage.aggregate(pipeline)]
    prompt_tokens = agg[0]["prompt_tokens"] if agg else 0
    completion_tokens = agg[0]["completion_tokens"] if agg else 0
    cost = agg[0]["cost"] if agg else 0.0
    used = prompt_tokens + completion_tokens

    return {
        "used": used,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": round(cost, 6),
        "limit": limit,
        "remaining": max(0, limit - used),
    }


async def check_budget(user_id: str, estimated_tokens: int = 0, org_id: Optional[str] = None) -> None:
    """Raise BudgetExceeded if the next call would push usage past the daily limit. Fail-closed.

    `estimated_tokens` should be a realistic pre-call estimate of how many
    tokens the upcoming LLM call will consume. When called with 0 (the default),
    this only blocks users who are *already* over their limit -- callers should
    always pass a positive estimate for effective enforcement.
    """
    budget = await get_user_budget(user_id, org_id=org_id)
    if budget["used"] + estimated_tokens > budget["limit"]:
        raise BudgetExceeded(
            f"Daily token budget exceeded ({budget['used'] + estimated_tokens}/{budget['limit']} tokens would be used)",
            used=budget["used"],
            limit=budget["limit"],
        )


async def check_and_send_token_budget_alerts(
    db,
    user_id: str,
    user_email: str,
    user_name: str,
    used: int,
    limit: int,
) -> None:
    """Check if any budget alert thresholds have been crossed and send email
    notifications. Best-effort: failures here must never block the build pipeline.

    Thresholds: 50%, 80%, 100% of daily token budget.
    Each threshold fires at most once per user (tracked via
    `token_budget_alerts_sent` on the User document).
    """
    if limit <= 0:
        return

    usage_pct = int((used / limit) * 100)
    thresholds_to_fire = [t for t in BUDGET_ALERT_THRESHOLDS if usage_pct >= t]

    if not thresholds_to_fire:
        return

    # Fetch the user doc to see which alerts have already been sent
    user_doc = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "token_budget_alerts_sent": 1},
    )
    already_sent: List[str] = (user_doc or {}).get("token_budget_alerts_sent") or []

    new_alerts = []
    for threshold in thresholds_to_fire:
        key = f"daily_{threshold}"
        if key not in already_sent:
            new_alerts.append(key)

    if not new_alerts:
        return

    # Send email alerts for new thresholds
    from core.config import get_settings
    settings = get_settings()

    if settings.resend_api_key:
        try:
            import resend
            resend.api_key = settings.resend_api_key

            for key in new_alerts:
                threshold_pct = int(key.split("_")[1])
                subject = f"Forge: You've used {threshold_pct}% of your daily AI token budget"
                body = (
                    f"Hi {user_name},\n\n"
                    f"You've used {usage_pct}% of your daily AI token budget "
                    f"({used:,} / {limit:,} tokens).\n\n"
                    f"Your builds will be paused once you reach 100%.\n"
                    f"Your budget resets daily at midnight UTC.\n\n"
                    f"— Forge AI"
                )
                resend.Emails.send({
                    "from": settings.from_email,
                    "to": user_email,
                    "subject": subject,
                    "text": body,
                })
        except Exception:
            logger.exception("Failed to send token budget alert email for user %s", user_id)

    # Mark all new thresholds as sent (even if email failed -- avoid re-sending
    # on every subsequent LLM call, which would spam the error log).
    try:
        await db.users.update_one(
            {"id": user_id},
            {"$addToSet": {"token_budget_alerts_sent": {"$each": new_alerts}}},
        )
    except Exception:
        logger.exception("Failed to update token_budget_alerts_sent for user %s", user_id)


async def track_usage(
    user_id: str,
    build_id: Optional[str],
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    cached_tokens: int = 0,
    provider: Optional[str] = None,
    agent: Optional[str] = None,
    byok: bool = False,
) -> Dict[str, Any]:
    """Persist a single LLM call's usage record. Called after every completed LLM call, win or lose.

    After persisting, fires budget alert checks so users are notified when
    they cross 50%/80%/100% of their daily token budget.
    """
    db = await get_db()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "org_id": org_id,
        "project_id": project_id,
        "build_id": build_id,
        "agent": agent,
        "model": model,
        "provider": provider or get_model_provider(model),
        "byok": bool(byok),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cached_tokens": cached_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "cost": round(cost_usd, 6),
        "created_at": utcnow(),
    }
    await db.ai_usage.insert_one(record)

    await _fire_budget_alerts(db, user_id, org_id)

    budget = await get_user_budget(user_id, org_id=org_id)
    record["budget_remaining"] = budget["remaining"]
    return record


async def _fire_budget_alerts(db, user_id: str, org_id: Optional[str]) -> None:
    """Fire budget alert checks after persisting usage. Best-effort."""
    try:
        user_doc = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "email": 1, "name": 1},
        )
        if user_doc:
            budget = await get_user_budget(user_id, org_id=org_id)
            await check_and_send_token_budget_alerts(
                db,
                user_id=user_id,
                user_email=user_doc.get("email", ""),
                user_name=user_doc.get("name", ""),
                used=budget["used"],
                limit=budget["limit"],
            )
    except Exception:
        logger.exception("Failed to check token budget alerts for user %s", user_id)


async def get_spending_dashboard(days: int = 30, limit: int = 100) -> List[Dict[str, Any]]:
    """Admin-facing per-user spending summary over the trailing `days`."""
    db = await get_db()
    since = utcnow() - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": "$user_id",
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "total_tokens": {"$sum": "$total_tokens"},
                "cost_usd": {"$sum": "$cost"},
                "requests": {"$sum": 1},
            }
        },
        {"$sort": {"cost_usd": -1}},
        {"$limit": limit},
    ]
    results = []
    async for doc in db.ai_usage.aggregate(pipeline):
        results.append(
            {
                "user_id": doc["_id"],
                "prompt_tokens": doc.get("prompt_tokens", 0),
                "completion_tokens": doc.get("completion_tokens", 0),
                "total_tokens": doc.get("total_tokens", 0),
                "cost_usd": round(doc.get("cost_usd", 0.0), 6),
                "requests": doc.get("requests", 0),
            }
        )
    return results


# --------------------------------------------------------------------------- #
# Unified per-attempt usage recording (A2; docs/architecture/agent-
# collaboration-plan.md §6, §7.2, §15.2). One row per provider attempt on
# every channel, including failed zero-token attempts. Written by
# core/llm/router.py, gateway/guardrails.py and retrieval/embeddings.py when
# `settings.unified_usage_recording` is on (legacy `track_usage` otherwise).
# --------------------------------------------------------------------------- #

USAGE_SCHEMA_VERSION = 2

# UA-5 allow-list: every field an `ai_usage` row may carry. Metadata only --
# never prompt, completion, message or provider error text (U11). Rows are
# validated against this set before they are written.
USAGE_ROW_FIELDS = frozenset({
    "id", "schema_version", "created_at",
    # who / what
    "user_id", "org_id", "project_id", "build_id", "agent",
    "beneficiary_user_id", "beneficiary_org_id", "beneficiary_project_id",
    "principal", "platform_principal",
    # attribution (§15.2)
    "purpose", "attempt_kind", "operation_id", "dispatch_no", "attempt_seq", "request_id",
    "outcome", "error_class", "credential", "cost_bearer", "account", "processing_boundary",
    # provider and tokens
    "provider", "model", "byok",
    "prompt_tokens", "completion_tokens", "cached_tokens", "total_tokens", "cost", "latency_ms",
})

# Legacy `track_usage` rows (schema 1) are a subset of the allow-list.
LEGACY_USAGE_ROW_FIELDS = frozenset({
    "id", "user_id", "org_id", "project_id", "build_id", "agent", "model", "provider", "byok",
    "prompt_tokens", "completion_tokens", "cached_tokens", "total_tokens", "cost", "created_at",
})

USAGE_OUTCOMES = frozenset({"success", "error", "cache_hit", "denied"})

_ERROR_CLASS_RE = re.compile(r"^[A-Za-z0-9_.:\-]{1,64}$")


class UsageRowSchemaError(ValueError):
    """A usage row carried a field outside the U11 allow-list."""


def validate_usage_row(row: Dict[str, Any]) -> Dict[str, Any]:
    extra = set(row) - USAGE_ROW_FIELDS
    if extra:
        raise UsageRowSchemaError(f"ai_usage row carries non-allow-listed fields: {sorted(extra)}")
    boundary = row.get("processing_boundary")
    if boundary is not None and set(boundary) - {"credential_mode"}:
        raise UsageRowSchemaError("ai_usage.processing_boundary may only carry credential_mode")
    return row


def safe_error_class(value: Any) -> Optional[str]:
    """An error *class* (an identifier such as ``ProviderError`` or
    ``timeout``), never the exception message: provider messages can echo
    request content."""
    if value is None:
        return None
    if isinstance(value, BaseException):
        explicit = getattr(value, "error_class", None)
        value = explicit if isinstance(explicit, str) else type(value).__name__
    text = str(value)
    return text if _ERROR_CLASS_RE.match(text) else "error"


async def record_provider_attempt(
    *,
    purpose: str,
    outcome: str,
    credential: str,
    account: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    principal: str = "user",
    user_id: Optional[str] = None,
    beneficiary_user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    build_id: Optional[str] = None,
    agent: Optional[str] = None,
    operation_id: Optional[str] = None,
    dispatch_no: Optional[int] = None,
    attempt_seq: Optional[int] = None,
    attempt_kind: str = "primary",
    request_id: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cached_tokens: int = 0,
    error_class: Any = None,
    credential_mode: Optional[str] = None,
    latency_ms: Optional[float] = None,
) -> Dict[str, Any]:
    """Persist one provider attempt. Platform principals (guardrail, shadow,
    monitoring, retrieval) are recorded **without** ``user_id``/``org_id``/
    ``project_id`` -- the customer they ran for is kept in the
    ``beneficiary_*`` fields -- so no user, org or project budget query ever
    counts platform-funded spend (UA-3, UA-4)."""
    if outcome not in USAGE_OUTCOMES:
        raise ValueError(f"unknown usage outcome {outcome!r}")
    platform = principal != "user"
    prompt_tokens = max(0, int(prompt_tokens or 0))
    completion_tokens = max(0, int(completion_tokens or 0))
    cached_tokens = max(0, int(cached_tokens or 0))
    cost = 0.0
    if prompt_tokens or completion_tokens:
        cost = calculate_cost(model or DEFAULT_MODEL, prompt_tokens, completion_tokens, cached_tokens=cached_tokens)
    byok = credential == "byok"
    record: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "schema_version": USAGE_SCHEMA_VERSION,
        "created_at": utcnow(),
        "user_id": None if platform else user_id,
        "org_id": None if platform else org_id,
        "project_id": None if platform else project_id,
        "beneficiary_user_id": beneficiary_user_id if beneficiary_user_id is not None else user_id,
        "beneficiary_org_id": org_id,
        "beneficiary_project_id": project_id,
        "build_id": build_id,
        "agent": agent,
        "principal": principal,
        "platform_principal": platform,
        "purpose": purpose,
        "attempt_kind": attempt_kind,
        "operation_id": operation_id,
        "dispatch_no": dispatch_no,
        "attempt_seq": attempt_seq,
        "request_id": request_id,
        "outcome": outcome,
        "error_class": safe_error_class(error_class),
        "credential": credential,
        "cost_bearer": "customer_provider" if byok else "platform",
        "account": account,
        "processing_boundary": {"credential_mode": credential_mode} if credential_mode else None,
        "provider": provider or (get_model_provider(model) if model else None),
        "model": model,
        "byok": byok,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cached_tokens": cached_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "cost": round(cost, 6),
        "latency_ms": round(float(latency_ms), 3) if latency_ms is not None else None,
    }
    validate_usage_row(record)
    db = await get_db()
    await db.ai_usage.insert_one(record)
    if not platform and user_id and (prompt_tokens + completion_tokens) > 0:
        await _fire_budget_alerts(db, user_id, org_id)
    return record
