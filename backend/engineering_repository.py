"""MongoDB persistence for prompt engineering, harness engineering, and loop engineering data.

Provides async repository classes that store/retrieve:
- Prompt template versions
- Few-shot examples
- Test suites and evaluation results
- A/B test results
- Regression baselines
- Loop improvement results

Uses the existing Motor-based get_db() from core/database.py.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from core.database import get_db

logger = logging.getLogger(__name__)


def _sanitize_mongo_value(value: str, max_length: int = 100) -> str:
    """Sanitize a user-supplied string value for safe use in MongoDB queries.
    
    Prevents NoSQL injection by:
    1. Stripping MongoDB operator prefixes ($regex, $gt, $ne, etc.)
    2. Removing control characters
    3. Limiting length
    """
    if not isinstance(value, str):
        return ""
    # Strip MongoDB operator prefixes
    value = re.sub(r'^\$[\w]+', '', value)
    # Remove null bytes and control characters
    value = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
    # Limit length
    if len(value) > max_length:
        value = value[:max_length]
    return value


class VersionRepository:
    """Persists prompt template version history to MongoDB."""

    def __init__(self):
        self._collection_name = "prompt_versions"

    @property
    async def _collection(self):
        db = await get_db()
        return db[self._collection_name]

    async def save_version(self, role: str, version: str, change_type: str,
                           author: str = "system", template_snapshot: Optional[dict] = None) -> None:
        col = await self._collection
        await col.insert_one({
            "role": role,
            "version": version,
            "change_type": change_type,
            "author": author,
            "template_snapshot": template_snapshot or {},
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })

    async def get_versions(self, role: str, version: str) -> List[dict]:
        col = await self._collection
        cursor = col.find({"role": _sanitize_mongo_value(role), "version": _sanitize_mongo_value(version)}).sort("created_at", -1).limit(100)
        return await cursor.to_list(length=100)

    async def rollback_version(self, role: str, version: str, reason: str = "") -> Optional[dict]:
        col = await self._collection
        doc = await col.find_one({"role": _sanitize_mongo_value(role), "version": _sanitize_mongo_value(version)}, sort=[("created_at", -1)])
        if doc:
            await col.update_one({"_id": doc["_id"]}, {"$set": {"rolled_back_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "rollback_reason": reason}})
        return doc


class FewShotRepository:
    """Persists few-shot examples to MongoDB."""

    def __init__(self):
        self._collection_name = "few_shot_examples"

    @property
    async def _collection(self):
        db = await get_db()
        return db[self._collection_name]

    async def save_example(self, example: dict) -> None:
        col = await self._collection
        await col.update_one(
            {"example_id": _sanitize_mongo_value(example["example_id"])},
            {"$set": {**example, "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}},
            upsert=True,
        )

    async def get_by_role(self, role: str, strategy: str = "semantic", max_examples: int = 10) -> List[dict]:
        col = await self._collection
        cursor = col.find({"role": _sanitize_mongo_value(role), "strategy": _sanitize_mongo_value(strategy)}).sort("score", -1).limit(max_examples)
        return await cursor.to_list(length=max_examples)

    async def delete_example(self, example_id: str) -> bool:
        col = await self._collection
        result = await col.delete_one({"example_id": _sanitize_mongo_value(example_id)})
        return result.deleted_count > 0


class HarnessRepository:
    """Persists test suites, evaluation results, A/B tests, and benchmarks to MongoDB."""

    def __init__(self):
        self._eval_collection = "harness_evaluations"
        self._ab_collection = "harness_ab_tests"
        self._benchmark_collection = "harness_benchmarks"
        self._baseline_collection = "harness_baselines"

    async def _eval_col(self):
        db = await get_db()
        return db[self._eval_collection]

    async def _ab_col(self):
        db = await get_db()
        return db[self._ab_collection]

    async def _benchmark_col(self):
        db = await get_db()
        return db[self._benchmark_collection]

    async def _baseline_col(self):
        db = await get_db()
        return db[self._baseline_collection]

    async def save_evaluation(self, suite_id: str, role: str, result: dict) -> str:
        col = await self._eval_col()
        doc = {
            "suite_id": suite_id,
            "role": role,
            "result": result,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await col.insert_one(doc)
        return str(doc["_id"])

    async def save_ab_test(self, test_id: str, role: str, result: dict) -> str:
        col = await self._ab_col()
        doc = {
            "test_id": test_id,
            "role": role,
            "result": result,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await col.insert_one(doc)
        return str(doc["_id"])

    async def save_benchmark(self, benchmark_id: str, role: str, result: dict) -> str:
        col = await self._benchmark_col()
        doc = {
            "benchmark_id": benchmark_id,
            "role": role,
            "result": result,
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await col.insert_one(doc)
        return str(doc["_id"])

    async def set_baseline(self, role: str, template_version: str, metrics: dict) -> None:
        col = await self._baseline_col()
        await col.update_one(
            {"role": _sanitize_mongo_value(role), "template_version": _sanitize_mongo_value(template_version)},
            {"$set": {"metrics": metrics, "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}},
            upsert=True,
        )

    async def get_baseline(self, role: str, template_version: str) -> Optional[dict]:
        col = await self._baseline_col()
        return await col.find_one({"role": _sanitize_mongo_value(role), "template_version": _sanitize_mongo_value(template_version)})


class LoopRepository:
    """Persists loop engineering iteration history and results to MongoDB."""

    def __init__(self):
        self._collection_name = "loop_results"

    @property
    async def _collection(self):
        db = await get_db()
        return db[self._collection_name]

    async def save_result(self, result: dict) -> str:
        col = await self._collection
        doc = {
            "role": result.get("role"),
            "task": result.get("task"),
            "iterations": result.get("iterations", []),
            "total_iterations": result.get("total_iterations", 0),
            "initial_quality": result.get("initial_quality", 0.0),
            "final_quality": result.get("final_quality", 0.0),
            "quality_improvement": result.get("quality_improvement", 0.0),
            "converged": result.get("converged", False),
            "actions_taken": result.get("actions_taken", []),
            "summary": result.get("summary", ""),
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await col.insert_one(doc)
        return str(doc["_id"])

    async def get_history(self, role: str, limit: int = 50) -> List[dict]:
        col = await self._collection
        cursor = col.find({"role": _sanitize_mongo_value(role)}).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    async def get_latest(self, role: str) -> Optional[dict]:
        col = await self._collection
        return await col.find_one({"role": _sanitize_mongo_value(role)}, sort=[("created_at", -1)])


# Shared singletons
_version_repo: Optional[VersionRepository] = None
_few_shot_repo: Optional[FewShotRepository] = None
_harness_repo: Optional[HarnessRepository] = None
_loop_repo: Optional[LoopRepository] = None


def get_version_repository() -> VersionRepository:
    global _version_repo
    if _version_repo is None:
        _version_repo = VersionRepository()
    return _version_repo


def get_few_shot_repository() -> FewShotRepository:
    global _few_shot_repo
    if _few_shot_repo is None:
        _few_shot_repo = FewShotRepository()
    return _few_shot_repo


def get_harness_repository() -> HarnessRepository:
    global _harness_repo
    if _harness_repo is None:
        _harness_repo = HarnessRepository()
    return _harness_repo


def get_loop_repository() -> LoopRepository:
    global _loop_repo
    if _loop_repo is None:
        _loop_repo = LoopRepository()
    return _loop_repo