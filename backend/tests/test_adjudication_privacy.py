"""S0 privacy controls for shadow reviews and human adjudication
(docs/architecture/agent-collaboration-plan.md §5.4, §17; Revision 2 amended
§12.3, PV-1…PV-6).

Runs on the in-memory Mongo double from ``a2_support`` (extended below with
the few operators S0 uses: ``update_many``, ``delete_one``, cursor
``sort``/``skip``/``limit`` and projections are ignored).
"""

from __future__ import annotations

import copy
from datetime import timedelta

import pytest

from core.data_use_consents import (
    SCOPE_AI_QUALITY_REVIEW,
    SCOPE_HUMAN_QUALITY_REVIEW,
    SCOPE_PLATFORM_MODEL_PROCESSING,
    ConsentUnavailable,
    active_from_docs,
    get_active_consents,
    grant_consent,
    list_consents,
    revoke_consent,
)
from core.models import utcnow
from tests.a2_support import FakeCollection, FakeDB, _Cursor, _UpdateResult, matches, set_flags


# --------------------------------------------------------------------------- #
# Mongo double extensions
# --------------------------------------------------------------------------- #


class _SortableCursor(_Cursor):
    def sort(self, key, direction=1):
        if isinstance(key, list):
            key, direction = key[0]
        self._docs = sorted(self._docs, key=lambda d: (d.get(key) is None, d.get(key)), reverse=direction == -1)
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self


class _DeleteResult:
    def __init__(self, n):
        self.deleted_count = n


class S0Collection(FakeCollection):
    def find(self, query=None, projection=None, **_):
        return _SortableCursor([copy.deepcopy(d) for d in self.docs if matches(d, query)])

    async def update_many(self, query, update):
        n = 0
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update, inserting=False)
                n += 1
        return _UpdateResult(n, n)

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _DeleteResult(before - len(self.docs))

    async def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if matches(d, query):
                self.docs.pop(i)
                return _DeleteResult(1)
        return _DeleteResult(0)

    async def count_documents(self, query):
        return sum(1 for d in self.docs if matches(d, query))


class S0DB(FakeDB):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        cols = self.__dict__.setdefault("_collections", {})
        if name not in cols:
            cols[name] = S0Collection()
        return cols[name]


def make_db(**collections) -> S0DB:
    db = S0DB()
    for name, docs in collections.items():
        db._collections[name] = S0Collection(docs)
    return db


@pytest.fixture
def external_flag(monkeypatch):
    """Turn the external adjudication flag on (it defaults to off, U12)."""
    set_flags(monkeypatch, external_adjudication_opt_in=True)


# --------------------------------------------------------------------------- #
# Consent scopes and revocation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_s0_scopes_are_versioned_to_their_own_policy_text(monkeypatch):
    set_flags(monkeypatch, external_adjudication_opt_in=True, ai_quality_review_policy_version="ai-v1")
    db = make_db()
    doc = await grant_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW)
    assert doc["policy_version"] == "ai-v1"
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    assert (await get_active_consents(db, "u1")).scopes == {SCOPE_AI_QUALITY_REVIEW, SCOPE_PLATFORM_MODEL_PROCESSING}

    # Changing the AI-review text requires re-consent for that scope only.
    set_flags(monkeypatch, ai_quality_review_policy_version="ai-v2")
    assert (await get_active_consents(db, "u1")).scopes == {SCOPE_PLATFORM_MODEL_PROCESSING}


@pytest.mark.asyncio
async def test_human_quality_review_not_grantable_while_external_flag_off(monkeypatch):
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    db = make_db()
    with pytest.raises(ConsentUnavailable):
        await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    assert await list_consents(db, "u1") == []

    # A consent stored while the flag was on stops counting when it is off.
    set_flags(monkeypatch, external_adjudication_opt_in=True)
    await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    assert SCOPE_HUMAN_QUALITY_REVIEW in (await get_active_consents(db, "u1")).scopes
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    assert active_from_docs(await list_consents(db, "u1")).scopes == frozenset()


@pytest.mark.asyncio
async def test_revoking_ai_quality_review_drops_queued_reviews_and_calls_s1_hook(external_flag):
    from core.quality_review import register_ai_review_revocation_handler, unregister_ai_review_revocation_handler

    db = make_db(
        users=[{"id": "u1"}],
        shadow_reviews=[
            {"id": "r1", "owner_user_id": "u1", "status": "queued", "consent_basis": "opt_in"},
            {"id": "r2", "owner_user_id": "u1", "status": "running", "consent_basis": "opt_in"},
            {"id": "r3", "owner_user_id": "u2", "status": "queued", "consent_basis": "opt_in"},
        ],
    )
    calls = []

    async def s1_handler(_db, user_id):
        calls.append(user_id)

    register_ai_review_revocation_handler(s1_handler)
    try:
        await grant_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW)
        assert await revoke_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW) is True
    finally:
        unregister_ai_review_revocation_handler(s1_handler)

    by_id = {d["id"]: d for d in db.shadow_reviews.docs}
    assert by_id["r1"]["status"] == "dropped"
    assert by_id["r2"]["status"] == "running"  # already calling the reviewer
    assert by_id["r3"]["status"] == "queued"  # another user
    assert calls == ["u1"]
    assert SCOPE_AI_QUALITY_REVIEW not in (await get_active_consents(db, "u1")).scopes
    # The consent record is kept, revoked (§18.2).
    [record] = await list_consents(db, "u1")
    assert record["revoked_at"] is not None


# --------------------------------------------------------------------------- #
# users.is_internal: admin-set only, audited
# --------------------------------------------------------------------------- #


def _admin(user_id="admin-1"):
    from core.models import User

    return User(id=user_id, email=f"{user_id}@forge.test", name="Admin", is_admin=True)


def _request():
    from starlette.requests import Request

    return Request({"type": "http", "method": "PUT", "path": "/", "headers": [(b"user-agent", b"pytest")],
                    "client": ("10.0.0.9", 1234), "query_string": b""})


@pytest.mark.asyncio
async def test_is_internal_change_is_admin_only_and_audited(monkeypatch):
    import api.admin as admin_api

    db = make_db(users=[{"id": "u1", "email": "u1@x.test"}, {"id": "admin-1", "email": "a@forge.test"}])

    async def fake_get_db():
        return db

    monkeypatch.setattr(admin_api, "get_db", fake_get_db)
    req = admin_api.InternalToggleRequest(is_internal=True, reason="staff account")
    out = await admin_api.set_user_internal_flag("u1", req, _request(), admin=_admin())
    assert out == {"user_id": "u1", "is_internal": True, "unchanged": False}
    assert db.users.docs[0]["is_internal"] is True
    [entry] = db.audit_logs.docs
    assert entry["action"] == "grant_internal" and entry["resource_id"] == "u1"
    assert entry["actor_id"] == "admin-1" and entry["ip_address"] == "10.0.0.9"
    assert entry["changes"]["is_internal"] == {"old": False, "new": True}

    # A no-op writes no audit entry; every real change writes exactly one.
    out = await admin_api.set_user_internal_flag("u1", req, _request(), admin=_admin())
    assert out["unchanged"] is True and len(db.audit_logs.docs) == 1
    out = await admin_api.set_user_internal_flag(
        "u1", admin_api.InternalToggleRequest(is_internal=False), _request(), admin=_admin(),
    )
    assert out["unchanged"] is False and db.users.docs[0]["is_internal"] is False
    assert [e["action"] for e in db.audit_logs.docs] == ["grant_internal", "revoke_internal"]

    with pytest.raises(Exception) as exc:
        await admin_api.set_user_internal_flag("nobody", req, _request(), admin=_admin())
    assert getattr(exc.value, "status_code", None) == 404


def test_is_internal_route_requires_admin_and_users_cannot_set_it():
    import inspect

    import api.admin as admin_api
    from api.auth import UpdateProfileRequest
    from core.models import User

    sig = inspect.signature(admin_api.set_user_internal_flag)
    assert sig.parameters["admin"].default.dependency is admin_api.admin_required
    # Neither the self-service profile update nor the User model carries it.
    assert "is_internal" not in UpdateProfileRequest.model_fields
    assert "is_internal" not in User.model_fields


# --------------------------------------------------------------------------- #
# Eligibility (§17.2 U8, U2; §17.3 C7, U12)
# --------------------------------------------------------------------------- #

_BOOLS = (False, True)
_MATRIX = [
    (internal, byok, ai_c, human_c, pmp_c, flag)
    for internal in _BOOLS for byok in _BOOLS for ai_c in _BOOLS
    for human_c in _BOOLS for pmp_c in _BOOLS for flag in _BOOLS
]


@pytest.mark.parametrize("internal,byok,ai_consent,human_consent,pmp_consent,flag", _MATRIX)
def test_eligibility_matrix(internal, byok, ai_consent, human_consent, pmp_consent, flag):
    from core.quality_review import decide_review_eligibility

    consents = {
        s for s, on in (
            (SCOPE_AI_QUALITY_REVIEW, ai_consent),
            (SCOPE_HUMAN_QUALITY_REVIEW, human_consent),
            (SCOPE_PLATFORM_MODEL_PROCESSING, pmp_consent),
        ) if on
    }
    ai, human = decide_review_eligibility(
        is_internal=internal, credential_mode="byok" if byok else "forge",
        consents=consents, external_adjudication_opt_in=flag,
    )
    # AI: internal or opted in; BYOK additionally needs platform processing
    # consent, internal owners included (U2 is unconditional).
    expect_ai = (internal or ai_consent) and (not byok or pmp_consent)
    assert ai.allowed is expect_ai
    if expect_ai:
        assert ai.basis == ("internal" if internal else "opt_in")
    elif byok and not pmp_consent:
        assert ai.reason == "byok_without_platform_model_processing_consent"
    # Human: internal by default; external only with consent AND the flag.
    expect_human = internal or (human_consent and flag)
    assert human.allowed is expect_human
    if expect_human:
        assert human.basis == ("internal" if internal else "opt_in")
    elif not flag:
        assert human.reason == "external_adjudication_disabled"


def _build(build_id="b1", owner="u1", *, byok=False, consents=(), created_at=None):
    return {
        "id": build_id, "user_id": owner, "project_id": "p1",
        "created_at": created_at or utcnow(),
        "processing_boundary": {
            "credential_mode": "byok" if byok else "forge",
            "consents": list(consents), "policy_version": "2026-11", "owner_user_id": owner,
        },
    }


@pytest.mark.asyncio
async def test_evaluate_eligibility_counts_only_consents_granted_before_admission(external_flag):
    from core.quality_review import evaluate_review_eligibility

    db = make_db(users=[{"id": "u1"}])
    old_build = _build("old", created_at=utcnow() - timedelta(days=1))
    await grant_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW)
    await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    new_build = _build("new", created_at=utcnow() + timedelta(seconds=1))

    old = await evaluate_review_eligibility(db, old_build)
    assert not old.ai_review.allowed and not old.human_adjudication.allowed
    new = await evaluate_review_eligibility(db, new_build)
    assert new.ai_review.allowed and new.ai_review.basis == "opt_in"
    assert new.human_adjudication.allowed and new.human_adjudication.basis == "opt_in"

    # Revocation applies immediately, also to builds admitted under consent.
    await revoke_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    new = await evaluate_review_eligibility(db, new_build)
    assert new.ai_review.allowed and not new.human_adjudication.allowed


@pytest.mark.asyncio
async def test_evaluate_eligibility_byok_uses_snapshot_narrowed_to_active(external_flag):
    from core.quality_review import evaluate_review_eligibility

    db = make_db(users=[{"id": "u1", "is_internal": True}])
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    # Granted, but not in the admission snapshot: the grant never widens.
    no_snapshot_consent = _build("b-a", byok=True, consents=(), created_at=utcnow() + timedelta(seconds=1))
    assert not (await evaluate_review_eligibility(db, no_snapshot_consent)).ai_review.allowed
    with_consent = _build("b-b", byok=True, consents=(SCOPE_PLATFORM_MODEL_PROCESSING,))
    result = await evaluate_review_eligibility(db, with_consent)
    assert result.ai_review.allowed and result.ai_review.basis == "internal"
    assert result.credential_mode == "byok"
    # Revoked now: the snapshot narrows (BY-7).
    await revoke_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    assert not (await evaluate_review_eligibility(db, with_consent)).ai_review.allowed
    # Human adjudication involves no platform model: internal still allowed.
    assert (await evaluate_review_eligibility(db, with_consent)).human_adjudication.allowed


@pytest.mark.asyncio
async def test_evaluate_eligibility_fails_closed():
    from core.quality_review import evaluate_review_eligibility

    db = make_db(users=[{"id": "u1", "is_internal": True}], builds=[{"id": "legacy", "user_id": "u1"}])
    # No boundary snapshot (pre-A2): treated as BYOK without consent.
    legacy = await evaluate_review_eligibility(db, "legacy")
    assert legacy.credential_mode == "byok" and not legacy.ai_review.allowed
    assert legacy.human_adjudication.allowed  # internal rule; no model involved
    missing = await evaluate_review_eligibility(db, "nope")
    assert not missing.ai_review.allowed and missing.ai_review.reason == "build_not_found"
    orphan = await evaluate_review_eligibility(db, _build("b9", owner="ghost"))
    assert not orphan.human_adjudication.allowed and orphan.human_adjudication.reason == "owner_not_found"
    # A user flag that is anything but literal True is not internal.
    db.users.docs[0]["is_internal"] = "yes"
    assert not (await evaluate_review_eligibility(db, _build("b8"))).human_adjudication.allowed


# --------------------------------------------------------------------------- #
# Redactor (PV-3)
# --------------------------------------------------------------------------- #

# Runtime-assembled secret-shaped values (never real credentials).
AWS_KEY_ID = "AKIA" + "IOSFODNN7" + "EXAMPLE"
AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY"
STRIPE_LIVE = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc"
GOOGLE_KEY = "AIza" + "SyA1234567890" + "abcdefghijklmnopqrstuv"
SLACK_TOKEN = "xoxb-" + "1234567890-" + "abcdefghijkl"
GITHUB_PAT = "ghp_" + "0123456789abcdef" + "ABCDEF0123456789abcd"
JWT = "eyJhbGciOiJIUzI1NiJ9" + ".eyJzdWIiOiIxMjM0NTY3ODkwIn0" + ".dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
PEM_BODY = "MIIEowIBAAKCAQEAseededkeymaterial0001"
PEM = "-----BEGIN RSA " + "PRIVATE KEY-----\n" + PEM_BODY + "\nQ2xvc2VkS2V5TWF0ZXJpYWw=\n-----END RSA " + "PRIVATE KEY-----"
DB_PASSWORD = "hunter2" + "Pa55word"
ENV_SECRET = "env" + "SeedValue" + "9876"
EMAIL = "jane.doe" + "@customer-corp.example"
PLAIN_PASSWORD = "correct horse " + "battery staple"
FALLBACK_KEY = "fallback" + "Literal" + "Key42"
QUERY_TOKEN = "qs" + "Token" + "7788"

SEEDED_SECRETS = [
    AWS_KEY_ID, AWS_SECRET, STRIPE_LIVE, GOOGLE_KEY, SLACK_TOKEN, GITHUB_PAT, JWT, PEM_BODY,
    DB_PASSWORD, ENV_SECRET, EMAIL, PLAIN_PASSWORD, FALLBACK_KEY, QUERY_TOKEN, "Q2xvc2VkS2V5TWF0ZXJpYWw=",
]


def seeded_source(lines_before=30, lines_after=30) -> str:
    """A generated file with secrets around line ``lines_before + 1``."""
    body = [
        f'AWS_ACCESS_KEY_ID = "{AWS_KEY_ID}"',
        f'aws_secret_access_key = "{AWS_SECRET}"',
        f'stripe.api_key = "{STRIPE_LIVE}"',
        f'maps = "{GOOGLE_KEY}"  # google',
        f'slack = "{SLACK_TOKEN}"',
        f'gh = "{GITHUB_PAT}"',
        f'headers = {{"Authorization": "Bearer {JWT}"}}',
        PEM,
        f'DATABASE_URL = "postgres://admin:{DB_PASSWORD}@db.internal:5432/app"',
        f"export SESSION_SECRET={ENV_SECRET}",
        f'support = "{EMAIL}"',
        f'password = "{PLAIN_PASSWORD}"',
        f'key = os.getenv("PAYMENT_KEY", "{FALLBACK_KEY}")',
        f'url = "https://api.example.com/v1/items?token={QUERY_TOKEN}&page=2"',
    ]
    before = [f"line_{i} = {i}" for i in range(lines_before)]
    after = [f"tail_{i} = {i}" for i in range(lines_after)]
    return "\n".join(before + body + after)


def assert_no_seeded_secret(obj):
    import json

    dumped = json.dumps(obj, default=str)
    for secret in SEEDED_SECRETS:
        assert secret not in dumped, f"seeded secret leaked: {secret[:6]}..."


def test_pv3_redactor_masks_every_seeded_secret_and_reports_without_values():
    from core.redaction import redact_text

    source = seeded_source()
    result = redact_text(source, path="app/settings.py")
    assert_no_seeded_secret(result.text)
    assert_no_seeded_secret(result.report)
    assert result.text.count("\n") == source.count("\n")  # line numbers preserved
    counts = result.report["counts"]
    for rule in ("secret-aws-access-key-id", "secret-stripe-live-secret-key", "secret-google-api-key",
                 "secret-slack-token", "secret-github-personal-access-token", "jwt", "private-key", "url-credentials",
                 "env-value", "email", "secret-literal", "url-secret-param"):
        assert counts.get(rule), f"rule {rule} did not fire: {counts}"
    assert result.report["total"] == sum(counts.values())
    # Ordinary code stays readable.
    assert "line_3 = 3" in result.text and "tail_7 = 7" in result.text


def test_pv3_redactor_env_files_and_cut_private_keys():
    from core.redaction import redact_text

    env = f"DATABASE_URL=postgres://u:{DB_PASSWORD}@h/db\nSTRIPE_KEY = {STRIPE_LIVE}\nENV TOKEN {ENV_SECRET}\n"
    out = redact_text(env, path="deploy/.env.production").text
    assert_no_seeded_secret(out)
    compose = f"services:\n  api:\n    environment:\n      PAYMENT_KEY: {FALLBACK_KEY}\n      - SESSION_SECRET={ENV_SECRET}\n"
    assert_no_seeded_secret(redact_text(compose, path="docker-compose.yml").text)
    # A window that cuts a key block (only one marker visible) is redacted too.
    tail_only = PEM.split("\n", 1)[1]
    head_only = PEM.rsplit("\n", 1)[0]
    assert_no_seeded_secret(redact_text(tail_only).text)
    assert_no_seeded_secret(redact_text(head_only).text)


# --------------------------------------------------------------------------- #
# Excerpts, queueing (PV-1, PV-3)
# --------------------------------------------------------------------------- #

BLUEPRINT = {
    "app_name": "Invoice Hub",
    "description": "Private customer notes for " + EMAIL,
    "pages": [
        {"name": "Settings", "route": "/settings", "description": "secret plans", "components": ["SettingsForm"]},
        {"name": "Dashboard", "route": "/", "components": ["Chart"]},
    ],
    "api_endpoints": [
        {"method": "POST", "path": "/api/settings", "auth_required": True, "description": "save settings"},
        {"method": "GET", "path": "/api/invoices", "auth_required": True},
    ],
    "data_models": [{"name": "Invoice", "fields": [{"name": "total", "type": "number"}]}],
    "features": ["billing"],
    "integrations": ["stripe"],
    "auth_required": True,
}
SOURCE_PATH = "app/settings.py"
SOURCE = seeded_source()
FINDING_LINE = 31  # first seeded line


def _finding(finding_id="f1", build_id="b1", **extra):
    return {
        "finding_id": finding_id, "build_id": build_id, "file": SOURCE_PATH, "line": FINDING_LINE,
        "rule_or_category": "secret-aws-access-key-id",
        "message": f"Hardcoded key {AWS_KEY_ID} found; contact {EMAIL}",
        **extra,
    }


def seeded_db(*, internal=True, owner="u1", build_id="b1", byok=False, created_at=None, **collections):
    import json as _json

    build = _build(build_id, owner, byok=byok, created_at=created_at)
    build["prompt"] = f"Build an invoice app. My key is {STRIPE_LIVE}"
    build["agents"] = [{"agent": "architect", "status": "completed", "output": _json.dumps(BLUEPRINT)}]
    return make_db(
        users=[{"id": owner, "email": f"{owner}@x.test", "is_internal": internal}],
        builds=[build],
        build_files=[{"id": "file-1", "build_id": build_id, "path": SOURCE_PATH, "content": SOURCE}],
        **collections,
    )


@pytest.mark.asyncio
async def test_pv1_non_internal_non_consented_build_is_never_queued(monkeypatch):
    from core.adjudication import enqueue_finding_for_adjudication

    for flag in (False, True):
        set_flags(monkeypatch, external_adjudication_opt_in=flag)
        db = seeded_db(internal=False)
        assert await enqueue_finding_for_adjudication(db, _finding()) is None
        assert db.adjudication_excerpts.docs == []

    # External with consent but the flag off (U12): still never queued.
    set_flags(monkeypatch, external_adjudication_opt_in=True)
    db = seeded_db(internal=False, created_at=utcnow() + timedelta(seconds=5))
    await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    assert await enqueue_finding_for_adjudication(db, _finding()) is None
    assert db.adjudication_excerpts.docs == []

    # Same build with the flag on: queued on the opt-in basis.
    set_flags(monkeypatch, external_adjudication_opt_in=True)
    doc = await enqueue_finding_for_adjudication(db, _finding())
    assert doc and doc["consent_basis"] == "opt_in"

    # Internal: queued on the internal basis, flag or not.
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    db = seeded_db(internal=True)
    doc = await enqueue_finding_for_adjudication(db, _finding())
    assert doc["consent_basis"] == "internal" and len(db.adjudication_excerpts.docs) == 1


@pytest.mark.asyncio
async def test_pv3_seeded_secrets_never_appear_in_excerpts():
    from core.adjudication import enqueue_finding_for_adjudication

    db = seeded_db()
    doc = await enqueue_finding_for_adjudication(db, _finding())
    assert_no_seeded_secret(db.adjudication_excerpts.docs)
    assert_no_seeded_secret(doc)
    report = doc["redaction_report"]
    assert report["total"] > 0 and report["fields"]["redacted_excerpt"]["total"] > 0
    assert report["fields"]["finding.message"]["counts"] == {"email": 1, "secret-aws-access-key-id": 1}
    # The redacted text still shows the code around the finding.
    assert "line_29 = 29" in doc["redacted_excerpt"]


@pytest.mark.asyncio
async def test_excerpt_is_minimum_material():
    from core.adjudication import EXCERPT_TTL, enqueue_finding_for_adjudication

    db = seeded_db()
    finding = _finding(severity="high", full_prompt="should never be stored")
    doc = await enqueue_finding_for_adjudication(db, finding)
    # ±20 lines around the finding, nothing more.
    assert (doc["excerpt_start_line"], doc["excerpt_end_line"]) == (FINDING_LINE - 20, FINDING_LINE + 20)
    assert doc["redacted_excerpt"].count("\n") == 40
    # Only the minimal finding keys are stored.
    assert set(doc["finding"]) == {"finding_id", "build_id", "file", "line", "rule_or_category", "message"}
    # A blueprint fragment, not the blueprint: related page and endpoint only.
    fragment = doc["blueprint_fragment"]
    assert [p["name"] for p in fragment["pages"]] == ["Settings"]
    assert [e["path"] for e in fragment["api_endpoints"]] == ["/api/settings"]
    assert "description" not in fragment and "features" not in fragment and "app_name" not in fragment
    assert "data_models" not in fragment
    assert doc["expires_at"] - doc["created_at"] == EXCERPT_TTL
    # Idempotent per finding.
    again = await enqueue_finding_for_adjudication(db, finding)
    assert again["id"] == doc["id"] and len(db.adjudication_excerpts.docs) == 1


def test_finding_schema_is_validated():
    from core.adjudication import FindingError, normalize_finding

    with pytest.raises(FindingError):
        normalize_finding({"build_id": "b1", "rule_or_category": "x"})
    out = normalize_finding({"finding_id": "f", "build_id": "b", "rule_or_category": "r", "line": "0", "extra": 1})
    assert out == {"finding_id": "f", "build_id": "b", "rule_or_category": "r", "file": None, "line": None,
                   "message": None}


@pytest.mark.asyncio
async def test_s0_indexes_include_ttls():
    from core.adjudication import adjudication_index_coroutines

    calls = []

    class _Coll:
        def __init__(self, name):
            self.name = name

        async def create_index(self, *args, **kwargs):
            calls.append((self.name, args, kwargs))

    class _DB:
        def __getattr__(self, name):
            return _Coll(name)

    for coro in adjudication_index_coroutines(_DB()):
        await coro
    ttl = {(name, a[0]): kw["expireAfterSeconds"] for name, a, kw in calls if "expireAfterSeconds" in kw}
    assert ttl == {("adjudication_excerpts", "expires_at"): 0,
                   ("adjudication_access_log", "at"): 365 * 24 * 3600}
    assert ("adjudication_excerpts", ("finding_id",), {"unique": True}) in calls
    assert ("shadow_reviews", ("id",), {"unique": True}) in calls


# --------------------------------------------------------------------------- #
# Admin adjudication API (PV-2, PV-4, PV-5)
# --------------------------------------------------------------------------- #


def _api(monkeypatch, db, admin_id="admin-1"):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import api.adjudication as adjudication_api

    async def _get_db():
        return db

    monkeypatch.setattr(adjudication_api, "get_db", _get_db)
    app = FastAPI()
    app.include_router(adjudication_api.router)
    app.dependency_overrides[adjudication_api.admin_required] = lambda: _admin(admin_id)
    return TestClient(app)


async def _queued(db, finding_id="f1"):
    from core.adjudication import enqueue_finding_for_adjudication

    return await enqueue_finding_for_adjudication(db, _finding(finding_id))


def test_adjudication_routes_are_admin_only():
    import inspect

    import api.adjudication as adjudication_api

    for route in adjudication_api.router.routes:
        params = inspect.signature(route.endpoint).parameters
        assert params["admin"].default.dependency is adjudication_api.admin_required, route.path


@pytest.mark.asyncio
async def test_pv4_default_view_contains_no_full_artifact(monkeypatch):
    from core.adjudication import VIEW_FIELDS

    db = seeded_db()
    item = await _queued(db)
    client = _api(monkeypatch, db)
    resp = client.get(f"/admin/adjudication/items/{item['id']}")
    assert resp.status_code == 200
    view = resp.json()
    assert set(view) == set(VIEW_FIELDS)
    text = resp.text
    # Nothing outside the ±20-line window, no prompt, no unredacted secret.
    assert "tail_29 = 29" not in text and "line_0 = 0" not in text
    assert "Build an invoice app" not in text
    assert "content" not in view and "prompt" not in view
    assert_no_seeded_secret(view)
    assert view["redacted_excerpt"].count("\n") == 40
    assert view["blueprint_fragment"]["pages"][0]["name"] == "Settings"
    assert "description" not in view["blueprint_fragment"]

    # The full artifact only through the logged expand, and still redacted.
    resp = client.post(f"/admin/adjudication/items/{item['id']}/expand", json={"purpose": "too short"})
    assert resp.status_code == 422
    purpose = "Confirm the key is used at runtime, not only in a test fixture"
    resp = client.post(f"/admin/adjudication/items/{item['id']}/expand", json={"purpose": purpose})
    assert resp.status_code == 200
    expanded = resp.json()
    assert "tail_29 = 29" in expanded["content"] and expanded["artifact_id"] == "file-1"
    assert_no_seeded_secret(expanded)
    resp = client.post(f"/admin/adjudication/items/{item['id']}/expand",
                       json={"purpose": purpose, "target": "prompt"})
    assert resp.status_code == 200 and "Build an invoice app" in resp.json()["content"]
    assert STRIPE_LIVE not in resp.text


@pytest.mark.asyncio
async def test_pv5_every_adjudication_api_read_writes_one_access_log_row(monkeypatch):
    db = seeded_db()
    item = await _queued(db)
    await _queued(db, "f2")
    client = _api(monkeypatch, db)
    purpose = "Check whether the flagged line is reachable"

    calls = [
        ("get", "/admin/adjudication/queue", None, 200),
        ("get", f"/admin/adjudication/items/{item['id']}", None, 200),
        ("post", f"/admin/adjudication/items/{item['id']}/expand", {"purpose": purpose}, 200),
        ("post", f"/admin/adjudication/items/{item['id']}/expand", {"purpose": ""}, 422),
        ("get", "/admin/adjudication/items/does-not-exist", None, 404),
        ("post", f"/admin/adjudication/items/{item['id']}/label",
         {"verdict": "true_positive", "notes": f"real key {AWS_KEY_ID}"}, 200),
        ("get", "/admin/adjudication/queue?status=labelled", None, 200),
    ]
    for i, (method, url, body, status) in enumerate(calls, start=1):
        resp = getattr(client, method)(url, json=body) if body is not None else getattr(client, method)(url)
        assert resp.status_code == status, (url, resp.text)
        assert len(db.adjudication_access_log.docs) == i, url

    rows = db.adjudication_access_log.docs
    assert [r["action"] for r in rows] == ["list", "view", "expand", "expand", "view", "label", "list"]
    assert [r["outcome"] for r in rows] == ["granted", "granted", "granted", "invalid", "not_found", "granted",
                                            "granted"]
    assert all(r["adjudicator_id"] == "admin-1" and r["at"] for r in rows)
    view, expand = rows[1], rows[2]
    assert view["build_id"] == "b1" and view["artifact_id"] == "b1:app/settings.py"
    assert "redacted_excerpt" in view["fields"] and view["purpose"] is None
    assert expand["fields"] == ["artifact.content"] and expand["purpose"] == purpose
    assert expand["artifact_id"] == "file-1"
    assert sorted(rows[0]["build_ids"]) == ["b1"]
    # Label stored with redacted notes; the queue now lists it as labelled.
    [label] = db.finding_adjudications.docs
    assert label["verdict"] == "true_positive" and AWS_KEY_ID not in label["notes"]
    assert [i["item_id"] for i in client.get("/admin/adjudication/queue?status=labelled").json()["items"]] == [
        item["id"]]


@pytest.mark.asyncio
async def test_pv2_revocation_purges_excerpts_and_blocks_new_access(monkeypatch, external_flag):
    from core.adjudication import enqueue_finding_for_adjudication

    db = seeded_db(internal=False, created_at=utcnow() + timedelta(seconds=5))
    db.users.docs.append({"id": "u2", "is_internal": True})
    other = _build("b2", "u2")
    db.builds.docs.append(other)
    await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    item = await _queued(db)
    assert item["consent_basis"] == "opt_in"
    other_item = await enqueue_finding_for_adjudication(db, _finding("g1", "b2"), file_content="x = 1")
    client = _api(monkeypatch, db)
    assert client.get(f"/admin/adjudication/items/{item['id']}").status_code == 200

    await revoke_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    # Purged immediately; other users' excerpts untouched.
    assert [d["id"] for d in db.adjudication_excerpts.docs] == [other_item["id"]]
    # No new access: the item is gone, the queue no longer lists it, and a
    # new finding for the same build is not queued.
    assert client.get(f"/admin/adjudication/items/{item['id']}").status_code == 404
    assert [i["build_id"] for i in client.get("/admin/adjudication/queue").json()["items"]] == ["b2"]
    assert await enqueue_finding_for_adjudication(db, _finding("f9")) is None
    # Every one of those reads was still logged.
    assert [r["outcome"] for r in db.adjudication_access_log.docs] == ["granted", "not_found", "granted"]


@pytest.mark.asyncio
async def test_pv2_access_is_rechecked_on_every_read(monkeypatch):
    """Material that is still stored but no longer eligible is refused."""
    db = seeded_db(internal=True)
    item = await _queued(db)
    client = _api(monkeypatch, db)
    db.users.docs[0]["is_internal"] = False  # changed outside set_user_internal
    resp = client.get(f"/admin/adjudication/items/{item['id']}")
    assert resp.status_code == 403
    assert client.post(f"/admin/adjudication/items/{item['id']}/label",
                       json={"verdict": "false_positive"}).status_code == 403
    assert client.get("/admin/adjudication/queue").json()["items"] == []
    assert [r["outcome"] for r in db.adjudication_access_log.docs] == ["denied", "denied", "granted"]
    assert db.finding_adjudications.docs == []

    # Through the audited admin path the internal-basis excerpts are purged.
    from core.quality_review import set_user_internal

    db.users.docs[0]["is_internal"] = True
    await set_user_internal(db, user_id="u1", is_internal=False, actor=_admin())
    assert db.adjudication_excerpts.docs == []
