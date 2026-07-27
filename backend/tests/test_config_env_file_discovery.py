"""Settings must find the repo-root .env, not just the one in the cwd.

docker-compose interpolates ${VAR} from the repo-root .env, while the README's
local-dev instructions (`cd backend && uvicorn main:app`) make a bare ".env"
resolve to backend/.env. With a single .env.example at the repo root, following
both docs at once produced empty required settings and an import-time crash.

None of these tests write to the real repo root. An earlier version did, and
had to skip itself whenever a developer already had a .env -- which meant it
went quiet on exactly the machines where it mattered.
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


def _settings_from(*paths):
    """Build Settings against a specific set of env files.

    Uses the documented `_env_file` init override rather than patching
    Settings.Config: pydantic-settings resolves env_file when the class is
    defined, so a monkeypatched class attribute is silently ignored and the
    test passes against the real config instead of the one it meant to use.
    """
    return config.Settings(_env_file=tuple(p for p in paths if p is not None))


# --- the guard that decides whether a repo-root .env exists at all -----------


def test_repo_root_env_resolves_to_the_repo_root_in_a_checkout():
    """In a checkout, the second env path is the repo root's .env."""
    assert config._REPO_ROOT_ENV is not None
    assert config._REPO_ROOT_ENV == REPO_ROOT / ".env"
    assert (REPO_ROOT / "docker-compose.yml").is_file()


def test_settings_actually_consults_the_repo_root_env():
    """The contract a revert would break: the root path is IN env_file.

    The loading tests below pass an explicit `_env_file`, so they characterise
    pydantic rather than this repo's wiring. This is the one that fails if
    someone restores `env_file = ".env"`.
    """
    env_file = config.Settings.Config.env_file

    assert isinstance(env_file, tuple), f"expected a tuple of paths, got {env_file!r}"
    assert config._REPO_ROOT_ENV in env_file
    assert ".env" in env_file, "the cwd-relative entry must survive for local overrides"


def test_repo_root_env_is_none_outside_a_checkout(monkeypatch, tmp_path):
    """The container copies backend/ to /app, so parents[2] is "/" there.

    Without this guard the filesystem root's .env would join the config search
    path of a service holding the field encryption key.
    """
    fake = tmp_path / "app" / "core" / "config.py"
    fake.parent.mkdir(parents=True)
    monkeypatch.setattr(config, "__file__", str(fake))

    assert config._repo_root_env() is None


def test_repo_root_env_is_found_when_a_compose_file_sits_beside_it(
    monkeypatch, tmp_path
):
    """A real checkout is identified by docker-compose.yml next to the .env."""
    root = tmp_path / "repo"
    (root / "backend" / "core").mkdir(parents=True)
    (root / "docker-compose.yml").write_text("services: {}\n")
    monkeypatch.setattr(config, "__file__", str(root / "backend" / "core" / "config.py"))

    assert config._repo_root_env() == root / ".env"


# --- the loading behaviour that the guard feeds ------------------------------


def test_root_env_is_found_from_a_different_cwd(monkeypatch, tmp_path, env_from_files_only):
    """The README's own instructions must produce a working config.

    Regression guard: `env_file = ".env"` resolved against the cwd, so running
    from backend/ never saw the repo-root file and every required setting came
    back empty.
    """
    root_env = tmp_path / "root.env"
    root_env.write_text(ENV_BODY)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    settings = _settings_from(root_env, ".env")

    assert settings.mongodb_url == "mongodb://localhost:27017/forge-envtest"
    assert settings.jwt_secret
    assert settings.field_encryption_key


def test_cwd_env_wins_over_root(monkeypatch, tmp_path, env_from_files_only):
    """A .env sitting next to you overrides the shared repo-root one."""
    root_env = tmp_path / "root.env"
    root_env.write_text(ENV_BODY)
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    (work_dir / ".env").write_text(ENV_BODY.replace("forge-envtest", "forge-cwd-wins"))
    monkeypatch.chdir(work_dir)

    settings = _settings_from(root_env, ".env")

    assert settings.mongodb_url == "mongodb://localhost:27017/forge-cwd-wins"


def test_absent_root_env_is_a_no_op(monkeypatch, tmp_path, env_from_files_only):
    """A root path that does not exist must not break loading.

    pydantic-settings ignores missing env files, which is what makes the
    two-path env_file safe. That was an assertion in a comment until now.
    """
    work_dir = tmp_path / "no_root"
    work_dir.mkdir()
    (work_dir / ".env").write_text(ENV_BODY.replace("forge-envtest", "forge-no-root"))
    monkeypatch.chdir(work_dir)

    settings = _settings_from(tmp_path / "definitely" / "absent" / ".env", ".env")

    assert settings.mongodb_url == "mongodb://localhost:27017/forge-no-root"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
