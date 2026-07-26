"""
Tests for webhook delivery service (services/webhook.py).
Covers SSRF re-validation at delivery time, HMAC signing, queue push/pop,
retry logic, and worker initialisation — all without real Redis or HTTP.
"""
import asyncio
import contextlib
import json
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from services.webhook import (
    deliver_webhook,
    queue_webhook_delivery,
    process_webhook_queue,
    init_webhook_worker,
)


class TestDeliverWebhook:
    """deliver_webhook() — SSRF guard + HMAC signing + HTTP delivery."""

    async def test_rejects_invalid_url_at_delivery_time(self, monkeypatch):
        """Re-validates against SSRF even if the URL was valid at creation time."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(False, "blocked by SSRF guard")),
        )
        result = await deliver_webhook(
            "http://169.254.169.254/latest/meta-data/",
            {"event": "test"},
            "secret",
        )
        assert result is False

    async def test_valid_url_sends_signed_payload(self, monkeypatch):
        """A valid URL gets an HMAC-signed POST with the correct headers."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(True, "")),
        )
        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_client = AsyncMock()
        fake_client.__aenter__.return_value = fake_client
        fake_client.post = AsyncMock(return_value=fake_response)
        monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: fake_client)

        result = await deliver_webhook(
            "https://hooks.example.com/evt",
            {"event": "build.completed"},
            "whsec_test",
        )
        assert result is True
        # Verify the POST call
        fake_client.post.assert_awaited_once()
        # deliver_webhook passes the URL positionally: client.post(url, data=..., headers=...)
        call_args, call_kwargs = fake_client.post.call_args
        assert call_args[0] == "https://hooks.example.com/evt"
        headers = call_kwargs["headers"]
        assert headers["Content-Type"] == "application/json"
        assert "X-Forge-Timestamp" in headers
        assert headers["X-Forge-Signature"].startswith("v1=")
        # Body is compact JSON
        body = json.loads(call_kwargs["data"])
        assert body["event"] == "build.completed"

    async def test_successful_status_codes(self, monkeypatch):
        """200, 201, and 204 are all considered successful deliveries."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(True, "")),
        )
        for code in (200, 201, 204):
            fake_response = MagicMock()
            fake_response.status_code = code
            fake_client = AsyncMock()
            fake_client.__aenter__.return_value = fake_client
            fake_client.post = AsyncMock(return_value=fake_response)
            monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: fake_client)
            result = await deliver_webhook(
                "https://hooks.example.com/ok", {"test": True}, "secret"
            )
            assert result is True, f"status {code} should be accepted"

    async def test_non_success_status_is_failure(self, monkeypatch):
        """4xx and 5xx responses are treated as delivery failures."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(True, "")),
        )
        for code in (400, 404, 410, 500, 502, 503):
            fake_response = MagicMock()
            fake_response.status_code = code
            fake_client = AsyncMock()
            fake_client.__aenter__.return_value = fake_client
            fake_client.post = AsyncMock(return_value=fake_response)
            monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: fake_client)
            result = await deliver_webhook(
                "https://hooks.example.com/fail", {"test": True}, "secret"
            )
            assert result is False, f"status {code} should be rejected"

    async def test_network_error_returns_false(self, monkeypatch):
        """A connection error does not raise — it returns False."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(True, "")),
        )
        fake_client = AsyncMock()
        fake_client.__aenter__.return_value = fake_client
        fake_client.post = AsyncMock(side_effect=Exception("connection refused"))
        monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: fake_client)

        result = await deliver_webhook(
            "https://hooks.example.com/down", {"event": "x"}, "secret"
        )
        assert result is False

    async def test_hmac_signature_deterministic(self, monkeypatch):
        """Same secret + payload + timestamp produces the same signature."""
        monkeypatch.setattr(
            "services.webhook.validate_webhook_url",
            AsyncMock(return_value=(True, "")),
        )
        fake_response = MagicMock()
        fake_response.status_code = 200
        client_a = AsyncMock()
        client_a.__aenter__.return_value = client_a
        client_a.post = AsyncMock(return_value=fake_response)
        client_b = AsyncMock()
        client_b.__aenter__.return_value = client_b
        client_b.post = AsyncMock(return_value=fake_response)

        # Freeze utcnow so the timestamp is identical across two calls
        frozen = datetime(2026, 7, 9, 12, 0, 0)
        monkeypatch.setattr("services.webhook.datetime", MagicMock(utcnow=MagicMock(return_value=frozen)))

        monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: client_a)
        await deliver_webhook("https://hooks.example.com/a", {"x": 1}, "secret")
        sig_a = client_a.post.call_args[1]["headers"]["X-Forge-Signature"]

        monkeypatch.setattr("services.webhook.httpx.AsyncClient", lambda **kw: client_b)
        await deliver_webhook("https://hooks.example.com/b", {"x": 1}, "secret")
        sig_b = client_b.post.call_args[1]["headers"]["X-Forge-Signature"]

        assert sig_a == sig_b


class TestQueueWebhookDelivery:
    """queue_webhook_delivery() — fetching webhooks + pushing to Redis queue."""

    async def test_no_active_webhooks_does_nothing(self, monkeypatch):
        """When the user has no active webhooks, nothing is pushed to Redis."""
        fake_db = MagicMock()
        fake_db.webhooks.find = MagicMock()
        fake_db.webhooks.find.return_value.to_list = AsyncMock(return_value=[])

        fake_redis = MagicMock()
        fake_redis.lpush = AsyncMock()

        monkeypatch.setattr("services.webhook.get_db", AsyncMock(return_value=fake_db))
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))

        await queue_webhook_delivery("user-1", "build.completed", {"build_id": "b-1"})
        fake_redis.lpush.assert_not_called()

    async def test_pushes_one_item_per_active_webhook(self, monkeypatch):
        """Each active webhook gets a queue item with the correct shape."""
        fake_db = MagicMock()
        fake_db.webhooks.find = MagicMock()
        fake_db.webhooks.find.return_value.to_list = AsyncMock(
            return_value=[
                {"id": "wh-1", "url": "https://hook.a", "secret": "s1"},
                {"id": "wh-2", "url": "https://hook.b", "secret": "s2"},
            ]
        )

        fake_redis = MagicMock()
        fake_redis.lpush = AsyncMock()

        monkeypatch.setattr("services.webhook.get_db", AsyncMock(return_value=fake_db))
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))

        await queue_webhook_delivery("user-1", "build.completed", {"build_id": "b-1"})

        assert fake_redis.lpush.await_count == 2

        # Inspect the first pushed item
        first_call = fake_redis.lpush.call_args_list[0]
        assert first_call[0][0] == "webhook_queue"
        item = json.loads(first_call[0][1])
        assert item["webhook_id"] == "wh-1" or item["webhook_id"] == "wh-2"
        assert item["url"] in ("https://hook.a", "https://hook.b")
        assert item["event_type"] == "build.completed"
        assert item["attempts"] == 0
        assert item["max_attempts"] == 3
        assert "payload" in item

    async def test_user_id_filter_applied(self, monkeypatch):
        """Only webhooks belonging to the specified user are fetched."""
        fake_db = MagicMock()
        fake_db.webhooks.find = MagicMock()
        fake_db.webhooks.find.return_value.to_list = AsyncMock(return_value=[])

        fake_redis = MagicMock()
        fake_redis.lpush = AsyncMock()

        monkeypatch.setattr("services.webhook.get_db", AsyncMock(return_value=fake_db))
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))

        await queue_webhook_delivery("user-42", "build.completed", {})

        fake_db.webhooks.find.assert_called_once_with(
            {"user_id": "user-42", "active": True}
        )


class TestProcessWebhookQueue:
    """process_webhook_queue() — Redis BRPOP loop + delivery + retry.

    The worker is an unbounded `while True` loop that treats a falsy BRPOP as
    `continue`, so returning None from the mock never ends it. Each test drives
    exactly one iteration and then raises CancelledError, which is a
    BaseException and therefore passes through the loop's `except Exception`.
    """

    async def test_brpop_loop_delivers_and_does_not_retry_on_success(self, monkeypatch):
        """A successful delivery is popped and not re-queued."""
        item = json.dumps({
            "id": "wh_123",
            "webhook_id": "wh-1",
            "url": "https://hook.example.com/ok",
            "secret": "s1",
            "event_type": "build.completed",
            "payload": {"build_id": "b-1"},
            "attempts": 0,
            "max_attempts": 3,
            "created_at": "2026-07-09T12:00:00",
        })

        fake_redis = MagicMock()
        fake_redis.brpop = AsyncMock(return_value=("webhook_queue", item))
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))

        delivered = []

        async def fake_deliver(url, payload, secret):
            delivered.append(url)
            return True

        monkeypatch.setattr("services.webhook.deliver_webhook", fake_deliver)

        # Run one iteration by making brpop return None after the first call
        call_count = 0

        async def brpop_sequence(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("webhook_queue", item)
            raise asyncio.CancelledError

        fake_redis.brpop = AsyncMock(side_effect=brpop_sequence)

        with contextlib.suppress(asyncio.CancelledError):
            await process_webhook_queue()

        assert delivered == ["https://hook.example.com/ok"]
        fake_redis.lpush.assert_not_called()

    async def test_failed_delivery_is_retried_up_to_max_attempts(self, monkeypatch):
        """A failed delivery is re-queued if attempts < max_attempts."""
        item = {
            "id": "wh_456",
            "webhook_id": "wh-2",
            "url": "https://hook.example.com/fail",
            "secret": "s1",
            "event_type": "build.completed",
            "payload": {"build_id": "b-2"},
            "attempts": 0,
            "max_attempts": 3,
            "created_at": "2026-07-09T12:00:00",
        }

        fake_redis = MagicMock()
        # lpush is awaited by the worker, so it must be an AsyncMock -- a plain
        # MagicMock returns a non-awaitable and the worker's `except Exception`
        # would swallow the resulting TypeError, hiding the re-queue entirely.
        fake_redis.lpush = AsyncMock()
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))

        monkeypatch.setattr(
            "services.webhook.deliver_webhook",
            AsyncMock(return_value=False),
        )

        call_count = 0

        async def brpop_sequence(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("webhook_queue", json.dumps(item))
            raise asyncio.CancelledError

        fake_redis.brpop = AsyncMock(side_effect=brpop_sequence)

        with contextlib.suppress(asyncio.CancelledError):
            await process_webhook_queue()

        # Should have re-queued with attempts=1
        fake_redis.lpush.assert_awaited_once()
        requeued = json.loads(fake_redis.lpush.call_args[0][1])
        assert requeued["attempts"] == 1
        assert requeued["webhook_id"] == "wh-2"

    async def test_exhausted_attempts_not_retried(self, monkeypatch):
        """An item that has reached max_attempts is dropped (not re-queued)."""
        item = {
            "id": "wh_789",
            "webhook_id": "wh-3",
            "url": "https://hook.example.com/give-up",
            "secret": "s1",
            "event_type": "build.completed",
            "payload": {},
            "attempts": 3,
            "max_attempts": 3,
            "created_at": "2026-07-09T12:00:00",
        }

        fake_redis = MagicMock()
        monkeypatch.setattr("services.webhook.get_redis", AsyncMock(return_value=fake_redis))
        monkeypatch.setattr(
            "services.webhook.deliver_webhook",
            AsyncMock(return_value=False),
        )

        call_count = 0

        async def brpop_sequence(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("webhook_queue", json.dumps(item))
            raise asyncio.CancelledError

        fake_redis.brpop = AsyncMock(side_effect=brpop_sequence)

        with contextlib.suppress(asyncio.CancelledError):
            await process_webhook_queue()

        fake_redis.lpush.assert_not_called()


class TestInitWebhookWorker:
    """init_webhook_worker() — background task creation."""

    async def test_creates_asyncio_task(self, monkeypatch):
        """init_webhook_worker creates a background task for the queue processor."""
        created_tasks = []

        def fake_create_task(coro, *args, **kwargs):
            created_tasks.append(coro)
            return MagicMock()

        monkeypatch.setattr("services.webhook.asyncio.create_task", fake_create_task)

        init_webhook_worker()

        assert len(created_tasks) == 1
        # The coroutine should be process_webhook_queue
        assert created_tasks[0].cr_code.co_name == "process_webhook_queue"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])