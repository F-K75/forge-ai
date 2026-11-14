#!/usr/bin/env python3
"""Automated MongoDB backup script for Forge AI.

Creates timestamped gzipped ``mongodump`` backups in ``BACKUP_DIR`` (default
``/backups``), updates the ``latest`` symlink, writes a SHA-256 ``manifest.json``
for verification, and prunes backups older than ``BACKUP_RETENTION_DAYS``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import os
import re
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
logger = logging.getLogger("backup_mongodb")

BACKUP_PREFIX = "backup_"


def redact_uri(uri: str) -> str:
    """Mask credentials in a MongoDB connection URI before logging."""
    return re.sub(r"(://[^/:]+:)[^@]+(@)", r"\1***\2", uri)


def notify_failure(webhook_url: str, message: str) -> None:
    """Best-effort webhook notification when a backup fails."""
    if not webhook_url:
        return
    payload = json.dumps(
        {
            "service": "forge-backup",
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


def build_manifest(backup_path: Path) -> dict:
    """Create a checksum manifest for all files under ``backup_path``."""
    files: dict[str, dict[str, object]] = {}
    for item in sorted(backup_path.rglob("*")):
        if item.is_file() and item.name != "manifest.json":
            rel = item.relative_to(backup_path).as_posix()
            files[rel] = {
                "size": item.stat().st_size,
                "sha256": sha256_file(item),
            }
    return {
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "file_count": len(files),
        "files": files,
    }


def update_latest_symlink(backup_dir: Path, target_dir: Path) -> None:
    """Atomically point ``<backup_dir>/latest`` to ``target_dir.name``."""
    latest_link = backup_dir / "latest"
    tmp_link = backup_dir / f".latest.tmp.{os.getpid()}"
    if tmp_link.exists() or tmp_link.is_symlink():
        tmp_link.unlink()
    os.symlink(target_dir.name, tmp_link)
    os.replace(tmp_link, latest_link)


def prune_old_backups(
    backup_dir: Path,
    retention_days: int,
    dry_run: bool = False,
) -> list[Path]:
    """Remove ``backup_*`` directories older than ``retention_days``."""
    if retention_days <= 0:
        return []
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=retention_days)
    removed: list[Path] = []
    for entry in sorted(backup_dir.iterdir()):
        if not entry.is_dir() or entry.is_symlink():
            continue
        if not entry.name.startswith(BACKUP_PREFIX):
            continue
        mtime = dt.datetime.fromtimestamp(entry.stat().st_mtime, tz=dt.timezone.utc)
        if mtime < cutoff:
            if dry_run:
                logger.info("[dry-run] Would prune expired backup: %s", entry)
            else:
                shutil.rmtree(entry)
                logger.info("Pruned expired backup: %s", entry)
            removed.append(entry)
    return removed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a MongoDB backup using mongodump and prune old backups.",
    )
    parser.add_argument(
        "--uri",
        default=os.environ.get("MONGODB_URL", ""),
        help="MongoDB connection URI (defaults to MONGODB_URL env var).",
    )
    parser.add_argument(
        "--backup-dir",
        default=os.environ.get("BACKUP_DIR", "/backups"),
        help="Directory to store backups (defaults to BACKUP_DIR or /backups).",
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=int(os.environ.get("BACKUP_RETENTION_DAYS", "30")),
        help="Days to retain backups before pruning (default: 30).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log planned actions without running mongodump or modifying files.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    webhook_url = os.environ.get("BACKUP_FAILURE_WEBHOOK_URL", "")
    backup_dir = Path(args.backup_dir)

    if not args.uri and not args.dry_run:
        msg = "MONGODB_URL environment variable or --uri is required"
        logger.error(msg)
        notify_failure(webhook_url, msg)
        return 1

    mongodump_bin = shutil.which("mongodump")
    if not mongodump_bin and not args.dry_run:
        msg = "mongodump binary not found in PATH"
        logger.error(msg)
        notify_failure(webhook_url, msg)
        return 2

    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d_%H%M%S")
    target_dir = backup_dir / f"{BACKUP_PREFIX}{timestamp}"
    safe_uri = redact_uri(args.uri) if args.uri else "<unset>"

    if args.dry_run:
        logger.info("[dry-run] Would ensure backup dir exists: %s", backup_dir)
        logger.info(
            "[dry-run] Would run: %s --uri %s --out %s --gzip",
            mongodump_bin or "mongodump",
            safe_uri,
            target_dir,
        )
        logger.info("[dry-run] Would update symlink %s -> %s", backup_dir / "latest", target_dir.name)
        if backup_dir.exists():
            prune_old_backups(backup_dir, args.retention_days, dry_run=True)
        return 0

    backup_dir.mkdir(parents=True, exist_ok=True)
    staging_dir = backup_dir / f".staging_{timestamp}_{os.getpid()}"
    staging_dir.mkdir(parents=True, exist_ok=True)

    try:
        logger.info("Starting MongoDB backup to %s (uri=%s)", target_dir, safe_uri)
        result = subprocess.run(
            [mongodump_bin, "--uri", args.uri, "--out", str(staging_dir), "--gzip"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "unknown mongodump error").strip()
            raise RuntimeError(f"mongodump exited with {result.returncode}: {err}")

        manifest = build_manifest(staging_dir)
        if manifest["file_count"] == 0:
            raise RuntimeError("mongodump produced zero backup files")

        (staging_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(staging_dir, target_dir)
        update_latest_symlink(backup_dir, target_dir)
        logger.info(
            "Backup completed: %s (%d files)",
            target_dir,
            manifest["file_count"],
        )
        prune_old_backups(backup_dir, args.retention_days, dry_run=False)
        return 0
    except Exception as exc:
        logger.error("Backup failed: %s", exc)
        shutil.rmtree(staging_dir, ignore_errors=True)
        notify_failure(webhook_url, str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
