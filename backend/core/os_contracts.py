"""Forge OS shared contracts (Phase 1) -- Pydantic mirror of the wire schemas.

The wire truth is the JSON Schema in ``core/os_schemas/os-contracts.schema.json``
and the A2UI component catalog in ``core/os_schemas/forge-ember.catalog.json``.
Both are byte-identical copies of ``shared/os-schemas/`` (the backend Docker
image only copies ``backend/``), drift-tested in ``tests/test_os_contracts.py``.
The TypeScript mirror is ``frontend/src/os/contracts.ts``.

Two validation layers, mirroring A2UI's envelope + catalog split:

1. Pydantic models / ``validate_contract`` check envelopes, requests and state.
2. ``validate_component`` / ``validate_a2ui_message`` check every A2UI
   component against the closed Forge Ember catalog. Anything an LLM produces
   must pass both before it is persisted or streamed (docs/os/ARCHITECTURE.md,
   "Security model").

Changing a contract: edit ``shared/os-schemas/*.json``, run
``python backend/scripts/sync_os_schemas.py``, then update this module and
``frontend/src/os/contracts.ts`` in the same commit.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Dict, List, Literal, Optional, Tuple, Union, get_args

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

OS_PROTOCOL_VERSION = "forge-os/1"
A2UI_VERSION = "1.0"
FORGE_CATALOG_ID = "urn:forge:a2ui:catalog:ember:1"

SCHEMA_DIR = Path(__file__).resolve().parent / "os_schemas"
CONTRACTS_SCHEMA_FILE = SCHEMA_DIR / "os-contracts.schema.json"
CATALOG_FILE = SCHEMA_DIR / "forge-ember.catalog.json"
CAPABILITY_INDEX_FILE = SCHEMA_DIR / "capability-index.json"

# --------------------------------------------------------------------------- #
# Enumerations (parity with the schema is asserted in tests)
# --------------------------------------------------------------------------- #

IntentKind = Literal[
    "chat",
    "build_website",
    "analyze_data",
    "create_agent",
    "design_workflow",
    "compare_models",
    "manage_projects",
    "monitor_run",
    "review_code",
    "approve_gate",
    "open_capability",
    "account",
    "unknown",
]
PresentationKind = Literal["text", "inline", "panel", "window", "fullscreen"]
SurfacePresentationKind = Literal["inline", "panel", "window", "fullscreen"]
WindowPresentationKind = Literal["panel", "window", "fullscreen"]
Permission = Literal[
    "authenticated",
    "project:read",
    "project:write",
    "kernel:run",
    "kernel:approve",
    "mcp:invoke",
    "deploy",
    "billing:manage",
    "org:manage",
    "admin",
]
EntryPoint = Literal["prompt", "palette", "library", "deeplink"]
PersistenceRule = Literal["ephemeral", "session", "workspace", "server"]
OsEventType = Literal[
    "turn.started",
    "intent.resolved",
    "plan.ready",
    "text.delta",
    "text.completed",
    "a2ui.message",
    "surface.placed",
    "mcp_app.placed",
    "agent.progress",
    "action.result",
    "turn.completed",
    "turn.failed",
    "heartbeat",
]
CapabilityCategory = Literal[
    "build", "plan", "agents", "data", "models", "protocols", "governance", "account", "admin", "system"
]
OsErrorCode = Literal[
    "unauthorized",
    "forbidden",
    "not_found",
    "validation_failed",
    "rate_limited",
    "budget_exceeded",
    "llm_unavailable",
    "conflict",
    "internal",
]

INTENT_KINDS: Tuple[str, ...] = get_args(IntentKind)
PRESENTATION_KINDS: Tuple[str, ...] = get_args(PresentationKind)
PERMISSIONS: Tuple[str, ...] = get_args(Permission)
OS_EVENT_TYPES: Tuple[str, ...] = get_args(OsEventType)

# Legacy a2ui/v1 (core/protocol_gateway.py) component types -> Forge Ember
# catalog names. The legacy -> v1.0 adapter (WS-C) also renames snake_case
# props to camelCase (gate_id -> gateId, file_path -> filePath, ...).
LEGACY_A2UI_COMPONENT_MAP: Dict[str, str] = {
    "heading": "Heading",
    "metric_row": "MetricRow",
    "checklist": "Checklist",
    "approval_card": "ApprovalCard",
    "conflict_list": "ConflictList",
    "eval_table": "EvalTable",
    "text_block": "Text",
    "key_value_list": "KeyValueList",
    "progress_bar": "ProgressBar",
    "timeline": "Timeline",
    "status_list": "StatusList",
    "code_diff": "CodeView",
    "cost_breakdown": "CostBreakdown",
    "agent_roster": "AgentRoster",
    "callout": "Callout",
    "link_list": "LinkList",
}

# --------------------------------------------------------------------------- #
# Primitive field types
# --------------------------------------------------------------------------- #

OsId = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")]
Timestamp = Annotated[str, Field(min_length=10, max_length=40)]
JsonPointer = Annotated[str, Field(max_length=512, pattern=r"^(/.*)?$")]
CapabilityId = Annotated[str, Field(max_length=96, pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")]
RoutePath = Annotated[str, Field(max_length=512, pattern=r"^/")]


class _Strict(BaseModel):
    # strict: no str->int / str->bool coercion, so Pydantic accepts exactly what
    # the JSON Schema accepts (parity is asserted against the shared examples).
    model_config = ConfigDict(extra="forbid", strict=True)


# --------------------------------------------------------------------------- #
# A2UI v1.0 profile
# --------------------------------------------------------------------------- #


class A2UIComponent(BaseModel):
    """Flat A2UI component ``{id, component, ...props}``; props are checked against the catalog."""

    model_config = ConfigDict(extra="allow", strict=True)
    id: Annotated[str, Field(pattern=r"^[A-Za-z_][A-Za-z0-9_-]{0,63}$")]
    component: Annotated[str, Field(pattern=r"^[A-Z][A-Za-z0-9]{0,63}$")]


class _CreateSurfaceBody(_Strict):
    surfaceId: OsId
    catalogId: Literal["urn:forge:a2ui:catalog:ember:1"]
    components: Optional[Annotated[List[A2UIComponent], Field(max_length=200)]] = None
    dataModel: Optional[Dict[str, Any]] = None
    sendDataModel: Optional[bool] = None


class A2UICreateSurface(_Strict):
    version: Literal["1.0"]
    createSurface: _CreateSurfaceBody


class _UpdateComponentsBody(_Strict):
    surfaceId: OsId
    components: Annotated[List[A2UIComponent], Field(min_length=1, max_length=200)]


class A2UIUpdateComponents(_Strict):
    version: Literal["1.0"]
    updateComponents: _UpdateComponentsBody


class _UpdateDataModelBody(_Strict):
    surfaceId: OsId
    path: Optional[JsonPointer] = None
    value: Any


class A2UIUpdateDataModel(_Strict):
    version: Literal["1.0"]
    updateDataModel: _UpdateDataModelBody


class _DeleteSurfaceBody(_Strict):
    surfaceId: OsId


class A2UIDeleteSurface(_Strict):
    version: Literal["1.0"]
    deleteSurface: _DeleteSurfaceBody


A2UIServerMessage = Union[A2UICreateSurface, A2UIUpdateComponents, A2UIUpdateDataModel, A2UIDeleteSurface]


class _UserActionBody(_Strict):
    name: Annotated[str, Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,63}$")]
    surfaceId: OsId
    sourceComponentId: Annotated[str, Field(min_length=1, max_length=64)]
    timestamp: Timestamp
    context: Dict[str, Any]


class A2UIUserAction(_Strict):
    version: Literal["1.0"]
    action: _UserActionBody


# --------------------------------------------------------------------------- #
# Intelligence kernel outputs
# --------------------------------------------------------------------------- #


class IntentResult(_Strict):
    kind: IntentKind
    confidence: Annotated[float, Field(ge=0, le=1)]
    capability_ids: Annotated[List[CapabilityId], Field(max_length=10)]
    entities: Dict[str, Any]
    source: Literal["llm", "rules", "explicit"]
    rationale: Optional[Annotated[str, Field(max_length=500)]]


class ModelRef(_Strict):
    provider: Annotated[str, Field(min_length=1, max_length=64)]
    model: Annotated[str, Field(min_length=1, max_length=128)]


class PlanStep(_Strict):
    id: OsId
    kind: Literal["respond_text", "render_surface", "open_capability", "open_mcp_app", "run_agent", "call_tool"]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    capability_id: Optional[CapabilityId]
    requires_approval: bool


class PresentationPlan(_Strict):
    plan_id: OsId
    intent: IntentResult
    presentation: PresentationKind
    steps: Annotated[List[PlanStep], Field(max_length=20)]
    model: Optional[ModelRef]
    fallback: bool


class SurfacePlacement(_Strict):
    surface_id: OsId
    presentation: SurfacePresentationKind
    title: Annotated[str, Field(min_length=1, max_length=200)]
    capability_id: Optional[CapabilityId] = None
    window_id: Optional[OsId] = None
    size_hint: Optional[Literal["compact", "regular", "large"]] = None
    focus: Optional[bool] = None


class MCPAppPlacement(_Strict):
    app_id: OsId
    server_id: OsId
    tool_name: Annotated[str, Field(min_length=1, max_length=128)]
    project_id: OsId
    presentation: WindowPresentationKind
    title: Annotated[str, Field(min_length=1, max_length=200)]


class AgentProgress(_Strict):
    project_id: OsId
    run_id: OsId
    agui_type: Annotated[str, Field(min_length=1, max_length=64)]
    kernel_event: Annotated[str, Field(min_length=1, max_length=64)]
    payload: Dict[str, Any]


class Usage(_Strict):
    input_tokens: Annotated[int, Field(ge=0)]
    output_tokens: Annotated[int, Field(ge=0)]
    cost_usd: Annotated[float, Field(ge=0)]


class OsError(_Strict):
    code: OsErrorCode
    message: Annotated[str, Field(min_length=1, max_length=1000)]
    retryable: bool


# --------------------------------------------------------------------------- #
# Event stream (server -> client)
# --------------------------------------------------------------------------- #


class _EventBase(_Strict):
    v: Literal["forge-os/1"] = OS_PROTOCOL_VERSION
    seq: Annotated[int, Field(ge=0)]
    session_id: OsId
    turn_id: Optional[OsId]
    ts: Timestamp


class TurnStartedData(_Strict):
    message_id: OsId
    prompt_preview: Annotated[str, Field(max_length=280)]


class TextDeltaData(_Strict):
    message_id: OsId
    delta: Annotated[str, Field(max_length=8000)]


class TextCompletedData(_Strict):
    message_id: OsId
    text: Annotated[str, Field(max_length=100000)]
    format: Literal["plain", "markdown"]


class ActionResultData(_Strict):
    action_id: OsId
    status: Literal["accepted", "completed", "rejected", "failed"]
    message: Optional[Annotated[str, Field(max_length=1000)]] = None


class TurnCompletedData(_Strict):
    status: Literal["completed", "cancelled"]
    usage: Optional[Usage] = None


class IntentResolvedData(_Strict):
    intent: IntentResult


class PlanReadyData(_Strict):
    plan: PresentationPlan


class A2UIMessageData(_Strict):
    message: A2UIServerMessage


class SurfacePlacedData(_Strict):
    placement: SurfacePlacement


class MCPAppPlacedData(_Strict):
    placement: MCPAppPlacement


class AgentProgressData(_Strict):
    progress: AgentProgress


class TurnFailedData(_Strict):
    error: OsError


class HeartbeatData(_Strict):
    pass


class TurnStartedEvent(_EventBase):
    type: Literal["turn.started"]
    data: TurnStartedData


class IntentResolvedEvent(_EventBase):
    type: Literal["intent.resolved"]
    data: IntentResolvedData


class PlanReadyEvent(_EventBase):
    type: Literal["plan.ready"]
    data: PlanReadyData


class TextDeltaEvent(_EventBase):
    type: Literal["text.delta"]
    data: TextDeltaData


class TextCompletedEvent(_EventBase):
    type: Literal["text.completed"]
    data: TextCompletedData


class A2UIMessageEvent(_EventBase):
    type: Literal["a2ui.message"]
    data: A2UIMessageData


class SurfacePlacedEvent(_EventBase):
    type: Literal["surface.placed"]
    data: SurfacePlacedData


class MCPAppPlacedEvent(_EventBase):
    type: Literal["mcp_app.placed"]
    data: MCPAppPlacedData


class AgentProgressEvent(_EventBase):
    type: Literal["agent.progress"]
    data: AgentProgressData


class ActionResultEvent(_EventBase):
    type: Literal["action.result"]
    data: ActionResultData


class TurnCompletedEvent(_EventBase):
    type: Literal["turn.completed"]
    data: TurnCompletedData


class TurnFailedEvent(_EventBase):
    type: Literal["turn.failed"]
    data: TurnFailedData


class HeartbeatEvent(_EventBase):
    type: Literal["heartbeat"]
    data: HeartbeatData


OsEvent = Annotated[
    Union[
        TurnStartedEvent,
        IntentResolvedEvent,
        PlanReadyEvent,
        TextDeltaEvent,
        TextCompletedEvent,
        A2UIMessageEvent,
        SurfacePlacedEvent,
        MCPAppPlacedEvent,
        AgentProgressEvent,
        ActionResultEvent,
        TurnCompletedEvent,
        TurnFailedEvent,
        HeartbeatEvent,
    ],
    Field(discriminator="type"),
]
OS_EVENT_ADAPTER: TypeAdapter = TypeAdapter(OsEvent)


def os_event_to_sse(event: BaseModel) -> str:
    """Frame one event for ``text/event-stream`` (``id`` = seq, ``event`` = type)."""
    body = event.model_dump_json(exclude_none=False)
    return f"id: {event.seq}\nevent: {event.type}\ndata: {body}\n\n"  # type: ignore[attr-defined]


# --------------------------------------------------------------------------- #
# Requests (client -> server)
# --------------------------------------------------------------------------- #


class AttachmentRef(_Strict):
    id: OsId
    name: Annotated[str, Field(min_length=1, max_length=255)]
    mime_type: Annotated[str, Field(min_length=1, max_length=127)]
    size_bytes: Annotated[int, Field(ge=0, le=52428800)]
    kind: Literal["file", "image", "audio", "dataset", "url"]


class ModelSelection(_Strict):
    mode: Literal["auto", "pinned"]
    provider: Optional[Annotated[str, Field(max_length=64)]] = None
    model: Optional[Annotated[str, Field(max_length=128)]] = None


class TurnContext(_Strict):
    active_window_id: Optional[OsId] = None
    open_capability_ids: Optional[Annotated[List[CapabilityId], Field(max_length=50)]] = None


class TurnRequest(_Strict):
    client_turn_id: OsId
    prompt: Annotated[str, Field(min_length=1, max_length=16000)]
    attachments: Optional[Annotated[List[AttachmentRef], Field(max_length=10)]] = None
    model: Optional[ModelSelection] = None
    project_id: Optional[OsId] = None
    context: Optional[TurnContext] = None


class TurnAccepted(_Strict):
    session_id: OsId
    turn_id: OsId
    stream_path: Annotated[str, Field(max_length=300, pattern=r"^/v1/os/")]
    after_seq: Annotated[int, Field(ge=0)]


class UserActionRequest(_Strict):
    action_id: OsId
    session_id: OsId
    turn_id: Optional[OsId] = None
    a2ui: A2UIUserAction


class CapabilityInvocation(_Strict):
    action_id: OsId
    capability_id: CapabilityId
    action: OsId
    input: Dict[str, Any]
    session_id: Optional[OsId] = None
    project_id: Optional[OsId] = None
    presentation: Optional[SurfacePresentationKind] = None


# --------------------------------------------------------------------------- #
# Persisted state
# --------------------------------------------------------------------------- #


class SessionSummary(_Strict):
    id: OsId
    title: Annotated[str, Field(max_length=200)]
    project_id: Optional[OsId]
    created_at: Timestamp
    updated_at: Timestamp
    turn_count: Annotated[int, Field(ge=0)]
    pinned: bool
    archived: bool


class SessionMessage(_Strict):
    id: OsId
    session_id: OsId
    turn_id: OsId
    role: Literal["user", "assistant", "system"]
    created_at: Timestamp
    text: Optional[Annotated[str, Field(max_length=100000)]]
    format: Literal["plain", "markdown"]
    attachments: Annotated[List[AttachmentRef], Field(max_length=10)]
    surface_ids: Annotated[List[OsId], Field(max_length=20)]
    intent: Optional[IntentKind]


class StoredSurface(_Strict):
    surface_id: OsId
    session_id: OsId
    turn_id: OsId
    catalog_id: Literal["urn:forge:a2ui:catalog:ember:1"]
    title: Annotated[str, Field(max_length=200)]
    components: Annotated[List[A2UIComponent], Field(max_length=200)]
    data_model: Dict[str, Any]
    version: Annotated[int, Field(ge=0)]
    updated_at: Timestamp


class WindowBounds(_Strict):
    x: float
    y: float
    w: Annotated[float, Field(ge=0)]
    h: Annotated[float, Field(ge=0)]


class WindowState(_Strict):
    id: OsId
    kind: Literal["surface", "capability", "mcp_app", "legacy_route"]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    presentation: WindowPresentationKind
    surface_id: Optional[OsId] = None
    capability_id: Optional[CapabilityId] = None
    app_id: Optional[OsId] = None
    route: Optional[RoutePath] = None
    session_id: Optional[OsId] = None
    params: Optional[Dict[str, Any]] = None
    bounds: Optional[WindowBounds] = None
    z: Annotated[int, Field(ge=0)]
    state: Literal["normal", "minimized", "maximized"]
    pinned: Optional[bool] = None


class WorkspaceState(_Strict):
    id: OsId
    name: Annotated[str, Field(min_length=1, max_length=120)]
    version: Annotated[int, Field(ge=0)]
    active_session_id: Optional[OsId]
    nav_collapsed: bool
    layout: Literal["free", "tiled", "focus"]
    windows: Annotated[List[WindowState], Field(max_length=24)]
    updated_at: Timestamp


# --------------------------------------------------------------------------- #
# Capability registry
# --------------------------------------------------------------------------- #


class ApiBinding(_Strict):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "WS"]
    path: Annotated[str, Field(max_length=300, pattern=r"^/")]
    stream: Literal["none", "sse", "websocket"]


class CapabilityAction(_Strict):
    id: OsId
    title: Annotated[str, Field(min_length=1, max_length=120)]
    permissions: Annotated[List[Permission], Field(max_length=10)]
    destructive: bool
    requires_confirmation: bool
    input_schema: Dict[str, Any]


class LegacyRouteRenderer(_Strict):
    kind: Literal["legacy_route"]
    route: Annotated[str, Field(max_length=300, pattern=r"^/")]


class ComponentRenderer(_Strict):
    kind: Literal["component"]
    component_key: Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_.]{0,95}$")]


class A2UIRenderer(_Strict):
    kind: Literal["a2ui"]
    catalog_id: Literal["urn:forge:a2ui:catalog:ember:1"]


class MCPAppRenderer(_Strict):
    kind: Literal["mcp_app"]
    app_id: OsId


CapabilityRenderer = Annotated[
    Union[LegacyRouteRenderer, ComponentRenderer, A2UIRenderer, MCPAppRenderer], Field(discriminator="kind")
]


class CapabilityDescriptor(_Strict):
    id: CapabilityId
    version: Annotated[int, Field(ge=1)]
    title: Annotated[str, Field(min_length=1, max_length=120)]
    summary: Annotated[str, Field(min_length=1, max_length=280)]
    category: CapabilityCategory
    intents: Annotated[List[IntentKind], Field(max_length=10)]
    keywords: Annotated[List[Annotated[str, Field(min_length=1, max_length=40)]], Field(max_length=30)]
    permissions: Annotated[List[Permission], Field(max_length=10)]
    requires_project: bool
    admin_only: bool
    min_plan: Optional[Literal["free", "standard", "pro", "enterprise"]]
    entry_points: Annotated[List[EntryPoint], Field(min_length=1, max_length=4)]
    surfaces: Annotated[List[SurfacePresentationKind], Field(min_length=1, max_length=4)]
    default_surface: SurfacePresentationKind
    renderer: CapabilityRenderer
    actions: Annotated[List[CapabilityAction], Field(max_length=30)]
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    api_bindings: Annotated[List[ApiBinding], Field(max_length=40)]
    persistence: PersistenceRule
    legacy_routes: Annotated[List[Annotated[str, Field(max_length=300, pattern=r"^/")]], Field(max_length=20)]
    status: Literal["available", "beta", "deprecated", "hidden"]


class CapabilityCatalog(_Strict):
    version: Annotated[int, Field(ge=1)]
    capabilities: Annotated[List[CapabilityDescriptor], Field(max_length=500)]


class CapabilityIndexEntry(_Strict):
    """Coverage index row: every existing feature/route maps to a capability (docs/os/CAPABILITY_MATRIX.md)."""

    id: CapabilityId
    title: Annotated[str, Field(min_length=1, max_length=120)]
    category: CapabilityCategory
    intents: Annotated[List[IntentKind], Field(max_length=10)]
    default_surface: SurfacePresentationKind
    requires_project: bool
    admin_only: bool
    legacy_routes: Annotated[List[Annotated[str, Field(max_length=300, pattern=r"^/")]], Field(max_length=20)]
    origin: Literal["existing", "existing_backend_only", "new"]
    owner: Literal["WS-A", "WS-B", "WS-C", "WS-D"]


class CapabilityIndex(_Strict):
    version: Annotated[int, Field(ge=1)]
    outside_shell_routes: Annotated[List[Annotated[str, Field(max_length=300)]], Field(max_length=50)]
    capabilities: Annotated[List[CapabilityIndexEntry], Field(max_length=500)]


# Schema ``$defs`` name -> Pydantic type, for tests and the server-side validator.
CONTRACT_MODELS: Dict[str, Any] = {
    "OsEvent": OsEvent,
    "A2UIServerMessage": A2UIServerMessage,
    "A2UIUserAction": A2UIUserAction,
    "IntentResult": IntentResult,
    "PresentationPlan": PresentationPlan,
    "SurfacePlacement": SurfacePlacement,
    "TurnRequest": TurnRequest,
    "TurnAccepted": TurnAccepted,
    "UserActionRequest": UserActionRequest,
    "CapabilityInvocation": CapabilityInvocation,
    "SessionSummary": SessionSummary,
    "SessionMessage": SessionMessage,
    "StoredSurface": StoredSurface,
    "WindowState": WindowState,
    "WorkspaceState": WorkspaceState,
    "CapabilityDescriptor": CapabilityDescriptor,
    "CapabilityCatalog": CapabilityCatalog,
    "CapabilityIndex": CapabilityIndex,
}


# --------------------------------------------------------------------------- #
# JSON Schema validation (reference `jsonschema` library)
# --------------------------------------------------------------------------- #


@lru_cache(maxsize=1)
def load_contract_schema() -> Dict[str, Any]:
    return json.loads(CONTRACTS_SCHEMA_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_catalog() -> Dict[str, Any]:
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    if catalog.get("catalogId") != FORGE_CATALOG_ID:
        raise RuntimeError("Forge Ember catalog id mismatch")
    return catalog


@lru_cache(maxsize=1)
def load_capability_index() -> CapabilityIndex:
    raw = json.loads(CAPABILITY_INDEX_FILE.read_text(encoding="utf-8"))
    return CapabilityIndex.model_validate(raw)


def catalog_component_names() -> List[str]:
    return list(load_catalog()["components"])


@lru_cache(maxsize=64)
def _def_validator(def_name: str):
    from jsonschema import Draft202012Validator

    schema = load_contract_schema()
    if def_name not in schema["$defs"]:
        raise KeyError(f"Unknown contract def {def_name!r}")
    return Draft202012Validator({"$ref": f"#/$defs/{def_name}", "$defs": schema["$defs"]})


@lru_cache(maxsize=128)
def _component_validator(name: str):
    from jsonschema import Draft202012Validator

    catalog = load_catalog()
    return Draft202012Validator({**catalog["components"][name], "$defs": catalog["$defs"]})


def _errors(validator, payload: Any, prefix: str = "") -> List[str]:
    out = []
    for err in validator.iter_errors(payload):
        path = "/".join(str(p) for p in err.absolute_path)
        out.append(f"{prefix}/{path}: {err.message[:300]}")
    return out


def validate_contract(def_name: str, payload: Any) -> List[str]:
    """Return schema errors for ``payload`` against ``$defs/<def_name>`` (empty list = valid)."""
    return _errors(_def_validator(def_name), payload)


def validate_component(component: Any) -> List[str]:
    """Validate one A2UI component against the closed Forge Ember catalog."""
    name = component.get("component") if isinstance(component, dict) else None
    if not isinstance(name, str) or name not in load_catalog()["components"]:
        return [f"/component: {name!r} is not in the Forge catalog"]
    return _errors(_component_validator(name), component)


def validate_a2ui_message(message: Any) -> List[str]:
    """Envelope + catalog validation for one agent->renderer A2UI message."""
    errs = validate_contract("A2UIServerMessage", message)
    if errs:
        return errs
    body = message.get("createSurface") or message.get("updateComponents") or {}
    out: List[str] = []
    for idx, comp in enumerate(body.get("components") or []):
        out.extend(f"/components/{idx}{e}" for e in validate_component(comp))
    return out


def validate_os_event(event: Any) -> List[str]:
    """Envelope validation for a stream event, plus catalog validation of ``a2ui.message`` events."""
    errs = validate_contract("OsEvent", event)
    if errs or not isinstance(event, dict) or event.get("type") != "a2ui.message":
        return errs
    return validate_a2ui_message(event["data"]["message"])
