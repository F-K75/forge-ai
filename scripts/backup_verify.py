#!/usr/bin/env python3
"""Backup verification script for Forge AI MongoDB backups.

Validates that a backup directory (defaulting to ``<BACKUP_DIR>/latest``) exists,
is fresh, contains valid BSON/gzipped BSON files, and passes SHA-256 manifest
integrity checks. Optionally runs ``mongorestore --dryRun`` when ``--live`` is
provided with a target ``MONGODB_URL``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("backup_verify")


def notify_failure(webhook_url: str, message: str) -> None:
    """Best-effort webhook notification when backup verification fails."""
    if not webhook_url:
        return
    payload = json.dumps(
        {
            "service": "forge-backup-verify",
            "status": "failed",
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "message": message,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Failure webhook delivered (status=%s)", resp.status)
    except (urllib.error.URLError, OSError) as exc:
        logger.warning("Failed to deliver failure webhook: %s", exc)


def sha256_file(path: Path) -> str:
    """Compute hex SHA-256 digest for a file."""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_gzip_file(path: Path) -> None:
    """Stream-read a .gz file to ensure its gzip framing and CRC are valid."""
    with gzip.open(path, "rb") as gz:
        while gz.read(65536):
            pass


def verify_backup_dir(
    backup_path: Path,
    max_age_hours: float = 36.0,
) -> tuple[int, list[str]]:
    """Verify backup directory contents, freshness, and manifest checksums."""
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup path does not exist: {backup_path}")

    resolved = backup_path.resolve()
    if not resolved.is_dir():
        raise NotADirectoryError(f"Backup path is not a directory: {resolved}")

    age_hours = (
        dt.datetime.now(dt.timezone.utc)
        - dt.datetime.fromtimestamp(resolved.stat().st_mtime, tz=dt.timezone.utc)
    ).total_seconds() / 3600.0
    if max_age_hours > 0 and age_hours > max_age_hours:
        raise RuntimeError(
            f"Backup {resolved} is stale ({age_hours:.1f}h old, max {max_age_hours:.1f}h)"
        )

    bson_files = [
        p
        for p in sorted(resolved.rglob("*"))
        if p.is_file() and (p.name.endswith(".bson") or p.name.endswith(".bson.gz"))
    ]
    if not bson_files:
        raise RuntimeError(f"No .bson or .bson.gz files found in {resolved}")

    manifest_path = resolved / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_files = manifest.get("files", {})
        if not manifest_files:
            raise RuntimeError("manifest.json contains no file entries")
        for rel_path, meta in manifest_files.items():
            file_path = resolved / rel_path
            if not file_path.is_file():
                raise FileNotFoundError(f"Missing file listed in manifest: {rel_path}")
            expected_hash = meta.get("sha256")
            if expected_hash:
                actual_hash = sha256_file(file_path)
                if actual_hash != expected_hash:
                    raise RuntimeError(
                        f"Checksum mismatch for {rel_path}: expected {expected_hash}, got {actual_hash}"
                    )

    for bf in bson_files:
        if bf.name.endswith(".gz"):
            verify_gzip_file(bf)

    return len(bson_files), [bf.relative_to(resolved).as_posix() for bf in bson_files]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    default_path = str(Path(os.environ.get("BACKUP_DIR", "/backups")) / "latest")
    parser = argparse.ArgumentParser(
        description="Verify integrity of a MongoDB backup directory.",
    )
    parser.add_argument(
        "backup_path",
        nargs="?",
        default=default_path,
        help=f"Path to backup directory or symlink (default: {default_path}).",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=float(os.environ.get("BACKUP_MAX_AGE_HOURS", "36")),
        help="Maximum allowed age in hours before failing (0 disables check, default: 36).",
    )
    parser.add_argument(
        "--uri",
        default=os.environ.get("MONGODB_URL", ""),
        help="MongoDB URI for optional mongorestore --dryRun check.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Run mongorestore --dryRun against --uri / MONGODB_URL.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print verification plan without checking files or invoking tools.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    webhook_url = os.environ.get("BACKUP_FAILURE_WEBHOOK_URL", "")
    backup_path = Path(args.backup_path)

    if args.dry_run:
        logger.info("[dry-run] Would verify backup path: %s", backup_path)
        logger.info("[dry-run] Max age hours: %s", args.max_age_hours)
        if args.live:
            logger.info("[dry-run] Would run mongorestore --dryRun against configured URI")
        return 0

    try:
        count, sample = verify_backup_dir(backup_path, max_age_hours=args.max_age_hours)
        logger.info(
            "Verified backup %s (%d BSON file(s), first=%s)",
            backup_path.resolve(),
            count,
            sample[0],
        )

        if args.live:
            if not args.uri:
                raise RuntimeError("--live requires --uri or MONGODB_URL")
            mongorestore_bin = shutil.which("mongorestore")
            if not mongorestore_bin:
                raise RuntimeError("mongorestore binary not found in PATH")
            cmd = [mongorestore_bin, "--uri", args.uri, "--dryRun", "--gzip", str(backup_path.resolve())]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                err = (result.stderr or result.stdout or "mongorestore --dryRun failed").strip()
                raise RuntimeError(err)
            logger.info("mongorestore --dryRun succeeded")

        return 0
    except Exception as exc:
        logger.error("Backup verification failed: %s", exc)
        notify_failure(webhook_url, str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
