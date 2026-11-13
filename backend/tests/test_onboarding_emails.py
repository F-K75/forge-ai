"""Hourly onboarding-email sweep (services/onboarding_emails.py)."""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from services.onboarding_emails import run_onboarding_sweep

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
_MISSING = object()


# --------------------------------------------------------------------------- #
# Minimal in-memory Mongo: just the operators the sweep uses.
# --------------------------------------------------------------------------- #

def _get(doc, path):
    for part in path.split("."):
        if not isinstance(doc, dict) or part not in doc:
            return _MISSING
        doc = doc[part]
    return doc


def _set(doc, path, value):
    *parents, last = path.split(".")
    for part in parents:
        doc = doc.setdefault(part, {})
    doc[last] = value


def _matches(doc, query):
    for path, cond in query.items():
        value = _get(doc, path)
        if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
            for op, arg in cond.items():
                if op == "$exists" and (value is not _MISSING) != arg:
                    return False
                if op == "$ne" and value is not _MISSING and value == arg:
                    return False
                if op in ("$lte", "$gte", "$lt") and (
                    value is _MISSING
                    or (op == "$lte" and not value <= arg)
                    or (op == "$gte" and not value >= arg)
                    or (op == "$lt" and not value < arg)
                ):
                    return False
        elif value is _MISSING or value != cond:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, length=None):
        return [dict(d) for d in self.docs[:length]]


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query, projection=None):
        return _Cursor([d for d in self.docs if _matches(d, query)])

    async def find_one(self, query, projection=None):
        return next((dict(d) for d in self.docs if _matches(d, query)), None)

    async def count_documents(self, query, limit=None):
        n = sum(1 for d in self.docs if _matches(d, query))
        return min(n, limit) if limit else n

    async def find_one_and_update(self, query, update, return_document=False):
        for d in self.docs:
            if _matches(d, query):
                for path, value in update.get("$set", {}).items():
                    _set(d, path, value)
                return dict(d)
        return None


class FakeDB:
    def __init__(self, users=(), builds=(), projects=()):
        self.users = FakeCollection([dict(u) for u in users])
        self.builds = FakeCollection([dict(b) for b in builds])
        self.projects = FakeCollection([dict(p) for p in projects])


def _user(uid, days_ago, **extra):
    return {
        "id": uid,
        "email": f"{uid}@example.com",
        "name": uid.title(),
        "email_verified": True,
        "created_at": NOW - timedelta(days=days_ago),
        **extra,
    }


class Outbox:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def __call__(self, params):
        if self.fail:
            raise RuntimeError("resend down")
        self.sent.append(params)

    def templates_for(self, uid):
        return [p["subject"] for p in self.sent if p["to"] == [f"{uid}@example.com"]]


def _sweep(db, outbox, now=NOW):
    return asyncio.run(run_onboarding_sweep(db, now, outbox))


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #

def test_nudge_goes_to_verified_user_without_builds_after_two_days():
    db = FakeDB(users=[_user("ada", 3)])
    out = Outbox()
    result = _sweep(db, out)
    assert result["first_build_nudge"] == 1
    assert out.sent[0]["subject"] == "Your first Forge build takes a couple of minutes"
    assert out.sent[0]["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


@pytest.mark.parametrize("user,builds", [
    (_user("ada", 1), []),                                        # too soon
    (_user("ada", 3, email_verified=False), []),                  # unverified
    (_user("ada", 3), [{"user_id": "ada", "status": "failed"}]),  # already tried a build
    (_user("ada", 3, marketing_emails_opt_out=True), []),         # unsubscribed
    (_user("ada", 30), []),                                       # signed up before the window
])
def test_nudge_not_sent(user, builds):
    out = Outbox()
    _sweep(FakeDB(users=[user], builds=builds), out)
    assert out.sent == []


def test_tips_after_five_days():
    db = FakeDB(users=[_user("ada", 6)], builds=[{"user_id": "ada", "status": "failed"}])
    out = Outbox()
    _sweep(db, out)
    assert out.templates_for("ada") == ["Planning something bigger? Try an Initiative"]


def test_first_build_done_uses_project_and_only_first_success():
    db = FakeDB(
        users=[_user("ada", 1), _user("bob", 1)],
        builds=[
            {"user_id": "ada", "project_id": "p1", "status": "success", "completed_at": NOW - timedelta(hours=3)},
            # bob already had an earlier success, so today's isn't his first
            {"user_id": "bob", "project_id": "p2", "status": "success", "completed_at": NOW - timedelta(hours=3)},
            {"user_id": "bob", "project_id": "p2", "status": "success", "completed_at": NOW - timedelta(days=4)},
        ],
        projects=[{"id": "p1", "name": "Habit Tracker"}],
    )
    out = Outbox()
    result = _sweep(db, out)
    assert result["first_build_done"] == 1
    assert out.templates_for("ada") == ["Habit Tracker is built - here's what to do next"]
    assert "/p/p1/workspace" in out.sent[0]["text"]
    assert out.templates_for("bob") == []


def test_each_email_sent_once_across_sweeps():
    db = FakeDB(users=[_user("ada", 6)])
    out = Outbox()
    _sweep(db, out)
    _sweep(db, out)
    _sweep(db, out, now=NOW + timedelta(hours=1))
    assert sorted(out.templates_for("ada")) == sorted([
        "Your first Forge build takes a couple of minutes",
        "Planning something bigger? Try an Initiative",
    ])


def test_failed_send_is_not_retried():
    db = FakeDB(users=[_user("ada", 3)])
    assert _sweep(db, Outbox(fail=True))["first_build_nudge"] == 0
    out = Outbox()
    _sweep(db, out)
    assert out.sent == []  # claimed before the failed send; not re-sent


def test_unsubscribed_between_query_and_send_is_skipped():
    # The claim re-reads the user; build_promotional_email checks the opt-out
    # on that fresh copy.
    db = FakeDB(users=[_user("ada", 3)])

    original = db.users.find_one_and_update

    async def opt_out_then_claim(query, update, return_document=False):
        db.users.docs[0]["marketing_emails_opt_out"] = True
        return await original(query, update, return_document)

    db.users.find_one_and_update = opt_out_then_claim
    out = Outbox()
    _sweep(db, out)
    assert out.sent == []


# --------------------------------------------------------------------------- #
# Celery task gate
# --------------------------------------------------------------------------- #

def test_task_disabled_by_default(monkeypatch):
    import tasks.onboarding_tasks as task_module
    from core.config import get_settings

    assert get_settings().onboarding_emails_enabled is False
    assert task_module.send_onboarding_emails.run() == {"skipped": "disabled"}


def test_task_needs_resend_key(monkeypatch):
    import tasks.onboarding_tasks as task_module
    from core.config import get_settings

    monkeypatch.setattr(get_settings(), "onboarding_emails_enabled", True)
    monkeypatch.setattr(get_settings(), "resend_api_key", "")
    assert task_module.send_onboarding_emails.run() == {"skipped": "no resend api key"}


def test_beat_schedule_runs_hourly():
    from celery_app import celery_app

    entry = celery_app.conf.beat_schedule["onboarding-emails-hourly"]
    assert entry["task"] == "backend.tasks.onboarding_tasks.send_onboarding_emails"
    assert entry["task"] in celery_app.tasks
