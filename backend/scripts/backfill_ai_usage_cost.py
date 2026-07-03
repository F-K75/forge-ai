#!/usr/bin/env python3
"""Backfill ``cost`` on ``ai_usage`` records written before real cost tracking was wired in.

Those records already have real ``model``/``prompt_tokens``/``completion_tokens``/``cached_tokens``
values, just ``cost=0.0``, so the true cost can be recomputed with ``calculate_cost``.
Run without ``--apply`` for a read-only preflight, then rerun with ``--apply``.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient

from core.ai_usage import calculate_cost


async def backfill(mongodb_url: str, apply: bool) -> tuple[int, int]:
    """Return ``(eligible, migrated)`` counts; writes only when ``apply`` is true."""
    client = AsyncIOMotorClient(mongodb_url, serverSelectionTimeoutMS=5000)
    eligible = migrated = 0
    try:
        await client.admin.command("ping")
        cursor = client.forge.ai_usage.find(
            {"cost": 0.0, "$or": [{"prompt_tokens": {"$gt": 0}}, {"completion_tokens": {"$gt": 0}}]},
            {"_id": 1, "model": 1, "prompt_tokens": 1, "completion_tokens": 1, "cached_tokens": 1},
        )
        async for record in cursor:
            eligible += 1
            new_cost = calculate_cost(
                record.get("model", ""),
                record.get("prompt_tokens", 0),
                record.get("completion_tokens", 0),
                cached_tokens=record.get("cached_tokens", 0),
            )
            if new_cost <= 0.0:
                continue
            if apply:
                result = await client.forge.ai_usage.update_one(
                    {"_id": record["_id"], "cost": 0.0},
                    {"$set": {"cost": round(new_cost, 6)}},
                )
                migrated += result.modified_count
    finally:
        client.close()
    return eligible, migrated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write recomputed costs")
    args = parser.parse_args()
    if not os.environ.get("MONGODB_URL"):
        parser.error("missing environment variable: MONGODB_URL")

    eligible, migrated = asyncio.run(backfill(os.environ["MONGODB_URL"], args.apply))
    mode = "apply" if args.apply else "dry-run"
    print(f"mode={mode} eligible={eligible} migrated={migrated}")


if __name__ == "__main__":
    main()
