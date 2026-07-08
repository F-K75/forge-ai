#!/usr/bin/env python3
"""
MongoDB backup verification and integrity checking.

Verifies that a mongodump-produced backup directory is structurally sound
and contains the expected metadata before it is relied on for restore.

Usage:
    python scripts/backup_verify.py /backups/mongodb/20260708_020000
    python scripts/backup_verify.py /backups/mongodb/latest   # symlink or most-recent dir
    python scripts/backup_verify.py --json /backups/mongodb/20260708_020000

Exit codes:
    0 — backup is valid
    1 — backup is missing, corrupt, or incomplete
    2 — unexpected error (wrong path type, permission error, etc.)
"""
from __future__ import annotations

import argparse
import datetime
import gzip
import hashlib
import json
import os
import sys
from typing import List, Optional, Tuple

# Expected top-level entries inside a mongodump --gzip output directory.
# mongodump writes one sub-directory per database under the output root.
# Each database directory contains one .json.gz file per collection plus an
# optional .metadata.json.gz for the collection schema.
MIN_EXPECTED_DBS = 1  # at least one database directory must exist


class BackupVerificationError(Exception):
    """Raised when a backup fails a structural integrity check."""


def _sha256_file(path: str, chunk_size: int = 1 << 20) -> str:
    """Compute the SHA-256 hex digest of a file without loading it all in memory."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _list_backup_contents(backup_dir: str) -> List[str]:
    """Return relative paths of all entries inside *backup_dir*.

    Raises BackupVerificationError if *backup_dir* is not a directory or
    cannot be read.
    """
    if not os.path.isdir(backup_dir):
        raise BackupVerificationError(f"Backup path is not a directory: {backup_dir}")
    try:
        return os.listdir(backup_dir)
    except OSError as exc:
        raise BackupVerificationError(f"Cannot read backup directory: {exc}") from exc


def _validate_database_dirs(entries: List[str], backup_dir: str) -> Tuple[List[str], List[str]]:
    """Validate the top-level structure of a mongodump output directory.

    Returns (valid_db_dirs, problematic_files) where *valid_db_dirs* are
    sub-directories that look like database dumps and *problematic_files*
    are top-level regular files (not expected in a clean dump).
    """
    db_dirs: List[str] = []
    problematic: List[str] = []
    for entry in entries:
        full_path = os.path.join(backup_dir, entry)
        if os.path.isdir(full_path):
            db_dirs.append(entry)
        elif os.path.isfile(full_path):
            problematic.append(entry)
    return db_dirs, problematic


def _validate_collection_file(file_path: str) -> Optional[str]:
    """Validate a single .json.gz collection dump file.

    Attempts to decompress the first JSON document to confirm the file is
    not corrupt. Returns the SHA-256 hex digest on success, or ``None`` if
    the file cannot be validated (it is skipped silently so the caller can
    decide whether to treat that as a hard failure).
    """
    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as gz:
            # Read just the first non-empty line to confirm the file is valid
            # JSON — we do not parse the whole file because large collections
            # would consume too much memory here.
            for line in gz:
                line = line.strip()
                if line:
                    json.loads(line)
                    break
            else:
                # Empty file is suspicious but not necessarily corrupt
                return None
    except (OSError, gzip.BadGzipFile, json.JSONDecodeError):
        return None
    return _sha256_file(file_path)


def verify_backup(backup_dir: str, *, min_dbs: int = MIN_EXPECTED_DBS) -> dict:
    """Run all structural integrity checks against *backup_dir*.

    Returns a verification report dict with the following keys:

    - ``valid`` (bool): overall pass/fail
    - ``backup_dir`` (str): the directory that was checked
    - ``checked_at`` (str): ISO-8601 UTC timestamp
    - ``database_count`` (int): number of database sub-directories found
    - ``total_collection_files`` (int): number of .json.gz files validated
    - ``corrupt_files`` (list[str]): paths of files that failed validation
    - ``unexpected_top_level_files`` (list[str]): regular files directly
      under *backup_dir* (only present when non-empty)
    - ``errors`` (list[str]): human-readable failure reasons (empty on pass)

    Raises ``BackupVerificationError`` only for unrecoverable path-level
    errors (not a directory, permission denied).
    """
    errors: List[str] = []
    corrupt_files: List[str] = []
    unexpected_files: List[str] = []
    total_collection_files = 0

    entries = _list_backup_contents(backup_dir)
    db_dirs, problematic_files = _validate_database_dirs(entries, backup_dir)

    if problematic_files:
        unexpected_files = problematic_files

    if len(db_dirs) < min_dbs:
        errors.append(
            f"Expected at least {min_dbs} database directory(ies), found {len(db_dirs)}: {db_dirs}"
        )

    for db_name in sorted(db_dirs):
        db_path = os.path.join(backup_dir, db_name)
        if not os.path.isdir(db_path):
            continue
        try:
            collection_files = [
                f
                for f in os.listdir(db_path)
                if f.endswith(".json.gz") and os.path.isfile(os.path.join(db_path, f))
            ]
        except OSError as exc:
            errors.append(f"Cannot list database directory {db_name}: {exc}")
            continue

        total_collection_files += len(collection_files)
        for coll_file in collection_files:
            full_path = os.path.join(db_path, coll_file)
            checksum = _validate_collection_file(full_path)
            if checksum is None:
                corrupt_files.append(full_path)

    if corrupt_files:
        errors.append(f"{len(corrupt_files)} collection file(s) failed validation")

    valid = len(errors) == 0
    return {
        "valid": valid,
        "backup_dir": backup_dir,
        "checked_at": datetime.datetime.utcnow().isoformat() + "Z",
        "database_count": len(db_dirs),
        "total_collection_files": total_collection_files,
        "corrupt_files": corrupt_files,
        "unexpected_top_level_files": unexpected_files,
        "errors": errors,
    }


# Path to the parent directory that holds backup timestamp directories.
# Defaults to "/backups/mongodb" in production; tests override this attribute.
BACKUP_PARENT_DIR = "/backups/mongodb"


def resolve_backup_path(path: str) -> str:
    """Resolve *path* to an absolute path.

    If *path* is ``"latest"``, the most-recently-modified sub-directory of
    the parent ``/backups/mongodb`` directory is returned.
    """
    if path == "latest":
        parent = BACKUP_PARENT_DIR
        if not os.path.isdir(parent):
            raise BackupVerificationError(f"Backup parent directory does not exist: {parent}")
        candidates = [
            os.path.join(parent, d)
            for d in os.listdir(parent)
            if os.path.isdir(os.path.join(parent, d))
        ]
        if not candidates:
            raise BackupVerificationError(f"No backup directories found in {parent}")
        return max(candidates, key=os.path.getmtime)
    return os.path.abspath(path)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify the structural integrity of a MongoDB backup directory."
    )
    parser.add_argument(
        "backup_path",
        help="Path to a mongodump output directory, or 'latest' for the most recent backup.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the verification report as JSON instead of human-readable text.",
    )
    parser.add_argument(
        "--min-dbs",
        type=int,
        default=MIN_EXPECTED_DBS,
        help=f"Minimum number of database directories expected (default: {MIN_EXPECTED_DBS}).",
    )
    args = parser.parse_args(argv)

    try:
        backup_dir = resolve_backup_path(args.backup_path)
    except BackupVerificationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    report = verify_backup(backup_dir, min_dbs=args.min_dbs)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        _print_report(report)

    return 0 if report["valid"] else 1


def _print_report(report: dict) -> None:
    status = "PASS" if report["valid"] else "FAIL"
    print(f"[{status}] Backup verification: {report['backup_dir']}")
    print(f"  Checked at  : {report['checked_at']}")
    print(f"  Databases   : {report['database_count']}")
    print(f"  Collections : {report['total_collection_files']}")
    if report["corrupt_files"]:
        print(f"  Corrupt files ({len(report['corrupt_files'])}):")
        for path in report["corrupt_files"]:
            print(f"    - {path}")
    if report["unexpected_top_level_files"]:
        print("  Unexpected top-level files:")
        for path in report["unexpected_top_level_files"]:
            print(f"    - {path}")
    if report["errors"]:
        print("  Errors:")
        for err in report["errors"]:
            print(f"    - {err}")


if __name__ == "__main__":
    sys.exit(main())
