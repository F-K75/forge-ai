"""Tests for MongoDB-backed per-org LLM policy overrides (LLMConfigLoader).

Mirrors test_llm_config_db_overrides.py's fake-DB/monkeypatch pattern.
"""

import pytest

from core.llm.config import LLMConfigLoader


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for doc in self._docs:
            yield doc


class _FakeOrgPolicyCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query=None):
        return _FakeCursor(list(self.docs))

    async def update_one(self, filter_, update, upsert=False):
        org_id = filter_.get("org_id")
        set_fields = update.get("$set", {})
        for doc in self.docs:
            if doc.get("org_id") == org_id:
                doc.update(set_fields)
                return
        if upsert:
            self.docs.append(dict(set_fields))


class _FakeDB:
    def __init__(self, docs=None):
        self.llm_org_policy_overrides = _FakeOrgPolicyCollection(docs)


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("core.database.get_db", _get_db)


@pytest.mark.asyncio
async def test_refresh_org_policy_overrides_pulls_from_db_and_load_reflects_it(monkeypatch):
    db = _FakeDB([
        {"org_id": "org-1", "policy": {"approved_providers": ["anthropic"]}, "updated_by": "owner-1"},
    ])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader()
    assert loader._org_policy_overrides == {}

    await loader.refresh_org_policy_overrides()

    config = await loader.load(org_id="org-1")
    assert config["policy"]["approved_providers"] == ["anthropic"]

    # An org with no DB doc is unaffected (default, unrestricted policy).
    other = await loader.load(org_id="org-2")
    assert other["policy"]["approved_providers"] is None


@pytest.mark.asyncio
async def test_set_org_policy_override_persists_and_is_visible_on_next_load(monkeypatch):
    db = _FakeDB([])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader()
    result = await loader.set_org_policy_override(
        "org-1", {"max_tokens_per_request": 4096}, updated_by="owner-1"
    )
    assert result == {"max_tokens_per_request": 4096}

    assert len(db.llm_org_policy_overrides.docs) == 1
    persisted = db.llm_org_policy_overrides.docs[0]
    assert persisted["org_id"] == "org-1"
    assert persisted["policy"] == {"max_tokens_per_request": 4096}
    assert persisted["updated_by"] == "owner-1"
    assert "updated_at" in persisted

    config = await loader.load(org_id="org-1")
    assert config["policy"]["max_tokens_per_request"] == 4096


@pytest.mark.asyncio
async def test_set_org_policy_override_still_updates_in_memory_when_db_write_fails(monkeypatch):
    async def _get_db():
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    monkeypatch.setattr("core.database.get_db", _get_db)

    loader = LLMConfigLoader()
    result = await loader.set_org_policy_override("org-1", {"max_cost_per_request_usd": 0.5})

    assert result == {"max_cost_per_request_usd": 0.5}
    config = await loader.load(org_id="org-1")
    assert config["policy"]["max_cost_per_request_usd"] == 0.5


@pytest.mark.asyncio
async def test_refresh_org_policy_overrides_fails_open_when_get_db_raises(monkeypatch):
    async def _get_db():
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    monkeypatch.setattr("core.database.get_db", _get_db)

    loader = LLMConfigLoader()
    loader._org_policy_overrides = {"org-1": {"approved_providers": ["anthropic"]}}

    await loader.refresh_org_policy_overrides()  # must not raise

    assert loader._org_policy_overrides == {"org-1": {"approved_providers": ["anthropic"]}}


@pytest.mark.asyncio
async def test_agent_level_policy_wins_over_org_level(tmp_path, monkeypatch):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: anthropic
agent_overrides:
  developer:
    policy:
      approved_providers:
        - openai
"""
    )
    db = _FakeDB([
        {"org_id": "org-1", "policy": {"approved_providers": ["anthropic"]}},
    ])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader(config_path=config_path)
    await loader.refresh_org_policy_overrides()

    config = await loader.load(agent_name="developer", org_id="org-1")
    assert config["policy"]["approved_providers"] == ["openai"]
