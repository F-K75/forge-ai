"""Regression test for PROD-039: credit usage alert emails didn't exist at
all -- a user's credits could silently run out with zero warning before a
build simply failed on "Insufficient credits". Found/built 2026-07-03.

check_and_send_credit_alerts fires at 20% and 0% of the plan's monthly
allocation remaining, deduplicated per-user via credit_alerts_sent (cleared
by reset_credit_alerts wherever credits are granted -- checkout completed,
credit purchase, admin credit adjustment -- so the user is warned again
next time they run low instead of only ever once).
"""

import pytest

import services.credit_alerts as credit_alerts_module
from services.credit_alerts import check_and_send_credit_alerts, reset_credit_alerts


class FakeCollection:
    def __init__(self, docs):
        self.docs = {d["id"]: d for d in docs}

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query.get("id"))
        return dict(doc) if doc else None

    async def update_one(self, query, update):
        doc = self.docs.get(query.get("id"))
        if not doc:
            return
        if "$set" in update:
            doc.update(update["$set"])
        if "$addToSet" in update:
            for field, spec in update["$addToSet"].items():
                current = set(doc.get(field, []))
                values = spec["$each"] if isinstance(spec, dict) and "$each" in spec else [spec]
                current.update(values)
                doc[field] = sorted(current)


class FakeDB:
    def __init__(self, users):
        self.users = FakeCollection(users)


PLAN_DETAILS_STUB = [
    {"tier": "free", "credits": 10},
    {"tier": "standard", "credits": 100},
]


@pytest.fixture(autouse=True)
def _patch_plan_details(monkeypatch):
    import api.billing as billing_module

    monkeypatch.setattr(billing_module, "PLAN_DETAILS", PLAN_DETAILS_STUB)


@pytest.fixture
def sent_emails(monkeypatch):
    sent = []
    monkeypatch.setattr(
        credit_alerts_module,
        "_send_credit_alert_email",
        lambda email, key, remaining, total: sent.append((email, key, remaining, total)),
    )
    return sent


@pytest.mark.asyncio
async def test_no_alert_above_the_20pct_threshold(sent_emails):
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": []}])
    await check_and_send_credit_alerts(db, "u1", "standard", credits_remaining=50)  # 50%
    assert sent_emails == []


@pytest.mark.asyncio
async def test_fires_20pct_alert_when_crossed(sent_emails):
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": []}])
    await check_and_send_credit_alerts(db, "u1", "standard", credits_remaining=15)  # 15%

    assert len(sent_emails) == 1
    assert sent_emails[0][1] == "20pct"
    assert db.users.docs["u1"]["credit_alerts_sent"] == ["20pct"]


@pytest.mark.asyncio
async def test_fires_both_thresholds_at_once_on_a_big_drop(sent_emails):
    """A single expensive build can take a user from well above 20% straight
    to 0% -- both alerts should still fire, not just the lower one."""
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": []}])
    await check_and_send_credit_alerts(db, "u1", "standard", credits_remaining=0)

    keys_sent = {call[1] for call in sent_emails}
    assert keys_sent == {"20pct", "0pct"}


@pytest.mark.asyncio
async def test_does_not_resend_an_already_sent_threshold(sent_emails):
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": ["20pct"]}])
    await check_and_send_credit_alerts(db, "u1", "standard", credits_remaining=10)  # still 10%, only 20pct crossed
    assert sent_emails == []


@pytest.mark.asyncio
async def test_reset_clears_dedup_state_so_alerts_can_fire_again(sent_emails):
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": ["20pct", "0pct"]}])

    await reset_credit_alerts(db, "u1")
    assert db.users.docs["u1"]["credit_alerts_sent"] == []

    await check_and_send_credit_alerts(db, "u1", "standard", credits_remaining=15)
    assert len(sent_emails) == 1
    assert sent_emails[0][1] == "20pct"


@pytest.mark.asyncio
async def test_unknown_plan_does_not_crash(sent_emails):
    db = FakeDB([{"id": "u1", "email": "a@x.com", "credit_alerts_sent": []}])
    await check_and_send_credit_alerts(db, "u1", "nonexistent-plan", credits_remaining=0)
    assert sent_emails == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
