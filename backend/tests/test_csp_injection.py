"""Deterministic CSP-injection tests for generated application code.

Verifies that a secure default CSP is injected into generated HTML entry
points and (for the supported, simple shape) FastAPI backends -- idempotently
and without weakening an existing policy or breaking unsupported code.
"""

import pytest

from sandbox.csp import (
    apply_csp,
    inject_html_csp,
    inject_fastapi_csp,
    DEFAULT_CSP,
    _META_CSP_RE,
)


# --- HTML injection ------------------------------------------------------------

def test_html_without_head_is_unchanged():
    content = "<html><body>hi</body></html>"
    new, changed = inject_html_csp(content)
    assert changed is False
    assert new == content


def test_html_head_gets_csp_meta():
    content = "<!doctype html><html><head><title>x</title></head><body></body></html>"
    new, changed = inject_html_csp(content)
    assert changed is True
    assert _META_CSP_RE.search(new)
    # meta is inside <head>
    assert new.index("Content-Security-Policy") < new.index("</head>")


def test_html_csp_is_idempotent():
    content = "<html><head></head><body></body></html>"
    once, _ = inject_html_csp(content)
    twice, changed2 = inject_html_csp(once)
    assert changed2 is False
    assert once == twice
    assert len(_META_CSP_RE.findall(twice)) == 1


def test_html_existing_csp_not_overridden():
    existing = "default-src 'none'"
    content = f'<html><head><meta http-equiv="Content-Security-Policy" content="{existing}"></head></html>'
    new, changed = inject_html_csp(content)
    assert changed is False
    assert existing in new


# --- FastAPI injection (guarded) ----------------------------------------------

def test_fastapi_supported_shape_gets_middleware():
    content = (
        "from fastapi import FastAPI\n"
        "app = FastAPI()\n\n"
        "@app.get('/')\n"
        "def root():\n"
        "    return {'ok': True}\n"
    )
    new, changed = inject_fastapi_csp(content)
    assert changed is True
    assert "app.add_middleware(_ForgeCSPMiddleware)" in new
    assert "class _ForgeCSPMiddleware(BaseHTTPMiddleware)" in new
    assert 'Content-Security-Policy' in new


def test_fastapi_injection_idempotent():
    content = "from fastapi import FastAPI\napp = FastAPI()\n"
    once, _ = inject_fastapi_csp(content)
    twice, changed2 = inject_fastapi_csp(once)
    assert changed2 is False
    assert once == twice
    assert once.count("_ForgeCSPMiddleware") == 2  # class + add_middleware


def test_fastapi_unnamed_or_nested_app_is_skipped():
    # app defined inside a function (indented) -> not module-level -> skip.
    content = (
        "from fastapi import FastAPI\n"
        "def make():\n"
        "    app = FastAPI()\n"
        "    return app\n"
    )
    new, changed = inject_fastapi_csp(content)
    assert changed is False
    assert new == content


def test_fastapi_different_app_variable_is_skipped():
    content = "from fastapi import FastAPI\napi = FastAPI()\n"
    new, changed = inject_fastapi_csp(content)
    assert changed is False


def test_fastapi_existing_starlette_import_not_duplicated():
    content = (
        "from fastapi import FastAPI\n"
        "from starlette.middleware.base import BaseHTTPMiddleware\n"
        "app = FastAPI()\n"
    )
    new, changed = inject_fastapi_csp(content)
    assert changed is True
    assert new.count("from starlette.middleware.base import BaseHTTPMiddleware") == 1


# --- apply_csp over a files dict ----------------------------------------------

def test_apply_csp_mutates_files_and_reports():
    files = {
        "index.html": "<html><head></head><body></body></html>",
        "app.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "README.md": "# hi",
    }
    report = apply_csp(files)
    kinds = {c.kind for c in report.changes}
    assert "html_meta" in kinds
    assert "fastapi_middleware" in kinds
    assert _META_CSP_RE.search(files["index.html"])
    assert "app.add_middleware(_ForgeCSPMiddleware)" in files["app.py"]
    # README untouched
    assert files["README.md"] == "# hi"


def test_apply_csp_skips_unsupported_fastapi_structure():
    files = {
        "service.py": "from fastapi import FastAPI\napi = FastAPI()\n",
    }
    report = apply_csp(files)
    assert any(c.kind == "skipped" for c in report.changes)
    assert "api.add_middleware" not in files["service.py"]


def test_apply_csp_idempotent_across_calls():
    files = {"index.html": "<html><head></head><body></body></html>"}
    apply_csp(files)
    report2 = apply_csp(files)
    assert report2.changes == []
    assert len(_META_CSP_RE.findall(files["index.html"])) == 1


def test_apply_csp_ignores_non_string_entries():
    files = {"x": 123, "y": None, "z": b"<html><head></head></html>"}
    report = apply_csp(files)
    assert report.changes == []
