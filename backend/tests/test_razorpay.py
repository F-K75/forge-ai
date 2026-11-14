"""Razorpay integration smoke/regression tests.

Validates that:
- `create_rzp_order` returns the expected shape
- `verify_payment` accepts valid signatures and rejects tampered ones
- the webhook endpoint rejects bad signatures, accepts valid ones, and
  routes common events to the right DB updates
"""

import os
import hashlib
import hmac

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("RAZORPAY_KEY_ID", "rzp_test_123")
os.environ.setdefault("RAZORPAY_KEY_SECRET", "test_secret_32chars_long_1234")
os.environ.setdefault("RAZORPAY_WEBHOOK_SECRET", "whsec_test_32chars_long_1234")

import pytest
from fastapi.testclient import TestClient

import api.razorpay as razorpay_module
from api.razorpay import create_rzp_order, _require_razorpay, get_razorpay_client, RazorpayVerifyRequest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _signature(body: str, secret: str) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def _make_webhook(event: str, entity: dict, secret: str):
    import json
    payload = json.dumps({"event": event, "payload": {"payment": {"entity": entity}}})
    sig = _signature(payload, secret)
    return payload, sig


# ---------------------------------------------------------------------------
# IMPORTANT: _razorpay_client is created lazily at module import with the
# env-configured credentials above. The Razorpay SDK construction is wrapped
# in a try/except ImportError, so if the SDK is not installed we skip these
# tests rather than failing the whole suite.
# ---------------------------------------------------------------------------

_RAZORPAY_AVAILABLE = get_razorpay_client() is not None
pytestmark = pytest.mark.skipif(not _RAZORPAY_AVAILABLE, reason="python-razorpay not installed or credentials missing")


# ============================================================
# Unit-level checks on the public helpers
# ============================================================


def test_require_razorpay_passes_when_configured():
    # _require_razorpay raises HTTPException, not a plain error
    try:
        _require_razorpay()
    except Exception as exc:
        pytest.fail(f"_require_razorpay raised unexpectedly: {exc}")


async def test_create_rzp_order_returns_expected_fields(monkeypatch):
    import api.razorpay as rzp

    captured: dict = {}

    class _FakeClient:
        class order:
            @staticmethod
            def create(data):
                captured.update(data)
                return {"id": "order_FAKE", "amount": data["amount"], "currency": data["currency"], "receipt": data["receipt"]}

    monkeypatch.setattr(rzp, "_razorpay_client", _FakeClient())
    req = razorpay_module.RazorpayOrderRequest(amount=50000, currency="INR", receipt="test")

    result = await create_rzp_order(req)

    assert result["order_id"] == "order_FAKE"
    assert result["amount"] == 50000
    assert captured["payment_capture"] == 1


def test_razorpay_verify_request_model():
    req = RazorpayVerifyRequest(
        razorpay_order_id="order_123",
        razorpay_payment_id="pay_456",
        razorpay_signature="sig_789",
    )
    assert req.razorpay_order_id == "order_123"


# ============================================================
# Integration-style tests via TestClient
# ============================================================


def test_razorpay_verify_valid_signature(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    body = "order_abc|pay_xyz"
    sig = _signature(body, os.environ["RAZORPAY_KEY_SECRET"])

    r = client.post("/razorpay/verify", json={
        "razorpay_order_id": "order_abc",
        "razorpay_payment_id": "pay_xyz",
        "razorpay_signature": sig,
    })
    assert r.status_code == 200
    assert r.json()["valid"] is True


def test_razorpay_verify_bad_signature(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})
    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    r = client.post("/razorpay/verify", json={
        "razorpay_order_id": "order_abc",
        "razorpay_payment_id": "pay_xyz",
        "razorpay_signature": "totally_wrong",
    })
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_razorpay_webhook_valid_payment_event(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    class _Col:
        async def find_one(self, *args, **kwargs):
            return None

        async def update_one(self, *args, **kwargs):
            return type("Res", (), {"matched_count": 0, "modified_count": 0})()

    class _DB:
        def __init__(self):
            self.credit_purchases = _Col()
            self.users = _Col()
            self.subscriptions = _Col()

    async def _fake_db():
        return _DB()

    monkeypatch.setattr(rzp, "get_db", _fake_db)

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    entity = {"id": "pay_123", "order_id": "order_1"}
    payload, sig = _make_webhook("payment.captured", entity, os.environ["RAZORPAY_WEBHOOK_SECRET"])

    r = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_razorpay_webhook_invalid_signature(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    payload = '{"event":"payment.captured"}'

    r = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": "bad_sig"})
    assert r.status_code == 400
    assert "signature" in r.json()["detail"].lower()


def test_razorpay_webhook_fails_closed_when_client_not_configured(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", None)

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    payload = '{"event":"payment.captured"}'
    sig = _signature(payload, os.environ["RAZORPAY_WEBHOOK_SECRET"])

    r = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r.status_code == 500


def test_razorpay_webhook_fails_closed_when_secret_missing(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})
    rzp_settings = rzp.get_settings()
    monkeypatch.setattr(rzp_settings, "razorpay_webhook_secret", "")

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    payload = '{"event":"payment.captured"}'
    sig = _signature(payload, "")

    r = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r.status_code in (500, 503)


def test_razorpay_webhook_payment_captured_idempotent(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})

    purchase_doc = {
        "razorpay_order_id": "order_1",
        "user_id": "user-1",
        "credits": 100,
        "status": "pending",
    }
    user_doc = {"id": "user-1", "credits": 10}

    class _Col:
        def __init__(self, docs):
            self.docs = docs

        async def find_one(self, query, projection=None):
            for d in self.docs:
                if all(d.get(k) == v for k, v in query.items()):
                    return dict(d)
            return None

        async def update_one(self, query, update):
            matched = 0
            for d in self.docs:
                ok = True
                for k, v in query.items():
                    if isinstance(v, dict) and "$ne" in v:
                        if d.get(k) == v["$ne"]:
                            ok = False
                            break
                    elif d.get(k) != v:
                        ok = False
                        break
                if ok:
                    matched = 1
                    if "$set" in update:
                        d.update(update["$set"])
                    if "$inc" in update:
                        for fk, fv in update["$inc"].items():
                            d[fk] = d.get(fk, 0) + fv
                    break
            return type("Res", (), {"matched_count": matched, "modified_count": matched})()

    class _DB:
        def __init__(self):
            self.credit_purchases = _Col([purchase_doc])
            self.users = _Col([user_doc])
            self.subscriptions = _Col([])

    db = _DB()

    async def _fake_db():
        return db

    monkeypatch.setattr(rzp, "get_db", _fake_db)

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    entity = {"id": "pay_123", "order_id": "order_1"}
    payload, sig = _make_webhook("payment.captured", entity, os.environ["RAZORPAY_WEBHOOK_SECRET"])

    r1 = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r1.status_code == 200
    assert user_doc["credits"] == 110

    r2 = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r2.status_code == 200
    assert user_doc["credits"] == 110

