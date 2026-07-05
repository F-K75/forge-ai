"""Tests for MongoDB-backed per-agent LLM overrides (LLMConfigLoader).

Follows the fake-DB/monkeypatch pattern already used elsewhere in this test
suite (see test_llm_byok.py's _FakeUsersCollection/_FakeDB and
test_admin_users_export.py's FakeCollection/_FakeCursor): a fake collection
whose find() returns an async-iterable cursor, patched in for
core.database.get_db so nothing here touches a real MongoDB (there isn't
one running in this sandbox).
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


class _FakeOverridesCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query=None):
        return _FakeCursor(list(self.docs))

    async def update_one(self, filter_, update, upsert=False):
        agent = filter_.get("agent")
        set_fields = update.get("$set", {})
        for doc in self.docs:
            if doc.get("agent") == agent:
                doc.update(set_fields)
                return
        if upsert:
            self.docs.append(dict(set_fields))


class _FakeDB:
    def __init__(self, docs=None):
        self.llm_agent_overrides = _FakeOverridesCollection(docs)


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("core.database.get_db", _get_db)


@pytest.mark.asyncio
async def test_refresh_db_overrides_pulls_from_db_and_load_reflects_it(monkeypatch):
    db = _FakeDB([
        {"agent": "developer", "provider": "openai", "model": "gpt-4.1", "updated_by": "admin-1"},
    ])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader()
    assert loader._db_overrides == {}

    await loader.refresh_db_overrides()

    config = await loader.load(agent_name="developer")
    assert config["provider"] == "openai"
    assert config["model"] == "gpt-4.1"

    # An agent with no DB doc is unaffected.
    other = await loader.load(agent_name="architect")
    assert other["provider"] == "anthropic"


@pytest.mark.asyncio
async def test_set_agent_override_persists_and_is_visible_on_next_load(monkeypatch):
    db = _FakeDB([])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader()
    result = await loader.set_agent_override(
        "qa", {"provider": "groq", "model": "llama-3.1-8b"}, updated_by="admin-2"
    )
    assert result == {"provider": "groq", "model": "llama-3.1-8b"}

    # Persisted into the fake DB's llm_agent_overrides collection.
    assert len(db.llm_agent_overrides.docs) == 1
    persisted = db.llm_agent_overrides.docs[0]
    assert persisted["agent"] == "qa"
    assert persisted["provider"] == "groq"
    assert persisted["model"] == "llama-3.1-8b"
    assert persisted["updated_by"] == "admin-2"
    assert "updated_at" in persisted

    # Visible on this SAME process's very next load() call -- no reload()
    # call in between.
    config = await loader.load(agent_name="qa")
    assert config["provider"] == "groq"
    assert config["model"] == "llama-3.1-8b"


@pytest.mark.asyncio
async def test_set_agent_override_still_updates_in_memory_when_db_write_fails(monkeypatch):
    async def _get_db():
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    monkeypatch.setattr("core.database.get_db", _get_db)

    loader = LLMConfigLoader()
    result = await loader.set_agent_override("developer", {"provider": "mistral"})

    assert result == {"provider": "mistral"}
    config = await loader.load(agent_name="developer")
    assert config["provider"] == "mistral"


@pytest.mark.asyncio
async def test_refresh_db_overrides_fails_open_when_get_db_raises(monkeypatch):
    async def _get_db():
        raise ConnectionRefusedError("[Errno 111] Connection refused")

    monkeypatch.setattr("core.database.get_db", _get_db)

    loader = LLMConfigLoader()
    loader._db_overrides = {"developer": {"provider": "anthropic"}}

    await loader.refresh_db_overrides()  # must not raise

    assert loader._db_overrides == {"developer": {"provider": "anthropic"}}


@pytest.mark.asyncio
async def test_db_override_wins_over_yaml_agent_override(tmp_path, monkeypatch):
    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        """
default_provider: anthropic
agent_overrides:
  developer:
    provider: anthropic
    model: claude-sonnet-4-6
"""
    )
    db = _FakeDB([
        {"agent": "developer", "provider": "openai", "model": "gpt-4.1"},
    ])
    _patch_db(monkeypatch, db)

    loader = LLMConfigLoader(config_path=config_path)
    await loader.refresh_db_overrides()

    config = await loader.load(agent_name="developer")
    assert config["provider"] == "openai"
    assert config["model"] == "gpt-4.1"
