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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
