"""Tests for the centralized data-retention policy (DB-003).

Verifies the policy is config-driven and that ``apply_retention_ttl_indexes``
creates the correct ``created_at`` TTL index for every retained collection,
skips missing collections, and never raises when index creation fails.
"""
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from core.config import RETENTION_TTL_SECONDS
from core.database import apply_retention_ttl_indexes


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.index_calls = []

    async def create_index(self, field, **kwargs):
        self.index_calls.append((field, kwargs))


class FakeDB:
    def __init__(self, collections):
        for c in collections:
            setattr(self, c, FakeCollection(c))


EXPECTED_COLLECTIONS = (
    "build_files",
    "analytics_events",
    "audit_logs",
    "security_events",
    "token_blacklist",
    "ai_usage",
    "sessions",
    "notifications",
)


def test_retention_policy_has_expected_collections():
    for coll in EXPECTED_COLLECTIONS:
        assert coll in RETENTION_TTL_SECONDS, f"{coll} missing from retention policy"
        assert RETENTION_TTL_SECONDS[coll] > 0


def test_retention_policy_covers_sessions_and_notifications():
    # The two ephemeral collections that previously had no retention.
    assert RETENTION_TTL_SECONDS["sessions"] == 30 * 24 * 3600
    assert RETENTION_TTL_SECONDS["notifications"] == 90 * 24 * 3600


async def test_apply_retention_creates_ttl_indexes():
    cols = list(RETENTION_TTL_SECONDS.keys())
    db = FakeDB(cols)
    await apply_retention_ttl_indexes(db)
    for coll in cols:
        fc = getattr(db, coll)
        assert len(fc.index_calls) == 1, f"{coll} should get exactly one TTL index"
        field, kwargs = fc.index_calls[0]
        assert field == "created_at"
        assert kwargs["expireAfterSeconds"] == RETENTION_TTL_SECONDS[coll]
        assert kwargs["name"] == f"retention_ttl_{coll}"


async def test_apply_retention_skips_missing_collections():
    db = FakeDB(["sessions", "notifications"])
    await apply_retention_ttl_indexes(db)
    assert len(db.sessions.index_calls) == 1
    assert len(db.notifications.index_calls) == 1


async def test_apply_retention_does_not_raise_on_create_failure():
    class BoomCollection:
        async def create_index(self, field, **kwargs):
            raise RuntimeError("mongo unavailable")

    class PartialDB:
        sessions = BoomCollection()
        notifications = BoomCollection()

    # Missing policy collections resolve to None (skipped); the two present
    # ones raise inside create_index but are caught, so this must not raise.
    await apply_retention_ttl_indexes(PartialDB())
