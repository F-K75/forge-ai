
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.repos as repos_module
from core.models import User


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def count_documents(self, query):
        return sum(1 for d in self.docs if all(d.get(k) == v for k, v in query.items()))


class FakeDB:
    def __init__(self, users=None, projects=None):
        self.users = FakeCollection(users or [])
        self.projects = FakeCollection(projects or [])

    async def command(self, *args, **kwargs):
        return {"ok": 1}


def _client_for(monkeypatch, fake_db, user):
    async def _get_db():
        return fake_db

    async def _get_current_user():
        return user

    monkeypatch.setattr(repos_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(repos_module.router)
    app.dependency_overrides[auth_module.get_current_user] = _get_current_user
    return TestClient(app)


@pytest.fixture
def user():
    return User(id="user-1", email="u@example.com", name="U", hashed_password="x", plan="free")


class TestImportRepo:
    def test_import_creates_project(self, monkeypatch, user):
        fake_db = FakeDB(users=[user.model_dump()])
        client = _client_for(monkeypatch, fake_db, user)

        with monkeypatch.context() as m:
            cloned = {}

            async def fake_clone(*args, **kwargs):
                cloned["args"] = args
                cloned["kwargs"] = kwargs
                return None

            m.setattr(repos_module, "_clone_repo", fake_clone)

            resp = client.post(
                "/repos/import",
                json={"repo_url": "https://github.com/owner/repo", "project_name": "My Import"},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["project"]["name"] == "My Import"
        assert body["project"]["github_repo"] == "https://github.com/owner/repo"
        assert body["files_indexed"] == 0

        assert len(fake_db.projects.docs) == 1
        assert fake_db.projects.docs[0]["user_id"] == user.id

    def test_import_defaults_project_name(self, monkeypatch, user):
        fake_db = FakeDB(users=[user.model_dump()])
        client = _client_for(monkeypatch, fake_db, user)

        with monkeypatch.context() as m:
            async def fake_clone(*args, **kwargs):
                return None

            m.setattr(repos_module, "_clone_repo", fake_clone)
            m.setattr(repos_module.tempfile, "mkdtemp", lambda prefix: "/tmp/repo")

            resp = client.post("/repos/import", json={"repo_url": "https://github.com/owner/repo"})

        assert resp.status_code == 200, resp.text
        assert resp.json()["project"]["name"] == "repo"

    def test_import_validates_repo_url(self, user, monkeypatch):
        fake_db = FakeDB(users=[user.model_dump()])
        client = _client_for(monkeypatch, fake_db, user)

        resp = client.post("/repos/import", json={"repo_url": "not-a-url"})
        assert resp.status_code == 422

    def test_import_requires_repo_url(self, user, monkeypatch):
        fake_db = FakeDB(users=[user.model_dump()])
        client = _client_for(monkeypatch, fake_db, user)

        resp = client.post("/repos/import", json={})
        assert resp.status_code == 422
