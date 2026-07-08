#!/usr/bin/env python3
"""
MongoDB backup script - should be run via cron or scheduled task
"""
import subprocess
import datetime
from core.config import get_settings

settings = get_settings()

def backup_mongodb():
    """Create a MongoDB backup using mongodump"""
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/backups/mongodb/{timestamp}"

    mongo_url = settings.mongodb_url

    cmd = [
        "mongodump",
        "--uri", mongo_url,
        "--out", backup_dir,
        "--gzip"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        print(f"Backup completed: {backup_dir}")
    else:
        print(f"Backup failed: {result.stderr}")

    cleanup_cmd = "find /backups/mongodb -type d -mtime +7 -exec rm -rf {} \\;"
    subprocess.run(cleanup_cmd, shell=True)

if __name__ == "__main__":
    backup_mongodb()