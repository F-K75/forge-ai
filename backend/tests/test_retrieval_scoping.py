"""Build-path retrieval and tenant scoping (docs/architecture/agent-
collaboration-plan.md F28, §5.3, BY-10)."""

from __future__ import annotations

import httpx
import pytest

from context_engineer import ContextAssembler, ContextRetriever, ContextSource
from core.data_use_consents import SCOPE_PLATFORM_MODEL_PROCESSING
from core.processing_boundary import CredentialMode, ProcessingBoundary, build_scope
from retrieval.embeddings import EmbeddingNotPermitted, embed_texts
from retrieval.index import SemanticIndex
from retrieval.models import SourceType
from retrieval.service import RetrievalScopeError, SemanticRetriever
from tests.a2_support import FakeDB, patch_infra, set_flags


class _SpyRetriever:
    def __init__(self):
        self.calls = []

    async def retrieve(self, query, **kwargs):
        self.calls.append(kwargs)
        return []


@pytest.fixture
def spy(monkeypatch):
    import context_engineer.retriever as module

    spy = _SpyRetriever()
    monkeypatch.setattr(module, "_get_semantic_retriever", lambda: spy)
    return spy


SEMANTIC_SOURCES = [ContextSource.FILE_CONTENT, ContextSource.KNOWLEDGE_BASE, ContextSource.SIMILAR_TASKS]


@pytest.mark.asyncio
async def test_build_path_retrieval_disabled(monkeypatch, spy):
    retriever = ContextRetriever()
    set_flags(monkeypatch, build_path_retrieval=False)
    # Default: off in the build path, even with a full tenant scope.
    result = await retriever.retrieve("developer", "task", sources=SEMANTIC_SOURCES,
                                      org_id="org-1", project_id="p1", build_path=True)
    assert spy.calls == []
    assert result.chunks  # placeholder context is still assembled

    # No scope: never, whatever the flag.
    set_flags(monkeypatch, build_path_retrieval=True)
    await retriever.retrieve("developer", "task", sources=SEMANTIC_SOURCES, build_path=True)
    await retriever.retrieve("developer", "task", sources=SEMANTIC_SOURCES, org_id="org-1", build_path=True)
    assert spy.calls == []

    # Flag on with a scope: tenant-scoped retrieval only.
    await retriever.retrieve("developer", "task", sources=SEMANTIC_SOURCES,
                             org_id="org-1", project_id="p1", build_path=True)
    assert len(spy.calls) == 3
    assert all(c["org_id"] == "org-1" and c["project_id"] == "p1" for c in spy.calls)


@pytest.mark.asyncio
async def test_agent_context_assembly_is_build_path(monkeypatch, spy):
    """agents/base.py's retrieval call is marked as the build path and takes
    the scope from the running build."""
    from agents.architect import ArchitectAgent

    set_flags(monkeypatch, build_path_retrieval=False)
    agent = ArchitectAgent()
    boundary = ProcessingBoundary(credential_mode=CredentialMode.FORGE)
    with build_scope(boundary, build_id="b1", project_id="p1", org_id="org-1"):
        await agent._resolve_system_prompt([{"role": "user", "content": "plan a todo app"}], "")
    assert spy.calls == []

    set_flags(monkeypatch, build_path_retrieval=True)
    with build_scope(boundary, build_id="b1", project_id="p1", org_id="org-1"):
        await agent._resolve_system_prompt([{"role": "user", "content": "plan a todo app"}], "")
    assert spy.calls and all(c["org_id"] == "org-1" and c["project_id"] == "p1" for c in spy.calls)


@pytest.mark.asyncio
async def test_concurrent_builds_never_share_a_retrieval_scope(monkeypatch, spy):
    import asyncio

    set_flags(monkeypatch, build_path_retrieval=True)
    assembler = ContextAssembler()

    async def one(org, project):
        await assembler.assemble(role="developer", task="t", org_id=org, project_id=project, build_path=True)

    await asyncio.gather(one("org-a", "pa"), one("org-b", "pb"), one("org-a", "pa"))
    pairs = {(c["org_id"], c["project_id"]) for c in spy.calls}
    assert pairs == {("org-a", "pa"), ("org-b", "pb")}


class _Index(SemanticIndex):
    def __init__(self):
        self.docs = []

    async def upsert(self, chunk, embedding):
        self.docs.append({**chunk.model_dump(mode="json"), "embedding": embedding})

    async def _collection(self):
        from tests.a2_support import FakeCollection

        return FakeCollection(self.docs)


@pytest.mark.asyncio
async def test_retrieve_requires_org_and_project(monkeypatch):
    async def fake_embed_texts(texts):
        return [[1.0, 0.0] for _ in texts]

    async def fake_embed_text(text):
        return [1.0, 0.0]

    monkeypatch.setattr("retrieval.service.embed_texts", fake_embed_texts)
    monkeypatch.setattr("retrieval.service.embed_text", fake_embed_text)
    index = _Index()
    retriever = SemanticRetriever(index=index)
    await retriever.index_source(source_type=SourceType.CODE, source_id="a", text="alpha",
                                 org_id="org-1", project_id="p1")
    await retriever.index_source(source_type=SourceType.CODE, source_id="b", text="beta",
                                 org_id="org-2", project_id="p2")
    await retriever.index_source(source_type=SourceType.CODE, source_id="c", text="gamma",
                                 org_id="org-1", project_id="p9")

    with pytest.raises(TypeError):
        await retriever.retrieve("q")  # org_id / project_id are mandatory keywords
    for org, project in ((None, "p1"), ("org-1", None), ("", "p1"), ("org-1", "")):
        with pytest.raises(RetrievalScopeError):
            await retriever.retrieve("q", org_id=org, project_id=project)
    with pytest.raises(ValueError):
        await index.search([1.0, 0.0])  # the index refuses an unscoped search

    results = await retriever.retrieve("q", org_id="org-1", project_id="p1")
    assert [r.source_id for r in results] == ["a"]
    org_wide = await retriever.retrieve_org_wide("q", org_id="org-1")
    assert sorted(r.source_id for r in org_wide) == ["a", "c"]
    with pytest.raises(RetrievalScopeError):
        await retriever.retrieve_org_wide("q", org_id="")


@pytest.mark.asyncio
async def test_retrieval_embeddings_pass_the_boundary(monkeypatch):
    db = FakeDB()
    patch_infra(monkeypatch, db)
    set_flags(monkeypatch, openai_api_key="sk-forge-embeddings", unified_usage_recording=True)
    posts = []

    async def fake_post(self, url, *a, **k):
        posts.append(str(url))
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1]}], "usage": {"prompt_tokens": 3}},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with build_scope(ProcessingBoundary(credential_mode=CredentialMode.BYOK), build_id="b1", user_id="u1"):
        with pytest.raises(EmbeddingNotPermitted):
            await embed_texts(["customer content"])
    assert posts == []  # refused before any network I/O

    consented = ProcessingBoundary(credential_mode=CredentialMode.BYOK,
                                   consents=frozenset({SCOPE_PLATFORM_MODEL_PROCESSING}))
    with build_scope(consented, build_id="b1", user_id="u1"):
        assert await embed_texts(["customer content"]) == [[0.1]]
    assert len(posts) == 1
    (row,) = db.ai_usage.docs
    assert row["purpose"] == "retrieval_embedding" and row["model"] == "text-embedding-3-small"
    assert row["user_id"] is None and row["beneficiary_user_id"] == "u1"
    assert row["prompt_tokens"] == 3 and row["cost"] > 0
