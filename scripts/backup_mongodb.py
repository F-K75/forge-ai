#!/usr/bin/env python3
"""
MongoDB backup script - should be run via cron or scheduled task.

Runs standalone (no backend imports) so it works inside the backup
container, which mounts only ./scripts. Configuration comes from the
environment, matching docker-compose.prod.yml / .staging.yml:

    MONGODB_URL           full mongodb connection string incl. credentials (see .env)
    BACKUP_RETENTION_DAYS number of days to keep backups (default: 7)

On success the newest backup directory is symlinked to /backups/latest
so the verification cron job can always verify the freshest backup.
"""
import datetime
import os
import subprocess
import sys

BACKUP_ROOT = "/backups/mongodb"
LATEST_LINK = "/backups/latest"


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def backup_mongodb() -> int:
    """Create a MongoDB backup using mongodump. Returns process exit code."""
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(BACKUP_ROOT, timestamp)

    mongo_url = os.environ.get("MONGODB_URL", "")
    if not mongo_url:
        print("Backup failed: MONGODB_URL is not set", file=sys.stderr)
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
        print("Backup failed: mongodump is not installed", file=sys.stderr)
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
        print(f"Backup failed: {result.stderr}", file=sys.stderr)
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