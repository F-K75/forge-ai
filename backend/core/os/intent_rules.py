"""Deterministic intent classifier: the no-LLM path (``source: "rules"`` / ``"explicit"``).

Used when no model provider is configured, the LLM call fails or times out,
or its output fails schema validation (ARCHITECTURE.md, step 3). Order:

1. explicit ``/capability.id`` or ``@capability.id`` mentions (``explicit``);
2. attachment MIME / kind rules (a dataset means ``analyze_data``);
3. high-precision phrase rules for the owner-example intents;
4. keyword scoring over every capability (descriptor ``keywords``, else the
   curated ``FALLBACK_KEYWORDS``);
5. ``chat``.

Pure and synchronous: no I/O, no model calls.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

_MODEL_WORDS = r"(?:claude|gpt[\w.\-]*|gemini|llama[\w.\-]*|mistral|sonnet|opus|haiku|o\d|grok|deepseek|llms?|models?)"

# (name, pattern, intent kind, capability id, confidence)
PHRASE_RULES: List[Tuple[str, re.Pattern, str, str, float]] = [
    (
        "monitor_run",
        re.compile(
            r"\b(?:how(?:'s|’s| is| are)?|what(?:'s|’s| is)?|status of|progress of|show(?: me)?(?: the)? progress of|check(?: on)?)\b"
            r"[^?.!]*\b(?:kernel )?run\s*#?\s*[\w\-]*\d[\w\-]*\b|\brun\s*#?\s*[\w\-]*\d[\w\-]*\b[^?.!]*\b(?:going|status|progress|doing|look(?:ing)?)\b",
            re.I,
        ),
        "monitor_run",
        "agents.kernel_run",
        0.85,
    ),
    ("start_run", re.compile(r"\brun (?:the |my )?agents? (?:on|against|for)\b", re.I), "monitor_run", "agents.kernel_run", 0.8),
    (
        "approve_gate",
        re.compile(r"\b(?:approve|reject|sign off on|sign-off)\b|\bneeds? my (?:approval|sign[- ]?off)\b|\bpending (?:approvals?|gates?)\b", re.I),
        "approve_gate",
        "governance.approvals",
        0.8,
    ),
    (
        "compare_models",
        re.compile(
            rf"\bcompare\b[^?.!]*\b{_MODEL_WORDS}\b|\b{_MODEL_WORDS}\b[^?.!]*\b(?:vs\.?|versus|against|compared (?:to|with))\b[^?.!]*\b{_MODEL_WORDS}\b"
            rf"|\bwhich (?:model|llm)\b",
            re.I,
        ),
        "compare_models",
        "models.compare",
        0.85,
    ),
    (
        "design_workflow",
        re.compile(r"\b(?:design|create|build|make|draft|map(?: out)?|set up|plan)\b[^?.!]*\b(?:workflow|pipeline)s?\b", re.I),
        "design_workflow",
        "workflow.design",
        0.85,
    ),
    (
        "create_agent",
        re.compile(
            r"\b(?:create|make|build|set up|setup|spin up|configure|add|new)\b[^?.!]*\b(?:agent|bot)\b(?! (?:run|fleet|org))",
            re.I,
        ),
        "create_agent",
        "agents.create",
        0.85,
    ),
    (
        "build_website",
        re.compile(
            r"\b(?:build|make|create|generate|launch|design|spin up|start)\b[^?.!]*\b(?:site|website|web ?site|web ?app|webapp|app|application|"
            r"landing page|homepage|home page|online store|storefront|store|shop|portfolio|blog)\b",
            re.I,
        ),
        "build_website",
        "build.new",
        0.85,
    ),
    (
        "manage_projects",
        re.compile(r"\b(?:show|list|open|see|view|find|browse)\b[^?.!]*\bprojects\b|\bmy projects\b|\ball projects\b", re.I),
        "manage_projects",
        "projects.manage",
        0.85,
    ),
    (
        "review_code",
        re.compile(r"\breview\b[^?.!]*\b(?:pr|prs|pull requests?|code|diff|branch|changes)\b", re.I),
        "review_code",
        "reviews.board",
        0.8,
    ),
    (
        "analyze_data",
        re.compile(r"\b(?:chart|plot|graph|visuali[sz]e|analy[sz]e|breakdown of|histogram|trend of)\b", re.I),
        "analyze_data",
        "data.analyze",
        0.7,
    ),
]

_EXPLICIT = re.compile(r"(?:^|\s)[/@]([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+)\b")
_RUN_ID = re.compile(r"\brun\s*#?\s*([A-Za-z0-9][\w\-]{0,63})", re.I)
_DATASET_MIMES = {"text/csv", "text/tab-separated-values", "application/json"}
_MODEL_ENTITY = re.compile(r"\b(claude|gpt[\w.\-]*|gemini|llama[\w.\-]*|mistral|sonnet|opus|haiku|grok|deepseek)\b", re.I)
_SKIP_SCORING = {"chat.answer"}


def _intent_result(kind: str, confidence: float, capability_ids: List[str], entities: Dict[str, Any], source: str, rationale: str) -> Dict[str, Any]:
    return {
        "kind": kind,
        "confidence": round(max(0.0, min(1.0, confidence)), 3),
        "capability_ids": capability_ids[:10],
        "entities": entities,
        "source": source,
        "rationale": rationale[:500],
    }


def extract_entities(prompt: str, attachments: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    entities: Dict[str, Any] = {}
    text = prompt or ""
    m = _RUN_ID.search(text)
    if m and any(ch.isdigit() for ch in m.group(1)):
        entities["run_id"] = m.group(1)
    models = []
    for mm in _MODEL_ENTITY.finditer(text):
        name = mm.group(1).lower()
        if name not in models:
            models.append(name)
    if models:
        entities["models"] = models[:8]
    criteria = re.search(r"\bfor ([a-z][\w \-]{1,40}?)(?:[?.!,]|$)", text, re.I)
    if criteria:
        entities["topic"] = criteria.group(1).strip()
    env = re.search(r"\b(prod|production|staging|dev|development)\b", text, re.I)
    if env:
        entities["environment"] = {"prod": "production", "dev": "development"}.get(env.group(1).lower(), env.group(1).lower())
    objective = re.search(r"\b(?:agent|bot)s? (?:that|to|which|who) (.{3,300})", text, re.I) or re.search(
        r"\bagents? on (.{3,300})", text, re.I
    )
    if objective:
        entities["objective"] = objective.group(1).strip().rstrip("?.!")[:300]
    for att in attachments or []:
        if att.get("kind") == "dataset" or att.get("mime_type") in _DATASET_MIMES:
            entities.setdefault("attachment_id", att["id"])
    return entities


def explicit_mention(prompt: str, registry) -> Optional[Dict[str, Any]]:
    for m in _EXPLICIT.finditer(prompt or ""):
        desc = registry.get(m.group(1))
        if desc is not None:
            kind = (desc.get("intents") or ["open_capability"])[0]
            return _intent_result(
                kind, 1.0, [desc["id"]], extract_entities(prompt), "explicit", f"Explicit mention of {desc['id']}"
            )
    return None


def _keyword_scores(prompt: str, registry) -> List[Tuple[float, str]]:
    text = " " + re.sub(r"\s+", " ", (prompt or "").lower()) + " "
    scored = []
    for cap_id in registry.ids():
        if cap_id in _SKIP_SCORING:
            continue
        score = 0.0
        for kw in registry.keywords(cap_id):
            kw = kw.lower().strip()
            if kw and re.search(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", text):
                score += 1.0 + 0.5 * kw.count(" ")
        if score:
            scored.append((score, cap_id))
    scored.sort(key=lambda s: (-s[0], s[1]))
    return scored


def classify(
    prompt: str,
    registry,
    *,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return an ``IntentResult`` dict (validated by the caller)."""
    explicit = explicit_mention(prompt, registry)
    if explicit is not None:
        return explicit
    entities = extract_entities(prompt, attachments)

    if entities.get("attachment_id"):
        return _intent_result(
            "analyze_data", 0.9, ["data.analyze"], entities, "rules", "Dataset attachment"
        )

    for name, pattern, kind, cap_id, confidence in PHRASE_RULES:
        if pattern.search(prompt or "") and registry.get(cap_id) is not None:
            return _intent_result(kind, confidence, [cap_id], entities, "rules", f"Matched the '{name}' phrase rule")

    scored = _keyword_scores(prompt, registry)
    if scored:
        best_score, best = scored[0]
        desc = registry.get(best) or {}
        kind = (desc.get("intents") or ["open_capability"])[0]
        others = [c for _, c in scored[1:4]]
        confidence = min(0.75, 0.45 + 0.1 * best_score)
        return _intent_result(kind, confidence, [best] + others, entities, "rules", f"Keyword match for {best}")

    return _intent_result("chat", 0.4, ["chat.answer"], entities, "rules", "No capability matched; answering in text")
