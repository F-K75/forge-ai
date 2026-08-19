"""Tests for deployment.py — 30s health check timeout with auto-rollback."""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017/forge-test")

from app.tasks.deployment import (
    run_health_check_with_rollback,
    _rollback_deployment,
)


class TestRunHealthCheckWithRollback:
    @pytest.mark.asyncio
    async def test_health_check_passes_on_success(self):
        emit = AsyncMock()

        async def mock_health_response():
            return MagicMock(status_code=200)

        with patch("app.tasks.deployment.httpx.AsyncClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_instance.get = AsyncMock(return_value=MagicMock(status_code=200))
            MockClient.return_value = mock_instance

            result = await run_health_check_with_rollback(
                "deploy-123", "http://localhost:8000", emit
            )
            assert result is True

    @pytest.mark.asyncio
    async def test_health_check_rolls_back_on_timeout(self):
        emit = AsyncMock()

        with patch("app.tasks.deployment.httpx.AsyncClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_instance.get = AsyncMock(
                side_effect=Exception("Connection refused")
            )
            MockClient.return_value = mock_instance

            with patch("app.tasks.deployment._rollback_deployment") as mock_rollback:
                result = await run_health_check_with_rollback(
                    "deploy-123", "http://localhost:8000", emit
                )
                assert result is False
                mock_rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_health_check_uses_correct_url(self):
        emit = AsyncMock()

        with patch("app.tasks.deployment.httpx.AsyncClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_instance.get = AsyncMock(
                side_effect=[Exception("fail"), Exception("fail"), MagicMock(status_code=200)]
            )
            MockClient.return_value = mock_instance

            result = await run_health_check_with_rollback(
                "deploy-456", "http://host:9000", emit
            )
            assert result is True
            mock_instance.get.assert_any_call("http://host:9000/health")


class TestRollbackDeployment:
    @pytest.mark.asyncio
    async def test_rollback_stops_container(self):
        emit = AsyncMock()

        mock_container = MagicMock()
        mock_container.stop = MagicMock()
        mock_container.remove = MagicMock()

        mock_client = MagicMock()
        mock_client.containers.get = MagicMock(return_value=mock_container)

        class _NotFound(Exception):
            pass

        with patch("app.tasks.deployment.docker") as mock_docker:
            mock_docker.errors.NotFound = _NotFound
            mock_docker.from_env.return_value = mock_client

            await _rollback_deployment("deploy-789", "http://localhost:8000", emit)

            mock_container.stop.assert_called_once_with(timeout=5)
            mock_container.remove.assert_called_once()

    @pytest.mark.asyncio
    async def test_rollback_emits_failed_event(self):
        emit = AsyncMock()

        class _NotFound(Exception):
            pass

        with patch("app.tasks.deployment.docker") as mock_docker:
            mock_docker.errors.NotFound = _NotFound
            mock_client = MagicMock()
            mock_client.containers.get.side_effect = _NotFound()
            mock_docker.from_env.return_value = mock_client

            await _rollback_deployment("deploy-789", "http://localhost:8000", emit)

            emit.assert_called()
            call_args = emit.call_args
            assert call_args[0][0].type.value == "build_failed"

    @pytest.mark.asyncio
    async def test_rollback_handles_not_found(self):
        emit = AsyncMock()

        class _NotFound(Exception):
            pass

        mock_client = MagicMock()
        mock_client.containers.get.side_effect = _NotFound()

        with patch("app.tasks.deployment.docker") as mock_docker:
            mock_docker.errors.NotFound = _NotFound
            mock_docker.from_env.return_value = mock_client

            await _rollback_deployment("deploy-789", "http://localhost:8000", emit)
            emit.assert_called()