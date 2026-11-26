"""P1 A2A (Agent-to-Agent) Protocol Adapter for Forge AI.

Inbound (Forge as an A2A agent):
1. Dynamic A2A Agent Card (`a2a/0.2`) built from the live org blueprint & SkillRegistry.
2. Governed JSON-RPC 2.0 dispatch (`tasks/send`, `tasks/get`, `tasks/cancel`) mapping
   external A2A tasks into project-scoped AgentKernel DAG runs executed in the
   background, with bounded concurrency, cost budget caps and cooperative cancel.

Outbound (Forge as an A2A client):
3. `A2ARemoteClient` fetches remote agent cards and sends / polls / cancels tasks
   with SSRF protection (https only, no redirects, private/loopback/link-local
   targets blocked unless the host is explicitly allowlisted), bounded timeouts,
   response size caps and strict content-type checks.

Every inbound and outbound call is recorded in a bounded A2A audit trail with an
optional async persister hook (MongoDB in production).
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, FrozenSet, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    get_agent_kernel,
    get_org_blueprint_summary,
    plan_objective_dag,
)
from core.protocol_gateway import validate_mcp_endpoint_url
from core.skill_engine import get_skill_registry
from core.a2a_task_store import (
    A2ATaskStore,
    InMemoryA2ATaskStore,
    MongoA2ATaskStore,
    is_stale_record,
    make_worker_id,
)

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------- #
# Protocol constants
# --------------------------------------------------------------------------- #

A2A_PROTOCOL = "a2a/0.2"
A2A_TASK_STATES = frozenset(
    {"submitted", "working", "input-required", "completed", "canceled", "failed", "unknown"}
)
A2A_TERMINAL_STATES = frozenset({"completed", "canceled", "failed"})

MAX_A2A_RPC_BODY_BYTES = 64 * 1024
MAX_A2A_TASK_TEXT_CHARS = 4000
MAX_A2A_MESSAGE_PARTS = 16
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,127}$")

# JSON-RPC / A2A error codes
JSONRPC_PARSE_ERROR = -32700
JSONRPC_INVALID_REQUEST = -32600
JSONRPC_METHOD_NOT_FOUND = -32601
JSONRPC_INVALID_PARAMS = -32602
JSONRPC_INTERNAL_ERROR = -32603
A2A_SERVER_BUSY = -32000
A2A_TASK_NOT_FOUND = -32001
A2A_TASK_NOT_CANCELABLE = -32002


@dataclass
class A2ASkillDescriptor:
    id: str
    name: str
    domain: str
    description: str
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class A2AAgentCard:
    name: str
    description: str
    version: str
    protocol: str
    url: str
    capabilities: Dict[str, bool]
    protocols_supported: List[str]
    authentication: Dict[str, Any]
    departments: List[str]
    skills: List[Dict[str, Any]]
    defaultInputModes: List[str] = field(default_factory=lambda: ["text/plain"])
    defaultOutputModes: List[str] = field(default_factory=lambda: ["text/plain", "application/json"])
    generated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class A2ATaskRequest:
    objective: str
    project_id: str
    task_id: str = field(default_factory=lambda: f"a2a_{uuid.uuid4().hex[:12]}")
    caller_agent: str = "external-a2a-client"
    max_agents: int = 6
    max_budget_usd: float = 1.50
    execute_now: bool = False
    session_id: Optional[str] = None


@dataclass
class A2ATaskResponse:
    task_id: str
    kernel_run_id: str
    project_id: str
    state: str  # submitted | working | completed | canceled | failed
    summary: str
    wave_count: int
    task_count: int
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    evaluations: List[Dict[str, Any]] = field(default_factory=list)
    session_id: Optional[str] = None
    caller_agent: str = "external-a2a-client"
    updated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_a2a_task(self) -> Dict[str, Any]:
        """Render as an A2A `Task` object."""
        return {
            "id": self.task_id,
            "sessionId": self.session_id,
            "status": {
                "state": self.state,
                "message": {
                    "role": "agent",
                    "parts": [{"type": "text", "text": self.summary}],
                },
                "timestamp": self.updated_at,
            },
            "artifacts": [
                {
                    "name": str(a.get("artifact_type") or a.get("type") or f"artifact_{i}")[:80],
                    "index": i,
                    "parts": [{"type": "data", "data": a}],
                }
                for i, a in enumerate(self.artifacts[-10:])
                if isinstance(a, dict)
            ],
            "metadata": {
                "projectId": self.project_id,
                "kernelRunId": self.kernel_run_id,
                "waveCount": self.wave_count,
                "taskCount": self.task_count,
            },
        }

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> "A2ATaskResponse":
        """Build from an `A2ATaskStore` record (ignores store bookkeeping fields)."""
        names = cls.__dataclass_fields__.keys()
        return cls(**{k: record[k] for k in names if k in record})


@dataclass
class A2AAuditRecord:
    audit_id: str
    direction: str  # inbound | outbound
    method: str  # agent/card | tasks/send | tasks/get | tasks/cancel
    project_id: str
    status: str  # succeeded | denied (SSRF policy) | rejected (protocol/validation) | error
    task_id: Optional[str] = None
    peer: Optional[str] = None  # caller agent (inbound) or remote host (outbound)
    actor: Optional[str] = None  # authenticated Forge user id
    reason: Optional[str] = None
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _skill_descriptors() -> List[Dict[str, Any]]:
    registry = get_skill_registry()
    return [
        A2ASkillDescriptor(
            id=str(s["name"]),
            name=str(s["name"]).replace("-", " ").title(),
            domain=str(s["domain"]),
            description=str(s["description"]),
            tags=list(s.get("keywords", []))[:6],
        ).to_dict()
        for s in registry.list_skills()[:24]
    ]


def build_forge_agent_card(
    *,
    project_id: str,
    base_url: str = "",
    endpoint_url: Optional[str] = None,
) -> A2AAgentCard:
    """Build Forge AI's dynamic A2A Agent Card from live departments & SkillRegistry.

    `endpoint_url` overrides the advertised task endpoint (defaults to the legacy
    REST `tasks/send` path for backward compatibility).
    """
    blueprint = get_org_blueprint_summary()
    base = (base_url or "").rstrip("/")
    endpoint = endpoint_url or f"{base}/v1/projects/{project_id}/protocols/a2a/tasks/send"
    return A2AAgentCard(
        name="Forge AI Autonomous Engineering OS",
        description=(
            "9-department multi-agent software engineering operating system with DAG wave "
            "scheduling, Shared Blackboard, critique-repair loops, governed MCP tools, and "
            "isolated verification worktrees."
        ),
        version="2.0.0",
        protocol=A2A_PROTOCOL,
        url=endpoint,
        capabilities={
            # A2A `tasks/sendSubscribe` streaming is not offered; live progress is
            # available over Forge's AG-UI SSE stream instead.
            "streaming": False,
            "agUiStreaming": True,
            "pushNotifications": False,
            "stateTransitionHistory": True,
            "humanInTheLoopApproval": True,
            "isolatedWorktrees": True,
        },
        protocols_supported=[
            A2A_PROTOCOL,
            "ag-ui/v1",
            "ai-sdk-ui-stream/v1",
            "mcp/2025-03-26",
            "mcp-apps/v1",
            "a2ui/v1",
        ],
        authentication={
            "schemes": ["Bearer"],
            "projectScoped": True,
        },
        departments=[d["key"] for d in blueprint.get("departments", [])],
        skills=_skill_descriptors(),
    )


def build_public_agent_card(*, base_url: str) -> A2AAgentCard:
    """Public discovery card served at `/.well-known/agent.json` (no project data)."""
    base = (base_url or "").rstrip("/")
    card = build_forge_agent_card(project_id="-", base_url=base, endpoint_url=f"{base}/v1/a2a/rpc")
    card.authentication = {
        "schemes": ["Bearer"],
        "projectScoped": True,
        "projectSelector": "params.metadata.projectId",
        "projectScopedCardPath": "/v1/projects/{projectId}/protocols/a2a/.well-known/agent.json",
    }
    return card


# --------------------------------------------------------------------------- #
# Inbound: JSON-RPC errors & param validation
# --------------------------------------------------------------------------- #


class A2ARpcError(Exception):
    def __init__(self, code: int, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


def jsonrpc_error(rpc_id: Any, code: int, message: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    err: Dict[str, Any] = {"code": code, "message": message}
    if data:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": rpc_id, "error": err}


def _validate_task_id(raw: Any, *, required: bool) -> Optional[str]:
    if raw is None:
        if required:
            raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.id is required")
        return None
    if not isinstance(raw, str) or not _TASK_ID_RE.match(raw):
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.id must match [A-Za-z0-9_.:-]{1,128}")
    return raw


def _extract_message_text(message: Any) -> str:
    if not isinstance(message, dict):
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.message must be an object")
    if message.get("role") != "user":
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.message.role must be 'user'")
    parts = message.get("parts")
    if not isinstance(parts, list) or not parts:
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.message.parts must be a non-empty list")
    if len(parts) > MAX_A2A_MESSAGE_PARTS:
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, f"At most {MAX_A2A_MESSAGE_PARTS} message parts allowed")
    texts: List[str] = []
    for part in parts:
        if not isinstance(part, dict) or part.get("type") != "text" or not isinstance(part.get("text"), str):
            raise A2ARpcError(JSONRPC_INVALID_PARAMS, "Only text message parts are supported")
        texts.append(part["text"])
    text = "\n".join(t.strip() for t in texts if t.strip())
    if len(text) < 3:
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, "Task text must be at least 3 characters")
    if len(text) > MAX_A2A_TASK_TEXT_CHARS:
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, f"Task text exceeds {MAX_A2A_TASK_TEXT_CHARS} characters")
    return text


def _clamp_number(raw: Any, *, lo: float, hi: float, default: float, name: str) -> float:
    if raw is None:
        return default
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, f"metadata.{name} must be a number")
    if not (lo <= float(raw) <= hi):
        raise A2ARpcError(JSONRPC_INVALID_PARAMS, f"metadata.{name} must be between {lo} and {hi}")
    return float(raw)


# --------------------------------------------------------------------------- #
# Outbound: SSRF-safe remote A2A client
# --------------------------------------------------------------------------- #


def validate_a2a_remote_url(
    url: str, *, allowlisted_hosts: FrozenSet[str] = frozenset()
) -> Tuple[bool, Optional[str]]:
    """Validate a remote A2A agent URL against SSRF.

    https only, no embedded credentials. Hosts in `allowlisted_hosts` skip the
    private-address checks (intended for tests / explicitly trusted peers); all
    others are checked as literal IPs (must be globally routable) and then via
    `validate_mcp_endpoint_url` (internal hostnames + DNS resolution check).
    """
    raw = (url or "").strip()
    if not raw or len(raw) > 2048:
        return False, "Remote A2A URL is empty or too long"
    parsed = urlparse(raw)
    if parsed.scheme != "https":
        return False, "Remote A2A agents must use https://"
    if parsed.username or parsed.password:
        return False, "Credentials in remote A2A URLs are not allowed"
    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "Missing hostname in remote A2A URL"
    if hostname in allowlisted_hosts:
        return True, None
    try:
        ip = ipaddress.ip_address(hostname)
        if not ip.is_global or ip.is_multicast:
            return False, f"Blocked non-public IP address '{hostname}'"
    except ValueError:
        pass
    ok, err = validate_mcp_endpoint_url(raw)
    if not ok:
        return False, (err or "Blocked remote A2A URL").replace("MCP", "A2A")
    return True, None


class A2ARemoteError(ValueError):
    """Raised for any rejected or failed outbound A2A call."""


class A2ABlockedURLError(A2ARemoteError):
    """Raised when an outbound A2A target is blocked by SSRF policy."""


def _sanitize_remote_card(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise A2ARemoteError("Remote agent card is not a JSON object")
    name = raw.get("name")
    url = raw.get("url")
    if not isinstance(name, str) or not name.strip():
        raise A2ARemoteError("Remote agent card is missing 'name'")
    if not isinstance(url, str) or not url.strip():
        raise A2ARemoteError("Remote agent card is missing 'url'")
    caps = raw.get("capabilities") if isinstance(raw.get("capabilities"), dict) else {}
    skills_raw = raw.get("skills") if isinstance(raw.get("skills"), list) else []
    skills = [
        {
            "id": str(s.get("id") or "")[:128],
            "name": str(s.get("name") or "")[:200],
            "description": str(s.get("description") or "")[:1000],
        }
        for s in skills_raw[:50]
        if isinstance(s, dict)
    ]
    return {
        "name": name.strip()[:200],
        "description": str(raw.get("description") or "")[:2000],
        "url": url.strip()[:2048],
        "version": str(raw.get("version") or "")[:64],
        "protocol": str(raw.get("protocol") or "")[:32],
        "capabilities": {str(k)[:64]: bool(v) for k, v in list(caps.items())[:32] if isinstance(v, bool)},
        "authentication": raw.get("authentication") if isinstance(raw.get("authentication"), dict) else {},
        "skills": skills,
    }


def _sanitize_remote_task(raw: Any, *, expected_id: str) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise A2ARemoteError("Remote A2A task result is not an object")
    if raw.get("id") != expected_id:
        raise A2ARemoteError("Remote A2A task id does not match the request")
    status = raw.get("status") if isinstance(raw.get("status"), dict) else {}
    state = status.get("state")
    if state not in A2A_TASK_STATES:
        raise A2ARemoteError("Remote A2A task has an invalid state")
    message_text = ""
    msg = status.get("message")
    if isinstance(msg, dict) and isinstance(msg.get("parts"), list):
        message_text = "\n".join(
            str(p.get("text"))
            for p in msg["parts"][:MAX_A2A_MESSAGE_PARTS]
            if isinstance(p, dict) and p.get("type") == "text" and isinstance(p.get("text"), str)
        )[:MAX_A2A_TASK_TEXT_CHARS]
    artifacts = raw.get("artifacts") if isinstance(raw.get("artifacts"), list) else []
    return {
        "id": expected_id,
        "sessionId": raw.get("sessionId") if isinstance(raw.get("sessionId"), str) else None,
        "status": {
            "state": state,
            "message": message_text,
            "timestamp": str(status.get("timestamp") or "")[:64],
        },
        "artifacts": [a for a in artifacts[:20] if isinstance(a, dict)],
        "metadata": raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {},
    }


class A2ARemoteClient:
    """Hardened outbound A2A client (agent card discovery + JSON-RPC tasks)."""

    MAX_RESPONSE_BYTES = 256 * 1024

    def __init__(
        self,
        *,
        timeout_seconds: float = 8.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        allowlisted_hosts: Optional[FrozenSet[str]] = None,
    ) -> None:
        self._timeout = min(15.0, max(0.5, float(timeout_seconds)))
        self._transport = transport
        self._allowlisted = frozenset(h.lower() for h in (allowlisted_hosts or frozenset()))

    async def _guard(self, url: str) -> str:
        ok, err = await asyncio.to_thread(
            validate_a2a_remote_url, url, allowlisted_hosts=self._allowlisted
        )
        if not ok:
            raise A2ABlockedURLError(err or "Blocked remote A2A URL")
        return url.strip()

    async def _request_json(
        self,
        method: str,
        url: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> Any:
        url = await self._guard(url)
        headers = {"Accept": "application/json", "User-Agent": "ForgeAI-A2A-Gateway/1.0"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async def _do() -> Any:
            async with httpx.AsyncClient(
                transport=self._transport,
                timeout=httpx.Timeout(self._timeout),
                follow_redirects=False,
            ) as client:
                async with client.stream(method, url, json=body, headers=headers) as resp:
                    if 300 <= resp.status_code < 400:
                        raise A2ABlockedURLError(
                            f"Remote A2A agent attempted disallowed HTTP redirect ({resp.status_code})"
                        )
                    if resp.status_code != 200:
                        raise A2ARemoteError(f"Remote A2A agent returned HTTP {resp.status_code}")
                    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype != "application/json":
                        raise A2ARemoteError("Remote A2A agent returned a non-JSON content type")
                    declared = resp.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > self.MAX_RESPONSE_BYTES:
                        raise A2ARemoteError("Remote A2A response exceeded the size limit")
                    buf = bytearray()
                    async for chunk in resp.aiter_bytes():
                        buf.extend(chunk)
                        if len(buf) > self.MAX_RESPONSE_BYTES:
                            raise A2ARemoteError("Remote A2A response exceeded the size limit")
            try:
                return json.loads(bytes(buf).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise A2ARemoteError("Remote A2A agent returned invalid JSON") from exc

        try:
            # Overall deadline on top of httpx per-operation timeouts (slow-drip defense).
            return await asyncio.wait_for(_do(), timeout=self._timeout * 2)
        except asyncio.TimeoutError as exc:
            raise A2ARemoteError("Remote A2A agent timed out") from exc
        except httpx.HTTPError as exc:
            raise A2ARemoteError(f"Remote A2A transport error ({type(exc).__name__})") from exc

    @staticmethod
    def card_url_for(agent_url: str) -> str:
        parsed = urlparse((agent_url or "").strip())
        if parsed.path in ("", "/"):
            return f"{parsed.scheme}://{parsed.netloc}/.well-known/agent.json"
        return agent_url.strip()

    async def fetch_agent_card(self, agent_url: str, *, auth_token: Optional[str] = None) -> Dict[str, Any]:
        raw = await self._request_json("GET", self.card_url_for(agent_url), auth_token=auth_token)
        card = _sanitize_remote_card(raw)
        ok, err = await asyncio.to_thread(
            validate_a2a_remote_url, card["url"], allowlisted_hosts=self._allowlisted
        )
        card["endpoint_allowed"] = ok
        if not ok:
            card["endpoint_rejection"] = err
        return card

    async def _rpc(
        self,
        endpoint_url: str,
        method: str,
        params: Dict[str, Any],
        *,
        auth_token: Optional[str] = None,
    ) -> Any:
        rpc_id = f"rpc_{uuid.uuid4().hex[:12]}"
        res = await self._request_json(
            "POST",
            endpoint_url,
            body={"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params},
            auth_token=auth_token,
        )
        if not isinstance(res, dict) or res.get("jsonrpc") != "2.0":
            raise A2ARemoteError("Remote A2A agent returned a malformed JSON-RPC envelope")
        if res.get("id") != rpc_id:
            raise A2ARemoteError("Remote A2A JSON-RPC response id mismatch")
        if "error" in res:
            err = res["error"] if isinstance(res["error"], dict) else {}
            raise A2ARemoteError(
                f"Remote A2A error {err.get('code')}: {str(err.get('message') or '')[:200]}"
            )
        return res.get("result")

    async def send_task(
        self,
        endpoint_url: str,
        *,
        task_id: str,
        text: str,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "id": task_id,
            "message": {"role": "user", "parts": [{"type": "text", "text": text}]},
        }
        if session_id:
            params["sessionId"] = session_id
        if metadata:
            params["metadata"] = metadata
        result = await self._rpc(endpoint_url, "tasks/send", params, auth_token=auth_token)
        return _sanitize_remote_task(result, expected_id=task_id)

    async def get_task(
        self,
        endpoint_url: str,
        *,
        task_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"id": task_id}
        if metadata:
            params["metadata"] = metadata
        result = await self._rpc(endpoint_url, "tasks/get", params, auth_token=auth_token)
        return _sanitize_remote_task(result, expected_id=task_id)

    async def cancel_task(
        self,
        endpoint_url: str,
        *,
        task_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"id": task_id}
        if metadata:
            params["metadata"] = metadata
        result = await self._rpc(endpoint_url, "tasks/cancel", params, auth_token=auth_token)
        return _sanitize_remote_task(result, expected_id=task_id)


# --------------------------------------------------------------------------- #
# Gateway
# --------------------------------------------------------------------------- #


class A2AGateway:
    """Governed A2A gateway: inbound tasks into Forge's AgentKernel + outbound remote calls.

    Inbound task state lives in an `A2ATaskStore` shared by all API workers
    (MongoDB in production, in-memory in tests/dev). Each gateway instance is
    one worker: it owns the kernel runs it started, heartbeats their leases,
    and observes cross-worker cancellation through the store.
    """

    MAX_TASK_RECORDS = 1000  # in-memory store cap; MongoDB uses TTL retention instead
    MAX_AUDIT_RECORDS = 500

    def __init__(
        self,
        kernel: Optional[AgentKernel] = None,
        *,
        remote_client: Optional[A2ARemoteClient] = None,
        max_inflight_tasks: int = 8,
        task_store: Optional[A2ATaskStore] = None,
        worker_id: Optional[str] = None,
        lease_ttl_seconds: float = 30.0,
        heartbeat_interval_seconds: Optional[float] = None,
        clock: Optional[Callable[[], float]] = None,
        auto_select_store: bool = False,
    ) -> None:
        self._kernel = kernel
        self._task_store: A2ATaskStore = task_store or InMemoryA2ATaskStore(
            max_records=self.MAX_TASK_RECORDS
        )
        # Only the process singleton auto-switches to MongoDB once a DB is known.
        self._auto_select_store = bool(auto_select_store) and task_store is None
        self.worker_id = worker_id or make_worker_id()
        self._lease_ttl = max(0.05, float(lease_ttl_seconds))
        self._heartbeat_interval = max(
            0.01,
            float(heartbeat_interval_seconds)
            if heartbeat_interval_seconds is not None
            else self._lease_ttl / 3.0,
        )
        self._clock: Callable[[], float] = clock or time.time
        # Runs executing on *this* worker (cancel hooks); task state lives in the store.
        self._runs: Dict[Tuple[str, str], KernelRun] = {}
        self._runners: Dict[Tuple[str, str], asyncio.Task] = {}
        self._max_inflight = max(1, int(max_inflight_tasks))
        self._remote = remote_client or A2ARemoteClient()
        self._audit_log: List[A2AAuditRecord] = []
        self._audit_persister: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]] = None

    # ---- task store ----------------------------------------------------- #

    @property
    def task_store(self) -> A2ATaskStore:
        return self._task_store

    @property
    def max_inflight(self) -> int:
        return self._max_inflight

    def attach_task_store(self, store: A2ATaskStore) -> None:
        self._task_store = store
        self._auto_select_store = False

    def ensure_db_task_store(self, db: Any) -> None:
        """Switch an auto-selecting gateway to MongoDB (no-op otherwise / once done)."""
        if not self._auto_select_store or self._runners:
            return
        self.attach_task_store(MongoA2ATaskStore(db, slot_count=self._max_inflight))

    def _lease_deadline(self) -> float:
        return self._clock() + self._lease_ttl

    async def reap_stale_tasks(self) -> int:
        """Mark tasks whose owning worker's lease expired as failed (startup recovery)."""
        return await self._task_store.reap_stale(self._clock())

    async def running_count(self) -> int:
        """Globally running inbound tasks (live slot leases across all workers)."""
        return await self._task_store.count_running(self._clock())

    # ---- audit ---------------------------------------------------------- #

    def attach_audit_persister(
        self, persister: Optional[Callable[[Dict[str, Any]], Awaitable[Any]]]
    ) -> None:
        self._audit_persister = persister

    async def record_audit(self, **kwargs: Any) -> A2AAuditRecord:
        rec = A2AAuditRecord(audit_id=f"a2aaud_{uuid.uuid4().hex[:12]}", **kwargs)
        if rec.reason:
            rec.reason = rec.reason[:300]
        self._audit_log.append(rec)
        if len(self._audit_log) > self.MAX_AUDIT_RECORDS:
            del self._audit_log[: len(self._audit_log) - self.MAX_AUDIT_RECORDS]
        if self._audit_persister is not None:
            try:
                await self._audit_persister(rec.to_dict())
            except Exception:
                logger.debug("A2A audit persistence failed open", exc_info=True)
        return rec

    def get_audit_log(self, *, project_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        entries = self._audit_log
        if project_id:
            entries = [e for e in entries if e.project_id == project_id]
        return [e.to_dict() for e in entries[-limit:]]

    # ---- inbound tasks -------------------------------------------------- #

    def _get_kernel(self) -> AgentKernel:
        return self._kernel or get_agent_kernel()

    @staticmethod
    def _record(resp: A2ATaskResponse, **bookkeeping: Any) -> Dict[str, Any]:
        rec = resp.to_dict()
        rec.update(
            {
                "created_at": resp.updated_at,
                "worker_id": None,
                "lease_expires_at": None,
                "cancel_requested": False,
                "plan_only": False,
            }
        )
        rec.update(bookkeeping)
        return rec

    def _plan(self, req: A2ATaskRequest, objective: str) -> Tuple[KernelRun, KernelExecutionConfig]:
        config = KernelExecutionConfig(
            max_concurrency=3,
            max_budget_usd=max(0.05, min(25.0, float(req.max_budget_usd))),
            isolate_worktrees=True,
            require_delivery_approval=False,
        )
        run = plan_objective_dag(
            project_id=req.project_id,
            objective=objective,
            max_agents=max(2, min(10, int(req.max_agents))),
            include_governance_gates=True,
            config=config,
        )
        return run, config

    @staticmethod
    def _finished_response(req: A2ATaskRequest, finished: KernelRun) -> A2ATaskResponse:
        status_val = finished.status.value
        if status_val == "completed":
            a2a_state = "completed"
        elif status_val == "cancelled":
            a2a_state = "canceled"
        else:
            a2a_state = "failed"
        return A2ATaskResponse(
            task_id=req.task_id,
            kernel_run_id=finished.id,
            project_id=req.project_id,
            state=a2a_state,
            summary=(
                f"Executed {len(finished.tasks)} specialist task(s) across "
                f"{len(finished.waves)} wave(s) ({status_val})."
            ),
            wave_count=len(finished.waves),
            task_count=len(finished.tasks),
            artifacts=finished.artifacts[-10:],
            evaluations=finished.evaluations[-10:],
            session_id=req.session_id,
            caller_agent=req.caller_agent,
        )

    async def send_task(self, req: A2ATaskRequest) -> A2ATaskResponse:
        """Plan (and optionally execute inline) an A2A task. Legacy REST entry point."""
        objective = (req.objective or "").strip()
        if len(objective) < 3:
            raise ValueError("A2A task objective must be at least 3 characters")

        kernel = self._get_kernel()
        run, config = self._plan(req, objective)

        if req.execute_now:
            finished = await kernel.execute_run(
                run, shared_context={"a2a_caller": req.caller_agent}
            )
            resp = self._finished_response(req, finished)
        else:
            resp = A2ATaskResponse(
                task_id=req.task_id,
                kernel_run_id=run.id,
                project_id=req.project_id,
                state="submitted",
                summary=(
                    f"Planned {len(run.tasks)} specialist task(s) across {len(run.waves)} DAG wave(s) "
                    f"with ${config.max_budget_usd:.2f} budget cap."
                ),
                wave_count=len(run.waves),
                task_count=len(run.tasks),
                session_id=req.session_id,
                caller_agent=req.caller_agent,
            )

        await self._task_store.put(self._record(resp, plan_only=not req.execute_now))
        return resp

    @staticmethod
    def _slot_holder(key: Tuple[str, str]) -> str:
        return f"{key[0]}/{key[1]}"

    async def submit_task(self, req: A2ATaskRequest, *, plan_only: bool = False) -> A2ATaskResponse:
        """A2A `tasks/send`: plan the DAG and execute it in the background.

        Idempotent per (project, task id) across workers: the record is created
        with a single atomic insert guarded by the store's unique key, so only
        the worker that wins the insert starts a run; everyone else gets the
        current state. Running tasks are bounded globally by store-held slots.
        """
        objective = (req.objective or "").strip()
        if len(objective) < 3:
            raise A2ARpcError(JSONRPC_INVALID_PARAMS, "Task text must be at least 3 characters")
        key = (req.project_id, req.task_id)
        existing = await self.get_task(project_id=req.project_id, task_id=req.task_id)
        if existing is not None:
            return existing

        run, config = self._plan(req, objective)
        slot_id: Optional[str] = None
        lease_until: Optional[float] = None
        holder = self._slot_holder(key)
        if not plan_only:
            now = self._clock()
            lease_until = now + self._lease_ttl
            slot_id = await self._task_store.acquire_slot(
                holder, self.worker_id, limit=self._max_inflight, now=now, lease_until=lease_until
            )
            if slot_id is None:
                raise A2ARpcError(A2A_SERVER_BUSY, "Too many in-flight A2A tasks; retry later")

        resp = A2ATaskResponse(
            task_id=req.task_id,
            kernel_run_id=run.id,
            project_id=req.project_id,
            state="submitted" if plan_only else "working",
            summary=(
                f"{'Planned' if plan_only else 'Executing'} {len(run.tasks)} specialist task(s) "
                f"across {len(run.waves)} DAG wave(s) with ${config.max_budget_usd:.2f} budget cap."
            ),
            wave_count=len(run.waves),
            task_count=len(run.tasks),
            session_id=req.session_id,
            caller_agent=req.caller_agent,
        )
        record = self._record(
            resp,
            plan_only=plan_only,
            worker_id=None if plan_only else self.worker_id,
            lease_expires_at=lease_until,
        )
        try:
            stored, created = await self._task_store.create_if_absent(record)
        except BaseException:
            if slot_id is not None:
                await self._release_slot(slot_id, holder)
            raise
        if not created:
            # Another request/worker won the insert and owns the (single) run.
            if slot_id is not None:
                await self._release_slot(slot_id, holder)
            return A2ATaskResponse.from_record(stored)

        if slot_id is not None:
            self._runs[key] = run
            self._runners[key] = asyncio.create_task(
                self._run_in_background(key, req, run, slot_id)
            )
        return resp

    async def _release_slot(self, slot_id: str, holder: str) -> None:
        try:
            await self._task_store.release_slot(slot_id, holder, self.worker_id)
        except Exception:
            # Fail open: the slot lease expires on its own.
            logger.warning("A2A slot release failed for %s", holder, exc_info=True)

    def _stop_local_run(self, key: Tuple[str, str]) -> None:
        """Stop a run executing on this worker via the kernel's cancel hook."""
        run = self._runs.get(key)
        if run is not None and self._get_kernel().cancel_run(run.id):
            return
        runner = self._runners.get(key)
        if runner is not None and not runner.done():
            # Not yet inside the kernel (or kernel already finished): stop the runner.
            runner.cancel()

    async def _watch_lease(self, key: Tuple[str, str], slot_id: str) -> None:
        """Heartbeat the task + slot lease and observe cross-worker cancellation."""
        project_id, task_id = key
        holder = self._slot_holder(key)
        while True:
            await asyncio.sleep(self._heartbeat_interval)
            lease_until = self._lease_deadline()
            try:
                doc = await self._task_store.update(
                    project_id,
                    task_id,
                    {"lease_expires_at": lease_until},
                    worker_id=self.worker_id,
                )
                await self._task_store.renew_slot(
                    slot_id, holder, self.worker_id, lease_until=lease_until
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("A2A lease heartbeat failed for %s", holder, exc_info=True)
                continue
            if doc is None or doc.get("cancel_requested") or doc.get("state") != "working":
                # Canceled from any worker, reaped, or ownership lost: stop spending.
                self._stop_local_run(key)
                return

    async def _run_in_background(
        self, key: Tuple[str, str], req: A2ATaskRequest, run: KernelRun, slot_id: str
    ) -> None:
        watcher = asyncio.create_task(self._watch_lease(key, slot_id))
        final: Optional[A2ATaskResponse] = None
        try:
            finished = await self._get_kernel().execute_run(
                run, shared_context={"a2a_caller": req.caller_agent}
            )
            final = self._finished_response(req, finished)
        except asyncio.CancelledError:
            final = None
        except Exception as exc:
            logger.warning("A2A background task %s failed: %s", req.task_id, type(exc).__name__)
            final = A2ATaskResponse(
                task_id=req.task_id,
                kernel_run_id=run.id,
                project_id=req.project_id,
                state="failed",
                summary="Kernel execution failed.",
                wave_count=len(run.waves),
                task_count=len(run.tasks),
                session_id=req.session_id,
                caller_agent=req.caller_agent,
            )
        finally:
            watcher.cancel()
            await asyncio.gather(watcher, return_exceptions=True)
            self._runners.pop(key, None)
            self._runs.pop(key, None)
            await self._release_slot(slot_id, self._slot_holder(key))

        if final is None:
            return
        fields = final.to_dict()
        fields.pop("task_id", None)
        fields.pop("project_id", None)
        try:
            # Never overwrite a terminal state set elsewhere (cancel / reaper).
            updated = await self._task_store.update(
                req.project_id,
                req.task_id,
                fields,
                unless_states=A2A_TERMINAL_STATES,
                worker_id=self.worker_id,
            )
        except Exception:
            logger.warning("A2A task %s final state was not persisted", req.task_id, exc_info=True)
            return
        if updated is not None:
            await self.record_audit(
                direction="inbound",
                method="tasks/execute",
                project_id=req.project_id,
                task_id=req.task_id,
                peer=req.caller_agent[:128],
                status="succeeded" if final.state == "completed" else "error",
                reason=None if final.state == "completed" else final.summary,
            )

    async def get_task(self, *, project_id: str, task_id: str) -> Optional[A2ATaskResponse]:
        rec = await self._task_store.get(project_id, task_id)
        if rec is None:
            return None
        now = self._clock()
        if is_stale_record(rec, now):
            # Owner stopped heartbeating (crash / redeploy): fail it instead of
            # reporting `working` forever.
            await self._task_store.reap_stale(now, project_id=project_id, task_id=task_id)
            rec = await self._task_store.get(project_id, task_id) or rec
        return A2ATaskResponse.from_record(rec)

    async def cancel_task(self, *, project_id: str, task_id: str) -> A2ATaskResponse:
        """Persist the cancel in the shared store; the owning worker observes it."""
        key = (project_id, task_id)
        rec = await self.get_task(project_id=project_id, task_id=task_id)
        if rec is None:
            raise A2ARpcError(A2A_TASK_NOT_FOUND, "Task not found")
        if rec.state in A2A_TERMINAL_STATES:
            raise A2ARpcError(A2A_TASK_NOT_CANCELABLE, f"Task is already {rec.state}")
        updated = await self._task_store.update(
            project_id,
            task_id,
            {
                "state": "canceled",
                "summary": "Task canceled by A2A client request.",
                "cancel_requested": True,
                "updated_at": _utc_now(),
            },
            unless_states=A2A_TERMINAL_STATES,
        )
        if updated is None:
            current = await self.get_task(project_id=project_id, task_id=task_id)
            if current is None:
                raise A2ARpcError(A2A_TASK_NOT_FOUND, "Task not found")
            raise A2ARpcError(A2A_TASK_NOT_CANCELABLE, f"Task is already {current.state}")
        # Fast path when this worker owns the run; other workers see it on heartbeat.
        if key in self._runs:
            self._stop_local_run(key)
        return A2ATaskResponse.from_record(updated)

    async def wait_for_task(self, *, project_id: str, task_id: str, timeout: float = 5.0) -> Optional[A2ATaskResponse]:
        """Await the local background runner (used by tests and graceful shutdown)."""
        runner = self._runners.get((project_id, task_id))
        if runner is not None:
            try:
                await asyncio.wait_for(asyncio.shield(runner), timeout=timeout)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
        return await self.get_task(project_id=project_id, task_id=task_id)

    async def handle_jsonrpc(
        self,
        payload: Any,
        *,
        project_id: Optional[str],
        actor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dispatch an inbound A2A JSON-RPC request. Always returns a JSON-RPC envelope.

        `project_id` is the already-authorized project. When None the caller must
        supply `params.metadata.projectId`; the API layer authorizes it through
        `resolve_project` before dispatching (see `extract_project_selector`).
        """
        rpc_id: Any = None
        method = "unknown"
        try:
            if isinstance(payload, list):
                raise A2ARpcError(JSONRPC_INVALID_REQUEST, "Batch requests are not supported")
            if not isinstance(payload, dict) or payload.get("jsonrpc") != "2.0":
                raise A2ARpcError(JSONRPC_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request")
            rpc_id = payload.get("id")
            if rpc_id is not None and not isinstance(rpc_id, (str, int)):
                rpc_id = None
                raise A2ARpcError(JSONRPC_INVALID_REQUEST, "JSON-RPC id must be a string or integer")
            if isinstance(rpc_id, str) and len(rpc_id) > 128:
                rpc_id = None
                raise A2ARpcError(JSONRPC_INVALID_REQUEST, "JSON-RPC id is too long")
            method_raw = payload.get("method")
            if not isinstance(method_raw, str):
                raise A2ARpcError(JSONRPC_INVALID_REQUEST, "JSON-RPC method must be a string")
            method = method_raw[:64]
            params = payload.get("params", {})
            if not isinstance(params, dict):
                raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params must be an object")
            if not project_id:
                raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.metadata.projectId is required")
            metadata = params.get("metadata")
            if metadata is not None and not isinstance(metadata, dict):
                raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.metadata must be an object")
            metadata = metadata or {}

            if method == "tasks/send":
                task_id = _validate_task_id(params.get("id"), required=False) or f"a2a_{uuid.uuid4().hex[:12]}"
                session_id = params.get("sessionId")
                if session_id is not None and (not isinstance(session_id, str) or len(session_id) > 128):
                    raise A2ARpcError(JSONRPC_INVALID_PARAMS, "params.sessionId must be a string (<=128)")
                text = _extract_message_text(params.get("message"))
                caller = metadata.get("callerAgent", "external-a2a-client")
                if not isinstance(caller, str) or not (2 <= len(caller) <= 128):
                    raise A2ARpcError(JSONRPC_INVALID_PARAMS, "metadata.callerAgent must be 2-128 chars")
                plan_only = metadata.get("planOnly", False)
                if not isinstance(plan_only, bool):
                    raise A2ARpcError(JSONRPC_INVALID_PARAMS, "metadata.planOnly must be a boolean")
                req = A2ATaskRequest(
                    objective=text,
                    project_id=project_id,
                    task_id=task_id,
                    caller_agent=caller,
                    max_agents=int(_clamp_number(metadata.get("maxAgents"), lo=2, hi=10, default=6, name="maxAgents")),
                    max_budget_usd=_clamp_number(
                        metadata.get("maxBudgetUsd"), lo=0.05, hi=25.0, default=1.50, name="maxBudgetUsd"
                    ),
                    execute_now=not plan_only,
                    session_id=session_id,
                )
                resp = await self.submit_task(req, plan_only=plan_only)
                result = resp.to_a2a_task()
                peer = caller
            elif method == "tasks/get":
                task_id = _validate_task_id(params.get("id"), required=True)
                rec = await self.get_task(project_id=project_id, task_id=task_id)
                if rec is None:
                    raise A2ARpcError(A2A_TASK_NOT_FOUND, "Task not found")
                result = rec.to_a2a_task()
                peer = rec.caller_agent
            elif method == "tasks/cancel":
                task_id = _validate_task_id(params.get("id"), required=True)
                rec = await self.cancel_task(project_id=project_id, task_id=task_id)
                result = rec.to_a2a_task()
                peer = rec.caller_agent
            else:
                raise A2ARpcError(JSONRPC_METHOD_NOT_FOUND, f"Method '{method}' is not supported")

            await self.record_audit(
                direction="inbound",
                method=method,
                project_id=project_id,
                task_id=result.get("id"),
                peer=str(peer)[:128],
                actor=actor,
                status="succeeded",
            )
            return {"jsonrpc": "2.0", "id": rpc_id, "result": result}
        except A2ARpcError as exc:
            await self.record_audit(
                direction="inbound",
                method=method,
                project_id=project_id or "",
                actor=actor,
                status="rejected",
                reason=f"{exc.code}: {exc.message}",
            )
            return jsonrpc_error(rpc_id, exc.code, exc.message, exc.data)
        except Exception as exc:
            logger.exception("A2A JSON-RPC dispatch failed")
            await self.record_audit(
                direction="inbound",
                method=method,
                project_id=project_id or "",
                actor=actor,
                status="error",
                reason=type(exc).__name__,
            )
            return jsonrpc_error(rpc_id, JSONRPC_INTERNAL_ERROR, "Internal error")

    # ---- outbound ------------------------------------------------------- #

    async def _outbound(
        self,
        *,
        method: str,
        project_id: str,
        url: str,
        actor: Optional[str],
        task_id: Optional[str],
        call: Callable[[], Awaitable[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        peer = (urlparse(url or "").hostname or "")[:253]
        try:
            result = await call()
        except A2ARemoteError as exc:
            blocked = isinstance(exc, A2ABlockedURLError)
            await self.record_audit(
                direction="outbound",
                method=method,
                project_id=project_id,
                task_id=task_id,
                peer=peer,
                actor=actor,
                status="denied" if blocked else "error",
                reason=str(exc),
            )
            raise
        await self.record_audit(
            direction="outbound",
            method=method,
            project_id=project_id,
            task_id=task_id,
            peer=peer,
            actor=actor,
            status="succeeded",
        )
        return result

    async def fetch_remote_agent_card(
        self, agent_url: str, *, project_id: str, actor: Optional[str] = None, auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        return await self._outbound(
            method="agent/card",
            project_id=project_id,
            url=agent_url,
            actor=actor,
            task_id=None,
            call=lambda: self._remote.fetch_agent_card(agent_url, auth_token=auth_token),
        )

    async def send_remote_task(
        self,
        endpoint_url: str,
        *,
        project_id: str,
        text: str,
        task_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        tid = task_id or f"forge_{uuid.uuid4().hex[:12]}"
        if not _TASK_ID_RE.match(tid):
            raise A2ARemoteError("Invalid task id")
        body = (text or "").strip()
        if not (3 <= len(body) <= MAX_A2A_TASK_TEXT_CHARS):
            raise A2ARemoteError(f"Task text must be 3-{MAX_A2A_TASK_TEXT_CHARS} characters")
        return await self._outbound(
            method="tasks/send",
            project_id=project_id,
            url=endpoint_url,
            actor=actor,
            task_id=tid,
            call=lambda: self._remote.send_task(
                endpoint_url, task_id=tid, text=body, metadata=metadata, auth_token=auth_token
            ),
        )

    async def get_remote_task(
        self,
        endpoint_url: str,
        *,
        project_id: str,
        task_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self._outbound(
            method="tasks/get",
            project_id=project_id,
            url=endpoint_url,
            actor=actor,
            task_id=task_id,
            call=lambda: self._remote.get_task(
                endpoint_url, task_id=task_id, metadata=metadata, auth_token=auth_token
            ),
        )

    async def cancel_remote_task(
        self,
        endpoint_url: str,
        *,
        project_id: str,
        task_id: str,
        metadata: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self._outbound(
            method="tasks/cancel",
            project_id=project_id,
            url=endpoint_url,
            actor=actor,
            task_id=task_id,
            call=lambda: self._remote.cancel_task(
                endpoint_url, task_id=task_id, metadata=metadata, auth_token=auth_token
            ),
        )

    async def poll_remote_task(
        self,
        endpoint_url: str,
        *,
        project_id: str,
        task_id: str,
        interval_seconds: float = 1.0,
        timeout_seconds: float = 30.0,
        metadata: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Poll `tasks/get` until the remote task reaches a terminal state or the deadline."""
        interval = min(10.0, max(0.01, float(interval_seconds)))
        deadline = time.monotonic() + min(300.0, max(0.05, float(timeout_seconds)))
        while True:
            task = await self.get_remote_task(
                endpoint_url,
                project_id=project_id,
                task_id=task_id,
                metadata=metadata,
                actor=actor,
                auth_token=auth_token,
            )
            if task["status"]["state"] in A2A_TERMINAL_STATES or task["status"]["state"] == "input-required":
                return task
            if time.monotonic() + interval > deadline:
                task["poll_timed_out"] = True
                return task
            await asyncio.sleep(interval)


_a2a_gateway: Optional[A2AGateway] = None


def get_a2a_gateway() -> A2AGateway:
    global _a2a_gateway
    if _a2a_gateway is None:
        _a2a_gateway = A2AGateway(auto_select_store=True)
    return _a2a_gateway
