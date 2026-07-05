from fastapi.testclient import TestClient

from main import app
from api.admin import admin_required
from core.llm.router import get_llm_router
from core.llm.provider import BaseProviderAdapter, CompletionResponse
from core.models import User


def _override_admin():
    return User(id="admin-1", email="admin@forge.ai", name="Admin")


app.dependency_overrides[admin_required] = _override_admin


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


def test_llm_endpoints_reject_unauthenticated_requests():
    """Regression test: /api/llm/* previously had no auth dependency at all,
    so anyone on the internet could trigger real (Forge-billed) provider
    calls via POST /api/llm/test and rewrite every agent's model assignment
    platform-wide via PUT /api/llm/agent/{agent}, with no login required."""
    del app.dependency_overrides[admin_required]
    try:
        client = TestClient(app)
        assert client.get("/api/llm/providers").status_code == 401
        assert client.get("/api/llm/models").status_code == 401
        assert client.get("/api/llm/usage").status_code == 401
        assert client.get("/api/llm/health").status_code == 401
        assert client.post("/api/llm/test", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401
        assert client.put("/api/llm/agent/developer", json={"model": "evil-model"}).status_code == 401
        assert client.post("/api/llm/reload").status_code == 401
    finally:
        app.dependency_overrides[admin_required] = _override_admin
