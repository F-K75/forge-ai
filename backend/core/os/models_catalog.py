"""Non-admin, secret-free model metadata for ``GET /v1/os/models`` and the model selector.

PHASE2_DECISIONS.md #5: non-admins may see provider names, model ids, tiers and
public list prices (router registry + ``core.ai_usage.MODEL_COSTS``, the table
behind optimizer pricing). Never keys, quotas, health internals or org policy.

PHASE2_DECISIONS.md #7: the selector is a tier (Fast / Balanced / Best) the
router maps (``task_complexity``). Pinning an exact model is offered only on
Pro and Enterprise plans and to BYOK users.

Wire mapping of ``ModelSelection`` (the contract has no tier field):
``{"mode": "auto"}`` = Balanced; ``{"mode": "auto", "model": "fast"|"balanced"|"best"}``
= that tier; ``{"mode": "pinned", "provider"?, "model"}`` = an exact model.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from core.ai_usage import MODEL_COSTS
from core.os.common import OsHTTPError

TIERS: Dict[str, Dict[str, str]] = {
    "fast": {"label": "Fast", "task_complexity": "simple", "description": "Quickest and cheapest; good for short answers."},
    "balanced": {"label": "Balanced", "task_complexity": "moderate", "description": "The default mix of quality and speed."},
    "best": {"label": "Best", "task_complexity": "critical", "description": "Most capable model available to you."},
}
DEFAULT_TIER = "balanced"
PIN_PLANS = ("pro", "enterprise")


def _plan(user: Any) -> str:
    plan = getattr(user, "plan", "free")
    return getattr(plan, "value", plan) or "free"


def can_pin(user: Any) -> bool:
    return _plan(user) in PIN_PLANS or bool(getattr(user, "llm_api_key", None))


def model_tier(model: str) -> str:
    costs = MODEL_COSTS.get(model) or {}
    per_1k = float(costs.get("input", 0)) + float(costs.get("output", 0))
    if per_1k < 0.002:
        return "fast"
    if per_1k < 0.03:
        return "balanced"
    return "best"


def _registered(router: Any) -> Dict[str, List[str]]:
    """provider -> registered model names, from the router registry (no adapters or keys)."""
    out: Dict[str, List[str]] = {}
    try:
        for row in router.registry.list_models():
            out.setdefault(str(row["provider"]), []).append(str(row["name"]))
        for row in router.registry.list_providers():
            out.setdefault(str(row["name"]), [])
    except Exception:
        return {}
    return out


def list_models(router: Any = None) -> List[Dict[str, Any]]:
    registered = _registered(router) if router is not None else {}
    models = []
    for model, costs in sorted(MODEL_COSTS.items(), key=lambda kv: (kv[1]["provider"], kv[0])):
        provider = costs["provider"]
        models.append(
            {
                "provider": provider,
                "model": model,
                "tier": model_tier(model),
                # Public list prices, USD per 1k tokens.
                "input_per_1k_usd": float(costs["input"]),
                "output_per_1k_usd": float(costs["output"]),
                "available": provider in registered,
            }
        )
    return models


def catalog_for(user: Any, router: Any = None) -> Dict[str, Any]:
    return {
        "tiers": [{"id": tid, "label": t["label"], "description": t["description"]} for tid, t in TIERS.items()],
        "default_tier": DEFAULT_TIER,
        "can_pin": can_pin(user),
        "models": list_models(router),
    }


@dataclass
class ResolvedModel:
    tier: Optional[str]
    task_complexity: Optional[str]
    model: Optional[str]  # exact model only when pinned
    provider: Optional[str]

    def model_ref(self) -> Optional[Dict[str, str]]:
        if self.model and self.provider:
            return {"provider": self.provider, "model": self.model}
        return None


def resolve_selection(user: Any, selection: Any) -> ResolvedModel:
    """Validate a ``ModelSelection`` against the caller's plan. Raises ``OsHTTPError``."""
    if selection is None:
        return ResolvedModel(DEFAULT_TIER, TIERS[DEFAULT_TIER]["task_complexity"], None, None)
    mode = getattr(selection, "mode", None) or (selection.get("mode") if isinstance(selection, dict) else None)
    model = getattr(selection, "model", None) if not isinstance(selection, dict) else selection.get("model")
    provider = getattr(selection, "provider", None) if not isinstance(selection, dict) else selection.get("provider")
    if mode == "auto":
        tier = (model or DEFAULT_TIER).lower()
        if tier not in TIERS:
            raise OsHTTPError(422, "validation_failed", "Unknown model tier; use fast, balanced or best")
        return ResolvedModel(tier, TIERS[tier]["task_complexity"], None, None)
    if mode != "pinned":
        raise OsHTTPError(422, "validation_failed", "Unknown model selection mode")
    if not can_pin(user):
        raise OsHTTPError(403, "forbidden", "Pinning a model needs a Pro or Enterprise plan or your own key")
    if not model:
        raise OsHTTPError(422, "validation_failed", "A pinned selection needs a model")
    known = MODEL_COSTS.get(model)
    byok_model = getattr(user, "llm_model", None)
    if known is None and model != byok_model:
        raise OsHTTPError(422, "validation_failed", "Unknown model")
    expected_provider = known["provider"] if known else (provider or getattr(user, "llm_provider", None) or "byok")
    if provider and known and provider != expected_provider:
        raise OsHTTPError(422, "validation_failed", "Model does not belong to that provider")
    return ResolvedModel(None, None, model, expected_provider)
