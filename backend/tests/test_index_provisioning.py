"""Tests for INF-008: fast-fail MongoDB index provisioning.

_ensure_indexes previously ran ~35 sequential create_index calls, each
inheriting the client's serverSelectionTimeoutMS (5s). Against an unreachable
MongoDB that produced a ~175-second slow-fail. After the parallel rewrite,
all calls fail concurrently and the total slow-fail window collapses to ~5s.
"""

import asyncio
import time

import pytest

from core import database
from core.database import _ensure_indexes


class _FakeCollection:
    def __init__(self, delay: float = 0.01):
        self._delay = delay
        self.calls = []

    async def create_index(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        await asyncio.sleep(self._delay)
        return "index_created"


class _FakeDB:
    def __init__(self, delay: float = 0.01, fail: bool = False):
        self._delay = delay
        self._fail = fail
        self.calls = []

    def __getattr__(self, name):
        if self._fail:
            collection = _FailingCollection()
        else:
            collection = _FakeCollection(delay=self._delay)
        self.calls.append(name)
        setattr(self, name, collection)
        return collection


class _FailingCollection:
    async def create_index(self, *args, **kwargs):
        raise ConnectionError("mongo down")


@pytest.mark.asyncio
async def test_ensure_indexes_runs_concurrently():
    """All create_index calls should be issued concurrently, not sequentially."""
    db = _FakeDB(delay=0.05)
    start = time.monotonic()
    await _ensure_indexes(db)
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, f"Index creation took {elapsed:.2f}s; expected concurrent sub-2s"


@pytest.mark.asyncio
async def test_ensure_indexes_raises_on_failure():
    """Failed index creation should raise quickly, not after sequential timeouts."""
    db = _FakeDB(fail=True)
    start = time.monotonic()
    with pytest.raises(ConnectionError, match="mongo down"):
        await _ensure_indexes(db)
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, f"Failure took {elapsed:.2f}s; expected fast-fail sub-2s"


@pytest.mark.asyncio
async def test_ensure_indexes_succeeds_without_errors():
    """Successful index creation should complete without raising."""
    db = _FakeDB(delay=0.0)
    await _ensure_indexes(db)
    assert len(db.calls) > 0


@pytest.fixture
def reset_mongo_client():
    """Isolate the module-global Mongo client around a test.

    ``get_db`` caches its client in a module global, so a test that drives it
    must restore the previous value or it leaks into every later test. Any
    client the test itself built is closed on the way out, otherwise its
    connection pool and monitor tasks outlive the test.

    ``_db_lock`` is swapped for a fresh one per test as well. An ``asyncio.Lock``
    binds to an event loop the first time it actually has to wait, and each
    async test runs in its own loop, so a shared module-level lock that two
    tests both contend raises "bound to a different event loop" in whichever
    runs second. Production is unaffected — the Celery workers deliberately
    keep one loop per process (see ``tasks/build_tasks.py``) — but without this
    the next concurrency test added here would fail for a reason that looks
    nothing like its own code.
    """
    previous = database._mongo_client
    previous_lock = database._db_lock
    database._mongo_client = None
    database._db_lock = asyncio.Lock()
    yield
    created = database._mongo_client
    if created is not None and created is not previous:
        created.close()
    database._mongo_client = previous
    database._db_lock = previous_lock


@pytest.mark.asyncio
async def test_failed_provisioning_does_not_cache_the_client(monkeypatch, reset_mongo_client):
    """A failed index provision must not leave a client cached.

    Regression guard: the client used to be assigned to the module global
    *before* provisioning was awaited. When provisioning raised, the client
    stayed cached, so the error surfaced exactly once and every later caller
    sailed past the ``is None`` guard onto a database with no indexes.
    """
    async def failing_ensure_indexes(db):
        raise ConnectionError("mongo down")

    monkeypatch.setattr(database, "_ensure_indexes", failing_ensure_indexes)

    with pytest.raises(ConnectionError, match="mongo down"):
        await database.get_db()

    assert database._mongo_client is None, (
        "A failed index provision left a client cached; later calls would "
        "silently return an unindexed database."
    )


@pytest.mark.asyncio
async def test_provisioning_is_retried_after_a_failure(monkeypatch, reset_mongo_client):
    """Every call must keep raising until provisioning actually succeeds.

    This is the user-visible half of the bug: the second call used to return a
    working database handle whose unique indexes were never created, so
    duplicate emails, duplicate builds and double-credited payments could all
    be written without the database rejecting them.
    """
    attempts = []

    async def failing_ensure_indexes(db):
        attempts.append(1)
        raise ConnectionError("mongo down")

    monkeypatch.setattr(database, "_ensure_indexes", failing_ensure_indexes)

    for _ in range(3):
        with pytest.raises(ConnectionError, match="mongo down"):
            await database.get_db()

    assert len(attempts) == 3, (
        f"Provisioning was attempted {len(attempts)} time(s) across 3 calls; "
        "a cached client short-circuited the retries."
    )


@pytest.mark.asyncio
async def test_client_is_cached_once_provisioning_succeeds(monkeypatch, reset_mongo_client):
    """The happy path must still cache: provisioning runs once, not per call."""
    attempts = []

    async def succeeding_ensure_indexes(db):
        attempts.append(1)

    monkeypatch.setattr(database, "_ensure_indexes", succeeding_ensure_indexes)

    first = await database.get_db()
    second = await database.get_db()

    assert database._mongo_client is not None
    assert first is not None and second is not None
    assert len(attempts) == 1, (
        f"Provisioning ran {len(attempts)} times; it should run once and then "
        "be served from the cached client."
    )


@pytest.mark.asyncio
async def test_recovers_once_mongo_comes_back(monkeypatch, reset_mongo_client):
    """A transient outage must not permanently disable index provisioning."""
    attempts = []

    async def flaky_ensure_indexes(db):
        attempts.append(1)
        if len(attempts) == 1:
            raise ConnectionError("mongo down")

    monkeypatch.setattr(database, "_ensure_indexes", flaky_ensure_indexes)

    with pytest.raises(ConnectionError, match="mongo down"):
        await database.get_db()

    db = await database.get_db()

    assert db is not None
    assert len(attempts) == 2
    assert database._mongo_client is not None


@pytest.mark.asyncio
async def test_concurrent_cold_callers_provision_once(monkeypatch, reset_mongo_client):
    """Callers racing the cold path must provision once between them.

    `get_db` guards the global with a double-checked lock. The inner check is
    what stops the second coroutine re-provisioning after the first has already
    published, so drive both concurrently and assert only one build happened.
    """
    attempts = []

    async def slow_ensure_indexes(db):
        attempts.append(1)
        await asyncio.sleep(0.05)

    monkeypatch.setattr(database, "_ensure_indexes", slow_ensure_indexes)

    first, second = await asyncio.gather(database.get_db(), database.get_db())

    assert len(attempts) == 1, (
        f"Provisioning ran {len(attempts)} times for concurrent cold callers; "
        "the double-checked lock should collapse them into one."
    )
    assert first is not None and second is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
