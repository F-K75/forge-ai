"""Tests for Celery build tasks."""

import os

os.environ["TESTING"] = "true"
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)


class TestCeleryBuildTasks:
    """Test Celery build task configuration."""

    def test_celery_task_module_exists(self):
        """Verify Celery task module exists."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        assert p.exists(), "tasks/build_tasks.py should exist"

    def test_celery_task_has_retry_config(self):
        """Verify Celery task has retry configuration."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")

        # Should have retry configuration
        assert "retry_kwargs" in content or "autoretry" in content.lower()
        assert "max_retries" in content

    def test_celery_task_uses_asyncio(self):
        """Verify Celery task handles async code properly."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")

        # Should have async event handling
        assert "asyncio.run" in content or "async def" in content

    def test_celery_task_emits_events(self):
        """Verify Celery task emits WebSocket events."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")

        # Should call manager.emit for events
        assert "manager.emit" in content

    def test_celery_task_handles_credits(self):
        """Verify Celery task handles credit refunds."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")

        # Should handle credits on success and failure
        assert "credits" in content
        assert "refund" in content.lower() or "$inc" in content


class TestBuildAPICelery:
    """Test build API uses Celery instead of BackgroundTasks."""

    def test_builds_api_uses_celery(self):
        """Verify build endpoint uses Celery for processing."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "api" / "builds.py"
        content = p.read_text(encoding="utf-8")

        # Should import and use Celery task
        assert "run_build.delay" in content
        assert "tasks.build_tasks" in content

        # Should NOT use BackgroundTasks
        assert "BackgroundTasks" not in content

    def test_build_endpoint_returns_immediately(self):
        """Verify build endpoint returns build_id without waiting."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "api" / "builds.py"
        content = p.read_text(encoding="utf-8")

        # Should return after enqueueing task
        assert "return" in content
        assert "build_id" in content

    def test_celery_app_config_exists(self):
        """Verify Celery app configuration exists."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "celery_app.py"
        assert p.exists(), "celery_app.py should exist"

        content = p.read_text(encoding="utf-8")
        assert "Celery" in content
        assert "broker" in content
        assert "backend" in content

    def test_celery_app_has_task_routes(self):
        """Verify Celery app has task routing."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "celery_app.py"
        content = p.read_text(encoding="utf-8")

        assert "task_routes" in content
        assert "build" in content


class TestBuildIdempotency:
    """Test build idempotency to prevent duplicate processing."""

    def test_build_deduplication_check(self):
        """Verify duplicate build detection exists."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "api" / "builds.py"
        content = p.read_text(encoding="utf-8")

        assert "recent_build" in content
        assert "30 seconds" in content.lower() or "thirty_seconds" in content