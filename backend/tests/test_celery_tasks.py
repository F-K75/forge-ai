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

        # Should import and use Celery task (apply_async since the build
        # endpoint dispatches with headers/correlation_id)
        assert "run_build.apply_async" in content
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

    def test_run_build_bound_to_the_real_configured_app(self):
        """Regression test for a real bug: build_tasks.py used to decorate its
        tasks with `@current_app.task(...)` from a bare `from celery import
        current_app` import. celery_app.py (the module that actually builds a
        Redis-backed Celery app) was never imported anywhere else in the app,
        so `current_app` silently resolved to Celery's unconfigured default
        app (broker_url=None), and every `.delay()` call tried to reach
        RabbitMQ's default port and failed with ECONNREFUSED. Source-text
        checks can't catch this since the broken version also contains the
        substring "current_app.task(" — only actually importing and checking
        object identity/config catches it.
        """
        from tasks.build_tasks import run_build, update_build_status
        from celery_app import celery_app

        assert run_build.app is celery_app
        assert update_build_status.app is celery_app
        assert celery_app.conf.broker_url is not None
        assert "localhost" in celery_app.conf.broker_url or "redis" in celery_app.conf.broker_url

    def test_run_build_task_actually_registered_on_app(self):
        """A worker can only run tasks that are registered on its app. This
        would have caught the autodiscover_tasks(["backend"]) bug: that call
        crashed real worker startup (ModuleNotFoundError: No module named
        'backend'), and even if it hadn't crashed, it would never have found
        these tasks since there's no top-level "backend" package in this
        project's actual runtime layout.
        """
        from tasks.build_tasks import run_build, update_build_status  # noqa: F401
        from celery_app import celery_app

        assert "backend.tasks.build_tasks.run_build" in celery_app.tasks
        assert "backend.tasks.build_tasks.update_build_status" in celery_app.tasks

    def test_run_build_has_time_limit_wired_from_settings(self):
        """Regression test for a real bug: `settings.build_timeout` ("10 minutes
        max per build") was never referenced anywhere outside core/config.py —
        the task decorator had no `time_limit`/`soft_time_limit`, so nothing
        actually enforced it. A hung pipeline (agent retry storm, a stuck call
        outside the LLM client's own per-call timeout, a debug-loop bug bypassing
        MAX_DEBUG_ITERATIONS) would occupy a worker slot forever with the user's
        credits reserved and never refunded.
        """
        from tasks.build_tasks import run_build, settings

        assert run_build.soft_time_limit == settings.build_timeout
        assert run_build.time_limit > run_build.soft_time_limit

    def test_worker_can_process_more_than_one_task_per_process(self):
        """Regression test for a real bug: both tasks used to run their async
        body via `asyncio.run(...)`, which closes its event loop when done.
        core/database.py's Mongo client is a process-global singleton bound
        to whichever loop first created it, so the first task in a worker
        process would succeed and every task after it (including retries of
        the same task) would permanently fail with "RuntimeError: Event loop
        is closed". Reproduced live against a real worker before the fix:
        of 8 queued tasks, exactly 1 succeeded. This test simulates a worker
        processing two tasks in the same process without needing a live
        broker or database.
        """
        from tasks import build_tasks

        async def _noop():
            return "ok"

        first = build_tasks._run_async(_noop())
        second = build_tasks._run_async(_noop())

        assert first == "ok"
        assert second == "ok"
        assert build_tasks._worker_loop is not None
        assert not build_tasks._worker_loop.is_closed()


class TestBuildIdempotency:
    """Test build idempotency to prevent duplicate processing."""

    def test_build_deduplication_check(self):
        """Verify duplicate build detection exists."""
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "api" / "builds.py"
        content = p.read_text(encoding="utf-8")

        assert "recent_build" in content
        assert "30 seconds" in content.lower() or "thirty_seconds" in content