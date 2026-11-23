"""TX-5: ``ledger_v2`` refuses to run on a standalone server; admission
returns a service error and no money moves. TX-6 (the CI server really is
``rs0``) is the rs0-marked test at the end, plus the guard step in the
``mongo-integration`` job."""

from __future__ import annotations

import asyncio

import pytest

from core import db_tx
from core.db_tx import LedgerUnavailable, ensure_ledger_topology
from tests.a1_support import RS0_URL, LedgerFakeDB, rs0
from tests.test_tx_admission import FakeRunBuild, _client, _db, _post


def test_standalone_refuses_the_ledger():
    db_tx.reset_topology_cache()
    with pytest.raises(LedgerUnavailable):
        asyncio.run(ensure_ledger_topology(LedgerFakeDB(replica_set=None)))


def test_replica_set_member_passes_and_is_cached():
    db_tx.reset_topology_cache()
    topology = asyncio.run(ensure_ledger_topology(LedgerFakeDB(replica_set="rs0")))
    assert topology.set_name == "rs0"
    # Cached: a later probe failure does not matter for this process.
    assert asyncio.run(ensure_ledger_topology(LedgerFakeDB(replica_set=None))).set_name == "rs0"
    db_tx.reset_topology_cache()


def test_probe_error_fails_closed():
    db_tx.reset_topology_cache()

    class Broken(LedgerFakeDB):
        async def command(self, name, *a, **k):
            raise ConnectionError("no route")

    with pytest.raises(LedgerUnavailable):
        asyncio.run(ensure_ledger_topology(Broken()))


def test_admission_on_standalone_is_a_service_error_and_moves_no_money(monkeypatch):
    db = _db()
    db.__dict__["replica_set"] = None
    run = FakeRunBuild()
    r = _post(_client(monkeypatch, db, run))
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "ledger_unavailable"
    assert db.users.docs[0]["credits"] == 100
    assert db.builds.docs == [] and db.credit_transactions.docs == [] and db.usage_counters.docs == []
    assert run.calls == [] and db.log == []


def test_credit_transactions_unique_index_is_provisioned():
    db = LedgerFakeDB()
    asyncio.run(db.ensure_indexes())
    uniques = {(c.name, fields) for c in db._collections.values() for fields, _ in c.unique}
    assert ("credit_transactions", ("build_id", "kind")) in uniques
    assert ("usage_counters", ("scope", "scope_id", "day")) in uniques
    assert ("llm_response_journal", ("operation_id", "dispatch_no")) in uniques
    ttl = [i for i in db.llm_response_journal.indexes if i.get("expireAfterSeconds") == 0]
    assert ttl and ttl[0]["keys"] == ("expires_at",)


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ci_server_is_replica_set_rs0():
    """TX-6: the transactional suite never silently runs on a standalone."""
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(RS0_URL)
    try:
        hello = await client.admin.command("hello")
        assert hello.get("setName") == "rs0", hello
        db_tx.reset_topology_cache()
        topology = await ensure_ledger_topology(client["forge_a1_tx6"])
        assert topology.set_name == "rs0"
    finally:
        client.close()
