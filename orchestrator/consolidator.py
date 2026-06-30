"""The "CTO" consolidator: one high-tier model call over all agent reports.

Produces deduplicated issues, the critical/improvement top-lists, an overall
score, and a GO / NO_GO / GO_WITH_FIXES deployment recommendation. Degrades
gracefully: with zero successful agent reports it returns a NO_GO without
calling the model.
"""
from __future__ import annotations

import json
from typing import Optional

from .config import get_settings
from .models import (
    AgentReport,
    AgentStatus,
    ConsolidatedReport,
    Recommendation,
    SEVERITY_RANK,
)
from .providers import estimate_cost, llm_complete_with_usage
from .runner import strip_and_parse_json

_CTO_SYSTEM = (
    "You are the CTO consolidating a multi-agent code review into a single "
    "decision. You receive JSON reports from specialist reviewers. Deduplicate "
    "overlapping issues, weigh severity and breadth, and decide whether the "
    "code is safe to deploy.\n\n"
    "Return a SINGLE JSON object ONLY (no prose, no markdown fences) with keys:\n"
    "{\n"
    '  "overall_score": int (0-10),\n'
    '  "recommendation": "GO" | "NO_GO" | "GO_WITH_FIXES",\n'
    '  "summary": "str (2-4 sentences)",\n'
    '  "deduplicated_issues": [ {"severity","title","description","fix","files"} ],\n'
    '  "top_10_critical": [ {"severity","title","description","fix","files"} ],\n'
    '  "top_25_improvements": [ {"severity","title","description","fix","files"} ]\n'
    "}\n"
    "Rules: any unresolved critical issue means NO_GO or GO_WITH_FIXES, never GO. "
    "top_10_critical holds at most 10 of the most severe items; top_25_improvements "
    "holds at most 25 actionable improvements ordered by impact."
)


def _reports_payload(reports: list[AgentReport]) -> str:
    payload = []
    for r in reports:
        if r.status != AgentStatus.success:
            continue
        payload.append(
            {
                "agent_id": r.agent_id,
                "stage": r.stage,
                "score": r.score,
                "issues": [i.model_dump(mode="json") for i in r.issues],
            }
        )
    return json.dumps(payload, indent=2)


def _fallback_consolidation(reports: list[AgentReport]) -> ConsolidatedReport:
    """Deterministic merge used when the model is unavailable or there is
    nothing to consolidate."""
    issues = [
        i for r in reports if r.status == AgentStatus.success for i in r.issues
    ]
    issues.sort(key=lambda i: SEVERITY_RANK.get(i.severity.value, 0), reverse=True)
    has_critical = any(i.severity.value == "critical" for i in issues)
    scores = [r.score for r in reports if r.score is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    if not issues:
        rec = Recommendation.NO_GO if not scores else Recommendation.GO
    elif has_critical:
        rec = Recommendation.NO_GO
    else:
        rec = Recommendation.GO_WITH_FIXES

    return ConsolidatedReport(
        overall_score=overall,
        recommendation=rec,
        summary="Deterministic fallback consolidation (CTO model unavailable).",
        deduplicated_issues=issues,
        top_10_critical=[i for i in issues if i.severity.value in ("critical", "high")][:10],
        top_25_improvements=issues[:25],
    )


async def consolidate(
    reports: list[AgentReport],
    model: Optional[str] = None,
) -> tuple[ConsolidatedReport, float]:
    """Return the consolidated report and the USD cost of the CTO call."""
    settings = get_settings()
    successful = [r for r in reports if r.status == AgentStatus.success]
    if not successful:
        return _fallback_consolidation(reports), 0.0

    model = model or settings.consolidator_model
    user_msg = (
        "Here are the specialist agent reports as JSON. Consolidate them:\n\n"
        + _reports_payload(successful)
    )
    messages = [{"role": "user", "content": user_msg}]

    try:
        result = await llm_complete_with_usage(
            model, _CTO_SYSTEM, messages, settings.consolidator_max_output_tokens
        )
        data = strip_and_parse_json(result.text)
        report = ConsolidatedReport.model_validate(data)
        cost = estimate_cost(model, result.usage)
        return report, round(cost, 6)
    except Exception:
        # Never fail the run on consolidation — fall back deterministically.
        return _fallback_consolidation(reports), 0.0
