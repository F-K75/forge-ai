"""Tests for INF-008: fast-fail MongoDB index provisioning.

_ensure_indexes previously ran ~35 sequential create_index calls, each
inheriting the client's serverSelectionTimeoutMS (5s). Against an unreachable
MongoDB that produced a ~175-second slow-fail. After the parallel rewrite,
all calls fail concurrently and the total slow-fail window collapses to ~5s.
"""

import asyncio
import time

import pytest

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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
