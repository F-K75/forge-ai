"""Persistent AI Product Lead (Phase A).

Capabilities:
- remembers project context
- loads decision history
- answers "why" questions
- answers "what changed" questions
- answers "what next" questions
- cites decision, rationale, evidence, timestamp, confidence
- never hallucinates; says "I don't have enough evidence." when confidence is low
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from core.models import utcnow
from services.decision_log import DecisionLogService

logger = logging.getLogger(__name__)

_service = DecisionLogService()


class ProductLead:
    async def answer_why(self, project_id: str, question: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        decisions = await _service.recent_for_project(project_id, limit=200)
        matches = _match_decisions_to_question(question, decisions)
        if not matches:
            return {
                "answer": "I don't have enough evidence.",
                "citations": [],
                "confidence": 0.0,
            }
        best = matches[0]
        return {
            "answer": _compose_answer(best, question),
            "citations": [best],
            "confidence": best.get("confidence_score") or 0.0,
        }

    async def answer_what_changed(self, project_id: str, since: Optional[datetime] = None) -> Dict[str, Any]:
        if since is None:
            since = utcnow() - timedelta(days=1)
        decisions = await _service.recent_for_project(project_id, limit=200)
        recent = [d for d in decisions if d.get("created_at") and d["created_at"] >= since]
        return {
            "answer": f"{len(recent)} decision(s) changed since {since.isoformat()}.",
            "changes": recent,
            "confidence": 0.9 if recent else 0.0,
        }

    async def answer_what_next(self, project_id: str) -> Dict[str, Any]:
        pending = await _service.pending_for_project(project_id)
        if pending:
            return {
                "answer": f"You have {len(pending)} pending decision(s) that need attention.",
                "pending": pending,
                "confidence": 0.9,
            }
        decisions = await _service.recent_for_project(project_id, limit=10)
        accepted = [d for d in decisions if d.get("status") == "accepted"]
        if accepted:
            next_up = accepted[0]
            return {
                "answer": f"The most recent accepted decision is: {next_up.get('trigger', 'N/A')}",
                "next": next_up,
                "confidence": next_up.get("confidence_score") or 0.0,
            }
        return {
            "answer": "I don't have enough evidence.",
            "citations": [],
            "confidence": 0.0,
        }

    async def list_decisions(
        self,
        project_id: str,
        *,
        status: Optional[str] = None,
        category: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Dict[str, Any]:
        return await _service.list_for_project(
            project_id,
            status=status,
            category=category,
            page=page,
            per_page=per_page,
        )

    async def get_pending_decisions(self, project_id: str) -> List[Dict[str, Any]]:
        return await _service.pending_for_project(project_id)


def _match_decisions_to_question(question: str, decisions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    q = question.lower()
    keywords = set(re.findall(r"[a-z0-9]+", q))
    stop = {"why", "did", "we", "choose", "is", "the", "this", "that", "what", "changed", "how", "are", "you"}
    keywords = keywords - stop
    scored = []
    for d in decisions:
        text = " ".join([
            str(d.get("trigger", "")),
            str(d.get("rationale", "")),
            str(d.get("actions", "")),
            str(d.get("category", "")),
        ]).lower()
        score = sum(1 for k in keywords if k in text)
        if score > 0:
            scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored]


def _compose_answer(decision: Dict[str, Any], question: str) -> str:
    parts = []
    if decision.get("rationale"):
        parts.append(decision["rationale"])
    if decision.get("actions"):
        actions = decision["actions"]
        if isinstance(actions, list):
            parts.append("Actions taken: " + "; ".join(str(a) for a in actions))
        else:
            parts.append(f"Actions taken: {actions}")
    if decision.get("source_ref"):
        parts.append(f"Source: {decision['source_ref']}")
    if decision.get("created_at"):
        parts.append(f"Decided at: {decision['created_at']}")
    if not parts:
        return "I don't have enough evidence."
    return " ".join(parts)
