from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin import admin_required
from api.auth import get_current_user
from api.prompts import router as prompts_router
from core.models import PlanTier, User


def _fake_admin() -> User:
    return User(id="admin-1", email="admin@example.com", name="Admin", plan=PlanTier.ENTERPRISE)


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(prompts_router)
    app.dependency_overrides[admin_required] = _fake_admin
    app.dependency_overrides[get_current_user] = _fake_admin
    return TestClient(app)


def test_build_endpoint():
    resp = _client().post("/prompts/build", json={"agent_role": "architect", "task": "Build a todo app."})
    assert resp.status_code == 200
    body = resp.json()
    assert "prompt" in body
    assert body["metadata"]["agent"] == "architect"


def test_build_endpoint_404_for_unknown_role():
    resp = _client().post("/prompts/build", json={"agent_role": "unknown-role", "task": "x"})
    assert resp.status_code == 404


def test_build_endpoint_422_on_missing_task():
    resp = _client().post("/prompts/build", json={"agent_role": "architect", "task": ""})
    assert resp.status_code == 422


def test_preview_endpoint():
    resp = _client().post("/prompts/preview", json={"agent_role": "developer", "task": "Generate files."})
    assert resp.status_code == 200
    assert "prompt" in resp.json()


def test_validate_endpoint():
    resp = _client().post("/prompts/validate", json={"agent_role": "architect", "task": "Build a todo app."})
    assert resp.status_code == 200
    assert resp.json()["is_valid"] is True


def test_estimate_tokens_endpoint_with_text():
    resp = _client().post("/prompts/estimate-tokens", json={"text": "hello world"})
    assert resp.status_code == 200
    assert resp.json()["tokens"] > 0


def test_list_templates_endpoint():
    resp = _client().get("/prompts/templates")
    assert resp.status_code == 200
    roles = {t["role"] for t in resp.json()["templates"]}
    assert "architect" in roles
    assert "developer" in roles


def test_get_template_endpoint():
    resp = _client().get("/prompts/templates/architect/v1")
    assert resp.status_code == 200
    assert resp.json()["role"] == "architect"


def test_template_crud_requires_admin_and_round_trips():
    client = _client()
    payload = {
        "role": "test-role",
        "version": "v1",
        "identity": "You are a test agent.",
        "required_inputs": ["task"],
        "output_format": "{}",
    }
    create_resp = client.post("/prompts/templates", json=payload)
    assert create_resp.status_code == 200

    get_resp = client.get("/prompts/templates/test-role/v1")
    assert get_resp.status_code == 200

    update_resp = client.put("/prompts/templates/test-role/v1", json=payload)
    assert update_resp.status_code == 200

    delete_resp = client.delete("/prompts/templates/test-role/v1")
    assert delete_resp.status_code == 200

    missing_resp = client.get("/prompts/templates/test-role/v1")
    assert missing_resp.status_code == 404
