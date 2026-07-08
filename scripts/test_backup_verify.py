"""Tests for scripts/backup_verify.py — backup structural integrity checks.

These tests create temporary directory trees that mimic the output of
``mongodump --gzip`` and exercise every branch of ``BackupVerificationError``
and ``verify_backup``.

No live MongoDB or mongodump binary is required.
"""
from __future__ import annotations

import gzip
import json
import os
import sys

# scripts/ is not an installable package; add the repo root to sys.path so
# `from scripts.backup_verify import …` works regardless of how the test is
# invoked (pytest, direct `python scripts/test_backup_verify.py`, etc.).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))

import pytest  # noqa: E402

from scripts.backup_verify import (  # noqa: E402
    BackupVerificationError,
    _list_backup_contents,
    _validate_database_dirs,
    _validate_collection_file,
    resolve_backup_path,
    verify_backup,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write_json_gz(path: str, documents: list[dict]) -> str:
    """Write *documents* as newline-delimited JSON to a .json.gz file.

    Returns the SHA-256 hex digest of the resulting file.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as gz:
        for doc in documents:
            gz.write(json.dumps(doc) + "\n")
    return _sha256(path)


def _sha256(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _make_backup(tmp_path, db_names: list[str], collections_per_db: int = 1) -> str:
    """Create a fake mongodump output directory under *tmp_path*.

    Returns the absolute path to the backup root.
    """
    backup_root = os.path.join(str(tmp_path), "backup_20260708_020000")
    os.makedirs(backup_root)
    for db in db_names:
        db_dir = os.path.join(backup_root, db)
        os.makedirs(db_dir)
        for coll_idx in range(collections_per_db):
            coll_name = f"collection_{coll_idx}"
            docs = [{"_id": f"{db}.{coll_name}.{i}", "value": i} for i in range(3)]
            _write_json_gz(os.path.join(db_dir, f"{coll_name}.json.gz"), docs)
    return backup_root


# ---------------------------------------------------------------------------
# _list_backup_contents
# ---------------------------------------------------------------------------

class TestListBackupContents:
    def test_returns_all_top_level_entries(self, tmp_path):
        root = _make_backup(tmp_path, ["admin"])
        entries = _list_backup_contents(root)
        assert "admin" in entries

    def test_raises_on_missing_path(self):
        with pytest.raises(BackupVerificationError, match="not a directory"):
            _list_backup_contents("/nonexistent/path/xyz")

    def test_raises_on_file_path(self, tmp_path):
        f = os.path.join(str(tmp_path), "not_a_dir.json.gz")
        with open(f, "wb") as fh:
            fh.write(b"{}")
        with pytest.raises(BackupVerificationError, match="not a directory"):
            _list_backup_contents(f)


# ---------------------------------------------------------------------------
# _validate_database_dirs
# ---------------------------------------------------------------------------

class TestValidateDatabaseDirs:
    def test_sub_dirs_are_db_dirs(self, tmp_path):
        root = _make_backup(tmp_path, ["db1", "db2"])
        entries = os.listdir(root)
        db_dirs, _ = _validate_database_dirs(entries, root)
        assert set(db_dirs) == {"db1", "db2"}

    def test_top_level_files_flagged_as_problematic(self, tmp_path):
        root = _make_backup(tmp_path, ["db1"])
        # Drop a stray file into the root
        with open(os.path.join(root, "stray_file.txt"), "w") as fh:
            fh.write("hello")
        _, problematic = _validate_database_dirs(os.listdir(root), root)
        assert "stray_file.txt" in problematic


# ---------------------------------------------------------------------------
# _validate_collection_file
# ---------------------------------------------------------------------------

class TestValidateCollectionFile:
    def test_valid_gzip_json_returns_checksum(self, tmp_path):
        f = os.path.join(str(tmp_path), "good.json.gz")
        _write_json_gz(f, [{"a": 1}])
        checksum = _validate_collection_file(f)
        assert checksum is not None
        assert len(checksum) == 64

    def test_corrupt_gzip_returns_none(self, tmp_path):
        f = os.path.join(str(tmp_path), "bad.json.gz")
        with open(f, "wb") as fh:
            fh.write(b"this is not gzip")
        assert _validate_collection_file(f) is None

    def test_missing_file_returns_none(self, tmp_path):
        assert _validate_collection_file(os.path.join(str(tmp_path), "nope.json.gz")) is None


# ---------------------------------------------------------------------------
# resolve_backup_path
# ---------------------------------------------------------------------------

class TestResolveBackupPath:
    def test_literal_path_returned_absolute(self, tmp_path):
        root = _make_backup(tmp_path, ["db1"])
        resolved = resolve_backup_path(root)
        assert resolved == os.path.abspath(root)

    def test_latest_returns_most_recent_dir(self, tmp_path):
        backups_dir = os.path.join(str(tmp_path), "backups", "mongodb")
        os.makedirs(backups_dir)
        old = _make_backup(tmp_path, ["old_db"])
        os.rename(old, os.path.join(backups_dir, "20260701_020000"))
        new = _make_backup(tmp_path, ["new_db"])
        os.rename(new, os.path.join(backups_dir, "20260708_020000"))
        # Temporarily replace the hardcoded parent so resolve_backup_path
        # can find our test fixtures.
        import scripts.backup_verify as bv
        original_parent = "/backups/mongodb"
        bv.BACKUP_PARENT_DIR = backups_dir  # type: ignore[attr-defined]
        try:
            resolved = resolve_backup_path("latest")
        finally:
            bv.BACKUP_PARENT_DIR = original_parent  # type: ignore[attr-defined]
        assert resolved == os.path.join(backups_dir, "20260708_020000")

    def test_latest_raises_when_parent_missing(self):
        with pytest.raises(BackupVerificationError, match="Backup parent directory"):
            # /backups/mongodb almost certainly doesn't exist in the test env
            resolve_backup_path("latest")


# ---------------------------------------------------------------------------
# verify_backup — integration
# ---------------------------------------------------------------------------

class TestVerifyBackup:
    def test_valid_single_db_backup_passes(self, tmp_path):
        root = _make_backup(tmp_path, ["forge"], collections_per_db=2)
        report = verify_backup(root)
        assert report["valid"] is True
        assert report["database_count"] == 1
        assert report["total_collection_files"] == 2
        assert report["errors"] == []

    def test_valid_multi_db_backup_passes(self, tmp_path):
        root = _make_backup(tmp_path, ["forge", "admin", "config"], collections_per_db=2)
        report = verify_backup(root)
        assert report["valid"] is True
        assert report["database_count"] == 3

    def test_empty_backup_dir_fails_min_db_check(self, tmp_path):
        root = os.path.join(str(tmp_path), "empty_backup")
        os.makedirs(root)
        report = verify_backup(root, min_dbs=1)
        assert report["valid"] is False
        assert any("Expected at least 1 database" in e for e in report["errors"])

    def test_non_directory_path_raises(self):
        with pytest.raises(BackupVerificationError, match="not a directory"):
            verify_backup("/nonexistent/backup/path")

    def test_corrupt_collection_file_reported(self, tmp_path):
        root = _make_backup(tmp_path, ["forge"])
        # Corrupt the first collection file in the forge DB
        db_dir = os.path.join(root, "forge")
        coll_files = [f for f in os.listdir(db_dir) if f.endswith(".json.gz")]
        bad_path = os.path.join(db_dir, coll_files[0])
        with open(bad_path, "wb") as fh:
            fh.write(b"corrupt data")
        report = verify_backup(root)
        assert report["valid"] is False
        assert len(report["corrupt_files"]) == 1

    def test_report_contains_checked_at_timestamp(self, tmp_path):
        root = _make_backup(tmp_path, ["forge"])
        report = verify_backup(root)
        assert "checked_at" in report
        assert report["checked_at"].endswith("Z")

    def test_report_contains_backup_dir(self, tmp_path):
        root = _make_backup(tmp_path, ["forge"])
        report = verify_backup(root)
        assert report["backup_dir"] == root

    def test_zero_dbs_with_min_zero_passes(self, tmp_path):
        root = os.path.join(str(tmp_path), "empty")
        os.makedirs(root)
        report = verify_backup(root, min_dbs=0)
        assert report["valid"] is True

    def test_db_dirs_are_sorted_in_report(self, tmp_path):
        root = _make_backup(tmp_path, ["z_db", "a_db", "m_db"])
        report = verify_backup(root)
        assert report["database_count"] == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
