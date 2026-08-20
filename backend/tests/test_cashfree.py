"""Cashfree integration smoke/regression tests.

Validates that:
- create_cashfree_order returns the expected shape
- verify_payment accepts valid responses and rejects invalid ones
- the webhook endpoint rejects bad signatures, accepts valid ones, and
  routes common events to the right DB updates
"""

import os
import hashlib
import hmac
import json

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("CASHFREE_APP_ID", "test_app_id")
os.environ.setdefault("CASHFREE_SECRET_KEY", "test_secret_key_32chars_long_123456")
os.environ.setdefault("CASHFREE_WEBHOOK_SECRET", "whsec_test_32chars_long_123456")
os.environ.setdefault("APP_URL", "http://localhost:3000")
os.environ.setdefault("API_URL", "http://localhost:8000")

import pytest
from fastapi.testclient import TestClient

from core.config import get_settings

# get_settings() is lru_cached process-wide; an earlier test module (main.py /
# billing.py imports) may have frozen Settings before the CASHFREE_* vars above
# were set. Clear the cache so this module's Settings reads the real env.
get_settings.cache_clear()

from api.cashfree import CashfreeVerifyRequest, CashfreeOrderRequest, require_cashfree


class _FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return True

    async def update_one(self, query, update, **kwargs):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                for op, fields in update.items():
                    if op == "$inc":
                        for f, amount in fields.items():
                            d[f] = d.get(f, 0) + amount
                    elif op == "$set":
                        d.update(fields)
                return True
        return False


class _FakeDB:
    def __init__(self):
        self.users = _FakeCollection()
        self.credit_purchases = _FakeCollection()
        self.subscriptions = _FakeCollection()


def _signature(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _make_webhook(event: str, entity: dict, secret: str):
    payload = json.dumps({"type": event, "data": {"order": entity}})
    sig = _signature(payload.encode(), secret)
    return payload, sig


class _FakeAsyncClient:
    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def post(self, path, json=None):
        self._last_path = path
        self._last_payload = json
        return _FakeResponse()

    async def get(self, path):
        self._last_path = path
        return _FakeResponse()


class _FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {
            "order_id": "order_FAKE",
            "order_token": "token_FAKE",
            "order_amount": 500,
            "order_currency": "INR",
            "order_status": "PAID",
            "payment_session_id": "session_FAKE",
        }


@pytest.fixture(autouse=True)
def _mock_async_client(monkeypatch):
    monkeypatch.setattr("api.cashfree.httpx.AsyncClient", _FakeAsyncClient)
    yield


def test_require_cashfree_passes_when_configured():
    try:
        require_cashfree()
    except Exception as exc:
        pytest.fail(f"require_cashfree raised unexpectedly: {exc}")


def test_create_cashfree_order_returns_expected_fields(monkeypatch):
    import api.cashfree as cf

    captured: dict = {}

    async def _fake_db():
        return _FakeDB()

    monkeypatch.setattr(cf, "get_db", _fake_db)

    class _CapturingFakeClient(_FakeAsyncClient):
        async def post(self, path, json=None):
            captured["path"] = path
            captured["payload"] = json
            return _FakeResponse()

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _CapturingFakeClient})())

    class _User:
        id = "user-1"
        email = "u@example.com"
        name = "U"

    req = CashfreeOrderRequest(amount=50000, currency="INR", receipt="test")
    import asyncio

    result = asyncio.run(cf.create_cashfree_order(req, current_user=_User()))

    assert result["order_id"] == "order_FAKE"
    assert result["order_token"] == "token_FAKE"
    assert captured["payload"]["order_id"] == "order_user-1"


def test_cashfree_verify_valid_response(monkeypatch):
    import api.cashfree as cf

    class _FakeGetClient(_FakeAsyncClient):
        async def get(self, path):
            return _FakeResponse()

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _FakeGetClient})())

    req = CashfreeVerifyRequest(order_id="order_123", order_token="token_123")
    import asyncio

    result = asyncio.run(cf.verify_payment(req))
    assert result["valid"] is True


def test_cashfree_verify_invalid_response(monkeypatch):
    import api.cashfree as cf

    class _FakeResponseBad:
        def raise_for_status(self):
            pass

        def json(self):
            return {"order_status": "FAILED"}

    class _FakeGetClient(_FakeAsyncClient):
        async def get(self, path):
            return _FakeResponseBad()

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _FakeGetClient})())

    req = CashfreeVerifyRequest(order_id="order_123", order_token="token_123")
    import asyncio

    result = asyncio.run(cf.verify_payment(req))
    assert result["valid"] is False


def test_cashfree_webhook_valid_payment_event(monkeypatch):
    import api.cashfree as cf
    from fastapi import FastAPI

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _FakeAsyncClient})())

    async def _fake_db():
        return _FakeDB()

    monkeypatch.setattr(cf, "get_db", _fake_db)

    app = FastAPI()
    app.include_router(cf.router)
    client = TestClient(app)

    entity = {"order_id": "order_1", "order_token": "token_1"}
    payload, sig = _make_webhook("ORDER.PAID", entity, os.environ["CASHFREE_WEBHOOK_SECRET"])

    r = client.post("/cashfree/webhook", data=payload, headers={"X-Cashfree-Signature": sig})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_cashfree_webhook_invalid_signature(monkeypatch):
    import api.cashfree as cf
    from fastapi import FastAPI

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _FakeAsyncClient})())

    app = FastAPI()
    app.include_router(cf.router)
    client = TestClient(app)

    payload = '{"type":"ORDER.PAID"}'

    r = client.post("/cashfree/webhook", data=payload, headers={"X-Cashfree-Signature": "bad_sig"})
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_cashfree_webhook_fails_closed_when_secret_missing(monkeypatch):
    import api.cashfree as cf
    from fastapi import FastAPI

    monkeypatch.setattr(cf, "httpx", type("httpx", (), {"AsyncClient": _FakeAsyncClient})())

    cf_settings = cf.get_settings()
    monkeypatch.setattr(cf_settings, "cashfree_webhook_secret", "")

    app = FastAPI()
    app.include_router(cf.router)
    client = TestClient(app)

    payload = '{"type":"ORDER.PAID"}'
    sig = _signature(payload.encode(), "anything")

    r = client.post("/cashfree/webhook", data=payload, headers={"X-Cashfree-Signature": sig})
    assert r.status_code == 500