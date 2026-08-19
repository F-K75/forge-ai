"""The first build on an account runs unmetered.

A build reserves ``max(MAX_DEBUG_ITERATIONS * debug_cost, sum(CREDIT_COSTS) *
(len(tech_stack) + 1))`` credits up front -- 17 for a project with no tech
stack, more once it has one. A new account is granted ``settings.free_credits``,
which is 5. Before this grant, ``POST /builds/`` rejected every free account
with 402 before their first build ever started, so no prospect could reach a
finished application without paying first. ``docs/icp.md`` covers why that
matters: every persona there buys on proof.

The grant is claimed by flipping a single ``free_build_used`` flag atomically
rather than by counting existing builds, because two concurrent requests would
both read a count of zero. The ceiling is exactly one unmetered build per
account.

Reuses the in-memory Mongo stand-in from test_build_idempotency.
"""

import pytest

from core.models import User

from tests.test_build_idempotency import FakeDB, FakeRunBuild, _client


BUILD_COST = 17  # sum(CREDIT_COSTS) for a project with an empty tech_stack


def _seed(db, *, credits, free_build_used=None):
    db.projects.docs.append({"id": "proj1", "user_id": "u1", "tech_stack": {}})
    user_doc = {"id": "u1", "email_verified": True, "credits": credits}
    if free_build_used is not None:
        user_doc["free_build_used"] = free_build_used
    db.users.docs.append(user_doc)
    return User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")


def _post(client):
    return client.post("/builds/", json={"project_id": "proj1", "prompt": "build me an app"})


def test_free_account_can_start_its_first_build_despite_insufficient_credits(monkeypatch):
    """The whole point: 5 credits, a build costs 17, and it still starts."""
    db = FakeDB()
    user = _seed(db, credits=5)
    assert db.users.docs[0]["credits"] < BUILD_COST

    run_build = FakeRunBuild()
    r = _post(_client(monkeypatch, db, user, run_build))

    assert r.status_code == 200
    # The pipeline was dispatched with a zero reservation, so the refund paths
    # in tasks/build_tasks.py (max(0, reserved - used)) neither debit nor credit.
    assert len(run_build.calls) == 1
    assert run_build.calls[0][0][3] == 0
    # Balance untouched, grant consumed.
    assert db.users.docs[0]["credits"] == 5
    assert db.users.docs[0]["free_build_used"] is True


def test_second_build_is_metered_again(monkeypatch):
    """The grant is one-shot: once used, the normal 402 gate applies."""
    db = FakeDB()
    user = _seed(db, credits=5, free_build_used=True)

    run_build = FakeRunBuild()
    r = _post(_client(monkeypatch, db, user, run_build))

    assert r.status_code == 402
    assert r.json()["detail"] == "Insufficient credits"
    assert run_build.calls == []
    assert db.users.docs[0]["credits"] == 5


def test_paying_account_is_still_charged_after_its_free_build(monkeypatch):
    """A funded account past its grant reserves credits as before."""
    db = FakeDB()
    user = _seed(db, credits=1000, free_build_used=True)

    run_build = FakeRunBuild()
    r = _post(_client(monkeypatch, db, user, run_build))

    assert r.status_code == 200
    assert run_build.calls[0][0][3] == BUILD_COST
    assert db.users.docs[0]["credits"] == 1000 - BUILD_COST


def test_grant_is_restored_when_the_task_is_never_enqueued(monkeypatch):
    """A dispatch failure must not silently burn the one-shot grant.

    Mirrors the existing credit-rollback guarantee: if the Celery task was
    never enqueued the account got nothing, so it must keep its free build.
    """
    db = FakeDB()
    user = _seed(db, credits=5)

    class ExplodingRunBuild:
        def apply_async(self, args=(), kwargs=None, **extra):
            raise RuntimeError("broker unavailable")

    client = _client(monkeypatch, db, user, ExplodingRunBuild())
    with pytest.raises(RuntimeError):
        _post(client)

    assert db.users.docs[0]["free_build_used"] is False
    assert db.users.docs[0]["credits"] == 5


def test_claim_is_atomic_not_a_build_count(monkeypatch):
    """Regression guard on the mechanism, not just the outcome.

    Counting builds would let two concurrent first requests both see zero and
    both go unmetered. The flag makes the second claim fail even though the
    account still has no completed builds.
    """
    db = FakeDB()
    user = _seed(db, credits=5)

    first = FakeRunBuild()
    assert _post(_client(monkeypatch, db, user, first)).status_code == 200

    # No build has finished; only the flag distinguishes the second request.
    db.builds.docs.clear()
    second = FakeRunBuild()
    r = _post(_client(monkeypatch, db, user, second))

    assert r.status_code == 402
    assert second.calls == []
