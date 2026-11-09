"""Webhook signing-secret lifecycle (regression for 01e9aa3).

Intended behaviour:
- POST /webhooks/ generates a per-webhook secret, stores it, and returns it
  once so the receiver can verify X-Forge-Signature.
- GET /webhooks/ never exposes it -- not even as a `"secret": null` key,
  which is what 01e9aa3 introduced by adding an optional `secret` field to
  the shared WebhookResponse model.
- Deliveries are signed with exactly the stored secret, so the value handed
  out at creation verifies real deliveries.
"""

import hashlib
import hmac
import json

import pytest

from core.models import User
from tests.test_pagination import FakeDB, _client_for


def _user():
    return User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")


@pytest.fixture
def webhook_client(monkeypatch):
    import api.webhooks as webhooks_module

    async def _valid(url):
        return True, None

    # URL validation resolves DNS (SSRF guard); not what's under test here.
    monkeypatch.setattr(webhooks_module, "validate_webhook_url", _valid)
    db = FakeDB()
    return _client_for(monkeypatch, webhooks_module, db, user=_user()), db


def test_create_returns_the_stored_secret_once(webhook_client):
    client, db = webhook_client

    r = client.post("/webhooks/", json={"url": "https://hooks.example.com/a", "events": ["build.completed"]})
    assert r.status_code == 200
    body = r.json()
    (stored,) = db.webhooks.docs

    assert body["secret"] == stored["secret"]
    assert len(body["secret"]) >= 40  # secrets.token_urlsafe(32)

    # A second webhook gets its own secret -- never a shared value.
    r2 = client.post("/webhooks/", json={"url": "https://hooks.example.com/b", "events": []})
    assert r2.json()["secret"] != body["secret"]


def test_list_never_exposes_a_secret_key(webhook_client):
    client, _db = webhook_client
    client.post("/webhooks/", json={"url": "https://hooks.example.com/a", "events": ["build.completed"]})

    r = client.get("/webhooks/")
    assert r.status_code == 200
    (item,) = r.json()["webhooks"]
    assert "secret" not in item  # not even "secret": null
    assert item["url"] == "https://hooks.example.com/a"


def test_response_schemas_only_carry_secret_on_create():
    from api.webhooks import WebhookCreateResponse, WebhookResponse

    assert "secret" not in WebhookResponse.model_fields
    assert WebhookCreateResponse.model_fields["secret"].is_required()


async def test_deliveries_are_signed_with_the_secret_returned_at_creation(webhook_client, monkeypatch):
    import services.webhook as webhook_service

    client, db = webhook_client
    created = client.post(
        "/webhooks/", json={"url": "https://hooks.example.com/a", "events": ["build.completed"]}
    ).json()

    # 1. Queueing copies the stored secret onto the delivery item.
    pushed = []

    class _Redis:
        async def lpush(self, key, value):
            pushed.append(json.loads(value))

    class _Cursor:
        def __init__(self, docs):
            self.docs = docs

        async def to_list(self, n):
            return self.docs[:n]

    class _Webhooks:
        def find(self, query):
            return _Cursor([d for d in db.webhooks.docs if d["user_id"] == query["user_id"] and d["active"]])

    class _DB:
        webhooks = _Webhooks()

    async def _get_redis():
        return _Redis()

    async def _get_db():
        return _DB()

    monkeypatch.setattr(webhook_service, "get_redis", _get_redis)
    monkeypatch.setattr(webhook_service, "get_db", _get_db)
    await webhook_service.queue_webhook_delivery("u1", "build.completed", {"build_id": "b1"})
    (item,) = pushed
    assert item["secret"] == created["secret"]

    # 2. Delivery signs with that secret; a receiver holding the value from
    #    creation can verify the signature.
    sent = {}

    async def _valid(url):
        return True, None

    class _Resp:
        status_code = 200

    class _Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, data, headers):
            sent.update(data=data, headers=headers)
            return _Resp()

    monkeypatch.setattr(webhook_service, "validate_webhook_url", _valid)
    monkeypatch.setattr(webhook_service.httpx, "AsyncClient", _Client)
    assert await webhook_service.deliver_webhook(item["url"], item["payload"], item["secret"]) is True

    ts = sent["headers"]["X-Forge-Timestamp"]
    expected = hmac.new(created["secret"].encode(), f"{ts}.{sent['data']}".encode(), hashlib.sha256).hexdigest()
    assert sent["headers"]["X-Forge-Signature"] == f"v1={expected}"
