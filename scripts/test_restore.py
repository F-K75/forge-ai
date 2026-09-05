#!/usr/bin/env python3
"""End-to-end backup/restore verification.

Spins up a temporary MongoDB via ``mongod`` if available, or uses a live
instance pointed at ``TEST_MONGODB_URL``. The script:

1. Writes known test data to a scratch database.
2. Runs ``mongodump`` to create a backup.
3. Drops the scratch database.
4. Runs ``mongorestore`` to restore the backup.
5. Reads the data back and compares it to the original.

Exit codes:
    0 — restore produced byte-for-byte-equivalent data
    1 — restore produced different data, or dump/restore failed
    2 — unexpected error (missing ``mongod``/``mongorestore``, etc.)
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BIN_MONGODUMP = "mongodump"
BIN_MONGORESTORE = "mongorestore"
BIN_MONGOD = "mongod"


def _must_find(name: str) -> str:
    path = shutil.which(name)
    if not path:
        print(f"ERROR: {name} not found in PATH", file=sys.stderr)
        sys.exit(2)
    return path


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        print(f"COMMAND FAILED: {' '.join(cmd)}", file=sys.stderr)
        if result.stderr:
            print(result.stderr, file=sys.stderr)
    return result


def _wait_for_mongo(uri: str, timeout: float = 30.0) -> bool:
    import pymongo  # type: ignore[import-untyped]
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=500)
            client.admin.command("ping")
            client.close()
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _start_local_mongo(data_dir: Path, port: int = 27018) -> tuple[subprocess.Popen, str]:
    mongod = _must_find(BIN_MONGOD)
    cmd = [
        mongod,
        "--dbpath",
        str(data_dir),
        "--port",
        str(port),
        "--bind_ip",
        "127.0.0.1",
        "--fork",
        "--logpath",
        str(data_dir / "mongod.log"),
        "--pidfilepath",
        str(data_dir / "mongod.pid"),
    ]
    result = _run(cmd)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(2)
    uri = f"mongodb://127.0.0.1:{port}/test_db?replicaSet=rs0&authSource=admin"
    if not _wait_for_mongo(uri):
        print("ERROR: local MongoDB did not become ready in time", file=sys.stderr)
        sys.exit(2)
    return None, uri  # Popen returned as None because we used --fork


def _stop_local_mongo(data_dir: Path) -> None:
    pid_file = data_dir / "mongod.pid"
    if pid_file.exists():
        try:
            with open(pid_file) as fh:
                pid = int(fh.read().strip())
            os.kill(pid, 0)  # check alive
            os.kill(pid, 15)  # SIGTERM
            time.sleep(1)
        except (ProcessLookupError, ValueError, OSError):
            pass


def _insert_test_data(uri: str) -> list[dict]:
    import pymongo  # type: ignore[import-untyped]
    client = pymongo.MongoClient(uri)
    db = client["test_db"]
    docs = [
        {"_id": f"doc_{i}", "value": i, "label": f"test-{i}"}
        for i in range(20)
    ]
    db.restore_test_collection.insert_many(docs)
    client.close()
    return sorted(docs, key=lambda d: d["_id"])


def _read_restored_data(uri: str) -> list[dict]:
    import pymongo  # type: ignore[import-untyped]
    client = pymongo.MongoClient(uri)
    db = client["test_db"]
    docs = list(db.restore_test_collection.find({}, {"_id": 0}).sort("_id", 1))
    client.close()
    return docs


def main() -> int:
    mongodump = _must_find(BIN_MONGODUMP)
    mongorestore = _must_find(BIN_MONGORESTORE)

    uri = os.environ.get("TEST_MONGODB_URL")
    tmpdir = Path(tempfile.mkdtemp(prefix="restore_test_"))
    local = False

    if not uri:
        local = True
        print("TEST_MONGODB_URL not set — starting local mongod")
        _start_local_mongo(tmpdir)
        uri = f"mongodb://127.0.0.1:27018/test_db"

    if not _wait_for_mongo(uri):
        print(f"ERROR: MongoDB at {uri} is not reachable", file=sys.stderr)
        if local:
            _stop_local_mongo(tmpdir)
        return 2

    backup_dir = tmpdir / "backup"
    backup_dir.mkdir()

    try:
        original_docs = _insert_test_data(uri)
        print(f"Inserted {len(original_docs)} test documents")

        dump = _run([mongodump, "--uri", uri, "--out", str(backup_dir)])
        if dump.returncode != 0:
            print(dump.stderr, file=sys.stderr)
            return 1
        print("mongodump completed")

        import pymongo  # type: ignore[import-untyped]
        client = pymongo.MongoClient(uri)
        client.drop_database("test_db")
        client.close()
        print("Dropped test_db")

        restore = _run([mongorestore, "--uri", uri, str(backup_dir / "test_db")])
        if restore.returncode != 0:
            print(restore.stderr, file=sys.stderr)
            return 1
        print("mongorestore completed")

        restored_docs = _read_restored_data(uri)

        # Normalize for comparison (strip ObjectIds if present)
        def normalize(docs: list[dict]) -> list[dict]:
            out = []
            for d in docs:
                nd = {k: v for k, v in d.items() if k != "_id"}
                out.append(nd)
            return out

        if normalize(original_docs) == normalize(restored_docs):
            print("SUCCESS: Restored data matches original")
            return 0

        print("FAILURE: Restored data does not match original", file=sys.stderr)
        print(f"Original ({len(original_docs)} docs):", file=sys.stderr)
        print(json.dumps(original_docs[:5], indent=2), file=sys.stderr)
        print(f"Restored ({len(restored_docs)} docs):", file=sys.stderr)
        print(json.dumps(restored_docs[:5], indent=2), file=sys.stderr)
        return 1

    finally:
        if local:
            _stop_local_mongo(tmpdir)
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
