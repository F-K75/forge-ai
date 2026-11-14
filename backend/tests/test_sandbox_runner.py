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


@pytest.mark.asyncio
async def test_run_fails_closed_in_production_when_bwrap_missing(runner, monkeypatch):
    """Non-development environments must fail closed when bwrap is unavailable."""
    import sandbox.runner as runner_module

    monkeypatch.setattr(runner_module.shutil, "which", lambda _cmd: None)
    monkeypatch.setattr(runner_module.settings, "app_env", "production")
    monkeypatch.delenv("TESTING", raising=False)

    result = await runner.run({"main.py": "print('hello')\n"})
    assert "bubblewrap" in result.lower() or "bwrap" in result.lower()
    assert "non-development" in result.lower()


@pytest.mark.asyncio
async def test_run_falls_back_in_development_when_bwrap_missing(runner, monkeypatch):
    """Development mode allows fallback when bwrap is unavailable."""
    import sandbox.runner as runner_module

    monkeypatch.setattr(runner_module.shutil, "which", lambda _cmd: None)
    monkeypatch.setattr(runner_module.settings, "app_env", "development")
    monkeypatch.delenv("TESTING", raising=False)

    result = await runner.run({"main.py": "print('hello')\n"})
    assert result == ""


@pytest.mark.asyncio
async def test_run_uses_bwrap_when_available(runner, monkeypatch):
    """When bwrap is available, _check_python invokes it to wrap py_compile."""
    import sandbox.runner as runner_module

    recorded_cmds = []

    class _FakeProc:
        returncode = 0

        async def communicate(self):
            return b"", b""

    async def _fake_exec(*cmd, **_kwargs):
        recorded_cmds.append(cmd)
        return _FakeProc()

    monkeypatch.setattr(runner_module.shutil, "which", lambda cmd: "/usr/bin/bwrap" if cmd == "bwrap" else None)
    monkeypatch.setattr(runner_module.settings, "app_env", "production")
    monkeypatch.setattr(runner_module.asyncio, "create_subprocess_exec", _fake_exec)

    result = await runner.run({"main.py": "print('hello')\n"})
    assert result == ""
    assert len(recorded_cmds) == 1
    assert recorded_cmds[0][0] == "/usr/bin/bwrap"
    assert "--unshare-all" in recorded_cmds[0]
    assert "py_compile" in recorded_cmds[0]
