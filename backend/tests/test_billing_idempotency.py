"""Regression tests for P0 billing data integrity fixes.

Covers:
- Credit-purchase webhook idempotency (duplicate Stripe retries must not grant
  credits twice).
- Checkout-completed handler must not overwrite existing credits.
- Downgrade handler must not overwrite existing credits.
"""

import os

import pytest

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import api.billing as billing_module
from api.billing import (
    _handle_payment_event,
    handle_checkout_completed,
    downgrade_plan,
    DowngradeRequest,
)
from core.models import User


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    for op, val in v.items():
                        if op == "$ne" and d.get(k) == val:
                            match = False
                            break
                        elif op == "$eq" and d.get(k) != val:
                            match = False
                            break
                        elif op == "$in" and d.get(k) not in val:
                            match = False
                            break
                    if not match:
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                doc = dict(d)
                if projection:
                    for key, remove in (projection.items() if isinstance(projection, dict) else []):
                        if remove == 0:
                            doc.pop(key, None)
                return doc
        return None

    async def update_one(self, query, update):
        matched = False
        for d in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    for op, val in v.items():
                        if op == "$ne" and d.get(k) == val:
                            match = False
                            break
                        elif op == "$eq" and d.get(k) != val:
                            match = False
                            break
                        elif op == "$in" and d.get(k) not in val:
                            match = False
                            break
                    if not match:
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matched = True
                if "$set" in update:
                    d.update(update["$set"])
                if "$inc" in update:
                    for key, inc in update["$inc"].items():
                        d[key] = d.get(key, 0) + inc
                break

        class _Result:
            matched_count = 1 if matched else 0
            modified_count = 1 if matched else 0

        return _Result()

    async def replace_one(self, query, doc, upsert=False):
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in query.items()):
                self.docs[i] = doc
                return
        if upsert:
            self.docs.append(doc)

    async def insert_one(self, doc):
        doc["_id"] = len(self.docs)
        self.docs.append(doc)


class FakeDB:
    def __init__(self, users=None, credit_purchases=None, subscriptions=None):
        self.users = FakeCollection(users or [])
        self.credit_purchases = FakeCollection(credit_purchases or [])
        self.subscriptions = FakeCollection(subscriptions or [])
        self.audit_logs = FakeCollection([])


def _make_purchase(user_id="user-1", status="pending", credits=100):
    return {
        "stripe_payment_intent_id": "pi_123",
        "user_id": user_id,
        "credits": credits,
        "status": status,
    }


def _make_user(credits=10):
    return {"id": "user-1", "plan": "free", "credits": credits}


@pytest.mark.asyncio
async def test_payment_webhook_idempotent_on_duplicate():
    """A retried payment_intent.succeeded must not grant credits twice."""
    db = FakeDB(
        users=[_make_user(credits=10)],
        credit_purchases=[_make_purchase(status="completed")],
    )

    event = {
        "type": "payment_intent.succeeded",
        "data": {"object": {"id": "pi_123"}},
    }
    await _handle_payment_event(db, event)

    # Credits should remain unchanged because purchase is already completed
    assert db.users.docs[0]["credits"] == 10


@pytest.mark.asyncio
async def test_payment_webhook_grants_credits_once():
    """First successful webhook must grant credits and mark purchase completed."""
    db = FakeDB(
        users=[_make_user(credits=10)],
        credit_purchases=[_make_purchase(status="pending")],
    )

    import api.billing as billing_mod
    import core.database as core_db_mod
    original_get_db = billing_mod.get_db

    async def _fake_get_db():
        return db

    billing_mod.get_db = _fake_get_db
    core_db_mod.get_db = _fake_get_db

    try:
        event = {
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_123"}},
        }
        await _handle_payment_event(db, event)
    finally:
        billing_mod.get_db = original_get_db
        core_db_mod.get_db = original_get_db

    assert db.users.docs[0]["credits"] == 110
    assert db.credit_purchases.docs[0]["status"] == "completed"


@pytest.mark.asyncio
async def test_checkout_completed_preserves_existing_credits(monkeypatch):
    """Checkout must not overwrite a user's existing credit balance."""
    db = FakeDB(users=[_make_user(credits=500)])
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "retrieve",
        lambda sub_id: {
            "id": "sub_123",
            "status": "active",
            "items": {"data": [{"price": {"id": "price_standard_monthly"}}]},
            "current_period_start": 1700000000,
            "current_period_end": 1702592000,
        },
    )

    session = {
        "metadata": {"user_id": "user-1"},
        "customer": "cus_123",
        "subscription": "sub_123",
    }
    await handle_checkout_completed(db, session)

    assert db.users.docs[0]["credits"] == 500
    assert db.users.docs[0]["plan"] == "standard"


@pytest.mark.asyncio
async def test_downgrade_plan_preserves_credits(monkeypatch):
    """Downgrade must not overwrite the user's credit balance."""
    db = FakeDB(
        users=[_make_user(credits=300)],
        subscriptions=[{"stripe_subscription_id": "sub_123", "user_id": "user-1", "status": "active"}],
    )
    monkeypatch.setattr(
        billing_module.stripe.Subscription,
        "modify",
        lambda sub_id, **kw: None,
    )

    import api.billing as billing_mod
    import core.database as core_db_mod
    original_get_db = billing_mod.get_db

    async def _fake_get_db():
        return db

    billing_mod.get_db = _fake_get_db
    core_db_mod.get_db = _fake_get_db

    try:
        req = DowngradeRequest(plan="free")
        user = User(id="user-1", email="u@example.com", name="U", plan="standard", credits=300)
        await downgrade_plan(req, user)
    finally:
        billing_mod.get_db = original_get_db
        core_db_mod.get_db = original_get_db

    assert db.users.docs[0]["credits"] == 300
    assert db.users.docs[0]["downgraded_to"] == "free"


@pytest.mark.asyncio
async def test_credit_packages_have_price_inr_and_checkout_succeeds(monkeypatch):
    """CREDIT_PACKAGES must support INR checkout without KeyError: 'price_inr'."""
    for pkg in billing_module.CREDIT_PACKAGES:
        assert "price_inr" in pkg and pkg["price_inr"] > 0

    db = FakeDB(users=[_make_user(credits=10)])

    async def _fake_db():
        return db

    async def _fake_rzp_order(req_data):
        return {
            "order_id": "order_rzp_1",
            "amount": req_data["amount"],
            "currency": req_data["currency"],
        }

    async def _fake_cf_order(req_obj, current_user):
        return {
            "order_id": "order_cf_1",
            "order_token": "tok_1",
            "amount": req_obj.amount,
            "currency": req_obj.currency,
        }

    monkeypatch.setattr(billing_module, "get_db", _fake_db)
    monkeypatch.setattr(billing_module, "_require_razorpay", lambda: None)
    monkeypatch.setattr(billing_module, "create_rzp_order", _fake_rzp_order)
    monkeypatch.setattr(billing_module, "require_cashfree", lambda: None)
    monkeypatch.setattr(billing_module, "create_cashfree_order", _fake_cf_order)

    user = User(id="user-1", email="u@example.com", name="U", plan="free", credits=10)
    req = billing_module.CreditPurchaseRequest(package_id="credits_100")

    rzp_res = await billing_module._razorpay_credit_purchase(req, billing_module.CREDIT_PACKAGES[0], user)
    assert rzp_res["currency"] == "INR"
    assert rzp_res["amount"] == billing_module.CREDIT_PACKAGES[0]["price_inr"] * 100

    cf_res = await billing_module._cashfree_credit_purchase(req, {"credits": 100, "price_usd": 10, "id": "credits_100"}, user)
    assert cf_res["currency"] == "INR"
    assert cf_res["amount"] == 850 * 100


def test_razorpay_webhook_fail_closed_and_idempotent(monkeypatch):
    """Razorpay webhook fails closed on missing secret and is idempotent on payment.captured."""
    import hashlib
    import hmac
    import json
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import api.razorpay as rzp

    db = FakeDB(
        users=[_make_user(credits=10)],
        credit_purchases=[{
            "razorpay_order_id": "order_rzp_1",
            "user_id": "user-1",
            "credits": 100,
            "status": "pending",
        }],
    )

    async def _fake_db():
        return db

    monkeypatch.setattr(rzp, "_razorpay_client", object())
    monkeypatch.setattr(rzp, "get_db", _fake_db)

    app = FastAPI()
    app.include_router(rzp.router)
    client = TestClient(app)

    payload = json.dumps({
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_1", "order_id": "order_rzp_1"}}},
    })

    rzp_settings = rzp.get_settings()
    monkeypatch.setattr(rzp_settings, "razorpay_webhook_secret", "")
    empty_sig = hmac.new(b"", payload.encode(), hashlib.sha256).hexdigest()
    r_missing = client.post("/razorpay/webhook", content=payload, headers={"X-Razorpay-Signature": empty_sig})
    assert r_missing.status_code in (500, 503)

    secret = "whsec_test_32chars_long_1234"
    monkeypatch.setattr(rzp_settings, "razorpay_webhook_secret", secret)
    valid_sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

    r1 = client.post("/razorpay/webhook", content=payload, headers={"X-Razorpay-Signature": valid_sig})
    assert r1.status_code == 200
    assert db.users.docs[0]["credits"] == 110

    r2 = client.post("/razorpay/webhook", content=payload, headers={"X-Razorpay-Signature": valid_sig})
    assert r2.status_code == 200
    assert db.users.docs[0]["credits"] == 110


def test_build_refund_succeeds_when_balance_below_refund(monkeypatch):
    """Unused reserved credits must be refunded even if user balance dropped below refund."""
    from datetime import datetime, timezone
    from types import SimpleNamespace
    import tasks.build_tasks as bt

    class _BuildCol(FakeCollection):
        async def find_one_and_update(self, query, update, return_document=False):
            for d in self.docs:
                if all(d.get(k) == v for k, v in query.items()):
                    if "$inc" in update:
                        for fk, fv in update["$inc"].items():
                            d[fk] = d.get(fk, 0) + fv
                    return dict(d)
            return None

    class _FindCursor:
        def __init__(self, docs):
            self._docs = docs

        async def to_list(self, _limit):
            return list(self._docs)

    class _BuildFilesCol(FakeCollection):
        def find(self, query, projection=None):
            return _FindCursor([])

        async def delete_many(self, query):
            return None

        async def insert_many(self, docs):
            return None

    class _BuildDB:
        def __init__(self):
            self.builds = _BuildCol([{
                "id": "build-1",
                "project_id": "proj-1",
                "user_id": "user-1",
                "prompt": "test",
                "status": "pending",
                "created_at": datetime.now(timezone.utc),
            }])
            # Balance dropped to 5, which is < refund (40)
            self.users = _BuildCol([{"id": "user-1", "credits": 5}])
            self.projects = _BuildCol([{"id": "proj-1", "deleted_at": None, "template": None}])
            self.build_files = _BuildFilesCol([])
            self.build_dead_letters = _BuildCol([])

    db = _BuildDB()

    async def _fake_db():
        return db

    async def _fake_run_build(build, **_kwargs):
        build.credits_used = 10
        return build, {}

    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(bt, "get_db", _fake_db)
    monkeypatch.setattr(bt, "orchestrator", SimpleNamespace(run_build=_fake_run_build))
    monkeypatch.setattr(bt, "manager", SimpleNamespace(emit=_noop))
    monkeypatch.setattr(bt, "sandbox", None)

    result = bt.run_build.run("build-1", "proj-1", "user-1", reserved_credits=50)
    assert result["status"] == "success"
    assert db.users.docs[0]["credits"] == 45  # 5 + (50 - 10)


def test_v1_router_parity():
    """All 6 newly mounted routers must be exposed under /v1."""
    from api.v1 import v1_router

    def _collect_paths(router, prefix=""):
        found = set()
        for item in getattr(router, "routes", []):
            if hasattr(item, "path"):
                found.add(f"{prefix}{item.path}")
            elif hasattr(item, "original_router"):
                sub = item.original_router
                found.update(_collect_paths(sub, f"{prefix}{getattr(sub, 'prefix', '')}"))
        return found

    paths = _collect_paths(v1_router, getattr(v1_router, "prefix", ""))
    for prefix in (
        "/v1/cashfree",
        "/v1/api/optimizer",
        "/v1/api/orgs",
        "/v1/api/budgets",
        "/v1/api/retrieval",
        "/v1/engineering",
    ):
        assert any(p.startswith(prefix) for p in paths), f"Missing {prefix} routes in v1_router"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
