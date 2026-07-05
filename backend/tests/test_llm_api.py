from fastapi.testclient import TestClient

from main import app
from core.llm.router import get_llm_router
from core.llm.provider import BaseProviderAdapter, CompletionResponse


class FakeProvider(BaseProviderAdapter):
    name = "test-provider"

    async def health_check(self) -> bool:
        return True

    async def chat_completion(self, *, model: str, messages: list, **kwargs):
        return CompletionResponse(text="hello", provider=self.name, model=model, usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2})

    async def stream_completion(self, *, model: str, messages: list, **kwargs):
        async def _iter():
            yield "hello"
        return _iter()


def test_llm_endpoints_return_provider_and_health_data():
    client = TestClient(app)
    response = client.get("/api/llm/providers")
    assert response.status_code == 200
    payload = response.json()
    assert "providers" in payload

    health = client.get("/api/llm/health")
    assert health.status_code == 200
    assert "providers" in health.json()


def test_llm_test_endpoint_uses_router_and_provider_override():
    router = get_llm_router()
    router.register_provider(FakeProvider(), name="test-provider", priority=999)

    client = TestClient(app)
    response = client.post(
        "/api/llm/test",
        json={"agent": "developer", "messages": [{"role": "user", "content": "hi"}], "provider_names": ["test-provider"]},
    )
    assert response.status_code == 200
    assert response.json()["text"] == "hello"
