import pytest

from providers.groq import GroqAdapter
from providers.gemini import GeminiAdapter
from providers.ollama import OllamaAdapter


class _FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("http error")

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, response=None, **kwargs):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, **kwargs):
        return self._response

    async def get(self, url, **kwargs):
        return self._response


@pytest.mark.asyncio
async def test_groq_adapter_without_api_key_returns_empty():
    adapter = GroqAdapter(api_key=None)
    result = await adapter.chat_completion(model="llama-3.1-8b", messages=[{"role": "user", "content": "hi"}])
    assert result.text == ""


@pytest.mark.asyncio
async def test_groq_adapter_parses_openai_compatible_response(monkeypatch):
    adapter = GroqAdapter(api_key="test-key")
    fake_response = _FakeResponse({
        "choices": [{"message": {"content": "hello from groq"}}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    })

    import providers.groq as groq_module

    monkeypatch.setattr(groq_module.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(response=fake_response))

    result = await adapter.chat_completion(model="llama-3.1-8b", messages=[{"role": "user", "content": "hi"}])
    assert result.text == "hello from groq"
    assert result.usage["total_tokens"] == 8


@pytest.mark.asyncio
async def test_gemini_adapter_parses_candidates(monkeypatch):
    adapter = GeminiAdapter(api_key="test-key")
    fake_response = _FakeResponse({
        "candidates": [{"content": {"parts": [{"text": "hello from gemini"}]}}],
        "usageMetadata": {"promptTokenCount": 2, "candidatesTokenCount": 4, "totalTokenCount": 6},
    })

    import providers.gemini as gemini_module

    monkeypatch.setattr(gemini_module.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(response=fake_response))

    result = await adapter.chat_completion(model="gemini-1.5-pro", messages=[{"role": "user", "content": "hi"}])
    assert result.text == "hello from gemini"
    assert result.usage["total_tokens"] == 6


@pytest.mark.asyncio
async def test_ollama_health_check_reports_unreachable(monkeypatch):
    adapter = OllamaAdapter(base_url="http://localhost:11434")

    import providers.ollama as ollama_module

    def _raise(**kw):
        raise ollama_module.httpx.HTTPError("boom")

    class _FailingClient(_FakeAsyncClient):
        async def get(self, url, **kwargs):
            raise ollama_module.httpx.HTTPError("boom")

    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", lambda **kw: _FailingClient())

    healthy = await adapter.health_check()
    assert healthy is False
