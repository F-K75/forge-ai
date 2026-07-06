from copy import deepcopy

import pytest
from fastapi import HTTPException

from api.gdpr import delete_user_data_cascade
from api import gdpr


def _matches(document, query):
    if "$or" in query:
        return any(_matches(document, branch) for branch in query["$or"])
    for key, expected in query.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
        elif actual != expected:
            return False
    return True


class DeleteResult:
    def __init__(self, count):
        self.deleted_count = count


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _length):
        return deepcopy(self.documents)


class Collection:
    def __init__(self, name, documents, operations):
        self.name = name
        self.documents = deepcopy(documents)
        self.operations = operations

    def find(self, query, _projection=None):
        return Cursor([doc for doc in self.documents if _matches(doc, query)])

    async def find_one(self, query, _projection=None):
        return next((deepcopy(doc) for doc in self.documents if _matches(doc, query)), None)

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents = [doc for doc in self.documents if not _matches(doc, query)]
        deleted = before - len(self.documents)
        self.operations.append((self.name, "delete_many", deepcopy(query), deleted))
        return DeleteResult(deleted)

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if _matches(document, query):
                self.documents.pop(index)
                self.operations.append((self.name, "delete_one", deepcopy(query), 1))
                return DeleteResult(1)
        self.operations.append((self.name, "delete_one", deepcopy(query), 0))
        return DeleteResult(0)

    async def update_many(self, query, update):
        count = 0
        for document in self.documents:
            if _matches(document, query):
                document.update(update["$set"])
                count += 1
        self.operations.append((self.name, "update_many", deepcopy(query), count))
        return DeleteResult(count)


class FakeDB:
    COLLECTIONS = {
        "agent_executions", "ai_usage", "analytics_events", "api_keys",
        "audit_logs", "build_files", "builds", "credit_purchases",
        "decision_log", "deployments", "epics", "feature_flags",
        "initiatives", "invitations", "invoices", "marketplace_items",
        "messages", "notifications", "onboarding_progress", "organizations",
        "prds", "projects", "referrals", "releases", "risk_reports",
        "security_events", "sessions", "sprint_retros", "sprint_reviews",
        "sprints", "standups", "stories", "subscriptions", "support_tickets",
        "tasks", "team_members", "tech_debt_summaries", "users", "webhooks",
    }

    def __init__(self, seed):
        self.operations = []
        for name in self.COLLECTIONS:
            setattr(self, name, Collection(name, seed.get(name, []), self.operations))


@pytest.mark.asyncio
async def test_cascade_removes_descendants_and_anonymizes_shared_records():
    user_id = "user-1"
    db = FakeDB(
        {
            "users": [{"id": user_id}, {"id": "other"}],
            "projects": [{"id": "project-1", "user_id": user_id}],
            "builds": [{"id": "build-1", "project_id": "project-1", "user_id": user_id}],
            "build_files": [{"build_id": "build-1", "path": "secret.py"}],
            "messages": [{"project_id": "project-1", "user_id": user_id}],
            "initiatives": [{"id": "initiative-1", "user_id": user_id}],
            "sprints": [{"id": "sprint-1", "initiative_id": "initiative-1"}],
            "standups": [{"sprint_id": "sprint-1"}],
            "tasks": [{"initiative_id": "initiative-1"}],
            "api_keys": [{"user_id": user_id, "key_hash": "hash"}],
            "sessions": [{"user_id": user_id, "jti": "jti"}],
            "webhooks": [{"user_id": user_id}],
            "marketplace_items": [{"author_id": user_id}],
            "referrals": [{"referrer_id": user_id, "referred_email": "friend@example.com"}],
            "audit_logs": [
                {"actor_id": user_id, "actor_email": "user@example.com"},
                {"actor_id": "admin", "actor_email": "admin@example.com", "resource_id": user_id},
            ],
            "feature_flags": [{"updated_by": user_id}],
        }
    )

    counts = await delete_user_data_cascade(db, user_id, "user@example.com")

    assert counts["users"] == 1
    assert db.users.documents == [{"id": "other"}]
    assert db.build_files.documents == []
    assert db.messages.documents == []
    assert db.standups.documents == []
    assert db.tasks.documents == []
    assert db.api_keys.documents == []
    assert db.sessions.documents == []
    assert db.webhooks.documents == []
    assert db.marketplace_items.documents == []
    assert db.audit_logs.documents[0]["actor_email"] == "[deleted]"
    assert db.audit_logs.documents[0]["actor_id"].startswith("deleted:")
    assert db.audit_logs.documents[1]["resource_id"].startswith("deleted:")
    assert db.feature_flags.documents[0]["updated_by"] is None
    assert db.operations[-1][0:2] == ("users", "delete_one")

    second_counts = await delete_user_data_cascade(db, user_id, "user@example.com")
    assert second_counts["users"] == 0


@pytest.mark.asyncio
async def test_shared_organization_owner_is_blocked_before_mutation():
    db = FakeDB(
        {
            "users": [{"id": "owner"}],
            "organizations": [{"id": "org-1", "owner_id": "owner"}],
            "team_members": [
                {"id": "member-owner", "org_id": "org-1", "user_id": "owner"},
                {"id": "member-other", "org_id": "org-1", "user_id": "other"},
            ],
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await delete_user_data_cascade(db, "owner", "owner@example.com")

    assert exc_info.value.status_code == 409
    assert db.operations == []
    assert db.users.documents == [{"id": "owner"}]


@pytest.mark.asyncio
async def test_billing_cleanup_failure_blocks_database_erasure(monkeypatch):
    db = FakeDB(
        {"users": [{"id": "subscriber", "stripe_customer_id": "cus_live"}]}
    )
    monkeypatch.setattr(gdpr.settings, "stripe_secret_key", "")

    with pytest.raises(HTTPException) as exc_info:
        await delete_user_data_cascade(db, "subscriber", "subscriber@example.com")

    assert exc_info.value.status_code == 503
    assert db.operations == []
    assert db.users.documents == [
        {"id": "subscriber", "stripe_customer_id": "cus_live"}
    ]
