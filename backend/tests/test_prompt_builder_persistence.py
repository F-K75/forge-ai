"""Unit tests for prompt_builder/persistence (8.9 -- TemplateRegistry overlay
persisted to MongoDB so it survives restart and syncs across workers)."""

import pytest

from prompt_builder.persistence import _from_doc, _to_doc, delete_template, load_overlay, upsert_template
from prompt_builder.registry import TemplateRegistry
from prompt_builder.templates.base import PromptTemplate


class FakeCollection:
    def __init__(self):
        self.docs = {}

    async def replace_one(self, query, doc, upsert=True):
        self.docs[(query["role"], query["version"])] = doc
        return True

    async def delete_one(self, query):
        self.docs.pop((query["role"], query["version"]), None)
        return True

    def find(self, query, projection=None):
        return _FakeCursor(list(self.docs.values()))


class _FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return self.docs


class FakeDB:
    def __init__(self, coll):
        self.prompt_templates = coll


@pytest.fixture
def fake_coll(monkeypatch):
    coll = FakeCollection()

    async def _collection():
        return coll

    monkeypatch.setattr("prompt_builder.persistence._collection", _collection)
    return coll


def _tpl(role, *, identity="id"):
    return PromptTemplate(
        role=role, version="v1", identity=identity,
        responsibilities=[], goals=[], constraints=[], required_inputs=[],
        output_format="", quality_rules=[],
    )


def test_to_and_from_doc_round_trip():
    t = PromptTemplate(
        role="developer", version="v1", identity="id", responsibilities=["r"],
        goals=["g"], constraints=["c"], required_inputs=["ri"], output_format="of",
        quality_rules=["q"],
    )
    doc = _to_doc(t)
    assert doc["role"] == "developer"
    parsed = _from_doc(doc)
    assert parsed == t


async def test_upsert_and_load_overlay_builds_full_registry(fake_coll):
    new_t = _tpl("custom_role", identity="hi")
    assert await upsert_template(new_t) is True

    # Fresh registry picks up the persisted overlay via load_overlay.
    fresh = TemplateRegistry()
    assert await load_overlay(fresh) == 1
    loaded = fresh.get("custom_role", "v1")
    assert loaded.identity == "hi"


async def test_load_overlay_overrides_existing_static_template(fake_coll):
    override = _tpl("developer", identity="OVERRIDDEN")
    assert await upsert_template(override) is True

    fresh = TemplateRegistry()
    assert await load_overlay(fresh) == 1
    assert fresh.get("developer", "v1").identity == "OVERRIDDEN"


async def test_delete_template_removes_overlay(fake_coll):
    new_t = _tpl("dropped_role", identity="x")
    await upsert_template(new_t)
    assert await delete_template("dropped_role", "v1") is True

    fresh = TemplateRegistry()
    assert await load_overlay(fresh) == 0
    from prompt_builder.registry import TemplateNotFoundError

    with pytest.raises(TemplateNotFoundError):
        fresh.get("dropped_role", "v1")


async def test_persistence_failures_are_swallowed(monkeypatch):
    async def boom():
        raise RuntimeError("mongo down")

    monkeypatch.setattr("prompt_builder.persistence._collection", boom)
    t = _tpl("r", identity="x")
    assert await upsert_template(t) is False
    assert await delete_template("r", "v1") is False
    assert await load_overlay(TemplateRegistry()) == 0