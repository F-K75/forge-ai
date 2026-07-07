from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

# Secure-by-default CSP for generated applications. External module scripts
# ('self') and inline styles are permitted (typical for Vite/React builds);
# inline scripts, eval, and remote origins are blocked to contain XSS in AI
# generated output. This is intentionally stricter than the platform's own
# dev-friendly CSP.
DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'"
)

_FORGE_CSP_SENTINEL = "forge:csp"
_META_CSP_RE = re.compile(
    r"<meta[^>]+http-equiv=[\"']?Content-Security-Policy[\"']?", re.IGNORECASE
)
_HEAD_RE = re.compile(r"<head[^>]*>", re.IGNORECASE)
_HTML_BODY_RE = re.compile(r"<html[\s>]", re.IGNORECASE)
_FASTAPI_APP_RE = re.compile(r"^app\s*=\s*FastAPI\(", re.MULTILINE)
_FASTAPI_IMPORT_RE = re.compile(r"from fastapi import FastAPI", re.MULTILINE)
_STARLETTE_MW_IMPORT_RE = re.compile(
    r"from starlette\.middleware\.base import BaseHTTPMiddleware", re.MULTILINE
)
_FORGE_CSP_MARKER_RE = re.compile(r"#\s*" + re.escape(_FORGE_CSP_SENTINEL), re.MULTILINE)


@dataclass
class CspChange:
    file: str
    kind: str  # "html_meta" | "fastapi_middleware" | "skipped"
    message: str


@dataclass
class CspReport:
    changes: List[CspChange] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "changes": [
                {"file": c.file, "kind": c.kind, "message": c.message}
                for c in self.changes
            ]
        }


def inject_html_csp(content: str) -> Tuple[str, bool]:
    """Insert a default CSP <meta> into <head> if absent. Idempotent: if the
    document already declares a CSP meta tag, it is left untouched (we never
    weaken a user/agent-provided policy)."""
    if not _HEAD_RE.search(content):
        return content, False
    if _META_CSP_RE.search(content):
        return content, False
    meta = (
        f'<meta http-equiv="Content-Security-Policy" content="{DEFAULT_CSP}">'
    )
    head_match = _HEAD_RE.search(content)
    inserted = (
        content[: head_match.end()]
        + "\n    "
        + meta
        + content[head_match.end():]
    )
    return inserted, True


def inject_fastapi_csp(content: str) -> Tuple[str, bool]:
    """Append a CSP response-header middleware to a module-level FastAPI app.

    Only fires for the simple, supported shape (`from fastapi import FastAPI`
    plus a module-level `app = FastAPI(...)`), so we never rewrite code in a way
    that could break the generated app. Idempotent via a sentinel comment.
    """
    if _FORGE_CSP_MARKER_RE.search(content):
        return content, False
    if not (_FASTAPI_IMPORT_RE.search(content) and _FASTAPI_APP_RE.search(content)):
        return content, False

    middleware_import = (
        "" if _STARLETTE_MW_IMPORT_RE.search(content)
        else "from starlette.middleware.base import BaseHTTPMiddleware\n"
    )
    block = (
        f"\n\n# {_FORGE_CSP_SENTINEL}\n"
        f"{middleware_import}"
        "class _ForgeCSPMiddleware(BaseHTTPMiddleware):\n"
        "    async def dispatch(self, request, call_next):\n"
        "        response = await call_next(request)\n"
        "        response.headers.setdefault(\n"
        "            \"Content-Security-Policy\",\n"
        f"            \"{DEFAULT_CSP}\",\n"
        "        )\n"
        "        return response\n\n"
        "app.add_middleware(_ForgeCSPMiddleware)\n"
    )
    return content + block, True


def _looks_like_html(content: str) -> bool:
    return bool(_HEAD_RE.search(content) or _HTML_BODY_RE.search(content))


def apply_csp(files: Dict[str, Any]) -> CspReport:
    """Inject a secure default CSP into generated application files in place.

    - HTML entry points get a CSP <meta> in <head>.
    - Simple module-level FastAPI apps get a CSP response-header middleware.

    Non-string entries are ignored. The function is idempotent and will not
    weaken an existing CSP. Returns a report of what changed (or was skipped).
    """
    report = CspReport()
    if not isinstance(files, dict):
        return report

    for path, content in files.items():
        if not isinstance(content, str):
            continue

        if path.lower().endswith((".html", ".htm")) or _looks_like_html(content):
            new_content, changed = inject_html_csp(content)
            if changed:
                files[path] = new_content
                report.changes.append(CspChange(
                    file=path, kind="html_meta",
                    message="Injected default CSP <meta> into <head>",
                ))
            elif _META_CSP_RE.search(content):
                # Already has a CSP meta tag; leave it as-is.
                pass
            continue

        if path.lower().endswith(".py") and _FASTAPI_IMPORT_RE.search(content):
            new_content, changed = inject_fastapi_csp(content)
            if changed:
                files[path] = new_content
                report.changes.append(CspChange(
                    file=path, kind="fastapi_middleware",
                    message="Appended CSP response-header middleware",
                ))
            else:
                # Supported shape already handled, or unsupported structure.
                if not _FORGE_CSP_MARKER_RE.search(content):
                    report.changes.append(CspChange(
                        file=path, kind="skipped",
                        message="FastAPI app has unsupported structure; CSP not auto-injected",
                    ))

    return report
