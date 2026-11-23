"""Shared fakes for the A2 acceptance tests (test_guardrail_v2.py,
test_byok_boundary.py, test_usage_attribution.py, test_retrieval_scoping.py).

- An in-memory Mongo double covering the operators A2 code uses (equality,
  ``$exists``, ``$ne``, ``$not``/``$gte``/``$lt``, ``$expr`` with
  ``$lte``/``$add``, ``$set``/``$inc``/``$setOnInsert``, upsert). Each update
  is applied without an ``await`` in between, so under asyncio every update
  is atomic per document -- the property a replica set gives single-document
  updates. It exercises the guarded-update logic; it cannot prove atomicity
  on a real server (see the rs0-marked tests).
- ``patch_infra``: points every module's ``get_db`` at the double and makes
  Redis fail fast so limiters use their in-process fallbacks.
- Counting provider adapters and a gateway-backed stub-agent harness that
  runs a full build through ``tasks.build_tasks.run_build`` with the real
  orchestrator, BaseAgent, gateway and router.
"""

from __future__ import annotations

import copy
import json
import sys
from typing import Any, Dict, List, Optional

from core.llm.provider import BaseProviderAdapter, CompletionResponse
from core.models import utcnow

# --------------------------------------------------------------------------- #
# Mongo double
# --------------------------------------------------------------------------- #

_MISSING = object()


def _get(doc: Dict[str, Any], path: str):
    cur: Any = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return _MISSING
        cur = cur[part]
    return cur


def _eval_expr(expr, doc):
    if isinstance(expr, str) and expr.startswith("$"):
        value = _get(doc, expr[1:])
        return 0 if value is _MISSING else value
    if isinstance(expr, dict):
        (op, args), = expr.items()
        values = [_eval_expr(a, doc) for a in args]
        if op == "$add":
            return sum(values)
        if op == "$lte":
            return values[0] <= values[1]
        if op == "$lt":
            return values[0] < values[1]
        raise NotImplementedError(op)
    return expr


def _match_value(value, cond) -> bool:
    if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
        for op, arg in cond.items():
            if op == "$exists":
                if (value is not _MISSING) != bool(arg):
                    return False
            elif op == "$ne":
                if (None if value is _MISSING else value) == arg:
                    return False
            elif op == "$not":
                if _match_value(value, arg):
                    return False
            elif op == "$gte":
                if value is _MISSING or value is None or value < arg:
                    return False
            elif op == "$lt":
                if value is _MISSING or value is None or value >= arg:
                    return False
            elif op == "$in":
                if (None if value is _MISSING else value) not in arg:
                    return False
            else:
                raise NotImplementedError(op)
        return True
    return (None if value is _MISSING else value) == cond


def matches(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    for key, cond in (query or {}).items():
        if key == "$expr":
            if not _eval_expr(cond, doc):
                return False
            continue
        if key == "$or":
            if not any(matches(doc, q) for q in cond):
                return False
            continue
        if not _match_value(_get(doc, key), cond):
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d

    def sort(self, *a, **k):
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        return list(self._docs)


class _UpdateResult:
    def __init__(self, matched: int, modified: int):
        self.matched_count = matched
        self.modified_count = modified


class FakeCollection:
    def __init__(self, docs=None):
        self.docs: List[Dict[str, Any]] = [dict(d) for d in (docs or [])]
        self.inserted: List[Dict[str, Any]] = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        self.inserted.append(dict(doc))

    async def insert_many(self, docs):
        for d in docs:
            await self.insert_one(d)

    async def find_one(self, query=None, projection=None, **_):
        for d in self.docs:
            if matches(d, query):
                return copy.deepcopy(d)
        return None

    def find(self, query=None, projection=None, **_):
        return _Cursor([copy.deepcopy(d) for d in self.docs if matches(d, query)])

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _UpdateResult(before - len(self.docs), before - len(self.docs))

    @staticmethod
    def _apply(doc, update, inserting: bool):
        for key, value in (update.get("$set") or {}).items():
            doc[key] = copy.deepcopy(value)
        if inserting:
            for key, value in (update.get("$setOnInsert") or {}).items():
                doc[key] = copy.deepcopy(value)
        for key, value in (update.get("$inc") or {}).items():
            doc[key] = (doc.get(key) or 0) + value

    def _upsert_doc(self, query):
        doc = {k: v for k, v in (query or {}).items() if not k.startswith("$") and not isinstance(v, dict)}
        return doc

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update, inserting=False)
                return _UpdateResult(1, 1)
        if upsert:
            doc = self._upsert_doc(query)
            self._apply(doc, update, inserting=True)
            self.docs.append(doc)
            return _UpdateResult(0, 0)
        return _UpdateResult(0, 0)

    async def find_one_and_update(self, query, update, upsert=False, return_document=False, **_):
        for d in self.docs:
            if matches(d, query):
                before = copy.deepcopy(d)
                self._apply(d, update, inserting=False)
                return copy.deepcopy(d) if return_document else before
        return None

    def aggregate(self, pipeline):
        docs = [copy.deepcopy(d) for d in self.docs]
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            elif "$group" in stage:
                spec = stage["$group"]
                buckets: Dict[Any, Dict[str, Any]] = {}
                for d in docs:
                    key = _eval_expr(spec["_id"], d) if spec["_id"] is not None else None
                    bucket = buckets.setdefault(key, {"_id": key})
                    for name, agg in spec.items():
                        if name == "_id":
                            continue
                        inc = 1 if agg["$sum"] == 1 else (_eval_expr(agg["$sum"], d) or 0)
                        bucket[name] = bucket.get(name, 0) + inc
                docs = list(buckets.values())
        return _Cursor(docs)


class FakeDB:
    def __init__(self, **collections):
        self._collections: Dict[str, FakeCollection] = {}
        for name, docs in collections.items():
            self._collections[name] = FakeCollection(docs)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        cols = self.__dict__.setdefault("_collections", {})
        if name not in cols:
            cols[name] = FakeCollection()
        return cols[name]

    def __getitem__(self, name):
        return getattr(self, name)


def patch_infra(monkeypatch, db: FakeDB) -> None:
    """Every ``get_db`` binding -> ``db``; Redis fails fast."""
    import core.database as database

    # Import the modules the harness drives first, so their module-level
    # `get_db` bindings exist (and are restored) rather than being bound to
    # this test's fake on first import.
    import agents.base  # noqa: F401
    import core.specialist_shadow  # noqa: F401
    import tasks.build_tasks  # noqa: F401

    original_db = database.get_db
    original_redis = database.get_redis

    async def fake_get_db():
        return db

    async def failing_redis():
        raise ConnectionError("redis disabled in tests")

    fake_get_db._a2_fake = True  # type: ignore[attr-defined]
    failing_redis._a2_fake = True  # type: ignore[attr-defined]

    def _ours(fn, original):
        return fn is original or getattr(fn, "_a2_fake", False)

    for mod in list(sys.modules.values()):
        if mod is None:
            continue
        if _ours(getattr(mod, "get_db", None), original_db):
            monkeypatch.setattr(mod, "get_db", fake_get_db)
        if _ours(getattr(mod, "get_redis", None), original_redis):
            monkeypatch.setattr(mod, "get_redis", failing_redis)
    monkeypatch.setattr(database, "get_db", fake_get_db)
    monkeypatch.setattr(database, "get_redis", failing_redis)

    # Call-frequency limiting is not under test, and a max-path build makes
    # more calls per minute than the per-user default allows.
    from core.llm.router import LLMRouter

    async def _no_rate_limit(self, user_id, *, project_id=None, org_id=None):
        return None

    monkeypatch.setattr(LLMRouter, "_check_rate_limit", _no_rate_limit)
    # The limiter's in-process fallback holds asyncio primitives bound to
    # whichever event loop first used them (the Celery task runs on its own
    # worker loop); give each test a fresh limiter.
    import core.llm.concurrency as concurrency

    monkeypatch.setattr(concurrency, "_concurrency_limiter", None)
    import logging

    for name in ("core.llm.rate_limiter", "core.llm.concurrency", "core.llm.circuit_breaker"):
        monkeypatch.setattr(logging.getLogger(name), "disabled", True)


def set_flags(monkeypatch, **flags) -> None:
    from core.config import get_settings

    settings = get_settings()
    for name, value in flags.items():
        monkeypatch.setattr(settings, name, value)


# --------------------------------------------------------------------------- #
# Providers
# --------------------------------------------------------------------------- #


class CountingProvider(BaseProviderAdapter):
    """Forge-side fake adapter. ``responder(model, messages) -> text`` or a
    fixed text; ``fail`` raises on every call; ``tripwire`` raises
    AssertionError (a call that must never happen)."""

    name = "fake"

    def __init__(self, *, text: str = "ok", responder=None, fail: Optional[Exception] = None,
                 tripwire: bool = False, chunks: Optional[List[str]] = None, label: str = "fake"):
        self.text = text
        self.responder = responder
        self.fail = fail
        self.tripwire = tripwire
        self.chunks = chunks
        self.label = label
        self.calls: List[Dict[str, Any]] = []

    def _record(self, model, messages, **kw):
        self.calls.append({"model": model, "messages": messages, **kw})
        if self.tripwire:
            raise AssertionError(f"Forge provider {self.label} must not be called")
        if self.fail is not None:
            raise self.fail

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        self._record(model, messages, max_tokens=kwargs.get("max_tokens"))
        text = self.responder(model, messages) if self.responder else self.text
        return CompletionResponse(
            text=text, provider=self.label, model=model,
            usage={"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12},
        )

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        self._record(model, messages, max_tokens=kwargs.get("max_tokens"), stream=True)
        text = self.responder(model, messages) if self.responder else self.text
        for chunk in (self.chunks or chunked(text, 50)):
            yield chunk


def developer_fixture(chars: int = 32_000) -> str:
    """A 32,000-character Developer stream: a JSON files payload of benign
    code, as in the §2.1 F26 measurement."""
    body = "export const handler = () => { return { ok: true, items: [1, 2, 3] } }; "
    overhead = len(json.dumps({"files": {"backend/main.py": ""}}))
    content = (body * (chars // len(body) + 1))[: chars - overhead]
    payload = json.dumps({"files": {"backend/main.py": content}})
    assert len(payload) == chars
    return payload


def chunked(text: str, size: int = 37) -> List[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]


# --------------------------------------------------------------------------- #
# Full stub build through tasks.build_tasks.run_build
# --------------------------------------------------------------------------- #

BYOK_TEST_KEY = "customer-owned-test-key"


def make_user(*, byok: bool, user_id: str = "u1", plan: str = "enterprise") -> Dict[str, Any]:
    """Forge users default to the enterprise plan so a max-path build fits
    the daily token budget (U4 keeps that budget on builds)."""
    from core.encryption import encrypt_field

    user = {"id": user_id, "credits": 1000, "plan": plan, "email": "u@example.test", "name": "U"}
    if byok:
        user.update({"plan": "pro", "llm_api_key": encrypt_field(BYOK_TEST_KEY), "llm_provider": "anthropic"})
    return user


def make_build(*, boundary: Optional[Dict[str, Any]] = None, build_id: str = "build-1") -> Dict[str, Any]:
    build = {
        "id": build_id, "project_id": "p1", "user_id": "u1", "prompt": "Build a todo API",
        "status": "pending", "agents": [], "credits_used": 0, "context_tokens": 0,
        "debug_iterations": 0, "business_model": None, "created_at": utcnow(), "completed_at": None,
    }
    if boundary is not None:
        build["processing_boundary"] = boundary
    return build


_SCHEMAS = {
    "blueprint": {"type": "object", "required": ["features"]},
    "improve": {"type": "object", "required": ["summary"]},
    "integrate": {"type": "object", "required": ["files"]},
    "validate": {"type": "object", "required": ["passed"]},
    "patch": {"type": "object", "required": ["files"]},
}


def build_responses(dev_text: Optional[str] = None) -> Dict[str, str]:
    return {
        "blueprint": json.dumps({"app_name": "todo", "features": ["tasks"], "integrations": ["stripe"],
                                 "description": "backend api", "api_endpoints": [{"path": "/api/tasks"}]}),
        "improve": json.dumps({"summary": "ok"}),
        "design": json.dumps({"theme": "default"}),
        "questions": json.dumps(["What happens when a session expires?", "Pagination size?", "Soft delete?"]),
        "answer": "Redirect to /login and keep the draft.",
        "integrate": json.dumps({"files": {"backend/stripe.py": "# stripe"}, "instructions": ""}),
        "validate_fail": json.dumps({"passed": False, "issues": [{"severity": "low", "file": "a", "description": "x"}]}),
        "validate_pass": json.dumps({"passed": True}),
        "patch": json.dumps({"files": {"backend/main.py": "# v2"}}),
        "developer": dev_text or developer_fixture(),
    }


def make_stub_agents(pm_failures: int = 3):
    """BaseAgent subclasses that do their work through the real gateway, one
    marker per operation so a provider double can answer each."""
    from agents.base import BaseAgent
    from core.models import AgentType

    class GatewayStubAgent(BaseAgent):
        agent_type = AgentType.ARCHITECT
        prompt_role = "architect"

        def __init__(self):
            super().__init__()
            self.pm_calls = 0

        @staticmethod
        def _ids(kw):
            return {k: kw.get(k) for k in ("user_id", "build_id", "project_id")}

        async def clarify(self, *a, **kw):
            return []

        async def blueprint(self, *a, **kw):
            return await self._call_structured([{"role": "user", "content": "[op:blueprint] plan it"}],
                                               schema=_SCHEMAS["blueprint"], **self._ids(kw))

        async def improve(self, *a, **kw):
            return await self._call_structured([{"role": "user", "content": "[op:improve] model it"}],
                                               schema=_SCHEMAS["improve"], **self._ids(kw))

        async def design(self, *a, **kw):
            text = await self.run([{"role": "user", "content": "[op:design] design it"}], **self._ids(kw))
            return json.loads(text)

        async def identify_questions(self, *a, **kw):
            text = await self.run([{"role": "user", "content": "[op:questions] ask"}], **self._ids(kw))
            return json.loads(text)

        async def answer(self, question, *a, **kw):
            return await self.run([{"role": "user", "content": f"[op:answer] {question}"}], **self._ids(kw))

        async def generate_files(self, *a, stream_callback=None, **kw):
            full = ""
            async for chunk in self.stream([{"role": "user", "content": "[op:developer] code it"}],
                                           **self._ids(kw)):
                full += chunk
                if stream_callback:
                    await stream_callback(chunk)
            return json.loads(full)

        async def integrate(self, *a, **kw):
            return await self._call_structured([{"role": "user", "content": "[op:integrate] wire it"}],
                                               schema=_SCHEMAS["integrate"], **self._ids(kw))

        async def validate(self, *a, **kw):
            self.pm_calls += 1
            marker = "validate_fail" if self.pm_calls <= pm_failures else "validate_pass"
            return await self._call_structured([{"role": "user", "content": f"[op:{marker}] check it"}],
                                               schema=_SCHEMAS["validate"], **self._ids(kw))

        async def patch_files(self, *a, **kw):
            return await self._call_structured([{"role": "user", "content": "[op:patch] fix it"}],
                                               schema=_SCHEMAS["patch"], **self._ids(kw))

    return GatewayStubAgent


def op_marker(messages: List[Dict[str, Any]]) -> Optional[str]:
    for m in reversed(messages or []):
        content = m.get("content")
        if m.get("role") == "user" and isinstance(content, str) and "[op:" in content:
            return content.split("[op:", 1)[1].split("]", 1)[0]
    return None


class StubBuildHarness:
    """Wires a fresh router + gateway into BaseAgent, the specialist shadow
    and the orchestrator singleton used by tasks.build_tasks, then runs one
    build. ``forge`` is the Forge-credential generation provider double;
    ``guardrail`` answers the dedicated L-tier model entry."""

    def __init__(self, monkeypatch, *, db: FakeDB, forge: CountingProvider,
                 guardrail: Optional[CountingProvider] = None, pm_failures: int = 3):
        import agents.base as base_module
        import core.specialist_shadow as shadow_module
        import tasks.build_tasks as build_tasks_module
        from core.llm.config import LLMConfigLoader
        from core.llm.router import LLMRouter
        from gateway.service import AIGateway

        self.db = db
        self.forge = forge
        self.guardrail = guardrail or CountingProvider(text="SAFE", label="guardrail")
        loader = LLMConfigLoader()
        # Every agent resolves to the "forge" double; the L-tier entry to
        # its own double under the provider name the policy entry names.
        loader._config = {**loader._config, "default_provider": "forge", "fallback_chain": ["forge"],
                          "agent_overrides": {}}
        self.loader = loader
        self.router = LLMRouter(config_loader=loader)
        # Drop the always-registered local provider: only the doubles exist.
        self.router.registry._providers.pop("ollama", None)
        self.router.register_provider(forge, name="forge", priority=100)
        self.router.register_provider(self.guardrail, name="openrouter", priority=1)
        self.gateway = AIGateway(router=self.router)

        monkeypatch.setattr(base_module, "get_ai_gateway", lambda: self.gateway)
        monkeypatch.setattr(shadow_module, "get_ai_gateway", lambda: self.gateway)

        Stub = make_stub_agents(pm_failures=pm_failures)
        orch = build_tasks_module.orchestrator
        for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
            monkeypatch.setattr(orch, attr, Stub())

        class _Sandbox:
            async def run(self, files):
                return ""

        monkeypatch.setattr(build_tasks_module, "sandbox", _Sandbox())
        self.build_tasks = build_tasks_module

    def run(self, *, retries: int = 0, reserved: int = 100):
        task = self.build_tasks.run_build
        task.push_request(retries=retries)
        try:
            return task.run("build-1", "p1", "u1", reserved)
        finally:
            task.pop_request()


class ForgeTripwires:
    """BY-1: every Forge provider adapter class and the OpenAI embeddings
    URL (httpx transport) raise and count. The Anthropic adapter serves the
    customer's key (the BYOK path builds one with the user's key) and only
    trips for any other key. ``byok_responder(messages) -> text`` answers
    customer-key calls; ``byok_fail`` makes them raise."""

    FORGE_ADAPTERS = (
        ("providers.openai", "OpenAIAdapter"),
        ("providers.openrouter", "OpenRouterAdapter"),
        ("providers.gemini", "GeminiAdapter"),
        ("providers.groq", "GroqAdapter"),
        ("providers.together", "TogetherAdapter"),
        ("providers.ollama", "OllamaAdapter"),
        ("providers.mistral", "MistralAdapter"),
        ("providers.azure_openai", "AzureOpenAIAdapter"),
    )

    def __init__(self, monkeypatch, *, byok_responder=None, byok_fail: Optional[Exception] = None):
        import importlib

        import httpx

        import providers.anthropic as anthropic_module

        self.forge_calls: List[str] = []
        self.embedding_calls: List[str] = []
        self.byok_calls: List[Dict[str, Any]] = []
        tripwires = self

        def _forge_trip(label):
            async def chat(self_, *a, **k):
                tripwires.forge_calls.append(label)
                raise AssertionError(f"Forge adapter {label} called")

            async def stream(self_, *a, **k):
                tripwires.forge_calls.append(label)
                raise AssertionError(f"Forge adapter {label} called")
                yield ""  # pragma: no cover

            return chat, stream

        for module_name, cls_name in self.FORGE_ADAPTERS:
            cls = getattr(importlib.import_module(module_name), cls_name)
            chat, stream = _forge_trip(cls_name)
            monkeypatch.setattr(cls, "chat_completion", chat)
            monkeypatch.setattr(cls, "stream_completion", stream)

        responder = byok_responder or (lambda messages: "ok")

        async def anthropic_chat(self_, *, model, messages, **k):
            if getattr(self_, "api_key", None) != BYOK_TEST_KEY:
                tripwires.forge_calls.append("AnthropicAdapter")
                raise AssertionError("Forge Anthropic adapter called")
            tripwires.byok_calls.append({"kind": "chat", "messages": messages})
            if byok_fail is not None:
                raise byok_fail
            return CompletionResponse(text=responder(messages), provider="anthropic", model=model,
                                      usage={"prompt_tokens": 20, "completion_tokens": 5})

        async def anthropic_stream(self_, *, model, messages, **k):
            if getattr(self_, "api_key", None) != BYOK_TEST_KEY:
                tripwires.forge_calls.append("AnthropicAdapter")
                raise AssertionError("Forge Anthropic adapter called")
            tripwires.byok_calls.append({"kind": "stream", "messages": messages})
            if byok_fail is not None:
                raise byok_fail
            for chunk in chunked(responder(messages), 50):
                yield chunk

        monkeypatch.setattr(anthropic_module.AnthropicAdapter, "chat_completion", anthropic_chat)
        monkeypatch.setattr(anthropic_module.AnthropicAdapter, "stream_completion", anthropic_stream)

        real_post = httpx.AsyncClient.post

        async def guarded_post(self_, url, *a, **k):
            if "api.openai.com" in str(url):
                tripwires.embedding_calls.append(str(url))
                raise AssertionError("OpenAI embeddings called with Forge's key")
            return await real_post(self_, url, *a, **k)

        monkeypatch.setattr(httpx.AsyncClient, "post", guarded_post)

    @property
    def total_forge_model_calls(self) -> int:
        return len(self.forge_calls) + len(self.embedding_calls)


def byok_responder_for(responses: Dict[str, str]):
    def _respond(messages):
        return responses.get(op_marker(messages) or "", "ok")

    return _respond
