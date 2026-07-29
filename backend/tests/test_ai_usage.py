"""Tests for LLM usage tracking and budget enforcement (P0-002)."""

from datetime import datetime, timedelta
from core.models import utcnow

import pytest

from core.ai_usage import (
    BudgetExceeded,
    DEFAULT_DAILY_TOKEN_BUDGETS,
    calculate_cost,
    check_budget,
    get_model_provider,
    get_spending_dashboard,
    get_user_budget,
    track_usage,
)


# --- pure functions: no DB required ---


def test_calculate_cost_basic():
    cost = calculate_cost("claude-sonnet-4-6", prompt_tokens=1000, completion_tokens=1000)
    assert cost == pytest.approx(0.003 + 0.015)


def test_calculate_cost_cached_tokens_are_discounted():
    full_price = calculate_cost("claude-sonnet-4-6", prompt_tokens=1000, completion_tokens=0)
    cached_price = calculate_cost("claude-sonnet-4-6", prompt_tokens=1000, completion_tokens=0, cached_tokens=1000)
    assert cached_price < full_price
    assert cached_price == pytest.approx(full_price * 0.1)


def test_calculate_cost_unknown_model_falls_back_to_default():
    known = calculate_cost("claude-sonnet-4-6", 500, 500)
    unknown = calculate_cost("some-future-model", 500, 500)
    assert known == unknown


def test_get_model_provider():
    assert get_model_provider("claude-sonnet-4-6") == "anthropic"
    assert get_model_provider("gpt-4-turbo") == "openai"
    assert get_model_provider("unknown-model") == "anthropic"  # falls back to default model's provider


# --- DB-backed behavior, exercised against an in-memory fake ---


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    def aggregate(self, pipeline):
        docs = list(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if self._matches(d, stage["$match"])]
            elif "$group" in stage:
                docs = self._group(docs, stage["$group"])
            elif "$sort" in stage:
                pass
            elif "$limit" in stage:
                docs = docs[: stage["$limit"]]
        return _FakeCursor(docs)

    @staticmethod
    def _matches(doc, match):
        for k, v in match.items():
            if isinstance(v, dict) and "$gte" in v:
                if doc.get(k) is None or doc[k] < v["$gte"]:
                    return False
            elif doc.get(k) != v:
                return False
        return True

    @staticmethod
    def _group(docs, spec):
        buckets = {}
        for d in docs:
            key_expr = spec["_id"]
            if isinstance(key_expr, str) and key_expr.startswith("$"):
                key = d.get(key_expr[1:])
            else:
                key = None
            bucket = buckets.setdefault(key, {"_id": key})
            for field, agg in spec.items():
                if field == "_id":
                    continue
                if "$sum" in agg:
                    expr = agg["$sum"]
                    inc = 1 if expr == 1 else d.get(str(expr).lstrip("$"), 0)
                    bucket[field] = bucket.get(field, 0) + inc
        return list(buckets.values())


class FakeDB:
    def __init__(self):
        self.ai_usage = FakeCollection()
        self.users = FakeCollection()
        self.organizations = FakeCollection()


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeDB()

    async def _get_db():
        return db

    monkeypatch.setattr("core.ai_usage.get_db", _get_db)
    return db


@pytest.mark.asyncio
async def test_track_usage_persists_all_required_fields(fake_db):
    record = await track_usage(
        user_id="user-1",
        build_id="build-1",
        model="claude-sonnet-4-6",
        prompt_tokens=100,
        completion_tokens=200,
        cost_usd=0.0033,
        org_id="org-1",
        project_id="proj-1",
        cached_tokens=10,
    )
    assert len(fake_db.ai_usage.docs) == 1
    stored = fake_db.ai_usage.docs[0]
    for field in (
        "id", "user_id", "org_id", "project_id", "build_id", "model", "provider",
        "prompt_tokens", "completion_tokens", "cached_tokens", "total_tokens",
        "cost", "created_at",
    ):
        assert field in stored
    assert stored["user_id"] == "user-1"
    assert stored["provider"] == "anthropic"
    assert stored["total_tokens"] == 300
    assert "budget_remaining" in record


@pytest.mark.asyncio
async def test_get_user_budget_defaults_to_free_plan(fake_db):
    budget = await get_user_budget("user-1")
    assert budget["limit"] == DEFAULT_DAILY_TOKEN_BUDGETS["free"]
    assert budget["used"] == 0
    assert budget["remaining"] == DEFAULT_DAILY_TOKEN_BUDGETS["free"]


@pytest.mark.asyncio
async def test_get_user_budget_uses_user_plan(fake_db):
    fake_db.users.docs.append({"id": "user-1", "plan": "pro"})
    budget = await get_user_budget("user-1")
    assert budget["limit"] == DEFAULT_DAILY_TOKEN_BUDGETS["pro"]


@pytest.mark.asyncio
async def test_get_user_budget_uses_org_plan_when_scoped(fake_db):
    fake_db.organizations.docs.append({"id": "org-1", "plan": "enterprise"})
    fake_db.users.docs.append({"id": "user-1", "plan": "free"})
    budget = await get_user_budget("user-1", org_id="org-1")
    assert budget["limit"] == DEFAULT_DAILY_TOKEN_BUDGETS["enterprise"]


@pytest.mark.asyncio
async def test_check_budget_allows_under_limit(fake_db):
    await check_budget("user-1", estimated_tokens=100)  # should not raise


@pytest.mark.asyncio
async def test_check_budget_blocks_when_exceeded(fake_db):
    fake_db.users.docs.append({"id": "user-1", "plan": "free"})
    fake_db.ai_usage.docs.append({
        "user_id": "user-1",
        "org_id": None,
        "prompt_tokens": DEFAULT_DAILY_TOKEN_BUDGETS["free"],
        "completion_tokens": 0,
        "cost": 1.0,
        "created_at": utcnow(),
    })
    with pytest.raises(BudgetExceeded) as exc_info:
        await check_budget("user-1", estimated_tokens=1)
    assert exc_info.value.limit == DEFAULT_DAILY_TOKEN_BUDGETS["free"]


@pytest.mark.asyncio
async def test_check_budget_ignores_usage_from_previous_day(fake_db):
    fake_db.ai_usage.docs.append({
        "user_id": "user-1",
        "org_id": None,
        "prompt_tokens": DEFAULT_DAILY_TOKEN_BUDGETS["free"],
        "completion_tokens": 0,
        "cost": 1.0,
        "created_at": utcnow() - timedelta(days=1, hours=1),
    })
    await check_budget("user-1", estimated_tokens=1)  # yesterday's usage shouldn't count today


@pytest.mark.asyncio
async def test_get_spending_dashboard_aggregates_by_user(fake_db):
    for tokens, user in ((100, "user-1"), (50, "user-1"), (200, "user-2")):
        fake_db.ai_usage.docs.append({
            "user_id": user,
            "prompt_tokens": tokens,
            "completion_tokens": 0,
            "total_tokens": tokens,
            "cost": tokens * 0.001,
            "created_at": utcnow(),
        })
    dashboard = await get_spending_dashboard()
    by_user = {row["user_id"]: row for row in dashboard}
    assert by_user["user-1"]["total_tokens"] == 150
    assert by_user["user-2"]["total_tokens"] == 200
    assert by_user["user-1"]["requests"] == 2
