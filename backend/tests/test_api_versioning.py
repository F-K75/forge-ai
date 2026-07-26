"""Regression tests for BE-004: API versioning.

Verifies that:
1. The /v1/ router mounts every production API sub-router.
2. The deprecation middleware adds Deprecation + Link headers to legacy
   root-level API routes while exempting /v1/, health, and webhook routes.
3. The /v1/ routes do not carry deprecation headers.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

import main
from main import deprecation_middleware


def _make_client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def test_deprecation_middleware_adds_headers_for_legacy_paths():
    app = FastAPI()
    app.middleware("http")(deprecation_middleware)

    @app.get("/builds")
    async def builds():
        return JSONResponse({"ok": True})

    client = _make_client(app)
    resp = client.get("/builds")
    assert resp.status_code == 200
    assert resp.headers.get("Deprecation") == "true"
    assert '/v1/builds' in resp.headers.get("Link", "")


def test_deprecation_middleware_skips_v1_paths():
    app = FastAPI()
    app.middleware("http")(deprecation_middleware)

    @app.get("/v1/builds")
    async def v1_builds():
        return JSONResponse({"ok": True})

    client = _make_client(app)
    resp = client.get("/v1/builds")
    assert resp.status_code == 200
    assert resp.headers.get("Deprecation") is None
    assert resp.headers.get("Link") is None


def test_deprecation_middleware_skips_health_paths():
    app = FastAPI()
    app.middleware("http")(deprecation_middleware)

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "ok"})

    client = _make_client(app)
    for path in ("/health", "/health/detailed", "/metrics"):
        resp = client.get(path)
        assert resp.headers.get("Deprecation") is None, path


def test_v1_router_contains_expected_prefixes():
    # Asserted against the generated OpenAPI schema rather than
    # `v1_router.routes`: since FastAPI 0.139 a router's `.routes` holds lazy
    # `_IncludedRouter` placeholders (resolved at request dispatch) instead of
    # flattened `APIRoute`s, so the old traversal silently matched nothing.
    # The schema is the public contract and is stable across FastAPI versions.
    schema_paths = main.app.openapi()["paths"].keys()
    for prefix in ("/v1/admin", "/v1/auth", "/v1/builds", "/v1/projects", "/v1/webhooks", "/v1/gdpr"):
        assert any(p.startswith(prefix) for p in schema_paths), f"no routes mounted under {prefix}"
