"""Read path for the existing `feature_flags` Mongo collection.

The collection and `core.models.FeatureFlag` shape already exist and are
already written to by `backend/api/admin.py`'s `POST /admin/feature-flags`
(with a matching `FeatureFlagsPage.tsx` admin UI to create/toggle flags) --
this module adds nothing new there. It only adds a small, safe read helper
for other backend code (e.g. `core/orchestrator.py`) to gate behavior on a
flag without duplicating the "missing doc / DB error -> off" fail-closed
logic at every call site.

Deliberately fail-closed: a flag that doesn't exist yet, or any error while
checking it (DB down, network hiccup, malformed doc), must always resolve to
`False`. Nothing that calls `is_feature_enabled` should ever have to handle
an exception from it, and nothing should ever treat "we couldn't tell" as
"on".
"""

from __future__ import annotations

import logging

from core.database import get_db

logger = logging.getLogger(__name__)


async def is_feature_enabled(key: str) -> bool:
    """Return whether the flag `key` is enabled. Defaults to `False` if the
    flag doc doesn't exist, or if checking it fails for any reason."""
    try:
        db = await get_db()
        doc = await db.feature_flags.find_one({"key": key})
        return bool(doc and doc.get("enabled"))
    except Exception:
        logger.warning("is_feature_enabled: failed to check flag %r, defaulting to False", key, exc_info=True)
        return False
