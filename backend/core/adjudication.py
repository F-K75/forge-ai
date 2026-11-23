"""Human adjudication store (docs/architecture/agent-collaboration-plan.md
§17.3; Revision 2 amended §12.3, PV-1…PV-6).

Collections:

- ``adjudication_excerpts``: the minimum material an adjudicator sees for one
  finding. Purged when the owner revokes ``human_quality_review`` (PV-2).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

EXCERPTS = "adjudication_excerpts"


def _basis_filter(basis: Optional[str]) -> Dict[str, Any]:
    if basis == "internal":
        return {"consent_basis": "internal"}
    if basis == "not_internal":
        return {"consent_basis": {"$ne": "internal"}}
    return {}


async def purge_user_excerpts(db, user_id: str, *, basis: Optional[str] = None) -> int:
    """Delete every adjudication excerpt of ``user_id``'s builds (PV-2).
    ``basis`` limits it to ``internal`` or ``not_internal`` excerpts."""
    if not user_id:
        return 0
    result = await db[EXCERPTS].delete_many({"owner_user_id": user_id, **_basis_filter(basis)})
    count = int(getattr(result, "deleted_count", 0) or 0)
    if count:
        logger.info("purged %s adjudication excerpts for a user", count)
    return count
