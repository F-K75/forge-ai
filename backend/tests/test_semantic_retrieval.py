import pytest

from retrieval.embeddings import EmbeddingUnavailable
from retrieval.index import SemanticIndex
from retrieval.models import SourceType
from retrieval.service import SemanticRetriever


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def limit(self, _n):
        return self

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d


class _FakeDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count


class _FakeCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False):
        self.docs[query["id"]] = update["$set"]

    async def delete_many(self, query):
        source_id = query["source_id"]
        to_delete = [k for k, v in self.docs.items() if v.get("source_id") == source_id]
        for k in to_delete:
            del self.docs[k]
        return _FakeDeleteResult(len(to_delete))

    def find(self, query, _projection=None):
        def matches(doc):
            for key, value in query.items():
                if key == "text" and isinstance(value, dict):
                    if value["$regex"].lower() not in doc.get("text", "").lower():
                        return False
                elif key == "source_type" and isinstance(value, dict):
                    if doc.get("source_type") not in value["$in"]:
                        return False
                elif doc.get(key) != value:
                    return False
            return True

        return _FakeCursor([d for d in self.docs.values() if matches(d)])


class _FakeDB:
    def __init__(self):
        self.semantic_chunks = _FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


@pytest.fixture
def fake_index(monkeypatch):
    db = _FakeDB()

    async def fake_get_db():
        return db

    monkeypatch.setattr("retrieval.index.get_db", fake_get_db)
    return SemanticIndex()


def _fake_embed(vector_by_text):
    async def embed_texts(texts):
        return [vector_by_text[t] for t in texts]

    async def embed_text(text):
        return vector_by_text[text]

    return embed_texts, embed_text


@pytest.mark.asyncio
async def test_index_source_chunks_and_stores_embeddings(fake_index, monkeypatch):
    embed_texts, embed_text = _fake_embed({"short text": [1.0, 0.0]})
    monkeypatch.setattr("retrieval.service.embed_texts", embed_texts)

    retriever = SemanticRetriever(index=fake_index)
    count = await retriever.index_source(
        source_type=SourceType.DOCUMENTATION, source_id="doc-1", text="short text",
    )

    assert count == 1
    assert len(fake_index.collection_name) > 0


@pytest.mark.asyncio
async def test_index_source_returns_zero_when_embeddings_unavailable(fake_index, monkeypatch):
    async def raising_embed_texts(_texts):
        raise EmbeddingUnavailable("no key")

    monkeypatch.setattr("retrieval.service.embed_texts", raising_embed_texts)

    retriever = SemanticRetriever(index=fake_index)
    count = await retriever.index_source(source_type=SourceType.CODE, source_id="src-1", text="def f(): pass")

    assert count == 0


@pytest.mark.asyncio
async def test_retrieve_ranks_by_cosine_similarity(fake_index, monkeypatch):
    texts = {
        "python async patterns": [1.0, 0.0, 0.0],
        "how to bake bread": [0.0, 1.0, 0.0],
        "query about async python": [0.9, 0.1, 0.0],
    }
    embed_texts, embed_text = _fake_embed(texts)
    monkeypatch.setattr("retrieval.service.embed_texts", embed_texts)
    monkeypatch.setattr("retrieval.service.embed_text", embed_text)

    retriever = SemanticRetriever(index=fake_index)
    await retriever.index_source(source_type=SourceType.DOCUMENTATION, source_id="doc-a", text="python async patterns")
    await retriever.index_source(source_type=SourceType.DOCUMENTATION, source_id="doc-b", text="how to bake bread")

    results = await retriever.retrieve("query about async python", top_k=2)

    assert results[0].source_id == "doc-a"
    assert results[0].score > results[1].score


@pytest.mark.asyncio
async def test_retrieve_returns_empty_when_embeddings_unavailable(fake_index, monkeypatch):
    async def raising_embed_text(_text):
        raise EmbeddingUnavailable("no key")

    monkeypatch.setattr("retrieval.service.embed_text", raising_embed_text)

    retriever = SemanticRetriever(index=fake_index)
    results = await retriever.retrieve("anything")

    assert results == []


@pytest.mark.asyncio
async def test_retrieve_filters_by_source_type_and_keyword(fake_index, monkeypatch):
    texts = {
        "django orm tips": [1.0, 0.0],
        "flask routing tips": [1.0, 0.0],
        "query": [1.0, 0.0],
    }
    embed_texts, embed_text = _fake_embed(texts)
    monkeypatch.setattr("retrieval.service.embed_texts", embed_texts)
    monkeypatch.setattr("retrieval.service.embed_text", embed_text)

    retriever = SemanticRetriever(index=fake_index)
    await retriever.index_source(source_type=SourceType.CODE, source_id="src-1", text="django orm tips")
    await retriever.index_source(source_type=SourceType.DOCUMENTATION, source_id="doc-1", text="flask routing tips")

    results = await retriever.retrieve("query", source_types=[SourceType.CODE], keyword_filter="django")

    assert len(results) == 1
    assert results[0].source_id == "src-1"


@pytest.mark.asyncio
async def test_delete_source_removes_all_its_chunks(fake_index, monkeypatch):
    embed_texts, _ = _fake_embed({"a" * 3000: [1.0, 0.0]})
    # Chunking splits long text into two overlapping pieces -- patch embed_texts
    # to return one vector per chunk regardless of exact chunk text.
    async def fixed_embed_texts(texts):
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr("retrieval.service.embed_texts", fixed_embed_texts)

    retriever = SemanticRetriever(index=fake_index)
    count = await retriever.index_source(source_type=SourceType.CODE, source_id="src-1", text="a" * 3000)
    assert count > 1

    deleted = await retriever.delete_source("src-1")
    assert deleted == count
