"""Settings must find the repo-root .env, not just the one in the cwd.

docker-compose interpolates ${VAR} from the repo-root .env, while the README's
local-dev instructions (`cd backend && uvicorn main:app`) make a bare ".env"
resolve to backend/.env. With a single .env.example at the repo root, following
both docs at once produced empty required settings and an import-time crash.
"""

from pathlib import Path

import pytest

from core import config

REPO_ROOT = Path(config.__file__).resolve().parents[2]

# Settings reads these from the environment first, and conftest.py sets them for
# the whole suite. They have to be cleared or the .env file is never consulted.
REQUIRED = ("MONGODB_URL", "JWT_SECRET", "FIELD_ENCRYPTION_KEY")

ENV_BODY = (
    "MONGODB_URL=mongodb://localhost:27017/forge-envtest\n"
    "JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n"
    "FIELD_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef"
    "0123456789abcdef0123456789abcdef\n"
    "APP_ENV=development\n"
)


@pytest.fixture
def env_from_files_only(monkeypatch):
    """Force Settings to resolve from .env files rather than the process env."""
    for name in REQUIRED:
        monkeypatch.delenv(name, raising=False)
    # CI_TEST_MODE relaxes the MONGODB_URL requirement, which would hide the bug.
    monkeypatch.delenv("CI_TEST_MODE", raising=False)
    monkeypatch.setenv("APP_ENV", "development")


@pytest.fixture
def root_env_file():
    """Write a repo-root .env, and never clobber a real one."""
    path = REPO_ROOT / ".env"
    if path.exists():
        pytest.skip("repo-root .env already exists; refusing to overwrite it")
    path.write_text(ENV_BODY)
    yield path
    path.unlink(missing_ok=True)


def test_root_env_is_found_when_running_from_backend(
    monkeypatch, tmp_path, env_from_files_only, root_env_file
):
    """The README's own instructions must produce a working config.

    Regression guard: `env_file = ".env"` resolved against the cwd, so running
    from backend/ never saw the repo-root file and every required setting came
    back empty.
    """
    backend_dir = REPO_ROOT / "backend"
    monkeypatch.chdir(backend_dir)
    assert not (backend_dir / ".env").exists(), "test assumes no backend/.env"

    settings = config.Settings()

    assert settings.mongodb_url == "mongodb://localhost:27017/forge-envtest"
    assert settings.jwt_secret
    assert settings.field_encryption_key


def test_cwd_env_still_wins_over_root(
    monkeypatch, env_from_files_only, root_env_file, tmp_path
):
    """A .env sitting next to you overrides the shared repo-root one.

    Someone who deliberately drops a .env into their working directory expects
    it to take precedence over the repo-wide defaults.
    """
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    (work_dir / ".env").write_text(
        ENV_BODY.replace("forge-envtest", "forge-cwd-wins")
    )
    monkeypatch.chdir(work_dir)

    settings = config.Settings()

    assert settings.mongodb_url == "mongodb://localhost:27017/forge-cwd-wins"


def test_repo_root_env_path_points_at_the_repo_root():
    """The resolved path must be the repo root, not backend/ or core/."""
    assert config._REPO_ROOT_ENV.parent == REPO_ROOT
    assert (config._REPO_ROOT_ENV.parent / "docker-compose.yml").exists()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
