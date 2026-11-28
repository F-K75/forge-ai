"""In-memory Mongo / Redis stand-ins for the Forge OS (WS-C) tests.

Covers the subset of the motor / redis.asyncio API ``core.os`` uses, with real
semantics where they matter for correctness tests: unique (and partial unique)
indexes raise ``DuplicateKeyError``; ``find_one_and_update`` is atomic (single
event loop, no awaits inside); pub/sub delivers to every pattern subscriber of
a shared broker, so two ``EventBus`` instances model two workers.
"""

from __future__ import annotations

import asyncio
import copy
import fnmatch
from typing import Any, Dict, List, Optional, Tuple

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

_MISSING = object()


def _get(doc: Dict[str, Any], key: str) -> Any:
    node: Any = doc
    for part in key.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return _MISSING
    return node


def _cmp_ok(val: Any, op: str, arg: Any) -> bool:
    if op == "$exists":
        return (val is not _MISSING) == bool(arg)
    v = None if val is _MISSING else val
    if op == "$eq":
        return v == arg
    if op == "$ne":
        return v != arg
    if op == "$in":
        return v in arg or (isinstance(v, list) and any(x in arg for x in v))
    if op == "$nin":
        if isinstance(v, list):
            return not any(x in arg for x in v)
        return v not in arg
    if v is None:
        return False
    try:
        if op == "$gt":
            return v > arg
        if op == "$gte":
            return v >= arg
        if op == "$lt":
            return v < arg
        if op == "$lte":
            return v <= arg
    except TypeError:
        return False
    raise NotImplementedError(op)


def matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, cond in query.items():
        if key == "$or":
            if not any(matches(doc, q) for q in cond):
                return False
            continue
        if key == "$and":
            if not all(matches(doc, q) for q in cond):
                return False
            continue
        val = _get(doc, key)
        if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
            if not all(_cmp_ok(val, op, arg) for op, arg in cond.items()):
                return False
        else:
            v = None if val is _MISSING else val
            if isinstance(v, list) and not isinstance(cond, list):
                if cond not in v:
                    return False
            elif v != cond:
                return False
    return True


def _project(doc: Dict[str, Any], projection: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = copy.deepcopy(doc)
    if not projection:
        return out
    include = {k for k, v in projection.items() if v and k != "_id"}
    if include:
        out = {k: out[k] for k in include if k in out}
    out.pop("_id", None)
    return out


def _apply_update(doc: Dict[str, Any], update: Dict[str, Any], *, inserting: bool = False) -> None:
    for op, fields in update.items():
        if op == "$set":
            for k, v in fields.items():
                doc[k] = copy.deepcopy(v)
        elif op == "$setOnInsert":
            if inserting:
                for k, v in fields.items():
                    doc[k] = copy.deepcopy(v)
        elif op == "$inc":
            for k, v in fields.items():
                doc[k] = (doc.get(k) or 0) + v
        elif op == "$unset":
            for k in fields:
                doc.pop(k, None)
        elif op == "$push":
            for k, v in fields.items():
                doc.setdefault(k, []).append(copy.deepcopy(v))
        else:
            raise NotImplementedError(op)


class _Result:
    def __init__(self, matched=0, modified=0, deleted=0, upserted_id=None, inserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.deleted_count = deleted
        self.upserted_id = upserted_id
        self.inserted_id = inserted_id


class FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs
        self._skip = 0
        self._limit: Optional[int] = None

    def sort(self, key, direction=None):
        spec: List[Tuple[str, int]] = key if isinstance(key, list) else [(key, direction or 1)]
        for field, d in reversed(spec):

            def _key(doc, field=field):
                v = _get(doc, field)
                return (-1, 0) if v is _MISSING or v is None else (0, v)

            self._docs.sort(key=_key, reverse=(d == -1))
        return self

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, length=None):
        docs = self._docs[self._skip:]
        n = self._limit if self._limit else length
        if n:
            docs = docs[:n]
        return docs

    def __aiter__(self):
        async def gen():
            for d in await self.to_list():
                yield d

        return gen()


class FakeCollection:
    def __init__(self, name: str):
        self.name = name
        self.docs: List[Dict[str, Any]] = []
        self.indexes: List[Dict[str, Any]] = []
        self._next_id = 0

    # -- indexes ------------------------------------------------------------ #

    async def create_index(self, keys, **kwargs):
        spec = keys if isinstance(keys, list) else [(keys, 1)]
        name = kwargs.get("name") or "_".join(f"{k}_{d}" for k, d in spec)
        self.indexes.append({"keys": spec, "name": name, **kwargs})
        return name

    def _check_unique(self, candidate: Dict[str, Any], ignore: Optional[Dict[str, Any]] = None) -> None:
        for idx in self.indexes:
            if not idx.get("unique"):
                continue
            partial = idx.get("partialFilterExpression")
            if partial and not matches(candidate, partial):
                continue
            key = tuple(None if _get(candidate, k) is _MISSING else _get(candidate, k) for k, _ in idx["keys"])
            for other in self.docs:
                if other is ignore:
                    continue
                if partial and not matches(other, partial):
                    continue
                okey = tuple(None if _get(other, k) is _MISSING else _get(other, k) for k, _ in idx["keys"])
                if okey == key:
                    raise DuplicateKeyError(f"E11000 duplicate key {self.name}.{idx['name']} {key}")

    # -- CRUD --------------------------------------------------------------- #

    async def insert_one(self, doc):
        doc = copy.deepcopy(doc)
        self._next_id += 1
        doc.setdefault("_id", f"{self.name}:{self._next_id}")
        self._check_unique(doc)
        self.docs.append(doc)
        return _Result(inserted_id=doc["_id"])

    async def find_one(self, query=None, projection=None, **kwargs):
        for d in self.docs:
            if matches(d, query or {}):
                return _project(d, projection)
        return None

    def find(self, query=None, projection=None):
        return FakeCursor([_project(d, projection) for d in self.docs if matches(d, query or {})])

    async def count_documents(self, query):
        return sum(1 for d in self.docs if matches(d, query))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if matches(d, query):
                trial = copy.deepcopy(d)
                _apply_update(trial, update)
                self._check_unique(trial, ignore=d)
                d.clear()
                d.update(trial)
                return _Result(matched=1, modified=1)
        if upsert:
            new_doc = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new_doc, update, inserting=True)
            res = await self.insert_one(new_doc)
            return _Result(upserted_id=res.inserted_id)
        return _Result()

    async def update_many(self, query, update):
        n = 0
        for d in self.docs:
            if matches(d, query):
                _apply_update(d, update)
                n += 1
        return _Result(matched=n, modified=n)

    async def find_one_and_update(self, query, update, projection=None, return_document=ReturnDocument.BEFORE, upsert=False, **kw):
        for d in self.docs:
            if matches(d, query):
                before = copy.deepcopy(d)
                trial = copy.deepcopy(d)
                _apply_update(trial, update)
                self._check_unique(trial, ignore=d)
                d.clear()
                d.update(trial)
                return _project(d if return_document == ReturnDocument.AFTER else before, projection)
        if upsert:
            new_doc = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new_doc, update, inserting=True)
            await self.insert_one(new_doc)
            return _project(new_doc, projection) if return_document == ReturnDocument.AFTER else None
        return None

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _Result(deleted=before - len(self.docs))

    async def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if matches(d, query):
                del self.docs[i]
                return _Result(deleted=1)
        return _Result()


class FakeDB:
    def __init__(self):
        self._cols: Dict[str, FakeCollection] = {}

    def __getitem__(self, name: str) -> FakeCollection:
        if name not in self._cols:
            self._cols[name] = FakeCollection(name)
        return self._cols[name]

    def __getattr__(self, name: str) -> FakeCollection:
        if name.startswith("__"):
            raise AttributeError(name)
        return self[name]


# --------------------------------------------------------------------------- #
# Redis
# --------------------------------------------------------------------------- #


class FakeRedisBroker:
    """Shared pub/sub fabric; each FakeRedis connected to it is one 'worker'."""

    def __init__(self):
        self.pubsubs: List["FakePubSub"] = []


class FakePubSub:
    def __init__(self, broker: FakeRedisBroker):
        self.broker = broker
        self.patterns: List[str] = []
        self.queue: asyncio.Queue = asyncio.Queue()
        broker.pubsubs.append(self)

    async def psubscribe(self, pattern):
        self.patterns.append(pattern)

    async def punsubscribe(self, pattern=None):
        self.patterns = [p for p in self.patterns if pattern is not None and p != pattern]

    async def get_message(self, ignore_subscribe_messages=True, timeout=1.0):
        try:
            return await asyncio.wait_for(self.queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    async def aclose(self):
        if self in self.broker.pubsubs:
            self.broker.pubsubs.remove(self)


class FakeRedis:
    def __init__(self, broker: Optional[FakeRedisBroker] = None, *, fail: bool = False):
        self.broker = broker or FakeRedisBroker()
        self.kv: Dict[str, Any] = {}
        self.published: List[Tuple[str, str]] = []
        self.fail = fail

    def pubsub(self):
        if self.fail:
            raise ConnectionError("redis down")
        return FakePubSub(self.broker)

    async def publish(self, channel, payload):
        if self.fail:
            raise ConnectionError("redis down")
        self.published.append((channel, payload))
        n = 0
        for ps in list(self.broker.pubsubs):
            for pat in ps.patterns:
                if fnmatch.fnmatchcase(channel, pat):
                    ps.queue.put_nowait({"type": "pmessage", "pattern": pat, "channel": channel, "data": payload})
                    n += 1
                    break
        return n

    async def incr(self, key):
        if self.fail:
            raise ConnectionError("redis down")
        self.kv[key] = int(self.kv.get(key, 0)) + 1
        return self.kv[key]

    async def expire(self, key, seconds):
        return True


def make_user(user_id: str = "alice", **kw):
    from core.models import User

    return User(id=user_id, email=f"{user_id}@example.com", name=user_id.title(), **kw)


class UserSwitch:
    """Mutable 'who is calling' for API tests (``dependency_overrides[get_current_user]``)."""

    def __init__(self, user):
        self.user = user

    async def __call__(self):
        if self.user is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Not authenticated")
        return self.user


def make_app(rt, caller: "UserSwitch"):
    """FastAPI app with only ``/v1/os/*``, the given runtime and a switchable caller."""
    from fastapi import APIRouter, FastAPI

    import api.os as os_api
    from api.auth import get_current_user

    app = FastAPI()
    v1 = APIRouter(prefix="/v1")
    v1.include_router(os_api.router)
    app.include_router(v1)

    async def _rt():
        return rt

    async def _enabled():
        return None

    app.dependency_overrides[get_current_user] = caller
    app.dependency_overrides[os_api.get_os_runtime] = _rt
    app.dependency_overrides[os_api.require_os_shell] = _enabled
    return app


async def indexed_db() -> FakeDB:
    """A FakeDB with the real ``os_*`` indexes (unique constraints enforced)."""
    from core.os.indexes import ensure_os_indexes

    db = FakeDB()
    await ensure_os_indexes(db)
    return db
