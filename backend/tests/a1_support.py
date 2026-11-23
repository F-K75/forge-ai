"""Test doubles for the A1 ledger tests.

``LedgerFakeDB`` is an in-memory Mongo double covering what the ledger code
uses: dotted paths (including numeric array indices), ``$set``/``$unset``/
``$inc``/``$push``/``$setOnInsert``, upserts, ``$elemMatch``/``$expr``/
``$or``, unique indexes (``DuplicateKeyError``), ``hello``, and client
sessions with ``with_transaction``.

Transactions are emulated by serializing them on a lock and restoring a
snapshot of every collection on abort, so a callback that raises leaves no
trace (all or none). ``fault_at_write`` raises at the N-th write inside a
transaction; ``unknown_commit`` raises an ``UnknownTransactionCommitResult``
after the commit was (or was not) applied, as a dropped connection at commit
would. ``session.log`` records the boundaries. This exercises the logic of
the transaction callbacks; it cannot prove isolation or atomicity on a real
server, which the rs0-marked tests do (``FORGE_RS0_MONGODB_URL``).

Each update is applied without an ``await`` in between, so single-document
updates are atomic under asyncio, as on a replica set.
"""

from __future__ import annotations

import asyncio
import copy
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pytest
from pymongo.errors import DuplicateKeyError, PyMongoError

RS0_URL = os.getenv("FORGE_RS0_MONGODB_URL")

rs0 = pytest.mark.skipif(
    not RS0_URL,
    reason="rs0: needs a real single-node replica set (set FORGE_RS0_MONGODB_URL); "
           "the in-memory double proves the callback logic, not server atomicity",
)

_MISSING = object()
_INDEX = re.compile(r"^\d+$")


# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #


def get_path(doc: Any, path: str) -> Any:
    cur = doc
    for part in path.split("."):
        if isinstance(cur, list):
            if _INDEX.match(part):
                i = int(part)
                if i >= len(cur):
                    return _MISSING
                cur = cur[i]
                continue
            # Implicit traversal: a list of every element's value.
            values = [get_path(el, part) for el in cur if isinstance(el, dict)]
            values = [v for v in values if v is not _MISSING]
            return values if values else _MISSING
        if not isinstance(cur, dict) or part not in cur:
            return _MISSING
        cur = cur[part]
    return cur


def _container(doc: Dict[str, Any], path: str, create: bool = True):
    parts = path.split(".")
    cur: Any = doc
    for part in parts[:-1]:
        if isinstance(cur, list):
            i = int(part)
            while create and len(cur) <= i:
                cur.append(None)
            if cur[i] is None and create:
                cur[i] = {}
            cur = cur[i]
        else:
            if part not in cur or cur[part] is None:
                if not create:
                    return None, parts[-1]
                cur[part] = {}
            cur = cur[part]
    return cur, parts[-1]


def set_path(doc: Dict[str, Any], path: str, value: Any) -> None:
    parent, last = _container(doc, path)
    if isinstance(parent, list):
        i = int(last)
        while len(parent) <= i:
            parent.append(None)
        parent[i] = value
    else:
        parent[last] = value


def unset_path(doc: Dict[str, Any], path: str) -> None:
    parent, last = _container(doc, path, create=False)
    if isinstance(parent, dict):
        parent.pop(last, None)


# --------------------------------------------------------------------------- #
# Query matching
# --------------------------------------------------------------------------- #


def _cmp(a, b, op):
    if a is _MISSING or a is None or b is None:
        return False
    try:
        return op(a, b)
    except TypeError:
        return False


def eval_expr(expr, doc):
    if isinstance(expr, str) and expr.startswith("$"):
        value = get_path(doc, expr[1:])
        return None if value is _MISSING else value
    if isinstance(expr, dict) and len(expr) == 1 and next(iter(expr)).startswith("$"):
        (op, args), = expr.items()
        if op == "$ifNull":
            v = eval_expr(args[0], doc)
            return eval_expr(args[1], doc) if v is None else v
        values = [eval_expr(a, doc) for a in (args if isinstance(args, list) else [args])]
        if op == "$add":
            return sum(v or 0 for v in values)
        if op == "$subtract":
            return (values[0] or 0) - (values[1] or 0)
        if op == "$lte":
            return (values[0] or 0) <= (values[1] or 0)
        if op == "$lt":
            return (values[0] or 0) < (values[1] or 0)
        if op == "$gte":
            return (values[0] or 0) >= (values[1] or 0)
        if op == "$gt":
            return (values[0] or 0) > (values[1] or 0)
        if op == "$eq":
            return values[0] == values[1]
        if op == "$and":
            return all(values)
        raise NotImplementedError(op)
    return expr


def _match_cond(value, cond) -> bool:
    if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
        for op, arg in cond.items():
            if op == "$exists":
                if (value is not _MISSING) != bool(arg):
                    return False
            elif op == "$ne":
                if _match_cond(value, arg):
                    return False
            elif op == "$eq":
                if not _match_cond(value, arg):
                    return False
            elif op == "$in":
                if not any(_match_cond(value, a) for a in arg):
                    return False
            elif op == "$nin":
                if any(_match_cond(value, a) for a in arg):
                    return False
            elif op in ("$lt", "$lte", "$gt", "$gte"):
                fn = {"$lt": lambda a, b: a < b, "$lte": lambda a, b: a <= b,
                      "$gt": lambda a, b: a > b, "$gte": lambda a, b: a >= b}[op]
                if isinstance(value, list):
                    if not any(_cmp(v, arg, fn) for v in value):
                        return False
                elif not _cmp(value, arg, fn):
                    return False
            elif op == "$not":
                if _match_cond(value, arg):
                    return False
            elif op == "$elemMatch":
                if not isinstance(value, list) or not any(
                    matches(el, arg) if isinstance(el, dict) else _match_cond(el, arg) for el in value
                ):
                    return False
            elif op == "$size":
                if not isinstance(value, list) or len(value) != arg:
                    return False
            else:
                raise NotImplementedError(op)
        return True
    if value is _MISSING:
        return cond is None
    if isinstance(value, list) and not isinstance(cond, list):
        return cond in value
    return value == cond


def matches(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    for key, cond in (query or {}).items():
        if key == "$expr":
            if not eval_expr(cond, doc):
                return False
        elif key == "$or":
            if not any(matches(doc, q) for q in cond):
                return False
        elif key == "$and":
            if not all(matches(doc, q) for q in cond):
                return False
        elif not _match_cond(get_path(doc, key), cond):
            return False
    return True


# --------------------------------------------------------------------------- #
# Collections
# --------------------------------------------------------------------------- #


class UpdateResult:
    def __init__(self, matched: int, modified: int, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id
        self.acknowledged = True


class InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id
        self.acknowledged = True


class DeleteResult:
    def __init__(self, n):
        self.deleted_count = n


class Cursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, key, direction=None):
        specs = key if isinstance(key, list) else [(key, direction or 1)]
        for field, d in reversed(specs):
            self._docs.sort(key=lambda x: (get_path(x, field) is _MISSING, get_path(x, field)
                                           if get_path(x, field) is not _MISSING else 0), reverse=(d == -1))
        return self

    def limit(self, n):
        if n:
            self._docs = self._docs[:n]
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                yield d
        return gen()

    async def to_list(self, length=None):
        return list(self._docs if length is None else self._docs[:length])


def _strip(doc):
    out = copy.deepcopy(doc)
    out.pop("_id", None)
    return out


class LedgerFakeCollection:
    def __init__(self, db: "LedgerFakeDB", name: str, docs: Optional[Iterable[Dict[str, Any]]] = None):
        self.db = db
        self.name = name
        self.docs: List[Dict[str, Any]] = [copy.deepcopy(d) for d in (docs or [])]
        self.unique: List[Tuple[Tuple[str, ...], Optional[Dict[str, Any]]]] = []
        self.indexes: List[Dict[str, Any]] = []
        self.writes = 0

    # -- indexes -------------------------------------------------------- #

    async def create_index(self, keys, unique=False, partialFilterExpression=None, **kw):
        fields = tuple(k for k, _ in keys) if isinstance(keys, list) else (keys,)
        self.indexes.append({"keys": fields, "unique": unique, "partial": partialFilterExpression, **kw})
        if unique and (fields, partialFilterExpression) not in self.unique:
            self.unique.append((fields, partialFilterExpression))
        return "_".join(fields)

    def _check_unique(self, candidate: Dict[str, Any], exclude: Optional[Dict[str, Any]] = None):
        for fields, partial in self.unique:
            if partial and not matches(candidate, partial):
                continue
            key = tuple(None if get_path(candidate, f) is _MISSING else get_path(candidate, f) for f in fields)
            for other in self.docs:
                if other is exclude or other is candidate:
                    continue
                if partial and not matches(other, partial):
                    continue
                if tuple(None if get_path(other, f) is _MISSING else get_path(other, f) for f in fields) == key:
                    raise DuplicateKeyError(f"E11000 duplicate key error collection: {self.name} index: {fields}",
                                            11000)

    # -- writes --------------------------------------------------------- #

    def _write(self, session):
        self.writes += 1
        self.db._on_write(self, session)

    async def insert_one(self, doc, session=None, **_):
        self._write(session)
        new = copy.deepcopy(doc)
        self._check_unique(new)
        self.docs.append(new)
        return InsertResult(new.get("id"))

    async def insert_many(self, docs, session=None, **_):
        for d in docs:
            await self.insert_one(d, session=session)

    @staticmethod
    def _apply(doc, update, inserting: bool):
        if not any(k.startswith("$") for k in update):
            raise ValueError("replacement documents are not supported")
        for key, value in (update.get("$set") or {}).items():
            set_path(doc, key, copy.deepcopy(value))
        if inserting:
            for key, value in (update.get("$setOnInsert") or {}).items():
                set_path(doc, key, copy.deepcopy(value))
        for key in (update.get("$unset") or {}):
            unset_path(doc, key)
        for key, value in (update.get("$inc") or {}).items():
            current = get_path(doc, key)
            set_path(doc, key, (0 if current in (_MISSING, None) else current) + value)
        for key, value in (update.get("$push") or {}).items():
            current = get_path(doc, key)
            if current in (_MISSING, None):
                current = []
                set_path(doc, key, current)
            items = value["$each"] if isinstance(value, dict) and "$each" in value else [value]
            current.extend(copy.deepcopy(items))
        for key, value in (update.get("$max") or {}).items():
            current = get_path(doc, key)
            if current in (_MISSING, None) or value > current:
                set_path(doc, key, value)

    @staticmethod
    def _seed(query):
        doc: Dict[str, Any] = {}
        for k, v in (query or {}).items():
            if k.startswith("$") or (isinstance(v, dict) and any(x.startswith("$") for x in v)):
                continue
            set_path(doc, k, copy.deepcopy(v))
        return doc

    def _find_doc(self, query, sort=None):
        candidates = [d for d in self.docs if matches(d, query)]
        if sort and candidates:
            candidates = Cursor(candidates).sort(sort)._docs
        return candidates[0] if candidates else None

    async def update_one(self, query, update, upsert=False, session=None, **_):
        self._write(session)
        doc = self._find_doc(query)
        if doc is not None:
            trial = copy.deepcopy(doc)
            self._apply(trial, update, inserting=False)
            self._check_unique(trial, exclude=doc)
            doc.clear()
            doc.update(trial)
            return UpdateResult(1, 1)
        if upsert:
            new = self._seed(query)
            self._apply(new, update, inserting=True)
            self._check_unique(new)
            self.docs.append(new)
            return UpdateResult(0, 0, upserted_id=new.get("id"))
        return UpdateResult(0, 0)

    async def update_many(self, query, update, session=None, **_):
        self._write(session)
        n = 0
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update, inserting=False)
                n += 1
        return UpdateResult(n, n)

    async def find_one_and_update(self, query, update, upsert=False, return_document=False,
                                  session=None, sort=None, projection=None, **_):
        self._write(session)
        doc = self._find_doc(query, sort=sort)
        if doc is None:
            if not upsert:
                return None
            new = self._seed(query)
            self._apply(new, update, inserting=True)
            self._check_unique(new)
            self.docs.append(new)
            return _strip(new) if return_document else None
        before = _strip(doc)
        trial = copy.deepcopy(doc)
        self._apply(trial, update, inserting=False)
        self._check_unique(trial, exclude=doc)
        doc.clear()
        doc.update(trial)
        return _strip(doc) if return_document else before

    async def delete_one(self, query, session=None, **_):
        self._write(session)
        for i, d in enumerate(self.docs):
            if matches(d, query):
                del self.docs[i]
                return DeleteResult(1)
        return DeleteResult(0)

    async def delete_many(self, query, session=None, **_):
        self._write(session)
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return DeleteResult(before - len(self.docs))

    # -- reads ---------------------------------------------------------- #

    async def find_one(self, query=None, projection=None, sort=None, session=None, **_):
        doc = self._find_doc(query, sort=sort)
        return _strip(doc) if doc is not None else None

    def find(self, query=None, projection=None, session=None, sort=None, **_):
        cursor = Cursor([_strip(d) for d in self.docs if matches(d, query)])
        if sort:
            cursor.sort(sort)
        return cursor

    async def count_documents(self, query=None, session=None, **_):
        return sum(1 for d in self.docs if matches(d, query))

    def aggregate(self, pipeline, session=None, **_):
        docs = [_strip(d) for d in self.docs]
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            elif "$group" in stage:
                spec = stage["$group"]
                buckets: Dict[Any, Dict[str, Any]] = {}
                for d in docs:
                    key = eval_expr(spec["_id"], d) if spec["_id"] is not None else None
                    bucket = buckets.setdefault(repr(key), {"_id": key})
                    for name, agg in spec.items():
                        if name == "_id":
                            continue
                        (op, arg), = agg.items()
                        if op != "$sum":
                            raise NotImplementedError(op)
                        inc = arg if isinstance(arg, (int, float)) else (eval_expr(arg, d) or 0)
                        bucket[name] = bucket.get(name, 0) + inc
                docs = list(buckets.values())
        return Cursor(docs)


# --------------------------------------------------------------------------- #
# Database, client and sessions
# --------------------------------------------------------------------------- #


class FakeSession:
    def __init__(self, db: "LedgerFakeDB"):
        self.db = db
        self.in_transaction = False
        self.writes = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def end_session(self):
        return None

    async def with_transaction(self, coro, read_concern=None, write_concern=None,
                               read_preference=None, max_commit_time_ms=None):
        db = self.db
        db.txn_options.append({"read_concern": read_concern, "write_concern": write_concern,
                               "read_preference": read_preference})
        async with db._txn_lock:
            while True:
                snapshot = db._snapshot()
                self.in_transaction = True
                self.writes = 0
                db.log.append("start")
                try:
                    result = await coro(self)
                except BaseException as exc:
                    db._restore(snapshot)
                    db.log.append("abort")
                    self.in_transaction = False
                    if isinstance(exc, PyMongoError) and exc.has_error_label("TransientTransactionError") \
                            and db.transient_retries > 0:
                        db.transient_retries -= 1
                        continue
                    raise
                self.in_transaction = False
                if db.unknown_commit:
                    applied = db.unknown_commit.pop(0)
                    if not applied:
                        db._restore(snapshot)
                    db.log.append("commit_unknown" + ("" if applied else "_not_applied"))
                    raise PyMongoError("connection closed during commitTransaction",
                                       error_labels=["UnknownTransactionCommitResult"])
                db.log.append("commit")
                return result


class FakeClient:
    def __init__(self, db: "LedgerFakeDB"):
        self._db = db
        self.sessions: List[FakeSession] = []

    async def start_session(self, **_):
        session = FakeSession(self._db)
        self.sessions.append(session)
        return session

    def __getitem__(self, name):
        return self._db


class LedgerFakeDB:
    """``replica_set``: the ``hello.setName`` the double reports (None:
    standalone)."""

    def __init__(self, replica_set: Optional[str] = "rs0", **collections):
        self.__dict__["_collections"] = {}
        self.__dict__["replica_set"] = replica_set
        self.__dict__["log"] = []
        self.__dict__["txn_options"] = []
        self.__dict__["unknown_commit"] = []
        self.__dict__["transient_retries"] = 0
        self.__dict__["fault"] = None
        self.__dict__["_txn_locks"] = {}
        self.__dict__["client"] = FakeClient(self)
        self.__dict__["write_log"] = []
        for name, docs in collections.items():
            self._collections[name] = LedgerFakeCollection(self, name, docs)

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        cols = self.__dict__["_collections"]
        if name not in cols:
            cols[name] = LedgerFakeCollection(self, name)
        return cols[name]

    def __getitem__(self, name):
        return getattr(self, name)

    async def command(self, name, *a, **k):
        if name in ("hello", "isMaster", "ismaster"):
            out = {"ok": 1, "isWritablePrimary": True}
            if self.replica_set:
                out["setName"] = self.replica_set
            return out
        if name == "ping":
            return {"ok": 1}
        raise NotImplementedError(name)

    @property
    def _txn_lock(self) -> asyncio.Lock:
        """One lock per event loop (TestClient runs the app on its own)."""
        loop = asyncio.get_running_loop()
        locks = self.__dict__["_txn_locks"]
        if loop not in locks:
            locks[loop] = asyncio.Lock()
        return locks[loop]

    # -- fault injection ------------------------------------------------ #

    def fault_at_write(self, n: int, exc: Optional[BaseException] = None) -> None:
        """Raise ``exc`` at the n-th (1-based) write inside the next
        transaction(s)."""
        self.__dict__["fault"] = {"n": n, "exc": exc or RuntimeError(f"fault injected at write {n}")}

    def _on_write(self, collection: LedgerFakeCollection, session: Optional[FakeSession]):
        self.write_log.append((collection.name, bool(session and session.in_transaction)))
        if session is None or not session.in_transaction:
            return
        session.writes += 1
        fault = self.fault
        if fault and session.writes == fault["n"]:
            self.__dict__["fault"] = None
            raise fault["exc"]

    def _snapshot(self):
        return {name: copy.deepcopy(c.docs) for name, c in self._collections.items()}

    def _restore(self, snapshot):
        for name, c in self._collections.items():
            c.docs = copy.deepcopy(snapshot.get(name, []))

    async def ensure_indexes(self):
        """Run the production index provisioning against the double."""
        from core.database import _ensure_indexes

        await _ensure_indexes(self)


def set_flags(monkeypatch, **flags) -> None:
    """Set settings on ``get_settings()`` and on every module-level
    ``settings`` binding (some tests reload ``core.config``, leaving modules
    holding an older instance)."""
    import sys

    from core.config import Settings, get_settings

    targets = {id(get_settings()): get_settings()}
    for mod in list(sys.modules.values()):
        bound = getattr(mod, "settings", None) if mod is not None else None
        if isinstance(bound, Settings):
            targets[id(bound)] = bound
    for target in targets.values():
        for name, value in flags.items():
            monkeypatch.setattr(target, name, value)


def patch_ledger_infra(monkeypatch, db: LedgerFakeDB) -> None:
    """``patch_infra`` from a2_support, for the ledger double."""
    from tests.a2_support import patch_infra

    patch_infra(monkeypatch, db)
    import core.db_tx as db_tx

    db_tx.reset_topology_cache()
