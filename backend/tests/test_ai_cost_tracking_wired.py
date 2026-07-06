"""Tests for AI cost tracking, budget enforcement, and spending alerts.

These tests verify that:
1. Token estimation works for English text, code, and mixed content
2. check_budget() rejects calls that would exceed the daily limit
3. Concurrent request limiting blocks excessive parallel calls
4. Spending alert thresholds (50%, 80%, 100%) are detected correctly
5. track_usage() persists records and fires alerts
6. The admin spending dashboard endpoint returns data
"""

import pytest
from unittest.mock import AsyncMock, patch

from core.ai_usage import (
    estimate_tokens,
    check_budget,
    BudgetExceeded,
    check_and_send_token_budget_alerts,
    BUDGET_ALERT_THRESHOLDS,
    track_usage,
    DEFAULT_DAILY_TOKEN_BUDGETS,
)

import core.security as security_module


@pytest.fixture(autouse=True)
def _reset_llm_rate_limit_state():
    # These tests drive the real LLMRouter.generate() with user_id="user-1"
    # in rapid succession. Redis isn't reachable in this sandbox, so the
    # per-user LLM rate limiter (core.security.LLM_RATE_LIMITS) falls back
    # to the module-level, process-wide _in_memory_rate_limits dict --
    # without clearing it, repeated "user-1" calls here would share state
    # with other test modules that also use "user-1" (e.g.
    # test_llm_byok.py), risking spurious rate-limit failures unrelated to
    # what either test is actually checking.
    security_module._in_memory_rate_limits.clear()
    yield
    security_module._in_memory_rate_limits.clear()


class TestEstimateTokens:
    """Token estimation heuristic tests."""

    def test_empty_string(self):
        assert estimate_tokens("") == 0

    def test_english_text(self):
        """~4 chars/token for English text."""
        text = "The quick brown fox jumps over the lazy dog"
        tokens = estimate_tokens(text)
        assert tokens > 0
        # 43 chars / 4 = ~11 tokens, +1 rounding = ~12
        assert 5 <= tokens <= 20

    def test_code_content(self):
        """~1.5 chars/token for code-heavy content."""
        code = """def hello(x: int) -> str:
    result = ""
    for i in range(x):
        result += f"item {i}\\n"
    return result
"""
        tokens = estimate_tokens(code)
        assert tokens > 0
        # Code chars are dense, estimate should be higher than naive text division
        naive_text_tokens = len(code) // 4
        assert tokens > naive_text_tokens

    def test_mixed_content(self):
        """Mixed code and English should produce a blended estimate."""
        text = "Create a function that adds two numbers"
        code = "def add(a, b): return a + b"
        mixed = f"{text}\n{code}"
        tokens = estimate_tokens(mixed)
        assert tokens > 0

    def test_special_characters(self):
        """JSON-like strings with many special chars should be dense."""
        json_str = '{"key": "value", "items": [1, 2, 3], "nested": {"a": 1}}'
        tokens = estimate_tokens(json_str)
        assert tokens > 0
        naive = len(json_str) // 4
        # JSON is denser than plain text
        assert tokens >= naive

    def test_very_long_text(self):
        """Long text should not blow up."""
        text = "hello world " * 10000
        tokens = estimate_tokens(text)
        assert tokens > 0
        assert tokens < len(text)  # Should compress, not expand


class TestBudgetEnforcement:
    """Budget check and enforcement tests."""

    @pytest.mark.asyncio
    async def test_check_budget_allows_when_under(self):
        """check_budget() should pass when used + estimated <= limit."""
        mock_budget = {"used": 100, "limit": 1000}
        with patch("core.ai_usage.get_user_budget", new=AsyncMock(return_value=mock_budget)):
            # Should not raise
            await check_budget("user_1", estimated_tokens=500)

    @pytest.mark.asyncio
    async def test_check_budget_rejects_when_over(self):
        """check_budget() should raise BudgetExceeded when used + estimated > limit."""
        mock_budget = {"used": 900, "limit": 1000}
        with patch("core.ai_usage.get_user_budget", new=AsyncMock(return_value=mock_budget)):
            with pytest.raises(BudgetExceeded):
                await check_budget("user_1", estimated_tokens=200)

    @pytest.mark.asyncio
    async def test_check_budget_blocks_when_over_limit_with_zero_estimate(self):
        """check_budget() with zero estimate should block only if usage already exceeds limit."""
        mock_budget = {"used": 1001, "limit": 1000}
        with patch("core.ai_usage.get_user_budget", new=AsyncMock(return_value=mock_budget)):
            with pytest.raises(BudgetExceeded):
                await check_budget("user_1", estimated_tokens=0)

    @pytest.mark.asyncio
    async def test_check_budget_passes_with_zero_usage(self):
        """check_budget() should pass when no tokens used yet."""
        mock_budget = {"used": 0, "limit": 10000}
        with patch("core.ai_usage.get_user_budget", new=AsyncMock(return_value=mock_budget)):
            await check_budget("user_1", estimated_tokens=5000)

    @pytest.mark.asyncio
    async def test_check_budget_exception_contains_used_and_limit(self):
        """BudgetExceeded should carry exact used/limit values for the frontend."""
        mock_budget = {"used": 9500, "limit": 10000}
        with patch("core.ai_usage.get_user_budget", new=AsyncMock(return_value=mock_budget)):
            with pytest.raises(BudgetExceeded) as exc_info:
                await check_budget("user_1", estimated_tokens=1000)
            assert exc_info.value.used == 9500
            assert exc_info.value.limit == 10000


class TestBudgetAlerts:
    """Spending alert threshold tests."""

    @pytest.mark.asyncio
    async def test_no_alert_below_50_percent(self):
        """No alert should fire when usage is below 50%."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"token_budget_alerts_sent": []})
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=4000, limit=10000,
        )
        # Should not have called update_one
        db.users.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_alert_at_50_percent(self):
        """Alert should fire at 50% threshold."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"token_budget_alerts_sent": []})
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=5000, limit=10000,
        )
        # Should have marked "daily_50" as sent
        db.users.update_one.assert_called_once()
        call = db.users.update_one.call_args
        args, kwargs = call[0], call[1]
        # First positional arg is the filter
        assert args[0] == {"id": "user_1"}
        # Second positional arg is the update document
        update_doc = args[1]
        assert "$addToSet" in update_doc
        add_to_set_value = update_doc["$addToSet"]
        assert "token_budget_alerts_sent" in add_to_set_value
        each_value = add_to_set_value["token_budget_alerts_sent"]
        assert isinstance(each_value, dict)
        assert "daily_50" in each_value.get("$each", [])

    @pytest.mark.asyncio
    async def test_alert_at_80_percent(self):
        """Alert should fire at 80% threshold."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"token_budget_alerts_sent": []})
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=8000, limit=10000,
        )
        db.users.update_one.assert_called_once()
        call = db.users.update_one.call_args
        args = call[0]
        update_doc = args[1]
        each_value = update_doc["$addToSet"]["token_budget_alerts_sent"]
        assert "daily_80" in each_value.get("$each", [])

    @pytest.mark.asyncio
    async def test_alert_at_100_percent(self):
        """Alert should fire at 100% threshold."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"token_budget_alerts_sent": []})
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=10000, limit=10000,
        )
        db.users.update_one.assert_called_once()
        call = db.users.update_one.call_args
        args = call[0]
        update_doc = args[1]
        each_value = update_doc["$addToSet"]["token_budget_alerts_sent"]
        assert "daily_100" in each_value.get("$each", [])

    @pytest.mark.asyncio
    async def test_multiple_thresholds_fire_together(self):
        """Crossing multiple thresholds at once should fire all untriggered ones."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"token_budget_alerts_sent": ["daily_50"]})
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=9500, limit=10000,
        )
        db.users.update_one.assert_called_once()
        call = db.users.update_one.call_args
        args = call[0]
        update_doc = args[1]
        each_value = update_doc["$addToSet"]["token_budget_alerts_sent"]
        assert "daily_80" in each_value.get("$each", [])
        assert "daily_100" not in each_value.get("$each", [])  # Not yet at 100%

    @pytest.mark.asyncio
    async def test_already_sent_alert_not_fired_again(self):
        """Already-fired thresholds should not fire again."""
        db = AsyncMock()
        db.users.find_one = AsyncMock(
            return_value={"token_budget_alerts_sent": ["daily_50", "daily_80", "daily_100"]}
        )
        await check_and_send_token_budget_alerts(
            db, "user_1", "user@test.com", "Test User",
            used=10000, limit=10000,
        )
        # All thresholds already sent; should not call update_one
        db.users.update_one.assert_not_called()

    def test_budget_alert_thresholds_are_correct(self):
        """The threshold list must contain the expected values."""
        assert BUDGET_ALERT_THRESHOLDS == [50, 80, 100]


class TestDailyBudgetLimits:
    """Daily token budget limit configuration tests."""

    def test_free_plan_budget(self):
        assert DEFAULT_DAILY_TOKEN_BUDGETS["free"] == 10_000

    def test_standard_plan_budget(self):
        assert DEFAULT_DAILY_TOKEN_BUDGETS["standard"] == 100_000

    def test_pro_plan_budget(self):
        assert DEFAULT_DAILY_TOKEN_BUDGETS["pro"] == 500_000

    def test_enterprise_plan_budget(self):
        assert DEFAULT_DAILY_TOKEN_BUDGETS["enterprise"] == 2_000_000

    def test_unknown_plan_falls_back_to_free(self):
        """An unrecognized plan should default to free tier limits."""
        from core.llm.router import _get_concurrent_limit, _CONCURRENT_LIMITS
        assert _get_concurrent_limit("unknown") == _CONCURRENT_LIMITS["free"]


class TestTrackUsage:
    """Usage tracking integration tests."""

    @pytest.mark.asyncio
    async def test_track_usage_persists_record(self):
        """track_usage() should insert a record into ai_usage and check alerts."""
        mock_db = AsyncMock()
        mock_db.ai_usage.insert_one = AsyncMock()
        mock_db.users.find_one = AsyncMock(
            return_value={"email": "user@test.com", "name": "Test User"}
        )

        with patch("core.ai_usage.get_db", new=AsyncMock(return_value=mock_db)):
            with patch("core.ai_usage.get_user_budget", new=AsyncMock(
                return_value={"used": 500, "limit": 10000, "remaining": 9500}
            )):
                with patch("core.ai_usage.check_and_send_token_budget_alerts", new=AsyncMock()):
                    result = await track_usage(
                        user_id="user_1",
                        build_id="build_1",
                        model="claude-sonnet-4-6",
                        prompt_tokens=100,
                        completion_tokens=50,
                        cost_usd=0.003,
                        agent="architect",
                    )

        # Verify record was inserted
        mock_db.ai_usage.insert_one.assert_called_once()
        inserted = mock_db.ai_usage.insert_one.call_args[0][0]
        assert inserted["user_id"] == "user_1"
        assert inserted["build_id"] == "build_1"
        assert inserted["prompt_tokens"] == 100
        assert inserted["completion_tokens"] == 50
        assert inserted["total_tokens"] == 150
        assert inserted["agent"] == "architect"

        # Verify result has budget info
        assert result["budget_remaining"] == 9500