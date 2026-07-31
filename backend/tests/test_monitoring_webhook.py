"""Tests for the external monitoring-webhook intake path
(backend/api/monitoring_webhook.py).

Covers the API-key-authenticated `POST /projects/{project_id}/monitoring/
webhook/findings` route: valid payloads create findings (with the
"webhook" source default), category/severity pass through and persist,
HIGH/CRITICAL severity triggers auto-escalation into a change request, and
both unauthenticated and cross-project-ownership requests are rejected.

Follows the FakeDB/FakeCollection/FakeCursor pattern from
`tests/test_monitoring.py`, extended with `api_keys` and `users` collections
so the real `api.api_keys.validate_api_key` hashing/lookup path is exercised
end-to-end rather than stubbed out.
"""

from __future__ import annotations

from datetime import timedelta
from core.models import utcnow

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.api_keys as api_keys_module
import api.monitoring_webhook as webhook_module
import agent_registry.monitoring as monitoring_module
import agent_registry.pr_workflow as pr_module
import agent_registry.repository as repo_module
import agent_registry.team_chat as chat_module


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (mirrors tests/test_monitoring.py)
# --------------------------------------------------------------------------- #


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "to_agent_ids":
            if v not in (doc.get(k) or []):
                return False
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()
        self.team_messages = FakeCollection()
        self.change_requests = FakeCollection()
        self.monitoring_findings = FakeCollection()
        self.projects = FakeCollection()
        self.team_members = FakeCollection()
        self.api_keys = FakeCollection()
        self.users = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


# --------------------------------------------------------------------------- #
# Fixtures / helpers
# --------------------------------------------------------------------------- #


def _seed_project(db, project_id, user_id):
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})


def _seed_user(db, user_id, email=None):
    db.users.docs.append(
        {
            "id": user_id,
            "email": email or f"{user_id}@example.com",
            "name": user_id,
            "hashed_password": "x",
            "plan": "free",
        }
    )


def _seed_api_key(db, user_id, raw_key, *, expired=False):
    """Seed an api_keys doc the same shape `create_api_key` would produce,
    hashed with the real `_hash_key` from api.api_keys so `validate_api_key`
    is exercised for real rather than stubbed."""
    key_hash = api_keys_module._hash_key(raw_key)
    expires_at = (utcnow() - timedelta(days=1)) if expired else None
    db.api_keys.docs.append(
        {
            "id": f"key_{user_id}",
            "user_id": user_id,
            "name": "ci",
            "key_hash": key_hash,
            "key_prefix": raw_key[:8],
            "scopes": [],
            "created_at": utcnow(),
            "last_used_at": None,
            "expires_at": expires_at,
        }
    )


def _client_for(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(monitoring_module, "get_db", _get_db)
    monkeypatch.setattr(webhook_module, "get_db", _get_db)
    monkeypatch.setattr(api_keys_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(webhook_module.router)
    return TestClient(app)


RAW_KEY = "sk_forge_test_only_key_value"


def _setup(monkeypatch, project_id="proj1", user_id="owner"):
    db = FakeDB()
    _seed_project(db, project_id, user_id)
    _seed_user(db, user_id)
    _seed_api_key(db, user_id, RAW_KEY)
    client = _client_for(monkeypatch, db)
    return client, db


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


def test_valid_payload_creates_finding_with_default_source(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={
            "category": "ci_failure",
            "severity": "low",
            "title": "Flaky test in suite",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "webhook"
    assert body["status"] == "open"
    assert body["project_id"] == "proj1"


def test_category_and_severity_pass_through_and_persist(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={
            "category": "dependency_update",
            "severity": "medium",
            "title": "New minor version of a dependency available",
            "description": "npm audit flagged an update",
            "source": "dependency-scanner",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == "dependency_update"
    assert body["severity"] == "medium"
    assert body["source"] == "dependency-scanner"

    stored = [d for d in db.monitoring_findings.docs if d["id"] == body["id"]]
    assert len(stored) == 1
    assert stored[0]["category"] == "dependency_update"
    assert stored[0]["severity"] == "medium"


def test_high_severity_triggers_escalation(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={
            "category": "ci_failure",
            "severity": "high",
            "title": "CI pipeline broken",
            "description": "Build fails on main due to a flaky test",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["change_request_id"] is not None
    assert any(c["id"] == body["change_request_id"] for c in db.change_requests.docs)


def test_critical_severity_triggers_escalation(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={"category": "security", "severity": "critical", "title": "SQL injection found"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["change_request_id"] is not None


def test_auto_escalate_false_suppresses_escalation(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={
            "category": "security",
            "severity": "critical",
            "title": "SQL injection found",
            "auto_escalate": False,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["change_request_id"] is None


# --------------------------------------------------------------------------- #
# Auth / access control
# --------------------------------------------------------------------------- #


def test_missing_api_key_rejected(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        json={"category": "dead_code", "severity": "low", "title": "Unused helper"},
    )
    assert r.status_code == 401


def test_invalid_api_key_rejected(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": "sk_forge_not_a_real_key"},
        json={"category": "dead_code", "severity": "low", "title": "Unused helper"},
    )
    assert r.status_code == 401


def test_expired_api_key_rejected(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    _seed_user(db, "owner")
    _seed_api_key(db, "owner", RAW_KEY, expired=True)
    client = _client_for(monkeypatch, db)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={"category": "dead_code", "severity": "low", "title": "Unused helper"},
    )
    assert r.status_code == 401


def test_api_key_for_project_caller_does_not_own_returns_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    _seed_user(db, "intruder")
    _seed_api_key(db, "intruder", RAW_KEY)
    client = _client_for(monkeypatch, db)

    r = client.post(
        "/projects/proj1/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={"category": "dead_code", "severity": "low", "title": "Unused helper"},
    )
    assert r.status_code == 404


def test_unknown_project_returns_404(monkeypatch):
    client, db = _setup(monkeypatch)

    r = client.post(
        "/projects/does-not-exist/monitoring/webhook/findings",
        headers={"X-API-Key": RAW_KEY},
        json={"category": "dead_code", "severity": "low", "title": "Unused helper"},
    )
    assert r.status_code == 404
