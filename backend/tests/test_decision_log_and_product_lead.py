"""Tests for DecisionLogService and ProductLead (Phase A).

Uses a minimal FakeDB to avoid the missing-jwt import issue.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest

from services.decision_log import DecisionLogService
from services.product_lead import ProductLead, _match_decisions_to_question, _compose_answer


class _Cursor:
    def __init__(self, docs):
        self._docs = docs
        self._skip = 0
        self._limit = None

    async def to_list(self, length=None):
        start = self._skip
        end = start + self._limit if self._limit is not None else None
        return [dict(d) for d in self._docs[start:end]]

    def sort(self, *args, **kwargs):
        key = args[0] if args else None
        reverse = args[1] if len(args) > 1 else False
        if key:
            self._docs = sorted(self._docs, key=lambda d: d.get(key[0], 0), reverse=reverse)
        return self

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self


class FakeCollection:
    def __init__(self):
        self.docs: List[Dict[str, Any]] = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return dict(d)
        return None

    def find(self, query, projection=None):
        return _Cursor([d for d in self.docs if _matches(d, query)])

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                return
        if upsert:
            new = dict(query)
            new.update(update.get("$set", {}))
            self.docs.append(new)

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, query)]
        return type("DelResult", (), {"deleted_count": before - len(self.docs)})()

    async def count_documents(self, query):
        return len([d for d in self.docs if _matches(d, query)])


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection()
        self.initiatives = FakeCollection()
        self.decision_log = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)

    def __getattr__(self, name):
        col = FakeCollection()
        setattr(self, name, col)
        return col


def _matches(doc, query):
    if "$or" in query:
        return any(_matches(doc, sub) for sub in query["$or"])
    for k, v in query.items():
        if isinstance(v, dict):
            if "$in" in v and doc.get(k) not in v["$in"]:
                return False
            if "$ne" in v and doc.get(k) == v["$ne"]:
                return False
            if "$exists" in v and (k in doc) != v["$exists"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


@pytest.mark.asyncio
async def test_record_decision_sets_defaults(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = []

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    service = DecisionLogService()
    await service.record_decision({
        "id": "d1",
        "project_id": "p1",
        "trigger": "build_complete",
        "actions": ["deployed"],
    })

    assert len(db.decision_log.docs) == 1
    assert db.decision_log.docs[0].get("status") == "pending"


@pytest.mark.asyncio
async def test_list_for_project_paginates(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = []
    for i in range(5):
        db.decision_log.docs.append({
            "id": f"d{i}",
            "project_id": "p1",
            "status": "accepted",
            "created_at": datetime.utcnow(),
        })

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    service = DecisionLogService()
    result = await service.list_for_project("p1", page=1, per_page=2)
    assert result["total"] == 5
    assert result["page"] == 1
    assert result["per_page"] == 2
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_pending_for_project(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = [
        {"id": "d1", "project_id": "p1", "status": "pending", "created_at": datetime.utcnow()},
        {"id": "d2", "project_id": "p1", "status": "accepted", "created_at": datetime.utcnow()},
    ]

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    service = DecisionLogService()
    pending = await service.pending_for_project("p1")
    assert len(pending) == 1
    assert pending[0]["id"] == "d1"


@pytest.mark.asyncio
async def test_product_lead_why_finds_match(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = [
        {"id": "d1", "project_id": "p1", "trigger": "db_choice", "rationale": "PostgreSQL chosen for reliability", "actions": ["migrated to postgres"], "confidence_score": 0.9, "created_at": datetime.utcnow()},
    ]

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    lead = ProductLead()
    result = await lead.answer_why("p1", "Why did we choose PostgreSQL?")
    assert result["confidence"] > 0
    assert "citations" in result


@pytest.mark.asyncio
async def test_product_lead_why_no_match(monkeypatch):
    db = FakeDB()
    db.projects.docs = []

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    lead = ProductLead()
    result = await lead.answer_why("unknown-project", "Why did we choose PostgreSQL?")
    assert result["answer"] == "I don't have enough evidence."
    assert result["confidence"] == 0.0


@pytest.mark.asyncio
async def test_product_lead_what_changed(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = [
        {"id": "d1", "project_id": "p1", "created_at": datetime.utcnow()},
    ]

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    lead = ProductLead()
    result = await lead.answer_what_changed("p1")
    assert "decision(s)" in result["answer"]


@pytest.mark.asyncio
async def test_product_lead_what_next_with_pending(monkeypatch):
    db = FakeDB()
    db.projects.docs = [{"id": "p1", "user_id": "u1"}]
    db.decision_log.docs = [
        {"id": "d1", "project_id": "p1", "status": "pending", "created_at": datetime.utcnow()},
    ]

    async def fake_get_db():
        return db

    import repositories.decision_log_repository as repo_module
    monkeypatch.setattr(repo_module, "_get_db", fake_get_db)

    lead = ProductLead()
    result = await lead.answer_what_next("p1")
    assert "pending" in result["answer"].lower()


def test_match_decisions_to_question():
    decisions = [
        {"trigger": "db_choice", "rationale": "PostgreSQL chosen", "actions": ["migrated"], "category": "database"},
        {"trigger": "auth_setup", "rationale": "JWT chosen", "actions": ["implemented"], "category": "security"},
    ]
    matches = _match_decisions_to_question("Why did we choose PostgreSQL?", decisions)
    assert len(matches) == 1
    assert matches[0]["trigger"] == "db_choice"


def test_compose_answer_with_rationale():
    decision = {"rationale": "PostgreSQL is reliable", "actions": ["migrated"], "source_ref": "c01", "created_at": "2024-01-01"}
    answer = _compose_answer(decision, "Why PostgreSQL?")
    assert "PostgreSQL is reliable" in answer
    assert "Source: c01" in answer


def test_compose_answer_without_evidence():
    decision = {}
    answer = _compose_answer(decision, "Why?")
    assert answer == "I don't have enough evidence."


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
