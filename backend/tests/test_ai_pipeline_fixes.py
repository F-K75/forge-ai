"""Regression tests for TASK-002 (DeveloperAgent files unwrapping) and
TASK-003 (streaming / BaseAgent.run token & cost tracking + BYOK flag).
"""

import json
from types import SimpleNamespace
import pytest


@pytest.mark.asyncio
async def test_developer_generate_files_streaming_and_non_streaming_return_wrapped_dict(monkeypatch):
    """DeveloperAgent.generate_files must always return {'files': <dict>} in both
    streaming and non-streaming modes, whether the LLM wraps in 'files' or not."""
    from agents.developer import DeveloperAgent

    agent = DeveloperAgent()

    async def fake_stream_wrapped(*args, **kwargs):
        yield json.dumps({"files": {"src/App.tsx": "export default 1;"}})

    monkeypatch.setattr(agent, "stream", fake_stream_wrapped)
    streamed = []

    async def cb(chunk):
        streamed.append(chunk)

    res1 = await agent.generate_files({"pages": []}, {"tokens": {}}, stream_callback=cb)
    assert res1 == {"files": {"src/App.tsx": "export default 1;"}}
    assert len(streamed) == 1

    async def fake_stream_unwrapped(*args, **kwargs):
        yield json.dumps({"src/main.py": "print('hi')"})

    monkeypatch.setattr(agent, "stream", fake_stream_unwrapped)
    res2 = await agent.generate_files({"pages": []}, {"tokens": {}}, stream_callback=cb)
    assert res2 == {"files": {"src/main.py": "print('hi')"}}

    async def fake_call_structured(*args, **kwargs):
        return {"files": {"README.md": "# App"}}

    monkeypatch.setattr(agent, "_call_structured", fake_call_structured)
    res3 = await agent.generate_files({"pages": []}, {"tokens": {}}, stream_callback=None)
    assert res3 == {"files": {"README.md": "# App"}}


@pytest.mark.asyncio
async def test_developer_patch_files_returns_wrapped_dict(monkeypatch):
    """DeveloperAgent.patch_files must return {'files': <dict>} so Orchestrator
    does not drop patched files via patched.get('files', {})."""
    from agents.developer import DeveloperAgent

    agent = DeveloperAgent()

    async def fake_call_structured(*args, **kwargs):
        return {"files": {"src/App.tsx": "fixed content"}}

    monkeypatch.setattr(agent, "_call_structured", fake_call_structured)
    patched = await agent.patch_files(
        {"src/App.tsx": "broken"},
        "SyntaxError",
        {"pages": []},
    )
    assert patched == {"files": {"src/App.tsx": "fixed content"}}


@pytest.mark.asyncio
async def test_orchestrator_preserves_developer_generated_and_patched_files(monkeypatch):
    """End-to-end check with real DeveloperAgent methods: Orchestrator.run_build
    must preserve generated files from stream_callback and patched files from patch_files."""
    from agents.developer import DeveloperAgent
    from core import orchestrator as orch_mod
    from core.models import Build, BuildStatus

    dev = DeveloperAgent()

    async def fake_stream(*args, **kwargs):
        yield json.dumps({"files": {"src/App.tsx": "initial", "package.json": "{}"}})

    async def fake_call_structured(*args, **kwargs):
        return {"files": {"src/App.tsx": "patched"}}

    monkeypatch.setattr(dev, "stream", fake_stream)
    monkeypatch.setattr(dev, "_call_structured", fake_call_structured)

    class _Stub:
        async def blueprint(self, *a, **kw):
            return {"integrations": [], "features": []}

        async def improve(self, *a, **kw):
            return {"improvements": [], "spec": ""}

        async def design(self, *a, **kw):
            return {"tokens": {}}

        async def integrate(self, *a, **kw):
            return {"files": {}}

        async def validate(self, *a, **kw):
            return {"ok": True}

        async def clarify(self, *a, **kw):
            return []

        async def answer_questions(self, *a, **kw):
            return []

    async def fake_deduct(*a, **kw):
        return 0

    async def fake_refund(*a, **kw):
        return None

    async def fake_settle(*a, **kw):
        return None

    class _FakeCol:
        async def find_one(self, *a, **kw):
            return {"id": "u1", "plan": "free"}

        async def update_one(self, *a, **kw):
            return None

    class _FakeDB:
        users = _FakeCol()
        projects = _FakeCol()
        builds = _FakeCol()
        build_checkpoints = _FakeCol()

        def __getattr__(self, name):
            return _FakeCol()

    async def fake_get_db():
        return _FakeDB()

    monkeypatch.setattr(orch_mod, "get_db", fake_get_db)
    monkeypatch.setattr("core.database.get_db", fake_get_db)
    monkeypatch.setattr(orch_mod, "deduct_credits", fake_deduct, raising=False)

    orch = orch_mod.Orchestrator()
    orch.architect = _Stub()
    orch.designer = _Stub()
    orch.developer = dev
    orch.integration = _Stub()
    orch.pm = _Stub()
    orch.business_model = _Stub()
    orch._deduct_agent_credits = fake_deduct
    orch._refund_credits = fake_refund
    orch._settle_credits = fake_settle

    # Force one sandbox failure then pass so patch_files runs
    sandbox_calls = {"n": 0}

    class _SandboxStub:
        async def run(self, files):
            sandbox_calls["n"] += 1
            if sandbox_calls["n"] == 1:
                return "SyntaxError in src/App.tsx"
            return ""

    persisted = {}

    async def persist_files(files_dict):
        persisted.clear()
        persisted.update(files_dict)

    events = []

    async def emit(ev):
        events.append(ev)

    build = Build(
        id="b-task002",
        project_id="p-task002",
        user_id="u1",
        prompt="Build a counter app",
        status=BuildStatus.PENDING,
    )
    await orch.run_build(build, emit, sandbox_runner=_SandboxStub(), persist_files=persist_files)

    assert build.status == BuildStatus.SUCCESS
    assert persisted.get("src/App.tsx") == "patched"
    assert persisted.get("package.json") == "{}"


@pytest.mark.asyncio
async def test_base_agent_run_records_usage_via_track_usage(tmp_path, monkeypatch):
    """BaseAgent.run() delegates to stream() -> LLMRouter.stream() and must record
    non-zero prompt_tokens, completion_tokens, and cost_usd via track_usage()."""
    from agents.base import BaseAgent
    from core.llm import router as router_mod
    from core.llm.config import LLMConfigLoader
    from core.llm.provider import BaseProviderAdapter, CompletionResponse
    from core.models import AgentType
    from gateway.service import AIGateway

    class _FakeStreamProvider(BaseProviderAdapter):
        name = "fake"
        default_model = "claude-sonnet-4-6"

        async def chat_completion(self, *, model, messages, **kwargs):
            return CompletionResponse(text="ok", provider="fake", model=model)

        async def stream_completion(self, *, model, messages, **kwargs):
            yield "hello "
            yield "from base agent"

    config_path = tmp_path / "llm.yaml"
    config_path.write_text("default_provider: fake\nfallback_chain:\n  - fake\n")

    recorded = []

    async def fake_track_usage(**kwargs):
        recorded.append(kwargs)
        return kwargs

    async def fake_check_budget(*a, **kw):
        return None

    monkeypatch.setattr(router_mod, "track_usage", fake_track_usage)
    monkeypatch.setattr(router_mod, "check_budget", fake_check_budget)
    monkeypatch.setattr("agents.base.check_budget", fake_check_budget)

    router = router_mod.LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    router.register_provider(_FakeStreamProvider(), name="fake", priority=1)
    gateway = AIGateway(router=router)

    class _TestAgent(BaseAgent):
        agent_type = AgentType.ARCHITECT
        system_prompt = "You are a test agent."
        use_context_engineering = False

    monkeypatch.setattr("agents.base.get_ai_gateway", lambda: gateway)
    monkeypatch.setattr("agents.base._resolve_byok", lambda uid: _async_none())

    agent = _TestAgent()
    out = await agent.run(
        [{"role": "user", "content": "Say hello"}],
        user_id="user-base-1",
        build_id="build-base-1",
    )

    assert out == "hello from base agent"
    assert len(recorded) == 1
    assert recorded[0]["prompt_tokens"] > 0
    assert recorded[0]["completion_tokens"] > 0
    assert recorded[0]["cost_usd"] > 0
    assert recorded[0]["byok"] is False


async def _async_none():
    return None


@pytest.mark.asyncio
async def test_track_usage_stores_byok_flag(monkeypatch):
    """track_usage() must persist the `byok` boolean on the ai_usage record."""
    from core import ai_usage

    inserted = []

    class _FakeCollection:
        async def insert_one(self, doc):
            inserted.append(doc)

        async def find_one(self, *a, **kw):
            return None

        def aggregate(self, pipeline):
            async def _empty():
                if False:
                    yield {}
            return _empty()

    class _FakeDB:
        ai_usage = _FakeCollection()
        users = _FakeCollection()
        organizations = _FakeCollection()

    async def fake_get_db():
        return _FakeDB()

    monkeypatch.setattr(ai_usage, "get_db", fake_get_db)

    rec = await ai_usage.track_usage(
        user_id="u-byok",
        build_id="b-byok",
        model="claude-sonnet-4-6",
        prompt_tokens=100,
        completion_tokens=50,
        cost_usd=0.001,
        byok=True,
    )
    assert rec["byok"] is True
    assert inserted[0]["byok"] is True
