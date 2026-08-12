#!/usr/bin/env python3
"""Rotate field-level encryption for initiative/PRD data.

Scans `initiatives` and `prds` for values in encrypted fields that are still
in plaintext, then rewrites them with the current FIELD_ENCRYPTION_KEY.

Usage:
    python3 rotate_initiative_encryption.py --dry-run
    python3 rotate_initiative_encryption.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import os
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

from core.encryption import encrypt_field, decrypt_field


INITIATIVE_FIELDS = {"prompt", "business_goals", "risks"}
PRD_FIELDS = {"executive_summary", "problem_statement", "solution", "security", "performance", "scalability", "api_overview", "database_overview", "release_plan"}


def _is_encrypted(value: str) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        decrypted = decrypt_field(value)
        return decrypted != value
    except Exception:
        return False


async def _rotate_doc(doc: dict, encrypted_fields: set[str]) -> tuple[dict, int]:
    updates: dict[str, Any] = {}
    changed = 0
    for field in encrypted_fields:
        value = doc.get(field)
        if value is None:
            continue
        if isinstance(value, str) and not _is_encrypted(value):
            updates[field] = encrypt_field(value)
            changed += 1
        elif isinstance(value, list):
            new_list = []
            list_changed = False
            for item in value:
                if isinstance(item, str) and not _is_encrypted(item):
                    new_list.append(encrypt_field(item))
                    list_changed = True
                else:
                    new_list.append(item)
            if list_changed:
                updates[field] = new_list
                changed += 1
    return updates, changed


async def rotate(db: AsyncIOMotorClient, apply: bool) -> tuple[int, int]:
    initiative_changes = 0
    prd_changes = 0

    async for doc in db.initiatives.find({}):
        updates, changed = await _rotate_doc(doc, INITIATIVE_FIELDS)
        if updates and apply:
            await db.initiatives.update_one({"id": doc["id"]}, {"$set": updates})
        initiative_changes += changed

    async for doc in db.prds.find({}):
        updates, changed = await _rotate_doc(doc, PRD_FIELDS)
        if updates and apply:
            await db.prds.update_one({"id": doc["id"]}, {"$set": updates})
        prd_changes += changed

    return initiative_changes, prd_changes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="perform encryption rotation")
    args = parser.parse_args()
    mongodb_url = os.environ.get("MONGODB_URL")
    if not mongodb_url:
        parser.error("MONGODB_URL environment variable is required")

    async def _run() -> None:
        client = AsyncIOMotorClient(mongodb_url, serverSelectionTimeoutMS=5000)
        try:
            await client.admin.command("ping")
            db = client.forge
            initiative_changes, prd_changes = await rotate(db, args.apply)
            mode = "apply" if args.apply else "dry-run"
            print(f"mode={mode} initiative_fields_rotated={initiative_changes} prd_fields_rotated={prd_changes}")
        finally:
            client.close()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
