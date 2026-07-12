import pytest

from core.llm.budget_manager import (
    BudgetLimitExceeded,
    BudgetManager,
    BudgetPeriod,
    BudgetScope,
)


class _FakeUpdateResult:
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count


class _FakeBudgetLimitsCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False):
        key = (query["scope"], query["scope_id"])
        self.docs[key] = update["$set"]

    async def delete_one(self, query):
        key = (query["scope"], query["scope_id"])
        existed = self.docs.pop(key, None) is not None
        return _FakeUpdateResult(deleted_count=1 if existed else 0)

    def find(self, *_a, **_k):
        docs = list(self.docs.values())

        class _Cursor:
            def __aiter__(self):
                return self._gen()

            async def _gen(self):
                for d in docs:
                    yield d

        return _Cursor()


class _FakeAiUsageCollection:
    def __init__(self, spend_by_field=None):
        self.spend_by_field = spend_by_field or {}

    def aggregate(self, pipeline):
        match_stage = pipeline[0]["$match"]
        field, value = next((k, v) for k, v in match_stage.items() if k != "created_at")
        spend = self.spend_by_field.get((field, value), 0.0)

        class _Cursor:
            def __aiter__(self):
                return self._gen()

            async def _gen(self):
                if spend:
                    yield {"cost": spend}

        return _Cursor()


class _FakeDB:
    def __init__(self, spend_by_field=None):
        self.budget_limits = _FakeBudgetLimitsCollection()
        self.ai_usage = _FakeAiUsageCollection(spend_by_field)


@pytest.fixture
def fake_db(monkeypatch):
    db = _FakeDB()

    async def fake_get_db():
        return db

    monkeypatch.setattr("core.llm.budget_manager.get_db", fake_get_db)
    return db


@pytest.mark.asyncio
async def test_enforce_skips_db_entirely_when_no_limits_configured():
    manager = BudgetManager()

    model_chain, result = await manager.enforce(
        org_id="org-1", project_id=None, agent_name="developer",
        estimated_cost_usd=100.0, model_chain=["claude-opus-3"],
    )

    assert model_chain == ["claude-opus-3"]
    assert result.downgraded is False
    assert result.warnings == []


@pytest.mark.asyncio
async def test_set_limit_persists_and_populates_cache(fake_db):
    manager = BudgetManager()

    doc = await manager.set_limit(
        BudgetScope.ORG, "org-1", soft_limit_usd=5.0, hard_limit_usd=10.0, period=BudgetPeriod.DAILY,
    )

    assert doc["hard_limit_usd"] == 10.0
    assert await manager.get_limit(BudgetScope.ORG, "org-1") == doc
    assert fake_db.budget_limits.docs[("org", "org-1")] == doc


@pytest.mark.asyncio
async def test_set_limit_rejects_soft_greater_than_hard():
    manager = BudgetManager()

    with pytest.raises(ValueError):
        await manager.set_limit(BudgetScope.ORG, "org-1", soft_limit_usd=20.0, hard_limit_usd=10.0)


@pytest.mark.asyncio
async def test_enforce_raises_when_hard_limit_would_be_exceeded(fake_db):
    manager = BudgetManager()
    await manager.set_limit(BudgetScope.ORG, "org-1", soft_limit_usd=None, hard_limit_usd=10.0)
    fake_db.ai_usage.spend_by_field[("org_id", "org-1")] = 9.5

    with pytest.raises(BudgetLimitExceeded) as exc_info:
        await manager.enforce(
            org_id="org-1", project_id=None, agent_name=None,
            estimated_cost_usd=1.0, model_chain=["claude-opus-3"],
        )

    assert exc_info.value.scope == "org"
    assert exc_info.value.limit_usd == 10.0


@pytest.mark.asyncio
async def test_enforce_downgrades_model_chain_when_soft_limit_crossed(fake_db):
    manager = BudgetManager()
    await manager.set_limit(BudgetScope.PROJECT, "proj-1", soft_limit_usd=5.0, hard_limit_usd=None)
    fake_db.ai_usage.spend_by_field[("project_id", "proj-1")] = 4.9

    model_chain, result = await manager.enforce(
        org_id=None, project_id="proj-1", agent_name=None,
        estimated_cost_usd=1.0,
        model_chain=["claude-opus-3", "claude-haiku-4.5", "claude-sonnet-4-6"],
    )

    assert model_chain[0] == "claude-haiku-4.5"  # cheapest of the three
    assert result.downgraded is True
    assert len(result.warnings) == 1


@pytest.mark.asyncio
async def test_enforce_leaves_single_model_chain_unchanged_on_soft_limit(fake_db):
    manager = BudgetManager()
    await manager.set_limit(BudgetScope.AGENT, "developer", soft_limit_usd=1.0, hard_limit_usd=None)
    fake_db.ai_usage.spend_by_field[("agent", "developer")] = 5.0

    model_chain, result = await manager.enforce(
        org_id=None, project_id=None, agent_name="developer",
        estimated_cost_usd=1.0, model_chain=["claude-opus-3"],
    )

    assert model_chain == ["claude-opus-3"]
    assert result.downgraded is False


@pytest.mark.asyncio
async def test_delete_limit_removes_from_cache_and_returns_false_when_absent(fake_db):
    manager = BudgetManager()
    await manager.set_limit(BudgetScope.ORG, "org-1", soft_limit_usd=None, hard_limit_usd=10.0)

    assert await manager.delete_limit(BudgetScope.ORG, "org-1") is True
    assert await manager.get_limit(BudgetScope.ORG, "org-1") is None
    assert await manager.delete_limit(BudgetScope.ORG, "org-1") is False
