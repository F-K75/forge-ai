#!/usr/bin/env python3
"""Re-encrypt legacy user fields with ``FIELD_ENCRYPTION_KEY``.

The legacy key is supplied explicitly and is never read by application runtime.
Run without ``--apply`` for a read-only preflight, then rerun with ``--apply``.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorClient


def _legacy_cipher(jwt_secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(jwt_secret.encode()).digest())
    return Fernet(key)


def _new_cipher(field_key: str) -> Fernet:
    try:
        raw = bytes.fromhex(field_key)
    except ValueError:
        raw = b""
    key = base64.urlsafe_b64encode(raw) if len(raw) == 32 else field_key.encode()
    return Fernet(key)


async def migrate(
    mongodb_url: str, legacy_secret: str, field_key: str, apply: bool
) -> tuple[int, int]:
    """Return ``(eligible, migrated)`` counts; writes only when ``apply`` is true."""
    client = AsyncIOMotorClient(mongodb_url, serverSelectionTimeoutMS=5000)
    old_cipher = _legacy_cipher(legacy_secret)
    new_cipher = _new_cipher(field_key)
    eligible = migrated = 0
    try:
        await client.admin.command("ping")
        cursor = client.forge.users.find(
            {"github_token": {"$type": "string", "$ne": ""}},
            {"_id": 1, "github_token": 1},
        )
        async for user in cursor:
            token = user["github_token"]
            try:
                plaintext = old_cipher.decrypt(token.encode())
            except InvalidToken:
                # Already migrated values and malformed data are never overwritten.
                continue
            eligible += 1
            if apply:
                result = await client.forge.users.update_one(
                    {"_id": user["_id"], "github_token": token},
                    {"$set": {"github_token": new_cipher.encrypt(plaintext).decode()}},
                )
                migrated += result.modified_count
    finally:
        client.close()
    return eligible, migrated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="perform compare-and-set updates"
    )
    args = parser.parse_args()
    required = ("MONGODB_URL", "LEGACY_JWT_SECRET", "FIELD_ENCRYPTION_KEY")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        parser.error(f"missing environment variables: {', '.join(missing)}")

    eligible, migrated = asyncio.run(
        migrate(
            os.environ["MONGODB_URL"],
            os.environ["LEGACY_JWT_SECRET"],
            os.environ["FIELD_ENCRYPTION_KEY"],
            args.apply,
        )
    )
    mode = "apply" if args.apply else "dry-run"
    print(f"mode={mode} eligible={eligible} migrated={migrated}")


if __name__ == "__main__":
    main()
