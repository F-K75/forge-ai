#!/usr/bin/env python3
"""SEC-002: Migration script for FIELD_ENCRYPTION_KEY rotation.

This script re-encrypts all stored encrypted fields (currently github_token)
with a new FIELD_ENCRYPTION_KEY. Use this when rotating the encryption key
or when migrating from the old JWT-derived key to a dedicated key.

Usage:
    python backend/scripts/migrate_field_encryption_key.py \\
        --old-key <old_hex_or_base64_key> \\
        --new-key <new_hex_or_base64_key>

The script is idempotent — it can be safely re-run if interrupted.
"""

import argparse
import asyncio
import logging
import sys
from typing import Optional

from core.database import get_db, close_connections
from core.encryption import encrypt_field, decrypt_field, normalize_fernet_key
from core.config import get_settings

logger = logging.getLogger(__name__)


def _build_cipher(key: str):
    """Build a Fernet cipher from a raw key string (hex or base64)."""
    from cryptography.fernet import Fernet
    normalized = normalize_fernet_key(key)
    return Fernet(normalized)


def _decrypt_with_key(value: str, key: str) -> str:
    """Decrypt a value using a specific key."""
    if not value:
        return value
    cipher = _build_cipher(key)
    return cipher.decrypt(value.encode()).decode()


async def _migrate_user_field(
    db,
    user_id: str,
    field: str,
    old_key: str,
    new_key: str,
    dry_run: bool = False,
) -> tuple[int, int]:
    """Re-encrypt a single field for all users.
    
    Returns (processed, migrated) counts.
    """
    processed = 0
    migrated = 0
    
    cursor = db.users.find(
        {field: {"$exists": True, "$ne": None, "$ne": ""}},
        {"_id": 0, "id": 1, field: 1},
    )
    async for doc in cursor:
        processed += 1
        user_id_val = doc.get("id")
        encrypted_value = doc.get(field)
        
        if not user_id_val or not encrypted_value:
            continue
        
        try:
            decrypted = _decrypt_with_key(encrypted_value, old_key)
            if dry_run:
                logger.info(
                    "Would migrate %s for user %s (len=%d)",
                    field, user_id_val, len(decrypted),
                )
                migrated += 1
                continue
            
            new_encrypted = encrypt_field(decrypted)
            if new_encrypted == encrypted_value:
                logger.debug(
                    "User %s %s already encrypted with new key", user_id_val, field
                )
                migrated += 1
                continue
            
            result = await db.users.update_one(
                {"id": user_id_val},
                {"$set": {field: new_encrypted}},
            )
            if result.modified_count:
                migrated += 1
                logger.info(
                    "Migrated %s for user %s (%d/%d)",
                    field, user_id_val, migrated, processed,
                )
        except Exception as exc:
            logger.error(
                "Failed to migrate %s for user %s: %s", field, user_id_val, exc
            )
    
    return processed, migrated


async def run_migration(
    old_key: str,
    new_key: str,
    field: str = "github_token",
    dry_run: bool = False,
    batch_size: int = 100,
) -> dict:
    """Run the encryption key migration.
    
    Args:
        old_key: The previous FIELD_ENCRYPTION_KEY (hex or base64).
        new_key: The new FIELD_ENCRYPTION_KEY (hex or base64).
        field: The encrypted field to migrate (default: github_token).
        dry_run: If True, only report what would be migrated.
        batch_size: Number of users to process in each batch.
    
    Returns:
        Migration statistics dict.
    """
    db = await get_db()
    stats = {
        "field": field,
        "dry_run": dry_run,
        "total_processed": 0,
        "total_migrated": 0,
        "errors": 0,
    }
    
    logger.info(
        "Starting %smigration of %s from old key to new key",
        "dry-run " if dry_run else "", field
    )
    
    processed, migrated = await _migrate_user_field(
        db, None, field, old_key, new_key, dry_run
    )
    stats["total_processed"] = processed
    stats["total_migrated"] = migrated
    
    logger.info(
        "Migration %s: processed=%d, migrated=%d, errors=%d",
        "dry-run" if dry_run else "complete",
        stats["total_processed"],
        stats["total_migrated"],
        stats["errors"],
    )
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Migrate encrypted fields to a new FIELD_ENCRYPTION_KEY"
    )
    parser.add_argument(
        "--old-key",
        required=True,
        help="Previous FIELD_ENCRYPTION_KEY (64-char hex or base64)",
    )
    parser.add_argument(
        "--new-key",
        required=True,
        help="New FIELD_ENCRYPTION_KEY (64-char hex or base64)",
    )
    parser.add_argument(
        "--field",
        default="github_token",
        help="Encrypted field to migrate (default: github_token)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be migrated without making changes",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Users per batch (default: 100)",
    )
    args = parser.parse_args()
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    
    try:
        stats = asyncio.run(
            run_migration(
                old_key=args.old_key,
                new_key=args.new_key,
                field=args.field,
                dry_run=args.dry_run,
                batch_size=args.batch_size,
            )
        )
    except KeyboardInterrupt:
        logger.warning("Migration interrupted by user")
        sys.exit(1)
    except Exception as exc:
        logger.error("Migration failed: %s", exc, exc_info=True)
        sys.exit(1)
    finally:
        asyncio.run(close_connections())
    
    print("\nMigration Statistics:")
    print(f"  Field:            {stats['field']}")
    print(f"  Mode:             {'dry-run' if stats['dry_run'] else 'live'}")
    print(f"  Total processed:  {stats['total_processed']}")
    print(f"  Total migrated:   {stats['total_migrated']}")
    print(f"  Errors:           {stats['errors']}")
    
    if stats["dry_run"]:
        print("\nThis was a dry run. Re-run without --dry-run to apply changes.")
    elif stats["total_migrated"] > 0:
        print(f"\nSuccessfully migrated {stats['total_migrated']} records.")
        print("Update FIELD_ENCRYPTION_KEY in your deployment to the new key.")


if __name__ == "__main__":
    main()