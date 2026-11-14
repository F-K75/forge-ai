"""Regression tests for TASK-004 (deployments build_files & teardown) and TASK-005 (Google OAuth state/email_verified/MFA)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import deployments as deployments_api
from core.models import Deployment, DeploymentStatus


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return list(self._docs)


class _FakeBuildFilesCollection:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query, projection=None):
        bid = query.get("build_id")
        return _FakeCursor([d for d in self._docs if d.get("build_id") == bid])


class _FakeUpdateCollection:
    def __init__(self):
        self.updates = []

    async def update_one(self, query, update):
        self.updates.append((query, update))


class _FakeDeployDB:
    def __init__(self, build_file_docs):
        self.build_files = _FakeBuildFilesCollection(build_file_docs)
        self.deployments = _FakeUpdateCollection()
        self.projects = _FakeUpdateCollection()


@pytest.mark.asyncio
async def test_load_build_files_prefers_db_build_files_over_build_dict():
    db = _FakeDeployDB(
        [
            {"build_id": "b1", "path": "app.py", "content": "print('from db')"},
            {"build_id": "b2", "path": "other.py", "content": "ignore"},
        ]
    )
    files = await deployments_api._load_build_files(
        db, {"id": "b1", "files": {"app.py": "stale"}}
    )
    assert files == {"app.py": "print('from db')"}


@pytest.mark.asyncio
async def test_load_build_files_falls_back_to_build_dict_when_db_empty():
    db = _FakeDeployDB([])
    files = await deployments_api._load_build_files(
        db, {"id": "b1", "files": {"index.html": "<h1>hi</h1>"}}
    )
    assert files == {"index.html": "<h1>hi</h1>"}


@pytest.mark.asyncio
async def test_run_deployment_background_writes_db_files_and_does_not_teardown_on_success(
    monkeypatch,
):
    db = _FakeDeployDB(
        [{"build_id": "b1", "path": "src/main.py", "content": "print('live')"}]
    )
    seen_files = {}

    class _FakeTarget:
        def __init__(self):
            self.deploy_calls = 0
            self.teardown_calls = 0

        async def deploy(self, source_dir, project, build, env_vars):
            self.deploy_calls += 1
            with open(f"{source_dir}/src/main.py", encoding="utf-8") as f:
                seen_files["src/main.py"] = f.read()
            return SimpleNamespace(url="https://app.example.com", logs="ok")

        async def teardown(self, deployment_id, project):
            self.teardown_calls += 1

    fake_target = _FakeTarget()
    monkeypatch.setattr(
        deployments_api, "get_deploy_target", lambda *a, **kw: fake_target
    )
    monkeypatch.setattr(deployments_api.manager, "emit", AsyncMock())

    dep = Deployment(
        id="dep-1",
        project_id="proj-1",
        build_id="b1",
        user_id="user-1",
        status=DeploymentStatus.PENDING,
        logs="",
    )
    await deployments_api._run_deployment_background(
        dep,
        {"id": "b1", "files": {}},
        {"id": "proj-1", "tech_stack": {"backend": "python"}},
        db=db,
    )

    assert seen_files == {"src/main.py": "print('live')"}
    assert fake_target.deploy_calls == 1
    assert fake_target.teardown_calls == 0
    assert db.deployments.updates[-1][1]["$set"]["status"] == DeploymentStatus.LIVE


@pytest.mark.asyncio
async def test_run_deployment_background_tears_down_only_on_failure(monkeypatch):
    db = _FakeDeployDB(
        [{"build_id": "b1", "path": "src/main.py", "content": "print('fail')"}]
    )

    class _FailingTarget:
        def __init__(self):
            self.teardown_calls = 0

        async def deploy(self, source_dir, project, build, env_vars):
            raise RuntimeError("deploy boom")

        async def teardown(self, deployment_id, project):
            self.teardown_calls += 1

    fake_target = _FailingTarget()
    monkeypatch.setattr(
        deployments_api, "get_deploy_target", lambda *a, **kw: fake_target
    )
    monkeypatch.setattr(deployments_api.manager, "emit", AsyncMock())

    dep = Deployment(
        id="dep-2",
        project_id="proj-1",
        build_id="b1",
        user_id="user-1",
        status=DeploymentStatus.PENDING,
        logs="",
    )
    await deployments_api._run_deployment_background(
        dep,
        {"id": "b1", "files": {}},
        {"id": "proj-1", "tech_stack": {"backend": "python"}},
        db=db,
    )

    assert fake_target.teardown_calls == 1
    assert db.deployments.updates[-1][1]["$set"]["status"] == DeploymentStatus.FAILED


@pytest.mark.asyncio
async def test_github_push_background_loads_files_from_db_build_files(monkeypatch):
    db = _FakeDeployDB(
        [{"build_id": "b1", "path": "README.md", "content": "# Hello"}]
    )
    written_readme = {}

    class _FakeRepo:
        def __init__(self, working_dir):
            self.working_dir = working_dir
            self.index = MagicMock()
            self.index.diff.return_value = []

    def _fake_clone(url, temp_dir, env=None):
        return _FakeRepo(temp_dir)

    orig_rmtree = deployments_api.shutil.rmtree

    def _capture_rmtree(path, ignore_errors=False):
        readme_path = f"{path}/README.md"
        with open(readme_path, encoding="utf-8") as f:
            written_readme["content"] = f.read()
        orig_rmtree(path, ignore_errors=ignore_errors)

    monkeypatch.setattr(deployments_api.Repo, "clone_from", _fake_clone)
    monkeypatch.setattr(deployments_api.shutil, "rmtree", _capture_rmtree)
    monkeypatch.setattr(deployments_api.manager, "emit", AsyncMock())

    req = deployments_api.GitHubPushRequest(
        project_id="proj-1",
        build_id="b1",
        repo_url="https://github.com/acme/repo.git",
        branch="main",
        commit_message="init",
        github_token="ghp_test",
    )
    await deployments_api._github_push_background(
        req,
        {"id": "b1", "files": {}},
        {"id": "proj-1"},
        github_token="ghp_test",
        db=db,
    )
    assert written_readme["content"] == "# Hello"


def _make_oauth_app():
    from api.auth import router as auth_router

    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app)


def test_google_login_sets_oauth_state_cookie(monkeypatch):
    from api import auth as auth_api

    monkeypatch.setattr(auth_api.settings, "google_client_id", "cid")
    monkeypatch.setattr(auth_api.settings, "google_client_secret", "csec")

    client = _make_oauth_app()
    resp = client.get("/auth/google", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "oauth_state" in resp.cookies
    assert resp.cookies["oauth_state"] in resp.headers["location"]


def test_google_callback_rejects_missing_or_mismatched_state():
    client = _make_oauth_app()
    resp_missing = client.get("/auth/google/callback?code=abc&state=xyz")
    assert resp_missing.status_code == 400
    assert "Invalid OAuth state" in resp_missing.json()["detail"]

    client.cookies.set("oauth_state", "expected-state")
    resp_mismatch = client.get("/auth/google/callback?code=abc&state=wrong-state")
    assert resp_mismatch.status_code == 400
    assert "Invalid OAuth state" in resp_mismatch.json()["detail"]


def test_google_callback_rejects_unverified_email(monkeypatch):
    from api import auth as auth_api

    class _FakeOAuth2Session:
        def __init__(self, *args, **kwargs):
            pass

        def fetch_token(self, *args, **kwargs):
            return {"access_token": "tok"}

        def get(self, *args, **kwargs):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {"email": "u@example.com", "email_verified": False},
            )

    monkeypatch.setattr(auth_api, "OAuth2Session", _FakeOAuth2Session)

    client = _make_oauth_app()
    client.cookies.set("oauth_state", "valid-state")
    resp = client.get("/auth/google/callback?code=abc&state=valid-state")
    assert resp.status_code == 400
    assert "not verified" in resp.json()["detail"]


def test_google_callback_respects_mfa_enabled(monkeypatch):
    from api import auth as auth_api

    class _FakeOAuth2Session:
        def __init__(self, *args, **kwargs):
            pass

        def fetch_token(self, *args, **kwargs):
            return {"access_token": "tok"}

        def get(self, *args, **kwargs):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {
                    "email": "mfa@example.com",
                    "name": "MFA User",
                    "email_verified": True,
                },
            )

    class _FakeUsers:
        async def find_one(self, query, projection=None):
            return {
                "id": "u-mfa",
                "email": "mfa@example.com",
                "name": "MFA User",
                "mfa_enabled": True,
            }

    async def _fake_get_db():
        return SimpleNamespace(users=_FakeUsers())

    record_session_mock = AsyncMock()
    monkeypatch.setattr(auth_api, "OAuth2Session", _FakeOAuth2Session)
    monkeypatch.setattr(auth_api, "get_db", _fake_get_db)
    monkeypatch.setattr(auth_api, "_record_session", record_session_mock)

    client = _make_oauth_app()
    client.cookies.set("oauth_state", "valid-state")
    resp = client.get(
        "/auth/google/callback?code=abc&state=valid-state",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert "mfa_required=1" in resp.headers["location"]
    assert "mfa_token=" in resp.headers["location"]
    assert "access_token" not in resp.cookies
    assert "refresh_token" not in resp.cookies
    record_session_mock.assert_not_awaited()
