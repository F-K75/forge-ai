"""Protocol Gateway — P0 Streaming & Interoperability Layer:
1. AG-UI Event Stream Broker (server-authoritative async pub/sub with monotonic
   event IDs, bounded replay buffer for idempotent reconnection, and SSE wire formatting).
2. MCP Tool Gateway (governed external/built-in tool registry, per-department
   allowlists, SSRF-safe endpoint URL validation, and immutable invocation audit trail).
3. A2UI Generative Surface Builder (declarative, XSS-safe structured UI component
   trees synthesized from KernelRun state for approval cards, conflicts, and scorecards).

Pure-Python stdlib implementation so it runs cleanly in both FastAPI production
and standalone unit tests.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, FrozenSet, List, Optional, Set, Tuple
from urllib import request as urllib_request
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# --------------------------------------------------------------------------- #
# 1. AG-UI Event Stream Broker (Server-Authoritative SSE / Real-Time Protocol)
# --------------------------------------------------------------------------- #

KERNEL_TO_AGUI_TYPE: Dict[str, str] = {
    "kernel_run_started": "RUN_STARTED",
    "kernel_wave_started": "STEP_STARTED",
    "kernel_task_updated": "STATE_DELTA",
    "kernel_delegation": "TOOL_CALL_RESULT",
    "kernel_skill_activated": "CUSTOM",
    "kernel_artifact_published": "STATE_DELTA",
    "kernel_conflict_detected": "CUSTOM",
    "kernel_wave_reconciled": "STATE_DELTA",
    "kernel_repair_cycle": "CUSTOM",
    "kernel_approval_required": "CUSTOM",
    "kernel_approval_resolved": "CUSTOM",
    "kernel_run_completed": "RUN_FINISHED",
}


@dataclass
class AGUIEvent:
    event_id: int
    agui_type: str
    kernel_event: str
    project_id: str
    run_id: str
    payload: Dict[str, Any]
    timestamp: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_sse(self) -> str:
        body = json.dumps(self.to_dict(), default=str)
        return f"id: {self.event_id}\nevent: {self.agui_type}\ndata: {body}\n\n"


class AGUIStreamBroker:
    """In-process async event broker with replay buffer & optional Redis Pub/Sub bridge."""

    def __init__(self, *, max_history_per_run: int = 250) -> None:
        self._max_history = max(20, max_history_per_run)
        self._history: Dict[str, List[AGUIEvent]] = {}
        self._counters: Dict[str, int] = {}
        self._subscribers: Dict[str, Set[asyncio.Queue[Optional[AGUIEvent]]]] = {}
        self._redis_publisher: Optional[Callable[[str, str], Awaitable[Any]]] = None

    @staticmethod
    def redis_channel_for_run(run_id: str) -> str:
        return f"forge:agui:run:{run_id}"

    def attach_redis_publisher(
        self, publisher: Optional[Callable[[str, str], Awaitable[Any]]]
    ) -> None:
        """Attach an async `(channel, json_payload)` publisher for multi-worker Redis Pub/Sub."""
        self._redis_publisher = publisher

    async def publish(
        self,
        *,
        project_id: str,
        run_id: str,
        kernel_event: str,
        payload: Dict[str, Any],
    ) -> AGUIEvent:
        seq = self._counters.get(run_id, 0) + 1
        self._counters[run_id] = seq
        event = AGUIEvent(
            event_id=seq,
            agui_type=KERNEL_TO_AGUI_TYPE.get(kernel_event, "CUSTOM"),
            kernel_event=kernel_event,
            project_id=project_id,
            run_id=run_id,
            payload=dict(payload),
        )
        buf = self._history.setdefault(run_id, [])
        buf.append(event)
        if len(buf) > self._max_history:
            del buf[: len(buf) - self._max_history]

        for queue in list(self._subscribers.get(run_id, set())):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.debug("AG-UI subscriber queue full for run %s", run_id)

        if self._redis_publisher is not None:
            try:
                await self._redis_publisher(
                    self.redis_channel_for_run(run_id),
                    json.dumps(event.to_dict(), default=str),
                )
            except Exception:
                logger.debug("AG-UI Redis fanout failed open for run %s", run_id, exc_info=True)

        if kernel_event == "kernel_run_completed":
            for queue in list(self._subscribers.get(run_id, set())):
                try:
                    queue.put_nowait(None)
                except asyncio.QueueFull:
                    pass
        return event

    def get_history(self, run_id: str, *, after_event_id: int = 0) -> List[AGUIEvent]:
        return [e for e in self._history.get(run_id, []) if e.event_id > after_event_id]

    async def subscribe(
        self,
        run_id: str,
        *,
        after_event_id: int = 0,
        heartbeat_seconds: float = 15.0,
    ) -> AsyncIterator[AGUIEvent]:
        """Yield replay events after `after_event_id`, then live events until run completion."""
        queue: asyncio.Queue[Optional[AGUIEvent]] = asyncio.Queue(maxsize=200)
        subs = self._subscribers.setdefault(run_id, set())
        subs.add(queue)
        seen_id = after_event_id
        try:
            for past in self.get_history(run_id, after_event_id=after_event_id):
                seen_id = max(seen_id, past.event_id)
                yield past
                if past.kernel_event == "kernel_run_completed":
                    return

            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=heartbeat_seconds)
                except asyncio.TimeoutError:
                    # Emit keepalive event to prevent proxy timeouts without advancing event_id
                    yield AGUIEvent(
                        event_id=seen_id,
                        agui_type="HEARTBEAT",
                        kernel_event="heartbeat",
                        project_id="",
                        run_id=run_id,
                        payload={"status": "alive"},
                    )
                    continue
                if item is None:
                    return
                if item.event_id <= seen_id:
                    continue
                seen_id = item.event_id
                yield item
                if item.kernel_event == "kernel_run_completed":
                    return
        finally:
            subs.discard(queue)
            if not subs:
                self._subscribers.pop(run_id, None)


# --------------------------------------------------------------------------- #
# 2. MCP Tool Gateway (Governed External & Built-In Tool Invocation + P1 Apps)
# --------------------------------------------------------------------------- #


def validate_mcp_endpoint_url(url: str) -> Tuple[bool, Optional[str]]:
    """Validate an external MCP server URL against SSRF and unsafe schemes."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("https",):
        return False, "External MCP server endpoints must use https://"
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "Missing hostname in MCP endpoint URL"
    blocked_hosts = {"localhost", "metadata.google.internal", "169.254.169.254"}
    if hostname in blocked_hosts or hostname.endswith(".local") or hostname.endswith(".internal"):
        return False, f"Blocked private/internal MCP host '{hostname}'"

    # Check literal IP addresses directly
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return False, f"Blocked non-public IP address '{hostname}'"
    except ValueError:
        # Resolve DNS best-effort when running online; block if it resolves to private ranges
        try:
            infos = socket.getaddrinfo(hostname, None)
            for info in infos:
                resolved_ip = ipaddress.ip_address(info[4][0])
                if (
                    resolved_ip.is_private
                    or resolved_ip.is_loopback
                    or resolved_ip.is_link_local
                    or resolved_ip.is_reserved
                ):
                    return False, f"Host '{hostname}' resolves to non-public IP"
        except OSError:
            pass
    return True, None


class _NoRedirectHandler(urllib_request.HTTPRedirectHandler):
    """Block 3xx redirects on outbound external MCP requests to prevent redirect-based SSRF."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError(f"External MCP server attempted disallowed HTTP redirect ({code})")


class StreamableHTTPMCPClient:
    """Hardened Streamable HTTP JSON-RPC 2.0 client for external MCP servers."""

    MAX_RESPONSE_BYTES = 512 * 1024  # 512 KB cap

    def __init__(
        self,
        *,
        timeout_seconds: float = 8.0,
        transport_fn: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None,
    ) -> None:
        self._timeout = min(10.0, max(1.0, float(timeout_seconds)))
        self._transport_fn = transport_fn

    def _post_jsonrpc_sync(self, endpoint_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        ok, err = validate_mcp_endpoint_url(endpoint_url)
        if not ok:
            raise ValueError(err or "Invalid external MCP endpoint URL")
        if self._transport_fn is not None:
            return self._transport_fn(endpoint_url, payload)

        body = json.dumps(payload).encode("utf-8")
        req = urllib_request.Request(
            endpoint_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "ForgeAI-MCP-Gateway/1.0",
            },
            method="POST",
        )
        opener = urllib_request.build_opener(_NoRedirectHandler())
        with opener.open(req, timeout=self._timeout) as resp:
            raw = resp.read(self.MAX_RESPONSE_BYTES + 1)
            if len(raw) > self.MAX_RESPONSE_BYTES:
                raise ValueError("External MCP response exceeded 512 KB safety limit")
            parsed = json.loads(raw.decode("utf-8", errors="replace"))
            if not isinstance(parsed, dict):
                raise ValueError("External MCP server returned non-object JSON-RPC payload")
            return parsed

    async def list_tools(self, endpoint_url: str) -> List[Dict[str, Any]]:
        rpc = {"jsonrpc": "2.0", "id": _new_id("rpc"), "method": "tools/list", "params": {}}
        res = await asyncio.to_thread(self._post_jsonrpc_sync, endpoint_url, rpc)
        if "error" in res:
            raise ValueError(str(res["error"])[:240])
        tools = (res.get("result") or {}).get("tools") or []
        return [t for t in tools if isinstance(t, dict) and t.get("name")]

    async def call_tool(
        self, endpoint_url: str, tool_name: str, arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        rpc = {
            "jsonrpc": "2.0",
            "id": _new_id("rpc"),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }
        res = await asyncio.to_thread(self._post_jsonrpc_sync, endpoint_url, rpc)
        if "error" in res:
            raise ValueError(str(res["error"])[:240])
        return dict(res.get("result") or {})

    async def read_resource(self, endpoint_url: str, uri: str) -> Dict[str, Any]:
        """Fetch a resource (e.g. an MCP Apps `ui://` document) via `resources/read`."""
        rpc = {
            "jsonrpc": "2.0",
            "id": _new_id("rpc"),
            "method": "resources/read",
            "params": {"uri": uri},
        }
        res = await asyncio.to_thread(self._post_jsonrpc_sync, endpoint_url, rpc)
        if "error" in res:
            raise ValueError(str(res["error"])[:240])
        result = res.get("result")
        if not isinstance(result, dict):
            raise ValueError("External MCP server returned a malformed resources/read result")
        return result


def extract_mcp_app_resource_uri(raw_tool: Dict[str, Any]) -> Optional[str]:
    """Return the MCP Apps `ui://` resource a tool declares, if any.

    Supports the current `_meta.ui.resourceUri` shape and the legacy flat
    `_meta["ui/resourceUri"]` key. Non-`ui://` values are ignored.
    """
    meta = raw_tool.get("_meta")
    if not isinstance(meta, dict):
        return None
    candidate: Any = None
    ui = meta.get("ui")
    if isinstance(ui, dict):
        candidate = ui.get("resourceUri")
    if candidate is None:
        candidate = meta.get("ui/resourceUri")
    if isinstance(candidate, str) and candidate.startswith("ui://") and len(candidate) <= 512:
        return candidate
    return None


MCPToolHandler = Callable[[Dict[str, Any], Dict[str, Any]], Awaitable[Dict[str, Any]]]


@dataclass
class MCPToolSpec:
    name: str
    server_id: str
    description: str
    allowed_departments: FrozenSet[str]
    input_schema: Dict[str, Any]
    read_only: bool = True
    ui_resource_uri: Optional[str] = None  # MCP Apps `ui://` resource declared by the tool

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "server_id": self.server_id,
            "description": self.description,
            "allowed_departments": sorted(self.allowed_departments),
            "input_schema": self.input_schema,
            "read_only": self.read_only,
            "ui_resource_uri": self.ui_resource_uri,
        }


@dataclass
class MCPAppSpec:
    """P1 MCP App — declarative, XSS-safe interactive tool view bound to a governed MCP tool."""

    app_id: str
    title: str
    tool_name: str
    server_id: str
    description: str
    ui_schema: Dict[str, Any]
    protocol: str = "mcp-apps/v1"
    resource_uri: Optional[str] = None  # `ui://` resource rendered in a sandboxed iframe

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MCPInvocationAudit:
    invocation_id: str
    tool_name: str
    server_id: str
    role: str
    department: str
    project_id: str
    status: str  # succeeded | denied | error
    reason: Optional[str] = None
    action: str = "tools/call"  # tools/call | resources/read
    resource_uri: Optional[str] = None
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MCPGateway:
    """Governed MCP tool registry with per-department RBAC, external HTTP transport, P1 MCP Apps, and audit trail."""

    def __init__(self, *, http_client: Optional[StreamableHTTPMCPClient] = None) -> None:
        self._tools: Dict[str, Tuple[MCPToolSpec, MCPToolHandler]] = {}
        self._apps: Dict[str, MCPAppSpec] = {}
        self._http_client = http_client or StreamableHTTPMCPClient()
        self._audit_persister: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]] = None
        self._servers: Dict[str, Dict[str, Any]] = {
            "forge-workspace-mcp": {
                "server_id": "forge-workspace-mcp",
                "transport": "in-process",
                "status": "connected",
            }
        }
        self._audit_log: List[MCPInvocationAudit] = []
        self._register_builtin_tools()
        self._register_builtin_apps()

    def attach_audit_persister(
        self, persister: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]]
    ) -> None:
        """Attach an async MongoDB persister for immutable MCP invocation audits."""
        self._audit_persister = persister

    def _register_builtin_apps(self) -> None:
        builtins = [
            MCPAppSpec(
                app_id="app_security_hygiene",
                title="Security Hygiene Inspector",
                tool_name="security.static_scan",
                server_id="forge-workspace-mcp",
                description="Interactive static scanner checking code snippets for hardcoded credentials, unsafe HTML sinks, and shell injection.",
                ui_schema={
                    "input_field": "code",
                    "input_label": "Code Snippet",
                    "action_label": "Run Static Scan",
                    "result_view": "findings_list",
                },
            ),
            MCPAppSpec(
                app_id="app_skill_router",
                title="Skill Router Workbench",
                tool_name="skills.route",
                server_id="forge-workspace-mcp",
                description="Inspect live 9-domain SKILL.md activation scores, transitive dependencies, and permission boundaries for any role.",
                ui_schema={
                    "input_field": "objective",
                    "input_label": "Engineering Objective",
                    "action_label": "Route Skills",
                    "result_view": "skill_table",
                },
            ),
            MCPAppSpec(
                app_id="app_blackboard_explorer",
                title="Shared Blackboard Explorer",
                tool_name="blackboard.query",
                server_id="forge-workspace-mcp",
                description="Query versioned cross-agent artifacts published by active multi-agent DAG runs within this project.",
                ui_schema={
                    "input_field": "run_id",
                    "input_label": "Kernel Run ID",
                    "action_label": "Query Blackboard",
                    "result_view": "artifact_feed",
                },
            ),
        ]
        for app in builtins:
            self._apps[app.app_id] = app

    def list_apps(self) -> List[Dict[str, Any]]:
        return [a.to_dict() for a in self._apps.values()]

    def register_app(self, app: MCPAppSpec) -> None:
        self._apps[app.app_id] = app

    def get_app(self, app_id: str) -> Optional[MCPAppSpec]:
        return self._apps.get(app_id)

    def get_tool_spec(self, tool_name: str) -> Optional[MCPToolSpec]:
        entry = self._tools.get(tool_name)
        return entry[0] if entry else None

    def get_server(self, server_id: str) -> Optional[Dict[str, Any]]:
        return self._servers.get(server_id)

    @property
    def http_client(self) -> StreamableHTTPMCPClient:
        return self._http_client

    def _register_builtin_tools(self) -> None:
        all_depts = frozenset(
            {
                "leadership",
                "business",
                "architecture",
                "design",
                "engineering",
                "infrastructure",
                "security",
                "quality",
                "delivery",
            }
        )

        async def _list_blackboard_summary(args: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
            from core.agent_kernel import get_agent_kernel

            run_id = str(args.get("run_id") or "")
            active = get_agent_kernel().get_active_run(run_id)
            if active is None or active.project_id != ctx.get("project_id"):
                return {"run_id": run_id, "artifact_count": 0, "artifacts": []}
            return {
                "run_id": run_id,
                "artifact_count": len(active.artifacts),
                "artifacts": active.artifacts[-10:],
            }

        async def _route_skills_tool(args: Dict[str, Any], _ctx: Dict[str, Any]) -> Dict[str, Any]:
            from core.skill_engine import get_skill_router

            router = get_skill_router()
            matches = router.route_for_task(
                role=str(args.get("role") or "backend_engineer"),
                department=str(args.get("department") or "engineering"),
                objective=str(args.get("objective") or ""),
                top_k=min(5, max(1, int(args.get("top_k") or 3))),
            )
            return {"skills": [m.to_dict() for m in matches]}

        async def _security_hygiene_check(args: Dict[str, Any], _ctx: Dict[str, Any]) -> Dict[str, Any]:
            from core.execution_sandbox import run_static_security_hygiene_scan

            snippet = str(args.get("code") or "")[:10000]
            findings = run_static_security_hygiene_scan(snippet)
            return {"finding_count": len(findings), "findings": findings}

        self.register_tool(
            MCPToolSpec(
                name="blackboard.query",
                server_id="forge-workspace-mcp",
                description="Inspect published Shared Blackboard artifacts for an active project kernel run.",
                allowed_departments=all_depts,
                input_schema={"type": "object", "properties": {"run_id": {"type": "string"}}},
                read_only=True,
            ),
            _list_blackboard_summary,
        )
        self.register_tool(
            MCPToolSpec(
                name="skills.route",
                server_id="forge-workspace-mcp",
                description="Resolve relevant SKILL.md capabilities and permissions for an agent role.",
                allowed_departments=all_depts,
                input_schema={
                    "type": "object",
                    "properties": {
                        "role": {"type": "string"},
                        "department": {"type": "string"},
                        "objective": {"type": "string"},
                    },
                },
                read_only=True,
            ),
            _route_skills_tool,
        )
        self.register_tool(
            MCPToolSpec(
                name="security.static_scan",
                server_id="forge-workspace-mcp",
                description="Run static security hygiene checks for hardcoded secrets, unsafe HTML sinks, or shell execution.",
                allowed_departments=frozenset({"security", "quality", "engineering", "architecture"}),
                input_schema={"type": "object", "properties": {"code": {"type": "string"}}},
                read_only=True,
            ),
            _security_hygiene_check,
        )

    def register_external_server(self, server_id: str, endpoint_url: str) -> Dict[str, Any]:
        ok, err = validate_mcp_endpoint_url(endpoint_url)
        if not ok:
            raise ValueError(err or "Invalid MCP server URL")
        clean_id = "".join(ch for ch in (server_id or "").strip() if ch.isalnum() or ch in "-_")[:48]
        if not clean_id:
            raise ValueError("Invalid MCP server_id")
        entry = {
            "server_id": clean_id,
            "endpoint_url": endpoint_url.strip(),
            "transport": "streamable-http",
            "status": "registered",
        }
        self._servers[clean_id] = entry
        return entry

    async def discover_external_tools(
        self,
        server_id: str,
        *,
        allowed_departments: Optional[FrozenSet[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Discover and register tools from a registered external Streamable HTTP MCP server."""
        server = self._servers.get(server_id)
        if not server or server.get("transport") != "streamable-http":
            raise ValueError(f"External Streamable HTTP MCP server '{server_id}' not found")
        endpoint_url = str(server["endpoint_url"])
        raw_tools = await self._http_client.list_tools(endpoint_url)
        depts = allowed_departments or frozenset({"engineering", "architecture", "security", "quality"})
        registered: List[Dict[str, Any]] = []

        for raw in raw_tools[:30]:
            remote_name = str(raw.get("name") or "").strip()[:64]
            if not remote_name:
                continue
            scoped_name = f"{server_id}.{remote_name}"
            desc = str(raw.get("description") or f"External MCP tool {remote_name}")[:280]
            schema = raw.get("inputSchema") if isinstance(raw.get("inputSchema"), dict) else {"type": "object"}

            def _make_proxy(ep: str, rname: str) -> MCPToolHandler:
                async def _proxy_handler(args: Dict[str, Any], _ctx: Dict[str, Any]) -> Dict[str, Any]:
                    return await self._http_client.call_tool(ep, rname, args)
                return _proxy_handler

            ui_uri = extract_mcp_app_resource_uri(raw)
            spec = MCPToolSpec(
                name=scoped_name,
                server_id=server_id,
                description=desc,
                allowed_departments=depts,
                input_schema=schema,
                read_only=bool(raw.get("readOnly", True)),
                ui_resource_uri=ui_uri,
            )
            self.register_tool(spec, _make_proxy(endpoint_url, remote_name))
            if ui_uri:
                app_id = "app_" + "".join(
                    ch if ch.isalnum() else "_" for ch in scoped_name
                )[:96]
                self.register_app(
                    MCPAppSpec(
                        app_id=app_id,
                        title=str(raw.get("title") or remote_name)[:120],
                        tool_name=scoped_name,
                        server_id=server_id,
                        description=desc,
                        ui_schema={"kind": "mcp-app-resource", "resource_uri": ui_uri},
                        resource_uri=ui_uri,
                    )
                )
            registered.append(spec.to_dict())

        server["status"] = "connected"
        server["discovered_tools"] = len(registered)
        return registered

    def register_tool(self, spec: MCPToolSpec, handler: MCPToolHandler) -> None:
        self._tools[spec.name] = (spec, handler)

    def list_tools(self, *, department: Optional[str] = None) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for spec, _ in sorted(self._tools.values(), key=lambda pair: pair[0].name):
            if department and department not in spec.allowed_departments:
                continue
            out.append(spec.to_dict())
        return out

    def list_servers(self) -> List[Dict[str, Any]]:
        return list(self._servers.values())

    def get_audit_log(self, *, project_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        entries = self._audit_log
        if project_id:
            entries = [e for e in entries if e.project_id == project_id]
        return [e.to_dict() for e in entries[-limit:]]

    async def record_audit(self, audit: MCPInvocationAudit) -> None:
        await self._record_audit(audit)

    async def _record_audit(self, audit: MCPInvocationAudit) -> None:
        self._audit_log.append(audit)
        if len(self._audit_log) > 500:
            del self._audit_log[: len(self._audit_log) - 500]
        if self._audit_persister is not None:
            try:
                await self._audit_persister(audit.to_dict())
            except Exception:
                logger.debug("MCP audit persistence failed open", exc_info=True)

    async def invoke_tool(
        self,
        *,
        tool_name: str,
        arguments: Dict[str, Any],
        role: str,
        department: str,
        project_id: str,
    ) -> Dict[str, Any]:
        entry = self._tools.get(tool_name)
        if entry is None:
            audit = MCPInvocationAudit(
                invocation_id=_new_id("mcp"),
                tool_name=tool_name,
                server_id="unknown",
                role=role,
                department=department,
                project_id=project_id,
                status="denied",
                reason=f"Unknown MCP tool '{tool_name}'",
            )
            await self._record_audit(audit)
            return {"ok": False, "error": audit.reason, "audit": audit.to_dict()}

        spec, handler = entry
        if department not in spec.allowed_departments:
            audit = MCPInvocationAudit(
                invocation_id=_new_id("mcp"),
                tool_name=tool_name,
                server_id=spec.server_id,
                role=role,
                department=department,
                project_id=project_id,
                status="denied",
                reason=f"Department '{department}' is not permitted to invoke '{tool_name}'",
            )
            await self._record_audit(audit)
            return {"ok": False, "error": audit.reason, "audit": audit.to_dict()}

        try:
            result = await handler(
                dict(arguments or {}),
                {"role": role, "department": department, "project_id": project_id},
            )
            audit = MCPInvocationAudit(
                invocation_id=_new_id("mcp"),
                tool_name=tool_name,
                server_id=spec.server_id,
                role=role,
                department=department,
                project_id=project_id,
                status="succeeded",
            )
            await self._record_audit(audit)
            return {"ok": True, "result": result, "audit": audit.to_dict()}
        except Exception as exc:
            audit = MCPInvocationAudit(
                invocation_id=_new_id("mcp"),
                tool_name=tool_name,
                server_id=spec.server_id,
                role=role,
                department=department,
                project_id=project_id,
                status="error",
                reason=str(exc)[:300],
            )
            await self._record_audit(audit)
            return {"ok": False, "error": audit.reason, "audit": audit.to_dict()}


# --------------------------------------------------------------------------- #
# 3. A2UI Declarative Generative Surface Builder (XSS-Safe Typed Components)
# --------------------------------------------------------------------------- #
#
# Every A2UI component is a flat, typed JSON object: ``{"type": <name>, ...props}``.
# Each component type has a closed prop schema; unknown component types, unknown
# props (at any nesting depth), wrong types, oversize strings/lists, control
# characters and non-http(s) URLs are rejected. Components never carry raw HTML:
# every string is data that the client renders as escaped text nodes, so markup
# such as ``<script>`` stays inert.

A2UI_LINK_URL_SCHEMES: FrozenSet[str] = frozenset({"http", "https"})
A2UI_TONES: FrozenSet[str] = frozenset({"info", "success", "warning", "error"})
A2UI_TASK_STATUSES: FrozenSet[str] = frozenset(
    {"pending", "running", "completed", "failed", "blocked", "cancelled"}
)
A2UI_AGENT_STATUSES: FrozenSet[str] = frozenset({"idle", "active", "completed", "failed", "blocked"})
A2UI_TIMELINE_STATUSES: FrozenSet[str] = A2UI_TASK_STATUSES | frozenset(
    {"info", "answered", "rejected", "timeout"}
)


@dataclass(frozen=True)
class A2UIProp:
    """Declarative schema node for a single A2UI prop (or list item / object field)."""

    kind: str  # str | int | num | bool | enum | url | list | obj
    required: bool = True
    nullable: bool = False
    max_len: int = 200
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    choices: FrozenSet[str] = frozenset()
    item: Optional["A2UIProp"] = None
    fields: Optional[Dict[str, "A2UIProp"]] = None
    max_items: int = 50
    multiline: bool = False


def _p_str(
    max_len: int = 200, *, required: bool = True, nullable: bool = False, multiline: bool = False
) -> A2UIProp:
    return A2UIProp("str", required=required, nullable=nullable, max_len=max_len, multiline=multiline)


def _p_int(
    lo: Optional[float] = None, hi: Optional[float] = None, *, required: bool = True, nullable: bool = False
) -> A2UIProp:
    return A2UIProp("int", required=required, nullable=nullable, min_value=lo, max_value=hi)


def _p_num(
    lo: Optional[float] = None, hi: Optional[float] = None, *, required: bool = True, nullable: bool = False
) -> A2UIProp:
    return A2UIProp("num", required=required, nullable=nullable, min_value=lo, max_value=hi)


def _p_bool(*, required: bool = True, nullable: bool = False) -> A2UIProp:
    return A2UIProp("bool", required=required, nullable=nullable)


def _p_enum(choices: FrozenSet[str], *, required: bool = True) -> A2UIProp:
    return A2UIProp("enum", required=required, choices=frozenset(choices))


def _p_url(*, required: bool = True) -> A2UIProp:
    return A2UIProp("url", required=required, max_len=2048)


def _p_list(item: A2UIProp, max_items: int = 50, *, required: bool = True) -> A2UIProp:
    return A2UIProp("list", required=required, item=item, max_items=max_items)


def _p_obj(fields: Dict[str, A2UIProp]) -> A2UIProp:
    return A2UIProp("obj", fields=fields)


A2UI_COMPONENT_SCHEMAS: Dict[str, Dict[str, A2UIProp]] = {
    # --- Original six components -------------------------------------------
    "heading": {
        "text": _p_str(200),
        "level": _p_int(1, 4, required=False),
    },
    "metric_row": {
        "items": _p_list(_p_obj({"label": _p_str(80), "value": _p_str(80)}), 12),
    },
    "checklist": {
        "items": _p_list(_p_obj({"label": _p_str(200), "checked": _p_bool()}), 50),
    },
    "approval_card": {
        "gate_id": _p_str(120, nullable=True),
        "gate_name": _p_str(200, nullable=True),
        "reason": _p_str(1000, required=False, nullable=True, multiline=True),
        "wave_index": _p_int(0, None, required=False, nullable=True),
        "risk_level": _p_str(40, required=False, nullable=True),
        "actions": _p_list(_p_enum(frozenset({"approve", "reject"})), 2),
    },
    "conflict_list": {
        "items": _p_list(
            _p_obj(
                {
                    "file_path": _p_str(500, nullable=True),
                    "wave_index": _p_int(0, None, required=False, nullable=True),
                    "roles": A2UIProp("list", required=False, nullable=True, item=_p_str(80), max_items=20),
                    "status": _p_str(40, required=False, nullable=True),
                }
            ),
            50,
        ),
    },
    "eval_table": {
        "rows": _p_list(
            _p_obj(
                {
                    "role": _p_str(80, nullable=True),
                    "artifact_type": _p_str(80, nullable=True),
                    "score": _p_num(0, 1, nullable=True),
                    "passed": _p_bool(nullable=True),
                }
            ),
            50,
        ),
    },
    # --- Agent-surface components -------------------------------------------
    "text_block": {
        # "markdown" is rendered client-side from a tiny safe subset (headings,
        # bullets, paragraphs) into React text nodes; it is never turned into HTML.
        "text": _p_str(4000, multiline=True),
        "format": _p_enum(frozenset({"plain", "markdown"}), required=False),
    },
    "key_value_list": {
        "items": _p_list(_p_obj({"key": _p_str(80), "value": _p_str(500)}), 30),
    },
    "progress_bar": {
        "label": _p_str(120),
        "value": _p_num(0, None),
        "max": _p_num(0, None),
        "tone": _p_enum(A2UI_TONES, required=False),
    },
    "timeline": {
        "events": _p_list(
            _p_obj(
                {
                    "timestamp": _p_str(64, required=False, nullable=True),
                    "actor": _p_str(80, required=False, nullable=True),
                    "label": _p_str(300),
                    "status": _p_enum(A2UI_TIMELINE_STATUSES, required=False),
                }
            ),
            50,
        ),
    },
    "status_list": {
        "items": _p_list(
            _p_obj(
                {
                    "id": _p_str(120, required=False),
                    "title": _p_str(200),
                    "status": _p_enum(A2UI_TASK_STATUSES),
                    "owner": _p_str(80, required=False, nullable=True),
                    "detail": _p_str(500, required=False, nullable=True),
                }
            ),
            100,
        ),
    },
    "code_diff": {
        # Unified-diff text only; rendered line-by-line as escaped text.
        "diff": _p_str(20000, multiline=True),
        "file_path": _p_str(500, required=False, nullable=True),
        "language": _p_str(40, required=False, nullable=True),
    },
    "cost_breakdown": {
        "currency": _p_enum(frozenset({"USD"})),
        "total": _p_num(0, None),
        "budget": _p_num(0, None, required=False, nullable=True),
        "items": _p_list(_p_obj({"label": _p_str(120), "amount": _p_num(0, None)}), 30),
    },
    "agent_roster": {
        "agents": _p_list(
            _p_obj(
                {
                    "role": _p_str(80),
                    "department": _p_str(80, required=False, nullable=True),
                    "status": _p_enum(A2UI_AGENT_STATUSES),
                    "task_count": _p_int(0, None, required=False),
                    "model": _p_str(120, required=False, nullable=True),
                }
            ),
            50,
        ),
    },
    "callout": {
        "tone": _p_enum(A2UI_TONES),
        "title": _p_str(200, required=False, nullable=True),
        "text": _p_str(2000, multiline=True),
    },
    "link_list": {
        "links": _p_list(_p_obj({"label": _p_str(200), "url": _p_url()}), 30),
    },
}

ALLOWED_A2UI_COMPONENTS: FrozenSet[str] = frozenset(A2UI_COMPONENT_SCHEMAS)


def _a2ui_has_bad_control_chars(value: str, multiline: bool) -> bool:
    allowed = {"\n", "\t", "\r"} if multiline else {"\t"}
    return any((ord(ch) < 32 or ord(ch) == 127) and ch not in allowed for ch in value)


def validate_a2ui_url(url: Any) -> Tuple[bool, Optional[str]]:
    """Allow only absolute http(s) URLs with a host; rejects javascript:/data:/file: etc."""
    if not isinstance(url, str) or not url:
        return False, "URL must be a non-empty string"
    if len(url) > 2048:
        return False, "URL exceeds 2048 characters"
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in url):
        return False, "URL must not contain whitespace or control characters"
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        has_credentials = bool(parsed.username or parsed.password)
    except ValueError:
        return False, "URL could not be parsed"
    if parsed.scheme.lower() not in A2UI_LINK_URL_SCHEMES:
        return False, f"URL scheme '{parsed.scheme}' is not allowed (http/https only)"
    if not hostname:
        return False, "URL must include a host"
    if has_credentials:
        return False, "URL must not embed credentials"
    return True, None


def _validate_a2ui_value(value: Any, spec: A2UIProp, path: str) -> Optional[str]:
    if value is None:
        return None if spec.nullable else f"{path}: must not be null"
    kind = spec.kind
    if kind == "str":
        if not isinstance(value, str):
            return f"{path}: expected string"
        if len(value) > spec.max_len:
            return f"{path}: exceeds {spec.max_len} characters"
        if _a2ui_has_bad_control_chars(value, spec.multiline):
            return f"{path}: contains control characters"
        return None
    if kind in ("int", "num"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return f"{path}: expected {'integer' if kind == 'int' else 'number'}"
        if kind == "int" and not isinstance(value, int):
            return f"{path}: expected integer"
        if value != value or value in (float("inf"), float("-inf")):
            return f"{path}: must be finite"
        if spec.min_value is not None and value < spec.min_value:
            return f"{path}: must be >= {spec.min_value}"
        if spec.max_value is not None and value > spec.max_value:
            return f"{path}: must be <= {spec.max_value}"
        return None
    if kind == "bool":
        return None if isinstance(value, bool) else f"{path}: expected boolean"
    if kind == "enum":
        if not isinstance(value, str) or value not in spec.choices:
            return f"{path}: must be one of {sorted(spec.choices)}"
        return None
    if kind == "url":
        ok, reason = validate_a2ui_url(value)
        return None if ok else f"{path}: {reason}"
    if kind == "list":
        if not isinstance(value, list):
            return f"{path}: expected list"
        if len(value) > spec.max_items:
            return f"{path}: exceeds {spec.max_items} items"
        if spec.item is None:
            return f"{path}: list schema has no item spec"
        for idx, item in enumerate(value):
            err = _validate_a2ui_value(item, spec.item, f"{path}[{idx}]")
            if err:
                return err
        return None
    if kind == "obj":
        if not isinstance(value, dict):
            return f"{path}: expected object"
        return _validate_a2ui_props(value, spec.fields or {}, path)
    return f"{path}: unsupported schema kind '{kind}'"


def _validate_a2ui_props(obj: Dict[str, Any], schema: Dict[str, A2UIProp], path: str) -> Optional[str]:
    unknown = sorted(str(k) for k in obj if k not in schema)
    if unknown:
        return f"{path}: unknown prop(s) {unknown}"
    for name, spec in schema.items():
        if name not in obj:
            if spec.required:
                return f"{path}.{name}: is required"
            continue
        err = _validate_a2ui_value(obj[name], spec, f"{path}.{name}")
        if err:
            return err
    return None


def validate_a2ui_component(component: Any) -> Tuple[bool, Optional[str]]:
    """Validate one A2UI component against the allowlist and its closed prop schema."""
    if not isinstance(component, dict):
        return False, "component must be an object"
    ctype = component.get("type")
    if not isinstance(ctype, str) or ctype not in A2UI_COMPONENT_SCHEMAS:
        return False, f"component type {ctype!r} is not allowed"
    props = {k: v for k, v in component.items() if k != "type"}
    err = _validate_a2ui_props(props, A2UI_COMPONENT_SCHEMAS[ctype], ctype)
    return (err is None), err


def validate_a2ui_surface(surface: Any) -> Tuple[bool, Optional[str]]:
    """Validate an A2UI surface envelope and every component it contains."""
    if not isinstance(surface, dict):
        return False, "surface must be an object"
    allowed_keys = {"surface_id", "protocol", "title", "components"}
    unknown = sorted(str(k) for k in surface if k not in allowed_keys)
    if unknown:
        return False, f"surface: unknown key(s) {unknown}"
    if surface.get("protocol") != "a2ui/v1":
        return False, "surface: protocol must be 'a2ui/v1'"
    for key in ("surface_id", "title"):
        err = _validate_a2ui_value(surface.get(key), _p_str(200), f"surface.{key}")
        if err:
            return False, err
    components = surface.get("components")
    if not isinstance(components, list) or len(components) > 50:
        return False, "surface.components must be a list of at most 50 components"
    for idx, comp in enumerate(components):
        ok, reason = validate_a2ui_component(comp)
        if not ok:
            return False, f"components[{idx}]: {reason}"
    return True, None


def _finalize_a2ui_surface(surface: Dict[str, Any]) -> Dict[str, Any]:
    """Drop (and log) any component that fails validation so emitted surfaces are schema-safe."""
    surface["title"] = _a2ui_text(surface.get("title"), 200)
    surface["surface_id"] = _a2ui_text(surface.get("surface_id"), 200)
    safe_components: List[Dict[str, Any]] = []
    for comp in surface.get("components", []):
        ok, reason = validate_a2ui_component(comp)
        if ok:
            safe_components.append(comp)
        else:
            logger.warning("Dropping invalid A2UI component in %s: %s", surface.get("surface_id"), reason)
    surface["components"] = safe_components[:50]
    return surface


def _a2ui_text(value: Any, max_len: int, *, multiline: bool = False) -> str:
    """Coerce run data into a schema-safe string (strip control chars, clamp length)."""
    text = "" if value is None else str(value)
    allowed = {"\n", "\t"} if multiline else {"\t"}
    text = "".join(ch for ch in text if ch in allowed or not (ord(ch) < 32 or ord(ch) == 127))
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text


def _a2ui_opt_text(value: Any, max_len: int, *, multiline: bool = False) -> Optional[str]:
    return None if value is None or value == "" else _a2ui_text(value, max_len, multiline=multiline)


def _a2ui_amount(value: Any) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return 0.0
    if num != num or num in (float("inf"), float("-inf")) or num < 0:
        return 0.0
    return num


def _derive_agent_status(statuses: List[str]) -> str:
    if "running" in statuses:
        return "active"
    if "failed" in statuses:
        return "failed"
    if "blocked" in statuses:
        return "blocked"
    if statuses and all(s == "completed" for s in statuses):
        return "completed"
    return "idle"


def _build_a2ui_activity_components(
    run_dict: Dict[str, Any], tasks: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Agent activity components derived strictly from data present in the run snapshot."""
    components: List[Dict[str, Any]] = []
    cost_summary = run_dict.get("cost_summary") or {}
    delegations = [d for d in (run_dict.get("delegations") or []) if isinstance(d, dict)]

    # Run overview (objective + key facts that are actually present)
    if run_dict.get("objective"):
        components.append(
            {
                "type": "text_block",
                "format": "plain",
                "text": _a2ui_text(run_dict["objective"], 4000, multiline=True),
            }
        )
    overview: List[Dict[str, str]] = []
    duration_ms = run_dict.get("duration_ms")
    for key, value in (
        ("Status", run_dict.get("status")),
        ("Risk Level", run_dict.get("risk_level")),
        ("Waves", len(run_dict.get("waves") or []) or None),
        ("Duration", f"{int(duration_ms)} ms" if isinstance(duration_ms, (int, float)) and duration_ms else None),
        ("Plan", run_dict.get("plan_id")),
    ):
        if value not in (None, ""):
            overview.append({"key": key, "value": _a2ui_text(value, 500)})
    if overview:
        components.append({"type": "key_value_list", "items": overview})

    # Alerts
    statuses = [str(t.get("status") or "pending") for t in tasks]
    statuses = [s if s in A2UI_TASK_STATUSES else "pending" for s in statuses]
    failed = statuses.count("failed")
    blocked = statuses.count("blocked")
    if failed or blocked:
        parts = []
        if failed:
            parts.append(f"{failed} task(s) failed")
        if blocked:
            parts.append(f"{blocked} task(s) blocked")
        components.append(
            {"type": "callout", "tone": "error", "title": "Execution issues", "text": ", ".join(parts) + "."}
        )
    risk_level = str(run_dict.get("risk_level") or "").lower()
    if risk_level in ("high", "critical") and run_dict.get("risk_notes"):
        components.append(
            {
                "type": "callout",
                "tone": "warning",
                "title": f"{risk_level.capitalize()} risk",
                "text": _a2ui_text(run_dict.get("risk_notes"), 2000, multiline=True),
            }
        )

    # Progress
    completed = statuses.count("completed")
    components.append(
        {
            "type": "progress_bar",
            "label": "Tasks completed",
            "value": completed,
            "max": len(tasks),
            "tone": "error" if failed else ("success" if completed == len(tasks) else "info"),
        }
    )

    # Agent roster (one entry per role, aggregated over that role's tasks)
    roster: Dict[str, Dict[str, Any]] = {}
    for task, status in zip(tasks, statuses):
        role = _a2ui_text(task.get("role") or "agent", 80)
        entry = roster.setdefault(role, {"department": task.get("department"), "statuses": [], "model": None})
        entry["statuses"].append(status)
        if task.get("model_id"):
            entry["model"] = task.get("model_id")
    components.append(
        {
            "type": "agent_roster",
            "agents": [
                {
                    "role": role,
                    "department": _a2ui_opt_text(entry["department"], 80),
                    "status": _derive_agent_status(entry["statuses"]),
                    "task_count": len(entry["statuses"]),
                    "model": _a2ui_opt_text(entry["model"], 120),
                }
                for role, entry in list(roster.items())[:50]
            ],
        }
    )

    # Task board
    board: List[Dict[str, Any]] = []
    for idx, (task, status) in enumerate(zip(tasks, statuses)):
        wave = task.get("wave_index")
        detail = _a2ui_opt_text(task.get("error"), 500) or (
            f"Wave {wave}" if isinstance(wave, int) and not isinstance(wave, bool) else None
        )
        board.append(
            {
                "id": _a2ui_text(task.get("id") or f"task_{idx}", 120),
                "title": _a2ui_text(task.get("title") or task.get("id") or "Task", 200),
                "status": status,
                "owner": _a2ui_opt_text(task.get("role"), 80),
                "detail": detail,
            }
        )
    components.append({"type": "status_list", "items": board[:100]})

    # Activity timeline from task start/finish timestamps and delegation records
    events: List[Dict[str, Any]] = []
    for task, status in zip(tasks, statuses):
        title = _a2ui_text(task.get("title") or task.get("id") or "Task", 200)
        role = _a2ui_opt_text(task.get("role"), 80)
        if task.get("started_at"):
            events.append(
                {
                    "timestamp": _a2ui_text(task["started_at"], 64),
                    "actor": role,
                    "label": f"Started: {title}",
                    "status": "running",
                }
            )
        if task.get("finished_at"):
            events.append(
                {
                    "timestamp": _a2ui_text(task["finished_at"], 64),
                    "actor": role,
                    "label": f"Finished: {title}",
                    "status": status,
                }
            )
    for d in delegations:
        if not d.get("created_at"):
            continue
        status = str(d.get("status") or "info")
        question = _a2ui_text(d.get("question") or "", 240)
        label = f"Delegated to {_a2ui_text(d.get('to_role') or 'agent', 40)}" + (f": {question}" if question else "")
        events.append(
            {
                "timestamp": _a2ui_text(d["created_at"], 64),
                "actor": _a2ui_opt_text(d.get("from_role"), 80),
                "label": label,
                "status": status if status in A2UI_TIMELINE_STATUSES else "info",
            }
        )
    if events:
        events.sort(key=lambda e: e["timestamp"])
        components.append({"type": "timeline", "events": events[-50:]})

    # Cost breakdown by role (per-task cost_usd plus the budget guard summary)
    role_costs: Dict[str, float] = {}
    for task in tasks:
        label = _a2ui_text(task.get("role") or "agent", 120)
        role_costs[label] = role_costs.get(label, 0.0) + _a2ui_amount(task.get("cost_usd"))
    total = _a2ui_amount(cost_summary.get("spent_usd", sum(role_costs.values())))
    budget = cost_summary.get("max_budget_usd")
    if total > 0 or any(v > 0 for v in role_costs.values()):
        components.append(
            {
                "type": "cost_breakdown",
                "currency": "USD",
                "total": round(total, 6),
                "budget": round(_a2ui_amount(budget), 6) if budget is not None else None,
                "items": [
                    {"label": label, "amount": round(amount, 6)}
                    for label, amount in sorted(role_costs.items(), key=lambda kv: -kv[1])
                    if amount > 0
                ][:30],
            }
        )
    return components


def build_a2ui_surfaces_for_run(run_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Synthesize declarative A2UI surfaces from a KernelRun snapshot."""
    surfaces: List[Dict[str, Any]] = []
    metrics = run_dict.get("metrics") or {}
    gates = run_dict.get("approval_gates") or []
    conflicts = run_dict.get("conflicts") or []
    evaluations = run_dict.get("evaluations") or []
    repairs = run_dict.get("repair_cycles") or []

    # 1. Pending Governance Approval Surface (interactive A2UI card)
    pending_gates = [g for g in gates if g.get("status") == "pending"]
    for gate in pending_gates:
        surfaces.append(
            {
                "surface_id": f"a2ui_gate_{gate.get('gate_id')}",
                "protocol": "a2ui/v1",
                "title": f"Approval Required: {gate.get('gate_name')}",
                "components": [
                    {
                        "type": "approval_card",
                        "gate_id": gate.get("gate_id"),
                        "gate_name": gate.get("gate_name"),
                        "reason": _a2ui_opt_text(gate.get("reason"), 1000, multiline=True),
                        "wave_index": gate.get("wave_index"),
                        "risk_level": run_dict.get("risk_level", "medium"),
                        "actions": ["approve", "reject"],
                    }
                ],
            }
        )

    # 2. Execution & Quality Summary Surface
    summary_components: List[Dict[str, Any]] = [
        {
            "type": "metric_row",
            "items": [
                {"label": "Tasks Completed", "value": f"{metrics.get('completed_tasks', 0)}/{metrics.get('total_tasks', 0)}"},
                {"label": "Blackboard Artifacts", "value": str(metrics.get("artifact_count", 0))},
                {"label": "Repair Cycles", "value": str(len(repairs))},
                {"label": "Avg Quality", "value": f"{int(round(float(metrics.get('avg_quality_score', 0)) * 100))}%"},
                {"label": "Estimated Cost", "value": f"${float(metrics.get('total_cost_usd', 0.0)):.4f}"},
            ],
        }
    ]
    if conflicts:
        summary_components.append(
            {
                "type": "conflict_list",
                "items": [
                    {
                        "file_path": c.get("file_path"),
                        "wave_index": c.get("wave_index"),
                        "roles": c.get("roles", []),
                        "status": c.get("status", "detected"),
                    }
                    for c in conflicts
                ],
            }
        )
    if evaluations:
        summary_components.append(
            {
                "type": "eval_table",
                "rows": [
                    {
                        "role": ev.get("producer_role"),
                        "artifact_type": ev.get("artifact_type"),
                        "score": ev.get("overall_score"),
                        "passed": ev.get("passed"),
                    }
                    for ev in evaluations[-8:]
                ],
            }
        )

    surfaces.append(
        {
            "surface_id": f"a2ui_summary_{run_dict.get('id', 'run')}",
            "protocol": "a2ui/v1",
            "title": "Run Execution & Quality Surface",
            "components": summary_components,
        }
    )

    # 3. Agent Activity Surface (roster, task board, timeline, costs) -- only when tasks exist
    tasks = [t for t in (run_dict.get("tasks") or []) if isinstance(t, dict)]
    if tasks:
        surfaces.append(
            {
                "surface_id": f"a2ui_activity_{run_dict.get('id', 'run')}",
                "protocol": "a2ui/v1",
                "title": "Agent Activity Surface",
                "components": _build_a2ui_activity_components(run_dict, tasks),
            }
        )
    return [_finalize_a2ui_surface(surface) for surface in surfaces]


# --------------------------------------------------------------------------- #
# 4. P1 AI SDK UI Stream Protocol v1 Adapter (x-vercel-ai-ui-message-stream)
# --------------------------------------------------------------------------- #


def agui_event_to_ai_sdk_chunks(event: AGUIEvent) -> List[str]:
    """Translate an AGUIEvent into AI SDK UI Stream Protocol v1 SSE data frames."""
    chunks: List[str] = []

    def _frame(obj: Dict[str, Any]) -> str:
        return f"data: {json.dumps(obj, default=str)}\n\n"

    if event.agui_type == "HEARTBEAT":
        return chunks

    if event.kernel_event == "kernel_run_started":
        chunks.append(_frame({"type": "start", "messageId": f"msg_{event.run_id}"}))
        chunks.append(
            _frame(
                {
                    "type": "data-kernel-state",
                    "id": f"ev_{event.event_id}",
                    "data": {
                        "event_id": event.event_id,
                        "kernel_event": event.kernel_event,
                        "payload": event.payload,
                    },
                }
            )
        )
    elif event.kernel_event == "kernel_wave_started":
        chunks.append(_frame({"type": "start-step"}))
        chunks.append(
            _frame(
                {
                    "type": "data-kernel-state",
                    "id": f"ev_{event.event_id}",
                    "data": {
                        "event_id": event.event_id,
                        "kernel_event": event.kernel_event,
                        "payload": event.payload,
                    },
                }
            )
        )
    elif event.kernel_event == "kernel_delegation":
        chunks.append(
            _frame(
                {
                    "type": "tool-output-available",
                    "toolCallId": str(
                        event.payload.get("delegation_id") or f"del_{event.event_id}"
                    ),
                    "output": event.payload,
                }
            )
        )
    elif event.kernel_event == "kernel_run_completed":
        chunks.append(_frame({"type": "finish-step"}))
        chunks.append(
            _frame(
                {
                    "type": "data-kernel-state",
                    "id": f"ev_{event.event_id}",
                    "data": {
                        "event_id": event.event_id,
                        "kernel_event": event.kernel_event,
                        "status": event.payload.get("status", "completed"),
                    },
                }
            )
        )
        chunks.append(_frame({"type": "finish"}))
        chunks.append("data: [DONE]\n\n")
    else:
        chunks.append(
            _frame(
                {
                    "type": "data-kernel-state",
                    "id": f"ev_{event.event_id}",
                    "data": {
                        "event_id": event.event_id,
                        "agui_type": event.agui_type,
                        "kernel_event": event.kernel_event,
                        "payload": event.payload,
                    },
                }
            )
        )
    return chunks


_agui_broker: Optional[AGUIStreamBroker] = None
_mcp_gateway: Optional[MCPGateway] = None


def get_agui_broker() -> AGUIStreamBroker:
    global _agui_broker
    if _agui_broker is None:
        _agui_broker = AGUIStreamBroker()
    return _agui_broker


def get_mcp_gateway() -> MCPGateway:
    global _mcp_gateway
    if _mcp_gateway is None:
        _mcp_gateway = MCPGateway()
    return _mcp_gateway
