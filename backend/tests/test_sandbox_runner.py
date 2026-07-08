"""Tests for sandbox runner timeout enforcement (P3-DEV-001)."""

import asyncio
import pytest

from sandbox.runner import SandboxRunner


@pytest.fixture
def runner():
    return SandboxRunner()


@pytest.mark.asyncio
async def test_run_returns_empty_string_for_clean_python_files(runner):
    result = await runner.run({
        "main.py": "print('hello')\n",
    })
    assert result == ""


@pytest.mark.asyncio
async def test_run_returns_syntax_errors_for_broken_python(runner):
    result = await runner.run({
        "main.py": "def broken(\n    pass\n",
    })
    assert "Python syntax error" in result


@pytest.mark.asyncio
async def test_run_catches_unsafe_path_traversal(runner):
    result = await runner.run({
        "../../etc/passwd": "malicious content",
    })
    assert "Refused unsafe file path" in result


@pytest.mark.asyncio
async def test_run_enforces_sandbox_timeout_when_checks_exceed_budget(
    runner, monkeypatch,
):
    """A hung check must be killed by the outer sandbox_timeout budget."""
    
    async def _slow_check(self, tmpdir, files):
        await asyncio.sleep(20)  # hangs well past any realistic timeout
        return []

    monkeypatch.setattr(
        "sandbox.runner.SandboxRunner._check_python", _slow_check,
    )
    # Lower the overall budget below the fake hang duration.
    import sandbox.runner as runner_module
    runner_module.settings.sandbox_timeout = 0.1

    result = await runner.run({"main.py": "print('hello')\n"})
    assert "timed out" in result.lower()
    assert "0.1s" in result or "0.1" in result


@pytest.mark.asyncio
async def test_run_succeeds_when_checks_finish_under_timeout(runner):
    """A clean run under the default 120s budget must complete normally."""
    import sandbox.runner as runner_module
    # Restore the real budget in case a previous test lowered it.
    runner_module.settings.sandbox_timeout = 120

    files = {"main.py": "print('hello')\n"}
    result = await runner.run(files)
    assert result == ""
