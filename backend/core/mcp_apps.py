"""MCP Apps (`io.modelcontextprotocol/ui`) resource flow for Forge AI.

An MCP tool may declare an interactive UI by pointing `_meta.ui.resourceUri` at a
`ui://` resource. The gateway discovers that declaration during tool discovery
(`MCPGateway.discover_external_tools`), registers an `MCPAppSpec` for it, and this
module fetches the resource through the governed MCP client, validates it, and
returns a render-ready payload for a sandboxed iframe.

Security model (host side of the MCP Apps spec):
- The resource URI must be a well-formed `ui://` URI and must match the URI the
  tool declared; the server's response must echo that URI.
- Content type is strict: exactly `text/html;profile=mcp-app` (case and
  whitespace-insensitive). Anything else is rejected.
- Size is capped (`MAX_APP_HTML_BYTES`) and content must be valid UTF-8 without
  NUL/control characters.
- The HTML is never rendered in Forge's own origin. The payload carries iframe
  sandbox metadata (`allow-scripts` only; never `allow-same-origin`, top
  navigation, popups, or forms) and a Content-Security-Policy that is both
  returned as data and injected as the first `<meta>` of the document. The CSP
  starts from `default-src 'none'` (stricter than the generated-app baseline in
  `sandbox/csp.py`, which relies on `'self'` — meaningless for an opaque-origin
  srcdoc frame) and only opens the HTTPS origins the resource declared in
  `_meta.ui.csp`, after validating each one.
- Device permissions requested via `_meta.ui.permissions` are always denied.
- Every fetch (success, denial, or rejection) is written to the MCP audit trail.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import ipaddress
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from core.protocol_gateway import MCPGateway, MCPInvocationAudit, _new_id

MCP_APPS_EXTENSION_ID = "io.modelcontextprotocol/ui"
MCP_APP_MIME_TYPE = "text/html;profile=mcp-app"
MAX_APP_HTML_BYTES = 256 * 1024
MAX_CSP_DOMAINS_PER_DIRECTIVE = 16
IFRAME_SANDBOX = "allow-scripts"

_UI_URI_RE = re.compile(r"^ui://[A-Za-z0-9][A-Za-z0-9._~\-]*(/[A-Za-z0-9._~\-]+)*/?$")
_DOMAIN_RE = re.compile(
    r"^https://(\*\.)?([A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)"
    r"(\.[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)+(:\d{1,5})?$"
)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0e-\x1f\x7f]")
_LEADING_DOCTYPE_RE = re.compile(r"^\s*<!doctype[^>]*>", re.IGNORECASE)
_META_REFRESH_RE = re.compile(
    r"<meta\b[^>]*http-equiv\s*=\s*[\"']?\s*refresh[^>]*>", re.IGNORECASE
)
_BLOCKED_CSP_HOSTS = frozenset({"localhost", "metadata.google.internal"})


class MCPAppResourceError(ValueError):
    """Raised when an MCP App resource fails validation. `status` maps to HTTP."""

    def __init__(self, message: str, *, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class MCPAppRenderPayload:
    app_id: str
    tool_name: str
    server_id: str
    resource_uri: str
    mime_type: str
    html: str
    size_bytes: int
    content_sha256: str
    sandbox: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)
    protocol: str = "mcp-apps/v1"
    extension: str = MCP_APPS_EXTENSION_ID

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def is_valid_ui_uri(uri: str) -> bool:
    return (
        isinstance(uri, str)
        and len(uri) <= 512
        and ".." not in uri
        and bool(_UI_URI_RE.match(uri))
    )


def _normalize_mime(mime: Any) -> str:
    return re.sub(r"\s+", "", str(mime or "")).lower()


def _validate_csp_domain(domain: Any) -> Optional[str]:
    """Return a safe CSP source expression for `domain`, or None if unsafe."""
    if not isinstance(domain, str) or len(domain) > 253:
        return None
    candidate = domain.strip().rstrip("/")
    if not _DOMAIN_RE.match(candidate):
        return None
    host = candidate[len("https://"):].split(":", 1)[0].lower()
    bare = host[2:] if host.startswith("*.") else host
    if (
        bare in _BLOCKED_CSP_HOSTS
        or bare.endswith(".local")
        or bare.endswith(".internal")
        or bare.endswith(".localhost")
    ):
        return None
    try:
        ip = ipaddress.ip_address(bare)
        if not ip.is_global:
            return None
    except ValueError:
        pass
    return candidate


def _collect_domains(raw: Any, label: str, warnings: List[str]) -> List[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        warnings.append(f"Ignored non-list csp.{label}")
        return []
    out: List[str] = []
    for item in raw:
        safe = _validate_csp_domain(item)
        if safe is None:
            warnings.append(f"Dropped unsafe csp.{label} entry")
            continue
        if safe not in out:
            out.append(safe)
        if len(out) >= MAX_CSP_DOMAINS_PER_DIRECTIVE:
            warnings.append(f"Truncated csp.{label} to {MAX_CSP_DOMAINS_PER_DIRECTIVE} entries")
            break
    return out


def build_mcp_app_csp(ui_meta: Dict[str, Any], warnings: List[str]) -> Tuple[str, Dict[str, List[str]]]:
    """Build a restrictive CSP for a sandboxed MCP App from `_meta.ui.csp`."""
    csp_meta = ui_meta.get("csp") if isinstance(ui_meta.get("csp"), dict) else {}
    connect = _collect_domains(csp_meta.get("connectDomains"), "connectDomains", warnings)
    resource = _collect_domains(csp_meta.get("resourceDomains"), "resourceDomains", warnings)
    frame = _collect_domains(csp_meta.get("frameDomains"), "frameDomains", warnings)
    if csp_meta.get("baseUriDomains"):
        warnings.append("Ignored csp.baseUriDomains (base-uri is always 'none')")

    none = "'none'"
    inline = "'unsafe-inline'"

    def _src(*parts: str) -> str:
        return " ".join([*parts, *resource])

    directives = [
        f"default-src {none}",
        f"script-src {_src(inline)}",
        f"style-src {_src(inline)}",
        f"img-src {_src('data:')}",
        f"font-src {_src('data:')}",
        f"media-src {_src('data:')}",
        f"connect-src {' '.join(connect) if connect else none}",
        f"frame-src {' '.join(frame) if frame else none}",
        f"object-src {none}",
        f"base-uri {none}",
        f"form-action {none}",
    ]
    return "; ".join(directives), {
        "connect_domains": connect,
        "resource_domains": resource,
        "frame_domains": frame,
    }


def _decode_content(entry: Dict[str, Any]) -> str:
    if isinstance(entry.get("text"), str):
        text = entry["text"]
        if len(text.encode("utf-8", errors="strict")) > MAX_APP_HTML_BYTES:
            raise MCPAppResourceError("MCP App resource exceeds the size limit", status=413)
        return text
    blob = entry.get("blob")
    if isinstance(blob, str):
        # base64 expands 4/3; reject before decoding anything oversized.
        if len(blob) > (MAX_APP_HTML_BYTES * 4) // 3 + 8:
            raise MCPAppResourceError("MCP App resource exceeds the size limit", status=413)
        try:
            raw = base64.b64decode(blob, validate=True)
            return raw.decode("utf-8", errors="strict")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise MCPAppResourceError("MCP App resource blob is not valid base64 UTF-8") from exc
    raise MCPAppResourceError("MCP App resource has no text or blob content")


def sanitize_mcp_app_resource(
    result: Dict[str, Any], *, expected_uri: str
) -> Tuple[str, Dict[str, Any], List[str]]:
    """Validate a `resources/read` result and return (html, sandbox, warnings)."""
    contents = result.get("contents")
    if not isinstance(contents, list) or not contents:
        raise MCPAppResourceError("MCP App resource response has no contents")
    if len(contents) != 1:
        raise MCPAppResourceError("MCP App resource must contain exactly one document")
    entry = contents[0]
    if not isinstance(entry, dict):
        raise MCPAppResourceError("MCP App resource content is malformed")
    if entry.get("uri") != expected_uri:
        raise MCPAppResourceError("MCP App resource URI does not match the requested URI")
    if _normalize_mime(entry.get("mimeType")) != MCP_APP_MIME_TYPE:
        raise MCPAppResourceError(
            f"MCP App resource must be served as {MCP_APP_MIME_TYPE}", status=415
        )

    html = _decode_content(entry)
    if _CONTROL_CHARS_RE.search(html):
        raise MCPAppResourceError("MCP App resource contains control characters")
    if "<" not in html:
        raise MCPAppResourceError("MCP App resource is not an HTML document")

    warnings: List[str] = []
    meta = entry.get("_meta") if isinstance(entry.get("_meta"), dict) else {}
    ui_meta = meta.get("ui") if isinstance(meta.get("ui"), dict) else {}
    csp, allowed_domains = build_mcp_app_csp(ui_meta, warnings)

    requested_perms = ui_meta.get("permissions") if isinstance(ui_meta.get("permissions"), dict) else {}
    denied_permissions = sorted(str(k)[:32] for k in requested_perms.keys())[:8]
    if denied_permissions:
        warnings.append("Device permissions requested by the app were denied")

    if _META_REFRESH_RE.search(html):
        html = _META_REFRESH_RE.sub("", html)
        warnings.append("Removed meta refresh")

    # Inject our CSP as the first element so it governs every later node. Any
    # CSP the document declares itself can only narrow this policy further.
    body = _LEADING_DOCTYPE_RE.sub("", html.lstrip("﻿"), count=1)
    csp_attr = csp.replace("&", "&amp;").replace('"', "&quot;")
    safe_html = (
        "<!DOCTYPE html>\n"
        f'<meta http-equiv="Content-Security-Policy" content="{csp_attr}">\n'
        '<meta name="referrer" content="no-referrer">\n'
        f"{body}"
    )

    sandbox = {
        "render_mode": "iframe-srcdoc",
        "iframe_sandbox": IFRAME_SANDBOX,
        "iframe_allow": "",
        "referrer_policy": "no-referrer",
        "csp": csp,
        "allowed_domains": allowed_domains,
        "denied_permissions": denied_permissions,
        "prefers_border": bool(ui_meta.get("prefersBorder", False)),
    }
    return safe_html, sandbox, warnings


class MCPAppsService:
    """Fetch, validate and audit MCP App UI resources for governed tools."""

    def __init__(self, gateway: MCPGateway) -> None:
        self._gw = gateway

    async def _audit(
        self,
        *,
        tool_name: str,
        server_id: str,
        role: str,
        department: str,
        project_id: str,
        status: str,
        resource_uri: Optional[str],
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        audit = MCPInvocationAudit(
            invocation_id=_new_id("mcpapp"),
            tool_name=tool_name,
            server_id=server_id,
            role=role,
            department=department,
            project_id=project_id,
            status=status,
            reason=reason,
            action="resources/read",
            resource_uri=resource_uri,
        )
        await self._gw.record_audit(audit)
        return audit.to_dict()

    async def fetch_app_resource(
        self, *, app_id: str, role: str, department: str, project_id: str
    ) -> MCPAppRenderPayload:
        app = self._gw.get_app(app_id)
        if app is None:
            raise MCPAppResourceError(f"Unknown MCP App '{app_id[:64]}'", status=404)

        audit_kw = dict(
            tool_name=app.tool_name,
            server_id=app.server_id,
            role=role,
            department=department,
            project_id=project_id,
            resource_uri=app.resource_uri,
        )
        spec = self._gw.get_tool_spec(app.tool_name)
        if spec is None or department not in spec.allowed_departments:
            reason = f"Department '{department}' is not permitted to open '{app.app_id}'"
            await self._audit(status="denied", reason=reason, **audit_kw)
            raise MCPAppResourceError(reason, status=403)

        uri = app.resource_uri
        if not uri:
            raise MCPAppResourceError("MCP App does not declare a ui:// resource", status=400)
        if not is_valid_ui_uri(uri) or spec.ui_resource_uri != uri:
            reason = "MCP App resource URI is invalid or does not match the tool declaration"
            await self._audit(status="denied", reason=reason, **audit_kw)
            raise MCPAppResourceError(reason, status=400)

        server = self._gw.get_server(app.server_id) or {}
        endpoint = server.get("endpoint_url")
        if server.get("transport") != "streamable-http" or not endpoint:
            raise MCPAppResourceError("MCP App server has no remote endpoint", status=400)

        try:
            result = await self._gw.http_client.read_resource(str(endpoint), uri)
            html, sandbox, warnings = sanitize_mcp_app_resource(result, expected_uri=uri)
        except MCPAppResourceError as exc:
            await self._audit(status="error", reason=str(exc)[:300], **audit_kw)
            raise
        except ValueError as exc:
            await self._audit(status="error", reason=str(exc)[:300], **audit_kw)
            raise MCPAppResourceError(f"MCP App resource fetch failed: {str(exc)[:200]}") from exc
        except Exception as exc:  # network / transport failures
            await self._audit(status="error", reason=type(exc).__name__, **audit_kw)
            raise MCPAppResourceError("MCP App resource fetch failed") from exc

        encoded = html.encode("utf-8")
        await self._audit(status="succeeded", **audit_kw)
        return MCPAppRenderPayload(
            app_id=app.app_id,
            tool_name=app.tool_name,
            server_id=app.server_id,
            resource_uri=uri,
            mime_type=MCP_APP_MIME_TYPE,
            html=html,
            size_bytes=len(encoded),
            content_sha256=hashlib.sha256(encoded).hexdigest(),
            sandbox=sandbox,
            warnings=warnings,
        )
