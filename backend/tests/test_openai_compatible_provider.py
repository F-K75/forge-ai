"""Self-hosted OpenAI-compatible providers (vLLM / LiteLLM proxy).

All HTTP is served by ``httpx.MockTransport`` -- no network.
"""

import json
from types import SimpleNamespace

import httpx
import pytest

# core.llm must load before providers (providers/__init__ -> core.llm ->
# router -> providers.* is circular when providers is imported first).
from core.llm.config import LLMConfigLoader
from core.llm.provider import BaseProviderAdapter, CompletionResponse, ProviderError
from core.llm.router import LLMRouter

import providers.openai_compatible as oc  # noqa: E402
from providers.openai_compatible import OpenAICompatibleAdapter, build_self_hosted_adapters

MESSAGES = [{"role": "user", "content": "write a haiku about GPUs"}]


def _completion_body(text="hello from vllm", prompt=11, completion=7):
    return {
        "id": "cmpl-1",
        "object": "chat.completion",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": prompt + completion},
    }


class _Server:
    """Records requests and answers like an OpenAI-compatible server."""

    def __init__(self, *, status=200, body=None, headers=None, stream_lines=None, models=None):
        self.status = status
        self.body = body if body is not None else _completion_body()
        self.headers = headers or {}
        self.stream_lines = stream_lines
        self.models = models if models is not None else ["served-model"]
        self.requests = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"object": "list", "data": [{"id": m} for m in self.models]})
        if self.status >= 400:
            return httpx.Response(self.status, json={"error": "boom"})
        payload = json.loads(request.content)
        if payload.get("stream"):
            content = "\n\n".join(self.stream_lines or []).encode()
            return httpx.Response(200, content=content, headers={"content-type": "text/event-stream"})
        return httpx.Response(200, json=self.body, headers=self.headers)

    @property
    def completion_requests(self):
        return [r for r in self.requests if r.url.path.endswith("/chat/completions")]


@pytest.fixture
def server(monkeypatch):
    srv = _Server()
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: srv.handler(request))

    def _factory(**kwargs):
        return real_client(transport=transport, **kwargs)

    # Patch only this module's view of httpx so nothing else is affected.
    monkeypatch.setattr(oc, "httpx", SimpleNamespace(AsyncClient=_factory, HTTPError=httpx.HTTPError))
    return srv


def _vllm(**kwargs):
    kwargs.setdefault("base_url", "http://gpu-box:8000")
    kwargs.setdefault("models", ["Qwen/Qwen2.5-Coder-32B-Instruct"])
    return OpenAICompatibleAdapter(name="vllm", **kwargs)


# --------------------------------------------------------------------------
# Adapter: request shape, parsing, usage, cost
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_chat_completion_request_shape_and_usage(server):
    adapter = _vllm(api_key="sk-local")
    tools = [{"type": "function", "function": {"name": "noop", "parameters": {}}}]

    result = await adapter.chat_completion(
        model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES, max_tokens=256, temperature=0.2, tools=tools,
    )

    (request,) = server.completion_requests
    assert str(request.url) == "http://gpu-box:8000/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer sk-local"
    payload = json.loads(request.content)
    assert payload == {
        "model": "Qwen/Qwen2.5-Coder-32B-Instruct",
        "messages": MESSAGES,
        "max_tokens": 256,
        "stream": False,
        "temperature": 0.2,
        "tools": tools,
    }
    assert result.text == "hello from vllm"
    assert result.provider == "vllm"
    assert result.finish_reason == "stop"
    assert result.usage["prompt_tokens"] == 11
    assert result.usage["completion_tokens"] == 7
    assert result.usage["total_tokens"] == 18
    # Self-hosted inference defaults to zero cost.
    assert result.usage["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_api_key_optional_and_base_url_with_v1_not_doubled(server):
    adapter = _vllm(base_url="http://gpu-box:8000/v1/")
    await adapter.chat_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES)

    (request,) = server.completion_requests
    assert str(request.url) == "http://gpu-box:8000/v1/chat/completions"
    assert "Authorization" not in request.headers
    assert "temperature" not in json.loads(request.content)


@pytest.mark.asyncio
async def test_parses_tool_calls(server):
    server.body = {
        "choices": [{
            "message": {
                "content": None,
                "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "lookup", "arguments": "{\"q\": 1}"}}],
            },
            "finish_reason": "tool_calls",
        }],
        "usage": {"prompt_tokens": 3, "completion_tokens": 2},
    }
    result = await _vllm().chat_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES)
    assert result.text == ""
    assert result.tool_calls == [{"id": "call_1", "name": "lookup", "arguments": "{\"q\": 1}"}]
    assert result.usage["total_tokens"] == 5


@pytest.mark.asyncio
async def test_unknown_model_maps_to_default_served_model(server):
    """A local-first chain sends an Ollama tag to every provider; vLLM must
    serve it with its own model rather than 404 into a paid fallback."""
    adapter = _vllm(models=["Qwen/Qwen2.5-Coder-32B-Instruct", "meta-llama/Llama-3.1-8B-Instruct"])

    await adapter.chat_completion(model="qwen2.5-coder:32b", messages=MESSAGES)
    await adapter.chat_completion(model="meta-llama/Llama-3.1-8B-Instruct", messages=MESSAGES)

    sent = [json.loads(r.content)["model"] for r in server.completion_requests]
    assert sent == ["Qwen/Qwen2.5-Coder-32B-Instruct", "meta-llama/Llama-3.1-8B-Instruct"]


@pytest.mark.asyncio
async def test_model_discovered_from_server_when_none_configured(server):
    server.models = ["discovered/model-a"]
    adapter = _vllm(models=None)
    assert adapter.default_model == ""

    result = await adapter.chat_completion(model="", messages=MESSAGES)

    assert json.loads(server.completion_requests[0].content)["model"] == "discovered/model-a"
    assert result.model == "discovered/model-a"
    assert adapter.default_model == "discovered/model-a"
    assert await adapter.get_models() == ["discovered/model-a"]


@pytest.mark.asyncio
async def test_configurable_per_token_cost(server):
    adapter = _vllm(input_cost_per_1k=0.001, output_cost_per_1k=0.002)
    result = await adapter.chat_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES)
    # 11 prompt * 0.001/1K + 7 completion * 0.002/1K
    assert result.usage["cost_usd"] == pytest.approx((11 * 0.001 + 7 * 0.002) / 1000)
    assert adapter.cost_for_usage("x", 1000, 1000) == pytest.approx(0.003)


@pytest.mark.asyncio
async def test_litellm_uses_upstream_cost_header(server):
    server.headers = {"x-litellm-response-cost": "0.0042"}
    adapter = OpenAICompatibleAdapter(
        name="litellm", base_url="http://litellm:4000", models=["gpt-4o"], use_cost_header=True,
    )
    result = await adapter.chat_completion(model="gpt-4o", messages=MESSAGES)
    assert result.usage["cost_usd"] == pytest.approx(0.0042)

    # vLLM (header disabled) ignores it and uses configured rates.
    result = await _vllm().chat_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES)
    assert result.usage["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_http_error_raises_provider_error(server):
    server.status = 503
    with pytest.raises(ProviderError, match="vllm request failed"):
        await _vllm().chat_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES)


@pytest.mark.asyncio
async def test_streaming_parses_sse_and_reports_usage(server):
    def _sse(obj):
        return "data: " + json.dumps(obj)

    server.stream_lines = [
        _sse({"choices": [{"index": 0, "delta": {"role": "assistant"}}]}),
        _sse({"choices": [{"index": 0, "delta": {"content": "Hello"}}]}),
        ": keep-alive comment",
        _sse({"choices": [{"index": 0, "delta": {"content": ", world"}}]}),
        _sse({"choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13}}),
        "data: [DONE]",
    ]
    adapter = _vllm()

    chunks = [c async for c in adapter.stream_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES, max_tokens=64)]

    assert chunks == ["Hello", ", world"]
    payload = json.loads(server.completion_requests[0].content)
    assert payload["stream"] is True
    assert payload["stream_options"] == {"include_usage": True}
    assert payload["max_tokens"] == 64
    assert adapter.last_stream_usage == {"prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13}


@pytest.mark.asyncio
async def test_stream_http_error_raises_provider_error(server):
    server.status = 500
    with pytest.raises(ProviderError, match="vllm stream failed"):
        async for _ in _vllm().stream_completion(model="Qwen/Qwen2.5-Coder-32B-Instruct", messages=MESSAGES):
            pass


@pytest.mark.asyncio
async def test_health_check(server, monkeypatch):
    assert await _vllm().health_check() is True
    assert str(server.requests[-1].url) == "http://gpu-box:8000/v1/models"

    def _refuse(**kwargs):
        def _raise(request):
            raise httpx.ConnectError("connection refused", request=request)
        return httpx.AsyncClient(transport=httpx.MockTransport(_raise), **kwargs)

    monkeypatch.setattr(oc, "httpx", SimpleNamespace(AsyncClient=_refuse, HTTPError=httpx.HTTPError))
    assert await _vllm().health_check() is False


def test_adapter_requires_base_url():
    with pytest.raises(ValueError):
        OpenAICompatibleAdapter(name="vllm", base_url="")


# --------------------------------------------------------------------------
# Configuration / registration
# --------------------------------------------------------------------------


def _settings(**overrides):
    base = {
        "vllm_base_url": "", "vllm_api_key": "", "vllm_models": "",
        "litellm_base_url": "", "litellm_api_key": "", "litellm_models": "",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_build_adapters_disabled_when_unconfigured():
    assert build_self_hosted_adapters(_settings()) == []
    assert build_self_hosted_adapters(_settings(vllm_base_url="   ", vllm_models="m")) == []


def test_build_adapters_from_settings():
    built = build_self_hosted_adapters(_settings(
        vllm_base_url="http://gpu:8000", vllm_models="a/model, b/model",
        vllm_input_cost_per_1k=0.0005,
        litellm_base_url="http://litellm:4000/v1", litellm_api_key="sk-master", litellm_models="gpt-4o",
    ))
    by_name = {adapter.name: adapter for adapter, _priority in built}
    assert set(by_name) == {"vllm", "litellm"}
    vllm, litellm = by_name["vllm"], by_name["litellm"]
    assert vllm.base_url == "http://gpu:8000/v1"
    assert vllm.models == ["a/model", "b/model"]
    assert vllm.default_model == "a/model"
    assert vllm.api_key is None
    assert vllm.input_cost_per_1k == 0.0005
    assert vllm.use_cost_header is False
    assert litellm.base_url == "http://litellm:4000/v1"
    assert litellm.api_key == "sk-master"
    assert litellm.use_cost_header is True


def _patch_settings(monkeypatch, **overrides):
    import core.config as config_module

    real = config_module.get_settings()
    fields = {k: getattr(real, k) for k in type(real).model_fields}
    fields.update(overrides)
    fake = SimpleNamespace(**fields)
    monkeypatch.setattr(config_module, "get_settings", lambda: fake)


def test_router_does_not_register_self_hosted_when_unconfigured(monkeypatch):
    _patch_settings(monkeypatch, vllm_base_url="", litellm_base_url="")
    router = LLMRouter()
    assert router.registry.get_provider("vllm") is None
    assert router.registry.get_provider("litellm") is None


def test_router_registers_self_hosted_when_configured(monkeypatch):
    _patch_settings(
        monkeypatch,
        vllm_base_url="http://gpu:8000", vllm_models="Qwen/Qwen2.5-Coder-32B-Instruct",
        litellm_base_url="http://litellm:4000", litellm_models="gpt-4o,claude-3-5-sonnet",
    )
    router = LLMRouter()
    assert isinstance(router.registry.get_provider("vllm"), OpenAICompatibleAdapter)
    assert isinstance(router.registry.get_provider("litellm"), OpenAICompatibleAdapter)
    assert router.registry.list_models("vllm") == [{"provider": "vllm", "name": "Qwen/Qwen2.5-Coder-32B-Instruct"}]
    assert [m["name"] for m in router.registry.list_models("litellm")] == ["gpt-4o", "claude-3-5-sonnet"]
    # Ollama still registers alongside as the other local tier.
    assert router.registry.get_provider("ollama") is not None


# --------------------------------------------------------------------------
# prefer_local routing
# --------------------------------------------------------------------------


def test_prefer_local_puts_vllm_first_when_configured(monkeypatch):
    from core.evaluation_engine import ModelRouter as RoleModelRouter

    monkeypatch.setenv("VLLM_BASE_URL", "http://gpu:8000")
    decision = RoleModelRouter().select_model(department="engineering", role="backend_engineer", prefer_local=True)
    assert decision.provider_preference[:2] == ("vllm", "ollama")
    assert decision.input_cost_per_1m_usd == 0.0
    # cloud tier still follows as failover
    assert "google" in decision.provider_preference[2:]


def test_prefer_local_keeps_ollama_first_when_vllm_unconfigured(monkeypatch):
    from core.evaluation_engine import ModelRouter as RoleModelRouter

    monkeypatch.delenv("VLLM_BASE_URL", raising=False)
    _patch_settings(monkeypatch, vllm_base_url="")
    decision = RoleModelRouter().select_model(department="engineering", role="backend_engineer", prefer_local=True)
    assert decision.provider_preference[:2] == ("ollama", "vllm")


# --------------------------------------------------------------------------
# Router integration: routing, cost accounting, circuit-breaker fallback
# --------------------------------------------------------------------------


class _CloudProvider(BaseProviderAdapter):
    name = "secondary"

    def __init__(self):
        self.calls = 0

    async def chat_completion(self, *, model, messages, **kwargs):
        self.calls += 1
        return CompletionResponse(
            text="from the cloud", provider=self.name, model=model,
            usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        )

    async def stream_completion(self, *, model, messages, **kwargs):
        yield "from the cloud"


@pytest.fixture
def router_env(tmp_path, monkeypatch):
    from core.llm import router as router_mod

    config_path = tmp_path / "llm.yaml"
    config_path.write_text(
        "default_provider: vllm\nfallback_chain:\n  - vllm\nretry:\n  max_attempts: 1\n  backoff_seconds: 0\n"
    )
    recorded = []

    async def fake_track_usage(**kwargs):
        recorded.append(kwargs)
        return kwargs

    async def fake_check_budget(*args, **kwargs):
        return None

    monkeypatch.setattr(router_mod, "track_usage", fake_track_usage)
    monkeypatch.setattr(router_mod, "check_budget", fake_check_budget)
    router = LLMRouter(config_loader=LLMConfigLoader(config_path=config_path))
    return router, recorded


@pytest.mark.asyncio
async def test_router_prefers_vllm_for_local_chain_and_records_zero_cost(server, router_env):
    router, recorded = router_env
    router.register_provider(_vllm(), name="vllm", priority=45)
    cloud = _CloudProvider()
    router.register_provider(cloud, name="secondary", priority=1)

    usage_out = {}
    # Kernel's prefer_local preference, with an Ollama tag as the model id;
    # "google" is not a registered provider and is skipped.
    result = await router.generate(
        agent_name="developer",
        messages=MESSAGES,
        model="qwen2.5-coder:32b",
        provider_names=("vllm", "ollama", "google", "secondary"),
        user_id="user-local",
        usage_out=usage_out,
    )

    assert result.provider == "vllm"
    assert result.text == "hello from vllm"
    assert cloud.calls == 0
    assert json.loads(server.completion_requests[0].content)["model"] == "Qwen/Qwen2.5-Coder-32B-Instruct"
    assert len(recorded) == 1
    assert recorded[0]["provider"] == "vllm"
    assert recorded[0]["prompt_tokens"] == 11
    assert recorded[0]["completion_tokens"] == 7
    # Not priced at the MODEL_COSTS default (Claude Sonnet) rate.
    assert recorded[0]["cost_usd"] == 0.0
    assert usage_out["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_router_uses_configured_self_hosted_rate_for_stream(server, router_env):
    router, recorded = router_env
    server.stream_lines = [
        "data: " + json.dumps({"choices": [{"delta": {"content": "streamed"}}]}),
        "data: " + json.dumps({"choices": [], "usage": {"prompt_tokens": 1000, "completion_tokens": 500}}),
        "data: [DONE]",
    ]
    router.register_provider(_vllm(input_cost_per_1k=0.001, output_cost_per_1k=0.004), name="vllm", priority=45)

    usage_out = {}
    chunks = [
        c async for c in router.stream(
            agent_name="developer", messages=MESSAGES, provider_names=("vllm",),
            user_id="user-local", usage_out=usage_out,
        )
    ]

    assert "".join(chunks) == "streamed"
    assert len(recorded) == 1
    assert recorded[0]["prompt_tokens"] == 1000
    assert recorded[0]["completion_tokens"] == 500
    assert recorded[0]["cost_usd"] == pytest.approx(0.001 + 0.002)
    assert usage_out["cost_usd"] == pytest.approx(recorded[0]["cost_usd"])


@pytest.mark.asyncio
async def test_router_falls_back_when_vllm_fails_and_circuit_opens(server, router_env):
    from core.llm.circuit_breaker import DEFAULT_PROVIDER_FAILURE_THRESHOLD, get_circuit_breaker

    router, _recorded = router_env
    server.status = 503
    router.register_provider(_vllm(), name="vllm", priority=45)
    cloud = _CloudProvider()
    router.register_provider(cloud, name="secondary", priority=1)

    for _ in range(DEFAULT_PROVIDER_FAILURE_THRESHOLD):
        result = await router.generate(agent_name="developer", messages=MESSAGES, provider_names=("vllm", "secondary"))
        assert result.provider == "secondary"
        assert result.text == "from the cloud"

    vllm_attempts = len(server.completion_requests)
    assert vllm_attempts == DEFAULT_PROVIDER_FAILURE_THRESHOLD

    state = await get_circuit_breaker()._load("provider:vllm")
    assert state["state"] == "open"

    # Breaker is open: vLLM is skipped entirely, straight to the cloud tier.
    result = await router.generate(agent_name="developer", messages=MESSAGES, provider_names=("vllm", "secondary"))
    assert result.provider == "secondary"
    assert len(server.completion_requests) == vllm_attempts

    health = {entry["name"]: entry for entry in await router.health_check_all()}
    assert health["vllm"]["degraded"] is True
