"""Regression tests for BE-017: Stripe billing-webhook handlers granted
credits and changed subscription plans/status with zero audit trail.

Found 2026-07-03 while auditing audit-logging coverage (BE-009): admin-
initiated credit/plan changes were already logged (api/admin.py), but the
same class of change driven by a Stripe webhook -- checkout completed,
subscription updated/deleted, invoice paid/failed -- left no record at all.
Fixed by writing an audit_logs entry (actor = "stripe_webhook", a system
identity, since there's no logged-in human to attribute these to) from
each handler in api/billing.py.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

import api.billing as billing_module
from api.billing import (
    handle_checkout_completed,
    handle_subscription_updated,
    handle_subscription_deleted,
    handle_invoice_payment_succeeded,
    handle_invoice_payment_failed,
)


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))
                return

    async def replace_one(self, query, doc, upsert=False):
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in query.items()):
                self.docs[i] = doc
                return
        if upsert:
            self.docs.append(doc)

    async def insert_one(self, doc):
        self.docs.append(doc)


class FakeDB:
    def __init__(self, users=None, subscriptions=None, invoices=None):
        self.users = FakeCollection(users or [])
        self.subscriptions = FakeCollection(subscriptions or [])
        self.invoices = FakeCollection(invoices or [])
        self.audit_logs = FakeCollection([])


class _FakeStripeSubscription(dict):
    """A plain dict already satisfies stripe_sub["items"]["data"][0]["price"]["id"]
    style bracket access -- no real Stripe SDK object needed."""


def _fake_stripe_sub(sub_id="sub_123", price_id="price_standard_monthly", status="active"):
    return _FakeStripeSubscription(
        {
            "id": sub_id,
            "status": status,
            "items": {"data": [{"price": {"id": price_id}}]},
            "current_period_start": 1700000000,
            "current_period_end": 1702592000,
        }
    )


@pytest.mark.asyncio
async def test_checkout_completed_logs_credit_grant(monkeypatch):
    db = FakeDB(users=[{"id": "user-1", "plan": "free", "credits": 10}])
    monkeypatch.setattr(
        billing_module.stripe.Subscription, "retrieve", lambda sub_id: _fake_stripe_sub()
    )

    session = {
        "metadata": {"user_id": "user-1"},
        "customer": "cus_123",
        "subscription": "sub_123",
    }
    await handle_checkout_completed(db, session)

    assert len(db.audit_logs.docs) == 1
    log = db.audit_logs.docs[0]
    assert log["action"] == "stripe_checkout_completed"
    assert log["resource_id"] == "user-1"
    assert log["actor_id"] == "stripe_webhook"
    assert log["changes"]["credits_granted"] == 100  # standard plan


@pytest.mark.asyncio
async def test_checkout_completed_without_user_id_logs_nothing(monkeypatch):
    """Guard against a crash/false-positive log entry on a malformed/test event."""
    db = FakeDB()
    session = {"metadata": {}, "customer": "cus_123"}
    await handle_checkout_completed(db, session)
    assert db.audit_logs.docs == []


@pytest.mark.asyncio
async def test_subscription_updated_logs_plan_change():
    db = FakeDB(
        subscriptions=[{"stripe_subscription_id": "sub_123", "user_id": "user-1"}],
        users=[{"id": "user-1", "plan": "free"}],
    )
    sub = _fake_stripe_sub(price_id="price_pro_monthly", status="active")
    await handle_subscription_updated(db, sub)

    assert len(db.audit_logs.docs) == 1
    log = db.audit_logs.docs[0]
    assert log["action"] == "stripe_subscription_updated"
    assert log["resource_id"] == "user-1"
    assert log["changes"]["subscription_id"] == "sub_123"


@pytest.mark.asyncio
async def test_subscription_deleted_logs_downgrade():
    db = FakeDB(
        subscriptions=[{"stripe_subscription_id": "sub_123", "user_id": "user-1"}],
        users=[{"id": "user-1", "plan": "pro"}],
    )
    await handle_subscription_deleted(db, {"id": "sub_123"})

    assert len(db.audit_logs.docs) == 1
    log = db.audit_logs.docs[0]
    assert log["action"] == "stripe_subscription_deleted"
    assert log["resource_id"] == "user-1"
    assert db.users.docs[0]["plan"] == "free"


@pytest.mark.asyncio
async def test_invoice_payment_succeeded_logs_event():
    db = FakeDB(invoices=[{"stripe_invoice_id": "in_123", "user_id": "user-1", "status": "open"}])
    await handle_invoice_payment_succeeded(db, {"id": "in_123"})

    assert len(db.audit_logs.docs) == 1
    assert db.audit_logs.docs[0]["action"] == "stripe_invoice_payment_succeeded"
    assert db.audit_logs.docs[0]["resource_id"] == "user-1"
    assert db.invoices.docs[0]["status"] == "paid"


@pytest.mark.asyncio
async def test_invoice_payment_failed_logs_event():
    db = FakeDB(invoices=[{"stripe_invoice_id": "in_456", "user_id": "user-2", "status": "open"}])
    await handle_invoice_payment_failed(db, {"id": "in_456"})

    assert len(db.audit_logs.docs) == 1
    assert db.audit_logs.docs[0]["action"] == "stripe_invoice_payment_failed"
    assert db.audit_logs.docs[0]["resource_id"] == "user-2"
    assert db.invoices.docs[0]["status"] == "payment_failed"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
