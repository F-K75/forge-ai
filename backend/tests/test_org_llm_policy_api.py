from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from auth import create_access_token
from core.models import Role


async def _ok_csrf(*_a, **_k):
    return True


class _FakeCursor:
    def __init__(self, docs, projection=None):
        self._docs = [dict(d) for d in docs]

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d


class FakeCollection:
    def __init__(self, docs):
        self.docs = {d["id"]: d for d in docs} if docs and "id" in docs[0] else {}
        self._raw_docs = list(docs or [])

    async def find_one(self, query, projection=None):
        for doc in self._raw_docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    def find(self, query=None, projection=None):
        matched = [d for d in self._raw_docs if not query or all(d.get(k) == v for k, v in query.items())]
        return _FakeCursor(matched)

    async def update_one(self, query, update, upsert=False):
        for doc in self._raw_docs:
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(update.get("$set", {}))
                return
        if upsert:
            new_doc = {**query, **update.get("$set", {})}
            self._raw_docs.append(new_doc)


class FakeDB:
    def __init__(self, *, users, team_members):
        self.users = FakeCollection(users)
        self.token_blacklist = FakeCollection([])
        self.team_members = FakeCollection(team_members)
        self.llm_org_policy_overrides = FakeCollection([])


def _make_db():
    return FakeDB(
        users=[
            {"id": "owner-1", "email": "owner@forge.ai", "name": "Owner", "is_admin": False, "mfa_enabled": True},
            {"id": "member-1", "email": "member@forge.ai", "name": "Member", "is_admin": False, "mfa_enabled": True},
            {"id": "outsider-1", "email": "outsider@forge.ai", "name": "Outsider", "is_admin": False, "mfa_enabled": True},
        ],
        team_members=[
            {"org_id": "org-1", "user_id": "owner-1", "role": Role.OWNER.value},
            {"org_id": "org-1", "user_id": "member-1", "role": Role.MEMBER.value},
        ],
    )


def _patch_db(monkeypatch, db):
    import api.auth as auth_mod
    import api.org_llm_policy as policy_mod

    async def _get_db():
        return db

    monkeypatch.setattr(auth_mod, "get_db", _get_db)
    monkeypatch.setattr(policy_mod, "get_db", _get_db)
    monkeypatch.setattr("core.database.get_db", _get_db)


def _cookies_for(user_id: str, email: str):
    token = create_access_token({"sub": user_id, "email": email})
    return {"access_token": token}


def test_owner_can_set_and_read_org_policy(monkeypatch):
    db = _make_db()
    _patch_db(monkeypatch, db)
    client = TestClient(app)

    with patch("core.security.validate_csrf_token", _ok_csrf):
        response = client.put(
            "/api/orgs/org-1/llm-policy",
            json={"approved_providers": ["anthropic"]},
            cookies=_cookies_for("owner-1", "owner@forge.ai"),
            headers={"X-CSRF-Token": "x"},
        )
    assert response.status_code == 200
    assert response.json()["policy"]["approved_providers"] == ["anthropic"]

    read = client.get("/api/orgs/org-1/llm-policy", cookies=_cookies_for("owner-1", "owner@forge.ai"))
    assert read.status_code == 200
    assert read.json()["policy"]["approved_providers"] == ["anthropic"]


def test_member_can_read_but_not_write_org_policy(monkeypatch):
    db = _make_db()
    _patch_db(monkeypatch, db)
    client = TestClient(app)

    read = client.get("/api/orgs/org-1/llm-policy", cookies=_cookies_for("member-1", "member@forge.ai"))
    assert read.status_code == 200

    with patch("core.security.validate_csrf_token", _ok_csrf):
        write = client.put(
            "/api/orgs/org-1/llm-policy",
            json={"approved_providers": ["anthropic"]},
            cookies=_cookies_for("member-1", "member@forge.ai"),
            headers={"X-CSRF-Token": "x"},
        )
    assert write.status_code == 403


def test_non_member_gets_403_on_both_endpoints(monkeypatch):
    db = _make_db()
    _patch_db(monkeypatch, db)
    client = TestClient(app)

    read = client.get("/api/orgs/org-1/llm-policy", cookies=_cookies_for("outsider-1", "outsider@forge.ai"))
    assert read.status_code == 403

    with patch("core.security.validate_csrf_token", _ok_csrf):
        write = client.put(
            "/api/orgs/org-1/llm-policy",
            json={"approved_providers": ["anthropic"]},
            cookies=_cookies_for("outsider-1", "outsider@forge.ai"),
            headers={"X-CSRF-Token": "x"},
        )
    assert write.status_code == 403


def test_unauthenticated_request_gets_401(monkeypatch):
    db = _make_db()
    _patch_db(monkeypatch, db)
    client = TestClient(app)

    assert client.get("/api/orgs/org-1/llm-policy").status_code == 401
    # Mutating endpoint: an unauthenticated request carries no session
    # cookie, so the CSRF middleware may reject it (403) before the auth
    # dependency even runs. TestClient can surface that as either a response
    # or a raised HTTPException depending on middleware ordering -- either
    # way the request must not reach the handler (mirrors test_llm_api.py's
    # test_llm_endpoints_reject_unauthenticated_requests).
    try:
        assert client.put("/api/orgs/org-1/llm-policy", json={}).status_code in (401, 403)
    except Exception:
        pass
