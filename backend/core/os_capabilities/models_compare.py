"""``models.compare``: a deterministic comparison table of models (no LLM, no secrets).

Phase 2 decision (docs/os/PHASE2_DECISIONS.md #5): non-admins may see provider
names, model ids, tiers and public list prices from the router registry and
the optimizer pricing table. They never see keys, quotas, health internals or
org policy, so this module reads only:

* ``core.ai_usage.MODEL_COSTS`` (the same public price list the optimizer's
  ``/api/optimizer/pricing`` table is derived from), and
* ``LLMRouter.registry.list_models()`` (provider + model name only) to say
  whether a model is configured in this deployment.

Swap point: when WS-C's ``core/os/models_catalog.py`` (``GET /v1/os/models``)
lands, :func:`model_catalog` should delegate to it so the composer's model
picker and this table share one source.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from core.os_capabilities.surfaces import action, create_surface, new_surface_id, placement

CAPABILITY_ID = "models.compare"
MAX_SUBJECTS = 8

PROVIDER_ALIASES = {
    "claude": "anthropic",
    "anthropic": "anthropic",
    "gpt": "openai",
    "openai": "openai",
    "chatgpt": "openai",
    "gemini": "gemini",
    "google": "gemini",
    "llama": "groq",
    "meta": "together",
    "mistral": "mistral",
    "groq": "groq",
    "together": "together",
    "ollama": "ollama",
    "openrouter": "openrouter",
}
PROVIDER_LABELS = {
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "gemini": "Google Gemini",
    "groq": "Groq",
    "together": "Together",
    "ollama": "Ollama (local)",
    "mistral": "Mistral",
    "openrouter": "OpenRouter",
}


def tier_for(input_per_1k: float) -> str:
    """Router-facing tier (Fast / Balanced / Best, PHASE2_DECISIONS #7) from public list price."""
    if input_per_1k >= 0.005:
        return "Best"
    if input_per_1k >= 0.001:
        return "Balanced"
    return "Fast"


def _configured() -> Set[Tuple[str, str]]:
    try:
        from core.llm.router import get_llm_router

        return {(str(m.get("provider")), str(m.get("name"))) for m in get_llm_router().registry.list_models()}
    except Exception:  # noqa: BLE001 - availability is best effort, never an error
        return set()


def model_catalog() -> List[Dict[str, Any]]:
    """Secret-free model metadata: provider, model id, tier, list prices, availability."""
    from core.ai_usage import MODEL_COSTS

    configured = _configured()
    configured_models = {m for _, m in configured}
    out = []
    for model, pricing in MODEL_COSTS.items():
        provider = str(pricing.get("provider", "unknown"))
        inp = float(pricing.get("input", 0.0))
        outp = float(pricing.get("output", 0.0))
        out.append({
            "id": model,
            "provider": provider,
            "provider_label": PROVIDER_LABELS.get(provider, provider.title()),
            "tier": tier_for(inp),
            "input_per_1m_usd": round(inp * 1000, 4),
            "output_per_1m_usd": round(outp * 1000, 4),
            "available": (provider, model) in configured or model in configured_models,
        })
    return out


def _tokens(text: str) -> List[str]:
    return [t for t in re.split(r"[^a-z0-9.\-]+", text.lower()) if t]


def select_models(catalog: Sequence[Dict[str, Any]], models: Iterable[str] = (), providers: Iterable[str] = (),
                  query: Optional[str] = None) -> List[Dict[str, Any]]:
    wanted_models = [m.lower() for m in models if m]
    wanted_providers = {PROVIDER_ALIASES.get(p.lower(), p.lower()) for p in providers if p}
    for tok in _tokens(query or ""):
        if tok in PROVIDER_ALIASES:
            wanted_providers.add(PROVIDER_ALIASES[tok])
    picked: List[Dict[str, Any]] = []

    def add(entry: Dict[str, Any]) -> None:
        if entry not in picked and len(picked) < MAX_SUBJECTS:
            picked.append(entry)

    for want in wanted_models:
        for entry in catalog:
            if entry["id"].lower() == want:
                add(entry)
        for entry in catalog:
            if want in entry["id"].lower():
                add(entry)
    for provider in sorted(wanted_providers):
        # Direct-provider models first, best tier first, so "Claude vs GPT" compares flagship to flagship.
        matches = [e for e in catalog if e["provider"] == provider]
        if not matches:
            alias = next((a for a, p in PROVIDER_ALIASES.items() if p == provider), provider)
            matches = [e for e in catalog if alias in e["id"].lower()]
        for entry in sorted(matches, key=lambda e: -e["input_per_1m_usd"])[:3]:
            add(entry)
    if len(picked) < 2:
        # Nothing specific asked: one representative (priciest = most capable) per provider.
        seen: Set[str] = {e["provider"] for e in picked}
        for entry in sorted(catalog, key=lambda e: -e["input_per_1m_usd"]):
            if entry["provider"] not in seen:
                add(entry)
                seen.add(entry["provider"])
    return picked


def compare_surface(*, models: Iterable[str] = (), providers: Iterable[str] = (), query: Optional[str] = None,
                    presentation: str = "window") -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    catalog = model_catalog()
    subjects = select_models(catalog, models, providers, query)
    if len(subjects) < 2:
        subjects = catalog[:2]
    surface_id = new_surface_id(CAPABILITY_ID, "compare")
    ids = [f"m{i}" for i in range(len(subjects))]
    rows = [
        {"label": "Provider", "values": [s["provider_label"] for s in subjects], "better": "none"},
        {"label": "Tier", "values": [s["tier"] for s in subjects], "better": "none"},
        {"label": "Input $ / 1M tokens", "values": [s["input_per_1m_usd"] for s in subjects], "better": "lower"},
        {"label": "Output $ / 1M tokens", "values": [s["output_per_1m_usd"] for s in subjects], "better": "lower"},
        {"label": "Configured here", "values": [s["available"] for s in subjects], "better": "higher"},
    ]
    pin_buttons = []
    components: List[Dict[str, Any]] = [
        {"id": "title", "component": "Heading", "text": "Model comparison", "level": 2},
        {"id": "note", "component": "Text", "variant": "caption",
         "text": "Public list prices from Forge's pricing table. Quality depends on the task; try a short prompt with each."},
        {"id": "table", "component": "ComparisonTable",
         "subjects": [{"id": sid, "label": s["id"][:120]} for sid, s in zip(ids, subjects)], "rows": rows},
    ]
    for sid, s in zip(ids, subjects):
        if not s["available"]:
            continue
        bid = f"pin_{sid}"
        components.append({
            "id": bid, "component": "Button", "label": f"Use {s['id']}"[:120], "variant": "secondary",
            "action": action(CAPABILITY_ID, "pin_model", {"provider": s["provider"], "model": s["id"]}),
        })
        pin_buttons.append(bid)
    children = ["title", "note", "table"]
    if pin_buttons:
        components.append({"id": "pins", "component": "Row", "children": pin_buttons, "gap": "sm", "wrap": True})
        children.append("pins")
    components.insert(0, {"id": "root", "component": "Column", "children": children, "gap": "md"})
    return [create_surface(surface_id, components)], [placement(surface_id, presentation, "Model comparison", CAPABILITY_ID)], subjects
