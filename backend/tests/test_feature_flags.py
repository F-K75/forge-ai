"""Tests for `core.feature_flags.is_feature_enabled` -- the fail-closed read
path over the existing `feature_flags` Mongo collection (see
`backend/api/admin.py`'s `POST/GET /admin/feature-flags` for the existing
write side and `core.models.FeatureFlag` for the schema).

Every case here must resolve to a plain `bool`, never raise -- a missing
flag doc and a DB failure must both be indistinguishable from "off" to any
caller.
"""

from __future__ import annotations

import pytest

import core.feature_flags as feature_flags_module
from core.feature_flags import is_feature_enabled


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.queries = []

    async def find_one(self, query, projection=None):
        self.queries.append(query)
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None


class _RaisingCollection:
    async def find_one(self, query, projection=None):
        raise ConnectionError("simulated Mongo outage")


class _FakeDB:
    def __init__(self, collection):
        self.feature_flags = collection


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr(feature_flags_module, "get_db", _get_db)


@pytest.mark.asyncio
async def test_missing_flag_doc_returns_false(monkeypatch):
    _patch_db(monkeypatch, _FakeDB(_FakeCollection(docs=[])))
    assert await is_feature_enabled("specialist_shadow_developer") is False


@pytest.mark.asyncio
async def test_flag_doc_enabled_true_returns_true(monkeypatch):
    _patch_db(monkeypatch, _FakeDB(_FakeCollection(docs=[
        {"key": "specialist_shadow_developer", "enabled": True}
    ])))
    assert await is_feature_enabled("specialist_shadow_developer") is True


@pytest.mark.asyncio
async def test_flag_doc_enabled_false_returns_false(monkeypatch):
    _patch_db(monkeypatch, _FakeDB(_FakeCollection(docs=[
        {"key": "specialist_shadow_developer", "enabled": False}
    ])))
    assert await is_feature_enabled("specialist_shadow_developer") is False


@pytest.mark.asyncio
async def test_db_raising_returns_false_not_an_exception(monkeypatch):
    _patch_db(monkeypatch, _FakeDB(_RaisingCollection()))
    # Must not raise -- fail-closed.
    assert await is_feature_enabled("specialist_shadow_developer") is False


@pytest.mark.asyncio
async def test_get_db_itself_raising_returns_false(monkeypatch):
    async def _get_db():
        raise RuntimeError("no mongo client available")

    monkeypatch.setattr(feature_flags_module, "get_db", _get_db)
    assert await is_feature_enabled("specialist_shadow_developer") is False


@pytest.mark.asyncio
async def test_only_the_requested_key_is_checked(monkeypatch):
    db = _FakeDB(_FakeCollection(docs=[{"key": "some_other_flag", "enabled": True}]))
    _patch_db(monkeypatch, db)
    assert await is_feature_enabled("specialist_shadow_developer") is False
    assert db.feature_flags.queries == [{"key": "specialist_shadow_developer"}]
