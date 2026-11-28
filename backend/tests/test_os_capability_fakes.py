"""Shared fakes for the ``test_os_capability_*`` suites (no tests here).

``FakeMongo`` is an in-memory stand-in for the motor database with just enough
query, projection and update support for the route functions the capability
handlers delegate to. ``patch_db`` points every loaded module's ``get_db`` at
it (route modules import ``get_db`` by name), and makes Redis unavailable the
way CI runs (rate-limit and cache helpers then fail open, as in production
code paths without Redis).
"""

from __future__ import annotations

import copy
import sys
from typing import Any, Dict, List, Optional

from core.models import User
from core.os_contracts import ActionContext

_MISSING = object()


def _get(doc: Dict[str, Any], dotted: str) -> Any:
    cur: Any = doc
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return _MISSING
    return cur


def _match_cond(value: Any, cond: Any) -> bool:
    if isinstance(cond, dict) and cond and all(str(k).startswith("$") for k in cond):
        for op, arg in cond.items():
            v = None if value is _MISSING else value
            if op == "$in" and not (v in arg or (isinstance(v, list) and any(x in arg for x in v))):
                return False
            if op == "$nin" and v in arg:
                return False
            if op == "$ne" and v == arg:
                return False
            if op == "$eq" and v != arg:
                return False
            if op == "$exists" and (value is not _MISSING) != bool(arg):
                return False
            if op in ("$gt", "$gte", "$lt", "$lte"):
                if v is None:
                    return False
                try:
                    ok = {"$gt": v > arg, "$gte": v >= arg, "$lt": v < arg, "$lte": v <= arg}[op]
                except TypeError:
                    return False
                if not ok:
                    return False
        return True
    if value is _MISSING:
        return cond is None
    if isinstance(value, list) and not isinstance(cond, list):
        return cond in value
    return value == cond


def matches(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    for key, cond in (query or {}).items():
        if key == "$or":
            if not any(matches(doc, q) for q in cond):
                return False
        elif key == "$and":
            if not all(matches(doc, q) for q in cond):
                return False
        elif not _match_cond(_get(doc, key), cond):
            return False
    return True


def project(doc: Dict[str, Any], projection: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = copy.deepcopy(doc)
    out.pop("_id", None)
    if not projection:
        return out
    include = [k for k, v in projection.items() if v and k != "_id"]
    if include:
        return {k: out[k] for k in include if k in out}
    for k, v in projection.items():
        if not v:
            out.pop(k, None)
    return out


class FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, key: Any, direction: int = 1) -> "FakeCursor":
        specs = key if isinstance(key, list) else [(key, direction)]
        for field, d in reversed(specs):
            self._docs.sort(key=lambda x: (x.get(field) is None, str(x.get(field))), reverse=d < 0)
        return self

    def skip(self, n: int) -> "FakeCursor":
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int) -> "FakeCursor":
        if n:
            self._docs = self._docs[:n]
        return self

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        return self._docs[:length] if length else list(self._docs)

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                yield d

        return gen()


class _Result:
    def __init__(self, matched: int = 0, inserted_id: Any = None):
        self.matched_count = matched
        self.modified_count = matched
        self.deleted_count = matched
        self.inserted_id = inserted_id
        self.upserted_id = None


class FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None):
        self.docs: List[Dict[str, Any]] = [copy.deepcopy(d) for d in (docs or [])]

    async def find_one(self, query=None, projection=None, **_: Any):
        for d in self.docs:
            if matches(d, query):
                return project(d, projection)
        return None

    def find(self, query=None, projection=None, **_: Any) -> FakeCursor:
        return FakeCursor([project(d, projection) for d in self.docs if matches(d, query)])

    def aggregate(self, *_: Any, **__: Any) -> FakeCursor:
        return FakeCursor([])

    async def count_documents(self, query=None, **_: Any) -> int:
        return sum(1 for d in self.docs if matches(d, query))

    async def distinct(self, field: str, query=None) -> List[Any]:
        return sorted({d.get(field) for d in self.docs if matches(d, query) and d.get(field) is not None}, key=str)

    async def insert_one(self, doc: Dict[str, Any], **_: Any) -> _Result:
        self.docs.append(copy.deepcopy(doc))
        return _Result(1, doc.get("id"))

    async def insert_many(self, docs, **_: Any) -> _Result:
        for d in docs:
            self.docs.append(copy.deepcopy(d))
        return _Result(len(docs))

    def _apply(self, doc: Dict[str, Any], update: Dict[str, Any]) -> None:
        for key, value in (update.get("$set") or {}).items():
            cur = doc
            parts = key.split(".")
            for p in parts[:-1]:
                cur = cur.setdefault(p, {})
            cur[parts[-1]] = value
        for key, value in (update.get("$inc") or {}).items():
            doc[key] = doc.get(key, 0) + value
        for key, value in (update.get("$push") or {}).items():
            doc.setdefault(key, []).append(value)
        for key in (update.get("$unset") or {}):
            doc.pop(key, None)

    async def update_one(self, query, update, upsert: bool = False, **_: Any) -> _Result:
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update)
                return _Result(1)
        if upsert:
            doc = {k: v for k, v in (query or {}).items() if not str(k).startswith("$") and not isinstance(v, dict)}
            doc.update(update.get("$setOnInsert") or {})
            self._apply(doc, update)
            self.docs.append(doc)
        return _Result(0)

    async def update_many(self, query, update, **_: Any) -> _Result:
        n = 0
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update)
                n += 1
        return _Result(n)

    async def find_one_and_update(self, query, update, projection=None, return_document=None, upsert=False, **_: Any):
        for d in self.docs:
            if matches(d, query):
                before = project(d, projection)
                self._apply(d, update)
                return project(d, projection) if return_document else before
        return None

    async def delete_one(self, query, **_: Any) -> _Result:
        for i, d in enumerate(self.docs):
            if matches(d, query):
                del self.docs[i]
                return _Result(1)
        return _Result(0)

    async def delete_many(self, query, **_: Any) -> _Result:
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _Result(before - len(self.docs))

    async def create_index(self, *_: Any, **__: Any) -> str:
        return "idx"


class FakeMongo:
    def __init__(self, **collections: List[Dict[str, Any]]):
        self._cols: Dict[str, FakeCollection] = {k: FakeCollection(v) for k, v in collections.items()}

    def __getattr__(self, name: str) -> FakeCollection:
        if name.startswith("__"):
            raise AttributeError(name)
        return self._cols.setdefault(name, FakeCollection())

    def __getitem__(self, name: str) -> FakeCollection:
        return self.__getattr__(name)


async def _no_redis():
    raise ConnectionError("redis unavailable in tests")


def patch_db(monkeypatch, db: FakeMongo) -> None:
    async def _get_db():
        return db

    import core.os_capabilities.handlers  # noqa: F401 - make sure route modules can be imported first

    for name, module in list(sys.modules.items()):
        if module is None or not (name.startswith(("api.", "core.", "services.", "repositories.")) or name in ("api", "core")):
            continue
        if getattr(module, "get_db", None) is not None and callable(module.get_db):
            monkeypatch.setattr(module, "get_db", _get_db, raising=False)
        if getattr(module, "get_redis", None) is not None and callable(module.get_redis):
            monkeypatch.setattr(module, "get_redis", _no_redis, raising=False)


OWNER = "user-owner"
STRANGER = "user-stranger"
MEMBER = "user-member"
ADMIN = "user-admin"


def make_user(user_id: str, **kw: Any) -> User:
    return User(id=user_id, email=f"{user_id}@example.com", name=user_id, **kw)


def user_doc(user: User, **extra: Any) -> Dict[str, Any]:
    doc = user.model_dump(mode="json")
    doc.update(extra)
    return doc


def make_ctx(user: User, capability_id: str, action: str, project_id: Optional[str] = None, **metadata: Any) -> ActionContext:
    events: List[Any] = []

    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        events.append((event_type, data))

    ctx = ActionContext(user=user, capability_id=capability_id, action=action, session_id="ses_test", turn_id="turn_test",
                        project_id=project_id, emit=emit, metadata=dict(metadata))
    ctx.metadata.setdefault("_events", events)
    return ctx


def seeded_db(**extra: List[Dict[str, Any]]) -> FakeMongo:
    """Owner has project ``p1`` in org ``org1``; MEMBER is a plain member of org1; STRANGER has no relation."""
    cols: Dict[str, List[Dict[str, Any]]] = {
        "users": [user_doc(make_user(u)) for u in (OWNER, STRANGER, MEMBER)]
        + [user_doc(make_user(ADMIN), is_admin=True, mfa_enabled=True)],
        "projects": [{"id": "p1", "user_id": OWNER, "org_id": "org1", "name": "Bakery site", "description": "", "deleted_at": None}],
        "team_members": [
            {"org_id": "org1", "user_id": OWNER, "role": "owner"},
            {"org_id": "org1", "user_id": MEMBER, "role": "member"},
        ],
        "builds": [{"id": "b1", "project_id": "p1", "user_id": OWNER, "status": "complete", "prompt": "bakery", "files": {}}],
        "initiatives": [{"id": "i1", "user_id": OWNER, "org_id": None, "name": "Launch", "status": "ready", "project_id": "p1"}],
        "deployments": [{"id": "d1", "project_id": "p1", "user_id": OWNER, "build_id": "b1", "status": "live"}],
    }
    for k, v in extra.items():
        cols.setdefault(k, []).extend(v)
    return FakeMongo(**cols)
