"""Tests for log_streamer.py — secret masking on streamed build logs."""

import os
import pytest

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/forge-test")

from app.services.log_streamer import (
    redact_secrets,
    stream_logs_with_redaction,
)


class TestRedactSecrets:
    def test_redacts_stripe_live_key(self):
        result = redact_secrets("Using key sk_live_abc123def456")
        assert "sk_live_<REDACTED>" in result
        assert "sk_live_abc123def456" not in result

    def test_redacts_stripe_test_key(self):
        result = redact_secrets("Test key sk_test_abc123def456")
        assert "sk_test_<REDACTED>" in result

    def test_redacts_publishable_key(self):
        result = redact_secrets("Public key pk_live_abc123def456")
        assert "pk_live_<REDACTED>" in result

    def test_redacts_webhook_secret(self):
        result = redact_secrets("Webhook secret whsec_abc123def456")
        assert "whsec_<REDACTED>" in result

    def test_redacts_mongodb_url(self):
        result = redact_secrets("Connecting to mongodb://user:pass@host:27017/db")
        assert "mongodb://<REDACTED>@host:27017/db" in result
        assert "user:pass" not in result

    def test_redacts_mongodb_srv_url(self):
        result = redact_secrets("URI: mongodb+srv://user:pass@cluster.example.com/db")
        assert "mongodb+srv://<REDACTED>@cluster.example.com/db" in result

    def test_redacts_redis_url(self):
        result = redact_secrets("Redis: redis://:secretpassword@host:6379")
        assert "redis://:<REDACTED>@host:6379" in result

    def test_redacts_password_assignment(self):
        result = redact_secrets("password = mysecretpass123")
        assert "Password=<REDACTED>" in result

    def test_redacts_secret_assignment(self):
        result = redact_secrets("secret = mysecretvalue123")
        assert "Secret=<REDACTED>" in result

    def test_redacts_api_key_assignment(self):
        result = redact_secrets("API_KEY = sk_live_abc123def456")
        assert "API_KEY=<REDACTED>" in result

    def test_preserves_non_secret_text(self):
        text = "Build completed successfully in 42 seconds"
        assert redact_secrets(text) == text

    def test_preserves_normal_log_lines(self):
        text = "INFO: Starting build process for initiative abc123"
        assert redact_secrets(text) == text

    def test_multiple_secrets_in_one_line(self):
        text = "Connected to mongodb://user:pass@host/db with key sk_live_abc123def456"
        result = redact_secrets(text)
        assert "<REDACTED>" in result
        assert "user:pass" not in result
        assert "sk_live_abc123def456" not in result


class TestStreamLogsWithRedaction:
    @pytest.mark.asyncio
    async def test_redacts_each_line(self):
        async def fake_log_source():
            yield "Line with sk_live_abc123def456"
            yield "Normal log line"
            yield "Another line with password = mysecretpass123"

        emitted = []

        async def fake_emit(msg):
            emitted.append(msg)

        await stream_logs_with_redaction(fake_log_source(), fake_emit)

        assert len(emitted) == 3
        assert "sk_live_<REDACTED>" in emitted[0]
        assert "sk_live_abc123def456" not in emitted[0]
        assert emitted[1] == "Normal log line"
        assert "Password=<REDACTED>" in emitted[2]

    @pytest.mark.asyncio
    async def test_empty_source_emits_nothing(self):
        async def empty_source():
            return
            yield  # Make it async generator

        emitted = []

        async def fake_emit(msg):
            emitted.append(msg)

        await stream_logs_with_redaction(empty_source(), fake_emit)
        assert len(emitted) == 0