"""Tests for the GDPR data export endpoint (GET /gdpr/export).

Mirrors test_gdpr_cascade.py's FakeDB so export and deletion cover the same
data categories. Asserts completeness (every owned category is present) and
privacy (sensitive fields are stripped from the user block).
"""
from copy import deepcopy

import pytest

from api.gdpr import _collect_user_data


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
        # S0 (PV-6)
        "adjudication_excerpts", "data_use_consents",
    }

    def __init__(self, seed):
        self.operations = []
        for name in self.COLLECTIONS:
            setattr(self, name, Collection(name, seed.get(name, []), self.operations))


class FakeUser:
    def __init__(self, id, email):
        self.id = id
        self.email = email


@pytest.mark.asyncio
async def test_export_includes_all_owned_categories_and_strips_secrets():
    user_id = "user-1"
    email = "user@example.com"
    db = FakeDB(
        {
            "users": [
                {
                    "id": user_id,
                    "email": email,
                    "hashed_password": "secret-hash",
                    "github_token": "enc:gh",
                    "llm_api_key": "enc:byok",
                    "totp_secret": "enc:totp",
                    "plan": "pro",
                    "preferences": {"theme": "dark"},
                },
                {"id": "other"},
            ],
            "projects": [{"id": "project-1", "user_id": user_id, "name": "App"}],
            "builds": [{"id": "build-1", "project_id": "project-1", "user_id": user_id}],
            "build_files": [{"build_id": "build-1", "path": "main.py", "content": "x"}],
            "messages": [{"project_id": "project-1", "user_id": user_id, "body": "hi"}],
            "initiatives": [{"id": "initiative-1", "user_id": user_id}],
            "sprints": [{"id": "sprint-1", "initiative_id": "initiative-1"}],
            "standups": [{"sprint_id": "sprint-1", "note": "did stuff"}],
            "sprint_reviews": [{"sprint_id": "sprint-1"}],
            "sprint_retros": [{"sprint_id": "sprint-1"}],
            "prds": [{"initiative_id": "initiative-1"}],
            "epics": [{"initiative_id": "initiative-1"}],
            "stories": [{"initiative_id": "initiative-1"}],
            "tasks": [{"initiative_id": "initiative-1"}],
            "releases": [{"initiative_id": "initiative-1"}],
            "risk_reports": [{"initiative_id": "initiative-1"}],
            "tech_debt_summaries": [{"initiative_id": "initiative-1"}],
            "agent_executions": [{"initiative_id": "initiative-1"}],
            "decision_log": [{"initiative_id": "initiative-1"}],
            "api_keys": [{"user_id": user_id, "key_hash": "h"}],
            "ai_usage": [{"user_id": user_id, "tokens": 10}],
            "subscriptions": [{"user_id": user_id}],
            "invoices": [{"user_id": user_id}],
            "credit_purchases": [{"user_id": user_id}],
            "security_events": [{"user_id": user_id}],
            "notifications": [{"user_id": user_id}],
            "onboarding_progress": [{"user_id": user_id}],
            "support_tickets": [{"user_id": user_id}],
            "deployments": [{"user_id": user_id}],
            "webhooks": [{"user_id": user_id}],
            "marketplace_items": [{"author_id": user_id}],
            "referrals": [{"referrer_id": user_id, "referred_email": "friend@example.com"}],
            "team_members": [{"user_id": user_id}],
            "organizations": [{"owner_id": user_id}],
            "analytics_events": [{"user_id": user_id}],
        }
    )

    export = await _collect_user_data(db, FakeUser(user_id, email))

    # User block: present, portable fields kept, secrets stripped.
    assert export["user"]["id"] == user_id
    assert export["user"]["email"] == email
    assert export["user"]["plan"] == "pro"
    assert export["user"]["preferences"] == {"theme": "dark"}
    for secret in (
        "hashed_password", "github_token", "llm_api_key", "totp_secret", "_id"
    ):
        assert secret not in export["user"], f"leaked secret field: {secret}"

    # Derived categories present and complete.
    assert [p["id"] for p in export["projects"]] == ["project-1"]
    assert [b["id"] for b in export["builds"]] == ["build-1"]
    assert [f["path"] for f in export["build_files"]] == ["main.py"]
    assert [m["body"] for m in export["messages"]] == ["hi"]
    assert [i["id"] for i in export["initiatives"]] == ["initiative-1"]
    assert [s["id"] for s in export["sprints"]] == ["sprint-1"]
    assert export["sprint_artifacts"]["standups"]
    assert export["sprint_artifacts"]["sprint_reviews"]
    assert export["sprint_artifacts"]["sprint_retros"]
    assert export["initiative_artifacts"]["prds"]
    assert export["initiative_artifacts"]["epics"]
    assert export["initiative_artifacts"]["stories"]
    assert export["initiative_artifacts"]["tasks"]
    assert export["initiative_artifacts"]["releases"]
    assert export["initiative_artifacts"]["risk_reports"]
    assert export["initiative_artifacts"]["tech_debt_summaries"]
    assert export["initiative_artifacts"]["agent_executions"]
    assert export["initiative_artifacts"]["decision_log"]

    # Direct collections grouped under "direct".
    assert export["direct"]["api_keys"]
    assert export["direct"]["ai_usage"]
    assert export["direct"]["subscriptions"]
    assert export["direct"]["invoices"]
    assert export["direct"]["credit_purchases"]
    assert export["direct"]["security_events"]
    assert export["direct"]["notifications"]
    assert export["direct"]["onboarding_progress"]
    assert export["direct"]["support_tickets"]
    assert export["direct"]["deployments"]
    assert export["direct"]["webhooks"]
    assert export["direct"]["analytics_events"]

    # Remaining top-level categories.
    assert export["marketplace_items"]
    assert export["referrals"]
    assert export["team_members"]
    assert export["organizations"]


@pytest.mark.asyncio
async def test_export_omits_other_users_data():
    db = FakeDB(
        {
            "users": [
                {"id": "u1", "email": "u1@x.com", "hashed_password": "h"},
                {"id": "u2", "email": "u2@x.com"},
            ],
            "projects": [
                {"id": "p1", "user_id": "u1"},
                {"id": "p2", "user_id": "u2"},
            ],
            "api_keys": [
                {"user_id": "u1", "key_hash": "a"},
                {"user_id": "u2", "key_hash": "b"},
            ],
        }
    )
    export = await _collect_user_data(db, FakeUser("u1", "u1@x.com"))
    assert [p["id"] for p in export["projects"]] == ["p1"]
    assert [k["key_hash"] for k in export["direct"]["api_keys"]] == ["a"]
    # Other user's data must not appear anywhere in the export.
    payload = str(export)
    assert "u2" not in payload
