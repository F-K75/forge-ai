"""Static guard against routes that silently ship with no auth dependency.

This exists because two real gaps were found by manual audit rather than any
automated check: `api/prompts.py` had six routes (including ones exposing
internal agent prompt templates) with zero `Depends(...)`, and
`api/retrieval.py` accepted a client-supplied `org_id` with no membership
check, letting any authenticated user read/write/delete another org's
semantic index. Both were routes that *looked* like they took the request
model and did work, with nothing about the code screaming "this is
unprotected" -- exactly the kind of gap a human reviewer skims past.

This test parses every route in `api/*.py` and requires each one to either:
  - carry a recognized auth dependency (`get_current_user`, `admin_required`,
    or another name in `AUTH_DEPENDENCY_NAMES`), or
  - be explicitly listed in `PUBLIC_ROUTES` with a one-line reason, so an
    intentionally public route (login, signed webhook receivers, health
    checks) doesn't require a code change to stay public -- it requires a
    reviewed, named exception.

New api/*.py files are picked up automatically (no registration needed).
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Iterator, NamedTuple

API_DIR = Path(__file__).resolve().parent.parent / "api"
MAIN_FILE = Path(__file__).resolve().parent.parent / "main.py"

HTTP_METHODS = {"get", "post", "put", "delete", "patch"}

# Names of FastAPI dependencies (as used in `Depends(<name>)`) that constitute
# "this route is protected". A route needs at least one of these anywhere in
# its parameter defaults.
AUTH_DEPENDENCY_NAMES = {
    "get_current_user",
    "admin_required",
    "get_current_user_ws",
    "verify_api_key",
    "get_initiatives_current_user",
}

# (filename, route_path, http_method) -> reason. Every entry here is a
# reviewed, intentional exception -- not a default.
PUBLIC_ROUTES: dict[tuple[str, str, str], str] = {
    ("auth.py", "/register", "post"): "account creation, precedes having credentials",
    ("auth.py", "/login", "post"): "issues the credentials this whole check is about",
    ("auth.py", "/google", "get"): "OAuth login initiation, redirects to Google before any session exists",
    ("auth.py", "/google/callback", "get"): "OAuth login completion, authenticates by Google authorization code",
    ("auth.py", "/refresh", "post"): "presents a refresh token instead of a session",
    ("auth.py", "/mfa/verify", "post"): "second step of login, presents a pending-mfa token",
    ("auth.py", "/csrf-token", "get"): "CSRF token issuance must precede authenticated calls",
    ("auth.py", "/forgot-password", "post"): "user has no session by definition",
    ("auth.py", "/reset-password", "post"): "presents a reset token instead of a session",
    ("auth.py", "/verify-email", "get"): "presents a verification token instead of a session",
    ("auth.py", "/resend-verification", "post"): "user may not be able to log in yet",
    ("auth.py", "/organizations/invitations/{token}/accept", "post"): "presents an invite token",
    ("razorpay.py", "/webhook", "post"): "Razorpay-signed server-to-server callback, verified by signature",
    ("razorpay.py", "/verify", "post"): "verifies a client-side payment handshake by signature, not session",
    ("billing.py", "/razorpay/plans", "get"): "public pricing page, no user-specific data",
    ("billing.py", "/plans", "get"): "public pricing page, no user-specific data",
    ("billing.py", "/webhook", "post"): "Stripe-signed server-to-server callback, verified by signature in-body",
    ("billing.py", "/webhook/payment", "post"): "Stripe-signed server-to-server callback, verified by signature in-body",
    ("billing.py", "/webhook/cashfree", "post"): "Cashfree-signed server-to-server callback, verified by HMAC signature in header",
    ("billing.py", "/provider", "get"): "public billing-provider config, no user-specific data",
    ("cashfree.py", "/verify", "post"): "verifies payment status with the order token from the client-side flow, not a session",
    ("cashfree.py", "/webhook", "post"): "Cashfree-signed server-to-server callback, verified by HMAC signature in header",
    ("cashfree.py", "/plans", "get"): "public pricing page, no user-specific data",
    ("marketplace.py", "/", "get"): "lists only is_public=True marketplace items",
    ("marketplace.py", "/{item_id}", "get"): "reads only is_public=True marketplace items",
    ("tasks.py", "/github/webhook", "post"): "GitHub-signed inbound webhook, verified by HMAC signature",
    ("main.py", "/health", "get"): "k8s liveness probe, no auth context available",
    ("main.py", "/health/mongo-ping", "get"): "k8s/ops dependency probe, no auth context available",
    ("main.py", "/health/detailed", "get"): "k8s readiness probe, no auth context available",
    ("main.py", "/health/pools", "get"): "ops connection-pool monitoring probe, no auth context available",
    ("main.py", "/metrics", "get"): "Prometheus scrape endpoint, scraped without user session",
}


class Route(NamedTuple):
    file: str
    path: str
    method: str
    line: int
    has_auth_dep: bool


ROUTE_DECORATOR_TARGETS = {"router", "app"}


def _decorator_route_info(decorator: ast.expr) -> tuple[str, str] | None:
    """Return (method, path) if `decorator` is `@router.<method>("<path>", ...)`
    or `@app.<method>("<path>", ...)` (the latter for routes declared directly
    on the FastAPI app in main.py)."""
    if not isinstance(decorator, ast.Call):
        return None
    func = decorator.func
    if not (
        isinstance(func, ast.Attribute)
        and isinstance(func.value, ast.Name)
        and func.value.id in ROUTE_DECORATOR_TARGETS
    ):
        return None
    if func.attr not in HTTP_METHODS:
        return None
    if not decorator.args or not isinstance(decorator.args[0], ast.Constant):
        return None
    return func.attr, decorator.args[0].value


def _has_auth_dependency(func: ast.AST) -> bool:
    for node in ast.walk(func):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Depends":
            for arg in node.args:
                if isinstance(arg, ast.Name) and arg.id in AUTH_DEPENDENCY_NAMES:
                    return True
    return False


def _iter_routes() -> Iterator[Route]:
    paths = [p for p in sorted(API_DIR.glob("*.py")) if p.name not in {"__init__.py", "v1.py"}]
    paths.append(MAIN_FILE)
    for path in paths:
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                info = _decorator_route_info(decorator)
                if info is None:
                    continue
                method, route_path = info
                yield Route(
                    file=path.name,
                    path=route_path,
                    method=method,
                    line=node.lineno,
                    has_auth_dep=_has_auth_dependency(node) or any(
                        isinstance(arg_default, ast.Call)
                        and isinstance(arg_default.func, ast.Name)
                        and arg_default.func.id == "Depends"
                        and isinstance(arg_default.args[0] if arg_default.args else None, ast.Name)
                        and arg_default.args[0].id in AUTH_DEPENDENCY_NAMES
                        for arg_default in (node.args.defaults + node.args.kw_defaults)
                        if arg_default is not None
                    ),
                )


def test_every_api_route_is_authenticated_or_explicitly_public():
    unprotected = []
    for route in _iter_routes():
        key = (route.file, route.path, route.method)
        if route.has_auth_dep or key in PUBLIC_ROUTES:
            continue
        unprotected.append(f"{route.file}:{route.line} {route.method.upper()} {route.path}")

    assert not unprotected, (
        "Route(s) with no recognized auth dependency and no PUBLIC_ROUTES entry "
        "in tests/test_route_auth_coverage.py:\n  " + "\n  ".join(unprotected)
    )


def test_public_routes_allowlist_has_no_stale_entries():
    """Catches the allowlist drifting from reality (renamed/removed routes)."""
    live_routes = {(r.file, r.path, r.method) for r in _iter_routes()}
    stale = set(PUBLIC_ROUTES) - live_routes
    assert not stale, f"PUBLIC_ROUTES entries that no longer match any route: {stale}"
