from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


class AuditLogger:
    """Records gateway-level audit events. Never stores prompt content or
    API keys -- only ids, provider/model selection, and retry/failover
    counts, matching the pattern already used for usage tracking in
    `core/ai_usage.py`. Fails open: an audit-log write failure must never
    break the request it's describing."""

    collection_name = "gateway_audit_log"

    async def record(
        self,
        *,
        request_id: str,
        provider: str,
        model: str,
        agent_name: str,
        retry_attempts: int = 0,
        failovers: int = 0,
        policy_decisions: Optional[List[Dict[str, Any]]] = None,
        optimization_summary: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            db = await get_db()
            await db[self.collection_name].insert_one(
                {
                    "request_id": request_id,
                    "provider": provider,
                    "model": model,
                    "agent_name": agent_name,
                    "retry_attempts": retry_attempts,
                    "failovers": failovers,
                    "policy_decisions": policy_decisions or [],
                    "optimization_summary": optimization_summary or {},
                }
            )
        except Exception as exc:  # pragma: no cover - defensive, must fail open
            logger.warning("Failed to write gateway audit record %s: %s", request_id, exc)


_audit_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    global _audit_logger
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    return _audit_logger
