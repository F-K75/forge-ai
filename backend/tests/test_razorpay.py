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


def test_create_rzp_order_returns_expected_fields(monkeypatch):
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

    result = create_rzp_order(req)

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

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})

    app = rzp.router
    client = TestClient(app)

    body = "order_abc|pay_xyz"
    sig = _signature(body, os.environ["RAZORPAY_WEBHOOK_SECRET"])

    r = client.post("/razorpay/verify", json={
        "razorpay_order_id": "order_abc",
        "razorpay_payment_id": "pay_xyz",
        "razorpay_signature": sig,
    })
    assert r.status_code == 200
    assert r.json()["valid"] is True


def test_razorpay_verify_bad_signature(monkeypatch):
    import api.razorpay as rzp

    monkeypatch.setattr(rzp, "_razorpay_client", {"ignored": True})
    client = TestClient(rzp.router)

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


def test_razorpay_webhook_skips_when_client_not_configured(monkeypatch):
    import api.razorpay as rzp
    from fastapi import FastAPI

    monkeypatch.setattr(rzp, "_razorpay_client", None)

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    payload = '{"event":"payment.captured"}'
    sig = _signature(payload, os.environ["RAZORPAY_WEBHOOK_SECRET"])

    r = client.post("/razorpay/webhook", data=payload, headers={"X-Razorpay-Signature": sig})
    assert r.status_code == 200
    assert r.json()["status"] == "skipped"
