"""WS-C: os_* repositories -- tenant scoping, leases, idempotency, snapshots, workspaces."""

from __future__ import annotations

import asyncio

import pytest
from pymongo.errors import DuplicateKeyError

from core.os.common import OsHTTPError, iso
from core.os.sessions import (
    MessageRepository,
    SessionRepository,
    SurfaceRepository,
    TurnRepository,
    WorkspaceRepository,
    derive_title,
    session_summary,
    set_json_pointer,
)
from core.os_contracts import validate_contract
from tests.os_fakes import indexed_db


@pytest.fixture
async def db():
    return await indexed_db()


async def test_session_crud_is_scoped_to_owner(db):
    repo = SessionRepository(db)
    a = await repo.create(user_id="alice", title="Alpha")
    assert validate_contract("SessionSummary", session_summary(a)) == []

    assert (await repo.get("alice", a["id"]))["title"] == "Alpha"
    assert await repo.get("mallory", a["id"]) is None
    with pytest.raises(OsHTTPError) as exc:
        await repo.require("mallory", a["id"])
    assert exc.value.status == 404

    with pytest.raises(OsHTTPError) as exc:
        await repo.update("mallory", a["id"], {"title": "pwned"})
    assert exc.value.status == 404
    with pytest.raises(OsHTTPError):
        await repo.soft_delete("mallory", a["id"])
    assert (await repo.get("alice", a["id"]))["title"] == "Alpha"

    updated = await repo.update("alice", a["id"], {"title": "  Renamed  ", "pinned": True, "bogus": 1})
    assert updated["title"] == "Renamed" and updated["pinned"] is True and "bogus" not in updated

    await repo.soft_delete("alice", a["id"])
    assert await repo.get("alice", a["id"]) is None
    docs, total = await repo.list("alice")
    assert total == 0 and docs == []


async def test_session_list_pagination_pins_first_and_excludes_archived(db):
    repo = SessionRepository(db)
    ids = []
    for i in range(5):
        s = await repo.create(user_id="alice", title=f"s{i}")
        ids.append(s["id"])
        await asyncio.sleep(0.001)
    await repo.create(user_id="bob", title="bob's")
    await repo.update("alice", ids[0], {"pinned": True})
    await repo.update("alice", ids[1], {"archived": True})

    docs, total = await repo.list("alice", page=1, per_page=2)
    assert total == 4
    assert docs[0]["id"] == ids[0]  # pinned first
    page2, _ = await repo.list("alice", page=2, per_page=2)
    seen = {d["id"] for d in docs + page2}
    assert ids[1] not in seen
    assert all(d["user_id"] == "alice" for d in docs + page2)
    with_archived, total_all = await repo.list("alice", include_archived=True, per_page=50)
    assert total_all == 5


def test_derive_title():
    assert derive_title("  build me\n a   site ") == "build me a site"
    assert len(derive_title("x" * 500)) == 60
    assert derive_title("   ") == "New session"


async def test_turn_lease_is_exclusive_and_reclaimable_when_stale(db):
    repo = SessionRepository(db)
    s = await repo.create(user_id="alice", title="t")
    assert await repo.acquire_turn_lease("alice", s["id"], "turn_1") is True
    assert await repo.acquire_turn_lease("alice", s["id"], "turn_2") is False
    # a foreign user can never take the lease
    await repo.release_turn_lease(s["id"], "turn_1")
    assert await repo.acquire_turn_lease("mallory", s["id"], "turn_x") is False
    assert await repo.acquire_turn_lease("alice", s["id"], "turn_2") is True
    # simulate a crashed worker: lease far in the past
    await db["os_sessions"].update_one({"id": s["id"]}, {"$set": {"active_turn_at": "2000-01-01T00:00:00Z"}})
    assert await repo.acquire_turn_lease("alice", s["id"], "turn_3") is True


async def test_turn_create_is_idempotent_on_client_turn_id(db):
    turns = TurnRepository(db)
    doc = {"id": "turn_a", "session_id": "ses_1", "user_id": "alice", "client_turn_id": "c1", "status": "running"}
    first, created = await turns.create(dict(doc))
    assert created
    again, created2 = await turns.create({**doc, "id": "turn_b"})
    assert not created2 and again["id"] == "turn_a"
    with pytest.raises(DuplicateKeyError):
        await db["os_turns"].insert_one({**doc, "id": "turn_a", "client_turn_id": "c2"})


async def test_turn_finish_wins_exactly_once(db):
    turns = TurnRepository(db)
    await turns.create({"id": "turn_a", "session_id": "s", "user_id": "u", "client_turn_id": "c", "status": "running"})
    results = await asyncio.gather(*(turns.finish("turn_a", st) for st in ("completed", "cancelled", "failed")))
    assert sorted(results) == [False, False, True]
    assert await turns.is_cancel_requested("turn_a") is True  # no longer running


async def test_messages_scoped(db):
    msgs = MessageRepository(db)
    await msgs.add(user_id="alice", session_id="ses_1", turn_id="t1", role="user", text="hi")
    assert len(await msgs.list("alice", "ses_1")) == 1
    assert await msgs.list("mallory", "ses_1") == []
    wire = (await msgs.list("alice", "ses_1"))[0]
    assert validate_contract("SessionMessage", wire) == []


def test_json_pointer():
    assert set_json_pointer({}, "/a/b", 1) == {"a": {"b": 1}}
    assert set_json_pointer({"rows": [1, 2]}, "/rows/-", 3) == {"rows": [1, 2, 3]}
    assert set_json_pointer({"rows": [1, 2]}, "/rows/0", 9) == {"rows": [9, 2]}
    assert set_json_pointer({"x": 1}, "", {"y": 2}) == {"y": 2}
    assert set_json_pointer({}, "/a~1b/c~0d", 1) == {"a/b": {"c~d": 1}}
    with pytest.raises(ValueError):
        set_json_pointer({"rows": []}, "/rows/5", 1)
    with pytest.raises(ValueError):
        set_json_pointer({"rows": []}, "/rows/x", 1)


async def test_surface_snapshot_applies_messages_in_order(db):
    surfaces = SurfaceRepository(db)
    create = {
        "version": "1.0",
        "createSurface": {
            "surfaceId": "srf_1",
            "catalogId": "urn:forge:a2ui:catalog:ember:1",
            "components": [
                {"id": "root", "component": "Column", "children": ["t"]},
                {"id": "t", "component": "Text", "text": "a"},
            ],
            "dataModel": {"rows": []},
        },
    }
    await surfaces.apply(user_id="alice", session_id="ses_1", turn_id="t1", message=create, title="Sales")
    await surfaces.apply(
        user_id="alice",
        session_id="ses_1",
        turn_id="t1",
        message={
            "version": "1.0",
            "updateComponents": {
                "surfaceId": "srf_1",
                "components": [
                    {"id": "t", "component": "Text", "text": "b"},
                    {"id": "u", "component": "Text", "text": "c"},
                ],
            },
        },
    )
    await surfaces.apply(
        user_id="alice",
        session_id="ses_1",
        turn_id="t1",
        message={"version": "1.0", "updateDataModel": {"surfaceId": "srf_1", "path": "/rows/-", "value": {"r": 1}}},
    )
    snap = await surfaces.get("alice", "ses_1", "srf_1")
    assert [c["id"] for c in snap["components"]] == ["root", "t", "u"]
    assert snap["components"][1]["text"] == "b"
    assert snap["data_model"] == {"rows": [{"r": 1}]}
    assert snap["version"] == 2
    wire = (await surfaces.list("alice", "ses_1"))[0]
    assert validate_contract("StoredSurface", wire) == []

    # another tenant can neither read nor hijack the surface id
    assert await surfaces.list("mallory", "ses_1") == []
    with pytest.raises(OsHTTPError) as exc:
        await surfaces.apply(user_id="mallory", session_id="ses_9", turn_id="t", message=create)
    assert exc.value.status == 409
    with pytest.raises(OsHTTPError):
        await surfaces.apply(
            user_id="mallory",
            session_id="ses_1",
            turn_id="t",
            message={"version": "1.0", "updateDataModel": {"surfaceId": "srf_1", "value": {}}},
        )

    await surfaces.apply(
        user_id="alice", session_id="ses_1", turn_id="t1", message={"version": "1.0", "deleteSurface": {"surfaceId": "srf_1"}}
    )
    assert await surfaces.get("alice", "ses_1", "srf_1") is None


async def test_surface_data_model_size_cap(db):
    surfaces = SurfaceRepository(db)
    big = {"version": "1.0", "createSurface": {"surfaceId": "srf_big", "catalogId": "urn:forge:a2ui:catalog:ember:1", "dataModel": {"x": "y" * (3 * 1024 * 1024)}}}
    with pytest.raises(ValueError):
        await surfaces.apply(user_id="alice", session_id="s", turn_id="t", message=big)


async def test_workspace_optimistic_concurrency_and_isolation(db):
    repo = WorkspaceRepository(db)
    ws = await repo.get_current("alice")
    assert validate_contract("WorkspaceState", ws) == []
    assert (await repo.get_current("alice"))["id"] == ws["id"]  # stable

    saved = await repo.put("alice", ws["id"], {**ws, "nav_collapsed": True})
    assert saved["version"] == 1 and saved["nav_collapsed"] is True

    with pytest.raises(OsHTTPError) as exc:
        await repo.put("alice", ws["id"], {**ws, "layout": "tiled"})  # stale version 0
    assert exc.value.status == 409
    assert exc.value.extra["current"]["version"] == 1

    with pytest.raises(OsHTTPError) as exc:
        await repo.put("mallory", ws["id"], {**saved})
    assert exc.value.status == 404
    other = await repo.get_current("mallory")
    assert other["id"] != ws["id"]


def test_iso_is_contract_timestamp():
    ts = iso()
    assert ts.endswith("Z") and 10 <= len(ts) <= 40
