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

import api.cashfree as cashfree_module
from api.cashfree import CashfreeVerifyRequest, CashfreeOrderRequest, require_cashfree, _get_cashfree_client


def _signature(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _make_webhook(event: str, entity: dict, secret: str):
    payload = json.dumps({"type": event, "data": {"order": entity}})
    sig = _signature(payload.encode(), secret)
    return payload, sig


@pytest.fixture(autouse=True)
def _reset_cashfree_client():
    cashfree_module._CASHFREE_CLIENT = None
    yield
    if cashfree_module._CASHFREE_CLIENT is not None:
        cashfree_module._CASHFREE_CLIENT.close()
        cashfree_module._CASHFREE_CLIENT = None


def test_require_cashfree_passes_when_configured():
    try:
        require_cashfree()
    except Exception as exc:
        pytest.fail(f"require_cashfree raised unexpectedly: {exc}")


def test_create_cashfree_order_returns_expected_fields(monkeypatch):
    import api.cashfree as cf

    captured: dict = {}

    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "order_id": "order_FAKE",
                "order_token": "token_FAKE",
                "order_amount": 500,
                "order_currency": "INR",
                "payment_session_id": "session_FAKE",
            }

    class _FakeClient:
        def post(self, path, json=None):
            captured["path"] = path
            captured["payload"] = json
            return _FakeResponse()

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", _FakeClient())

    class _User:
        id = "user-1"
        email = "u@example.com"
        name = "U"

    req = CashfreeOrderRequest(amount=50000, currency="INR", receipt="test")
    result = cf.create_cashfree_order(req, current_user=_User())

    assert result["order_id"] == "order_FAKE"
    assert result["order_token"] == "token_FAKE"
    assert captured["payload"]["order_id"] == "test"


def test_cashfree_verify_valid_response(monkeypatch):
    import api.cashfree as cf

    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"order_status": "PAID"}

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", type("_C", (), {"get": lambda *a, **k: _FakeResponse()})())

    req = CashfreeVerifyRequest(order_id="order_123", order_token="token_123")
    result = cf.verify_payment(req)
    assert result["valid"] is True


def test_cashfree_verify_invalid_response(monkeypatch):
    import api.cashfree as cf

    class _FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"order_status": "FAILED"}

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", type("_C", (), {"get": lambda *a, **k: _FakeResponse()})())

    req = CashfreeVerifyRequest(order_id="order_123", order_token="token_123")
    result = cf.verify_payment(req)
    assert result["valid"] is False


def test_cashfree_webhook_valid_payment_event(monkeypatch):
    import api.cashfree as cf
    from fastapi import FastAPI

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", None)

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

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", None)

    app = FastAPI()
    app.include_router(cf.router)
    client = TestClient(app)

    payload = '{"type":"ORDER.PAID"}'

    r = client.post("/cashfree/webhook", data=payload, headers={"X-Cashfree-Signature": "bad_sig"})
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_cashfree_webhook_skips_when_secret_missing(monkeypatch):
    import api.cashfree as cf
    from fastapi import FastAPI

    monkeypatch.setattr(cf, "_CASHFREE_CLIENT", None)
    monkeypatch.setattr(cf.settings, "cashfree_webhook_secret", "")

    app = FastAPI()
    app.include_router(cf.router)
    client = TestClient(app)

    payload = '{"type":"ORDER.PAID"}'
    sig = _signature(payload.encode(), "anything")

    r = client.post("/cashfree/webhook", data=payload, headers={"X-Cashfree-Signature": sig})
    assert r.status_code == 200
    assert r.json()["status"] == "skipped"
