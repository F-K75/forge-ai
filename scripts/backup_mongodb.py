#!/usr/bin/env python3
"""
MongoDB backup script - should be run via cron or scheduled task.

Runs standalone (no backend imports) so it works inside the backup
container, which mounts only ./scripts. Configuration comes from the
environment, matching docker-compose.prod.yml / .staging.yml:

    MONGODB_URL           full mongodb connection string incl. credentials (see .env)
    BACKUP_RETENTION_DAYS number of days to keep backups (default: 7)
    BACKUP_FAILURE_WEBHOOK_URL
                          optional URL to notify on backup failure (e.g. the
                          monitoring webhook). Receives a small JSON POST
                          {"text": ..., "ok": false} (stdlib urllib only).

On success the newest backup directory is symlinked to /backups/latest
so the verification cron job can always verify the freshest backup.
"""
import datetime
import json
import os
import subprocess
import sys
import urllib.request

BACKUP_ROOT = "/backups/mongodb"
LATEST_LINK = "/backups/latest"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _notify_failure(message: str) -> None:
    """Best-effort POST to BACKUP_FAILURE_WEBHOOK_URL. Never raises."""
    url = os.environ.get("BACKUP_FAILURE_WEBHOOK_URL", "")
    if not url:
        return
    payload = json.dumps(
        {"text": f"MongoDB backup failed: {message}", "ok": False}
    ).encode()
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as exc:  # noqa: BLE001 - alerting must never crash the job
        print(f"Warning: failed to notify backup webhook: {exc}", file=sys.stderr)


def backup_mongodb() -> int:
    """Create a MongoDB backup using mongodump. Returns process exit code."""
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(BACKUP_ROOT, timestamp)

    mongo_url = os.environ.get("MONGODB_URL", "")
    if not mongo_url:
        message = "MONGODB_URL is not set"
        print(f"Backup failed: {message}", file=sys.stderr)
        _notify_failure(message)
        return 1

    os.makedirs(BACKUP_ROOT, exist_ok=True)

    cmd = [
        "mongodump",
        "--uri", mongo_url,
        "--out", backup_dir,
        "--gzip"
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        message = "mongodump is not installed"
        print(f"Backup failed: {message}", file=sys.stderr)
        _notify_failure(message)
        return 1

    if result.returncode == 0:
        print(f"Backup completed: {backup_dir}")
        try:
            os.symlink(backup_dir, LATEST_LINK + ".tmp")
            os.replace(LATEST_LINK + ".tmp", LATEST_LINK)
            print(f"Updated symlink: {LATEST_LINK} -> {backup_dir}")
        except OSError as exc:
            print(f"Warning: could not update {LATEST_LINK} symlink: {exc}", file=sys.stderr)
    else:
        message = result.stderr.strip() or f"mongodump exited {result.returncode}"
        print(f"Backup failed: {message}", file=sys.stderr)
        _notify_failure(message)
        return 1

    retention_days = _env_int("BACKUP_RETENTION_DAYS", 7)
    cleanup_cmd = (
        f"find {BACKUP_ROOT} -maxdepth 1 -type d -mtime +{retention_days} "
        "-exec rm -rf {} \\;"
    )
    subprocess.run(cleanup_cmd, shell=True)

    return 0


if __name__ == "__main__":
    sys.exit(backup_mongodb())