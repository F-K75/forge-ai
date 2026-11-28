"""One ``CapabilityActionHandler`` per server-side ``(capability_id, action_id)``.

Most handlers are :class:`EndpointHandler`s: they call the existing REST route
function in-process (see ``invoke.py``), so the endpoint's own authorization
(project/initiative access, org roles, ``admin_required`` with MFA, plan and
rate limits) is what decides, exactly as over HTTP. WS-C's registry checks the
descriptor's ``permissions`` first; the endpoint check is the second, binding
layer. A few handlers are composite or deterministic (no LLM): ``build.new``
start, the approvals gate cards, ``data.analyze``, ``models.compare``,
``workflow.design`` and the capability-library search.

Every action declared in ``capabilities.json`` is either here, in
:data:`CLIENT_SIDE_ACTIONS` (the existing UI performs it; secrets and payment
redirects stay out of the session event log) or in :data:`KERNEL_ACTIONS`
(implemented by WS-C itself). ``tests/test_os_capability_handlers.py`` enforces
that partition.

Side channels on ``ActionContext.metadata`` (swap point until the contract
grows a field for them): handlers put the JSON result in ``metadata["result"]``
and, on failure, an ``OsError`` dict in ``metadata["os_error"]``. Handlers read
``metadata["request"]`` (the originating ``Request``), ``metadata["surface_id"]``,
``metadata["surface_data_model"]`` and ``metadata["attachment_loader"]`` when
WS-C provides them.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, FrozenSet, Iterable, List, Optional, Tuple

from core.os_capabilities import approvals, data_analyze, models_compare, workflow
from core.os_capabilities.descriptors import get_descriptor, load_capability_catalog
from core.os_capabilities.invoke import error_outcome, guarded_call, resolve_target
from core.os_capabilities.surfaces import (
    create_surface,
    message_surface,
    new_surface_id,
    placement,
    result_surface,
    update_data_model,
)
from core.os_contracts import ActionContext, ActionOutcome, CapabilityActionHandler

ArgsFn = Callable[[ActionContext, Dict[str, Any]], Dict[str, Any]]
HandlerKey = Tuple[str, str]


def _presentation(capability_id: str) -> str:
    desc = get_descriptor(capability_id)
    return desc.default_surface if desc else "window"


def _title(capability_id: str, action_id: str) -> str:
    desc = get_descriptor(capability_id)
    if not desc:
        return capability_id
    act = next((a for a in desc.actions if a.id == action_id), None)
    return act.title if act else desc.title


def _base_args(ctx: ActionContext, input: Dict[str, Any]) -> Dict[str, Any]:
    args = dict(input or {})
    if ctx.project_id and not args.get("project_id"):
        args["project_id"] = ctx.project_id
    return args


async def require_admin(ctx: ActionContext) -> Optional[ActionOutcome]:
    """``None`` if the caller passes ``api.admin.admin_required``, else the rejection outcome."""
    from api.admin import admin_required

    ok, denied = await guarded_call(admin_required, ctx, {})
    return None if ok else denied


class EndpointHandler:
    """Delegate one capability action to an existing route function."""

    def __init__(
        self,
        capability_id: str,
        action_id: str,
        target: str,
        *,
        args: Optional[ArgsFn] = None,
        render: bool = False,
        list_key: Optional[str] = None,
        message: Optional[str] = None,
        only: Optional[Iterable[str]] = None,
    ) -> None:
        self.capability_id = capability_id
        self.action_id = action_id
        self.target = target
        self.args = args
        self.render = render
        self.list_key = list_key
        self.message = message
        # Allow-list of input keys forwarded to the endpoint (e.g. profile updates
        # must never carry BYOK keys or tokens even if a caller adds them).
        self.only = frozenset(only) if only is not None else None

    def build_args(self, ctx: ActionContext, input: Dict[str, Any]) -> Dict[str, Any]:
        args = _base_args(ctx, input)
        if self.only is not None:
            args = {k: v for k, v in args.items() if k in self.only}
        return self.args(ctx, args) if self.args else args

    async def __call__(self, ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
        desc = get_descriptor(self.capability_id)
        if desc is not None and desc.admin_only:
            # A few routes behind admin-only capabilities (prompt preview/validate, output
            # evaluation, AI-cost analytics) are open to any signed-in user over REST; the
            # capability is admin-only, so apply the same ``admin_required`` gate (admin flag + MFA).
            denied = await require_admin(ctx)
            if denied is not None:
                return denied
        try:
            args = self.build_args(ctx, input)
            func = resolve_target(self.target)
        except Exception as exc:  # noqa: BLE001
            return error_outcome(ctx, exc)
        ok, result = await guarded_call(func, ctx, args)
        if not ok:
            return result
        ctx.metadata["result"] = result
        title = _title(self.capability_id, self.action_id)
        if not self.render:
            return ActionOutcome(status="completed", message=self.message or f"{title}: done.")
        messages, places = result_surface(
            capability_id=self.capability_id, action_id=self.action_id, title=title, result=result,
            presentation=_presentation(self.capability_id), list_key=self.list_key,
        )
        return ActionOutcome(status="completed", message=self.message, a2ui_messages=messages, placements=places)


class FunctionHandler:
    """A handler implemented as an async function ``(ctx, input) -> ActionOutcome``."""

    def __init__(self, capability_id: str, action_id: str, fn: Callable[[ActionContext, Dict[str, Any]], Awaitable[ActionOutcome]]):
        self.capability_id = capability_id
        self.action_id = action_id
        self.fn = fn

    async def __call__(self, ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
        try:
            return await self.fn(ctx, dict(input or {}))
        except Exception as exc:  # noqa: BLE001
            return error_outcome(ctx, exc)


HANDLERS: Dict[HandlerKey, CapabilityActionHandler] = {}


def E(cap: str, action: str, target: str, **kw: Any) -> None:
    HANDLERS[(cap, action)] = EndpointHandler(cap, action, target, **kw)


def F(cap: str, action: str, fn: Callable[[ActionContext, Dict[str, Any]], Awaitable[ActionOutcome]]) -> None:
    HANDLERS[(cap, action)] = FunctionHandler(cap, action, fn)


def wrap(name: str, keys: Iterable[str]) -> ArgsFn:
    """Nest ``keys`` of the input under ``name`` (for endpoints taking ``req: Dict``/``payload``)."""
    keys = tuple(keys)

    def _args(ctx: ActionContext, args: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in args.items() if k not in keys}
        out[name] = {k: args[k] for k in keys if k in args}
        return out

    return _args


def rename(**mapping: str) -> ArgsFn:
    def _args(ctx: ActionContext, args: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(args)
        for new, old in mapping.items():
            if old in out:
                out[new] = out.pop(old)
        return out

    return _args


def fixed(**values: Any) -> ArgsFn:
    def _args(ctx: ActionContext, args: Dict[str, Any]) -> Dict[str, Any]:
        return {**args, **values}

    return _args


# --------------------------------------------------------------------------- generic open


async def _open(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    """Place the capability's own renderer (``surface.placed{capability_id}``); no data is read here.

    The renderer loads its data through the feature's existing endpoints, which
    enforce access, so opening a project-scoped capability for a project the
    caller cannot see shows that page's own "not found" state.
    """
    desc = get_descriptor(ctx.capability_id)
    if desc is None:
        return ActionOutcome(status="rejected", message="Unknown capability")
    # Opening a specific project or initiative first reads it through its own endpoint, so a
    # caller without access gets that endpoint's 404 instead of an empty window.
    project_id = input.get("project_id") or ctx.project_id
    if project_id:
        from api.projects import get_project

        ok, denied = await guarded_call(get_project, ctx, {"project_id": project_id})
        if not ok:
            return denied
    if input.get("initiative_id"):
        from api.initiatives import get_initiative

        ok, denied = await guarded_call(get_initiative, ctx, {"initiative_id": input["initiative_id"]})
        if not ok:
            return denied
    surface_id = new_surface_id(ctx.capability_id, "open")
    ctx.metadata["result"] = {"capability_id": desc.id, "params": input}
    return ActionOutcome(status="completed", placements=[placement(surface_id, desc.default_surface, desc.title, desc.id)])


for _cap in ("projects.manage", "build.workspace", "agents.org", "plan.initiatives"):
    F(_cap, "open", _open)


# --------------------------------------------------------------------------- system
E("system.notifications", "list", "api.growth:list_notifications", render=True, list_key="notifications")
E("system.notifications", "mark_read", "api.growth:mark_read", message="Marked as read.")


async def _library_search(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    """Deterministic capability search (no LLM): token match over title, summary and keywords."""
    query = str(input.get("query") or "").lower().strip()
    category = input.get("category")
    is_admin = bool(getattr(ctx.user, "is_admin", False))
    tokens = [t for t in query.replace(",", " ").split() if t]
    scored = []
    for cap in load_capability_catalog().capabilities:
        if cap.status == "hidden" or (cap.admin_only and not is_admin) or (category and cap.category != category):
            continue
        hay = " ".join([cap.id, cap.title, cap.summary, *cap.keywords]).lower()
        score = sum(3 if t in cap.title.lower() or t in cap.keywords else 1 for t in tokens if t in hay) if tokens else 1
        if score:
            scored.append((score, cap))
    scored.sort(key=lambda sc: (-sc[0], sc[1].title))
    top = [cap for _, cap in scored[:24]]
    ctx.metadata["result"] = {"capabilities": [c.id for c in top]}
    surface_id = new_surface_id(ctx.capability_id, "search")
    children = [f"cap_{i}" for i in range(len(top))]
    components: List[Dict[str, Any]] = [
        {"id": "title", "component": "Heading", "level": 3, "text": f"Capabilities matching “{query}”"[:200] if query else "Everything Forge can do"},
    ]
    if top:
        components.append({"id": "grid", "component": "Row", "children": children, "gap": "sm", "wrap": True})
        components += [{"id": cid, "component": "CapabilityLauncher", "capabilityId": cap.id, "label": cap.title} for cid, cap in zip(children, top)]
        root_children = ["title", "grid"]
    else:
        components.append({"id": "empty", "component": "Callout", "tone": "info", "text": "No capability matches that. Try fewer words."})
        root_children = ["title", "empty"]
    components.insert(0, {"id": "root", "component": "Column", "children": root_children, "gap": "md"})
    return ActionOutcome(status="completed", a2ui_messages=[create_surface(surface_id, components)],
                         placements=[placement(surface_id, _presentation(ctx.capability_id), "Capability library", ctx.capability_id)])


F("system.capability_library", "search", _library_search)


# --------------------------------------------------------------------------- build + projects
E("projects.manage", "list", "api.projects:list_projects", render=True, list_key="projects")
E("projects.manage", "create", "api.projects:create_project", message="Project created.",
  args=lambda ctx, a: {"description": "", **a})
E("projects.manage", "import_repo", "api.repos:import_repo", message="Repository import started.",
  only=("repo_url", "project_name", "branch"))
E("projects.manage", "rename", "api.projects:update_project", message="Project renamed.", only=("project_id", "name"))
E("projects.manage", "delete", "api.projects:delete_project", message="Project deleted.")
E("projects.settings", "update_settings", "api.projects:update_project", message="Project settings saved.",
  only=("project_id", "name", "description", "github_repo", "deployed_url", "template"))


async def _start_build(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    """Create the project (unless one is given) and start its first build, via the existing endpoints."""
    from api.builds import create_build
    from api.projects import create_project

    prompt = str(input.get("prompt") or "").strip()
    project_id = input.get("project_id") or ctx.project_id
    created_project = False
    if not project_id:
        name = (input.get("name") or prompt.split("\n", 1)[0] or "New project")[:200]
        ok, project = await guarded_call(create_project, ctx, {"name": name, "description": prompt[:5000], "template": input.get("template")})
        if not ok:
            return project
        project_id = project["id"]
        created_project = True
    ok, build = await guarded_call(create_build, ctx, {"project_id": project_id, "prompt": prompt, "interactive": bool(input.get("interactive"))})
    if not ok:
        if created_project:
            ctx.metadata["result"] = {"project_id": project_id, "build_id": None}
        return build
    build_id = build.get("id") or build.get("build_id")
    ctx.metadata["result"] = {"project_id": project_id, "build_id": build_id}
    # Open the website-build window group: preview focused, workspace + deploy alongside.
    places = [
        placement(new_surface_id("build.preview", "open"), "window", "Live preview", "build.preview", focus=True),
        placement(new_surface_id("build.workspace", "open"), "window", "Build workspace", "build.workspace", focus=False),
        placement(new_surface_id("build.deploy", "open"), "panel", "Deploy", "build.deploy", focus=False),
    ]
    return ActionOutcome(status="completed", message="Build started.", placements=places)


F("build.new", "start_build", _start_build)
E("build.workspace", "run_build", "api.builds:create_build", message="Build started.", only=("project_id", "prompt", "interactive"))
E("build.workspace", "gate_decision", "api.builds:respond_to_gate", message="Gate answered.")
E("build.debug", "view_logs", "api.builds:get_build", render=True)
E("build.debug", "retry", "api.builds:create_build", message="Build restarted.", only=("project_id", "prompt"))
E("build.deploy", "deploy", "api.deployments:create_deployment", message="Deployment started.")
E("build.deploy", "list", "api.deployments:list_deployments", render=True, list_key="deployments")
E("build.deploy", "redeploy", "api.deployments:redeploy", message="Redeploy started.")
E("build.deploy", "delete", "api.deployments:cancel_deployment", message="Deployment cancelled.")
E("build.deploy", "set_env_vars", "api.deployments:update_env_vars", message="Environment variables updated.")
E("build.deploy", "set_domain", "api.deployments:update_domain", message="Domain updated.")
E("build.history", "list_builds", "api.projects:get_project_builds", render=True, list_key="builds")
E("build.history", "rollback", "api.builds:rollback_build", message="Rolled back.")

# --------------------------------------------------------------------------- fleet + agents
E("fleet.overview", "summary", "api.command_center:get_command_center_summary", render=True, list_key="events")


async def _decide_gate(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    decision = input.get("decision")
    target = {"approve": "api.kernel:approve_kernel_gate", "reject": "api.kernel:reject_kernel_gate"}.get(decision)
    if target is None:
        return ActionOutcome(status="rejected", message="decision must be approve or reject")
    handler = EndpointHandler(ctx.capability_id, ctx.action, target, message=f"Gate {decision}d.")
    return await handler(ctx, {k: v for k, v in input.items() if k != "decision"})


F("fleet.overview", "decide_gate", _decide_gate)

E("agents.org", "route_task", "api.agent_registry:route_request", render=True, list_key="assignments")
E("agents.org", "promote", "api.agent_registry:promote_agent", message="Agent promoted.")
E("agents.org", "retire", "api.agent_registry:retire_agent", message="Agent retired.")
E("agents.org", "change_requests", "api.agent_registry:list_change_requests", render=True)
E("agents.org", "monitoring_findings", "api.agent_registry:list_findings", render=True)
# The existing endpoint stores role / department / display name; model, skills and
# budget from the config form are not persisted by it yet (reported gap).
E("agents.create", "create", "api.agent_registry:create_agent", message="Agent ready.",
  only=("project_id", "role", "department", "display_name"))
E("agents.create", "assign_task", "api.agent_registry:record_task_result", message="Task result recorded.")
E("agents.create", "promote", "api.agent_registry:promote_agent", message="Agent promoted.")

E("agents.kernel_run", "plan", "api.kernel:create_kernel_plan", render=True, list_key="tasks")
E("agents.kernel_run", "start", "api.kernel:start_kernel_run", message="Run started.")
E("agents.kernel_run", "status", "api.kernel:get_kernel_run", render=True, list_key="tasks")
E("agents.kernel_run", "cancel", "api.kernel:cancel_kernel_run", message="Run cancelled.")
E("agents.kernel_run", "approve_gate", "api.kernel:approve_kernel_gate", message="Gate approved.")
E("agents.kernel_run", "reject_gate", "api.kernel:reject_kernel_gate", message="Gate rejected.")

_PRODUCT_LEAD = {
    "why": "api.product_lead:why",
    "what_changed": "api.product_lead:what_changed",
    "what_next": "api.product_lead:what_next",
    "decisions": "api.product_lead:list_decisions",
    "pending": "api.product_lead:list_pending_decisions",
}


async def _product_lead(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    target = _PRODUCT_LEAD.get(str(input.get("kind")))
    if target is None:
        return ActionOutcome(status="rejected", message="Unknown question kind")
    return await EndpointHandler(ctx.capability_id, ctx.action, target, render=True)(
        ctx, {k: v for k, v in input.items() if k != "kind"}
    )


F("agents.product_lead", "ask", _product_lead)
E("agents.memory", "browse", "api.enterprise:get_project_memory_snapshot", render=True)
E("agents.memory", "query", "api.enterprise:query_project_memory", render=True)
E("agents.benchmarks", "run", "api.enterprise:run_project_benchmarks", render=True)
E("agents.benchmarks", "view", "api.enterprise:list_project_benchmarks", render=True)


async def _traces(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    target = "api.enterprise:get_run_trace" if input.get("run_id") else "api.enterprise:list_project_traces"
    return await EndpointHandler(ctx.capability_id, ctx.action, target, render=True)(ctx, input)


F("agents.traces", "view", _traces)
E("agents.workload", "view", "api.workload:get_project_workload", render=True)
E("agents.repo_memory", "view", "api.repo_memory:get_repository_memory", render=True)
E("agents.repo_memory", "edit", "api.repo_memory:update_repository_memory", message="Repository memory updated.")
E("skills.catalog", "browse", "api.skills:list_project_skills", render=True, list_key="skills")
E("skills.catalog", "route_preview", "api.skills:route_skills_for_task", render=True)
E("skills.catalog", "telemetry", "api.skills:get_skill_telemetry", render=True)


# --------------------------------------------------------------------------- workflow.design


def _template(input: Dict[str, Any]) -> Dict[str, Any]:
    return workflow.plan_template(str(input.get("objective") or ""), input.get("nodes") or [], input.get("edges") or [], str(input.get("name") or ""))


async def _workflow_save(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    """Validate the graph and store the kernel plan template in the surface data model (session artifact).

    Project write access is checked by previewing the plan through the existing
    ``POST /kernel/plan`` endpoint (it asserts project access), so a caller who
    cannot see the project cannot save a template for it.
    """
    from api.kernel import create_kernel_plan

    try:
        template = _template(input)
    except workflow.WorkflowError as exc:
        ctx.metadata["os_error"] = {"code": "validation_failed", "message": str(exc), "retryable": False}
        return ActionOutcome(status="rejected", message=str(exc))
    args = _base_args(ctx, {"project_id": input.get("project_id"), "objective": template["objective"], "max_agents": max(1, len(template["tasks"]))})
    ok, plan = await guarded_call(create_kernel_plan, ctx, args)
    if not ok:
        return plan
    template["project_id"] = args["project_id"]
    ctx.metadata["result"] = {"template": template, "plan_preview": plan}
    surface_id = ctx.metadata.get("surface_id")
    messages = [update_data_model(surface_id, "/template", template)] if surface_id else []
    return ActionOutcome(status="completed", message=f"Workflow saved ({len(template['tasks'])} steps).", a2ui_messages=messages)


async def _workflow_run(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    from api.kernel import start_kernel_run

    try:
        template = _template(input)
    except workflow.WorkflowError as exc:
        ctx.metadata["os_error"] = {"code": "validation_failed", "message": str(exc), "retryable": False}
        return ActionOutcome(status="rejected", message=str(exc))
    args = _base_args(ctx, {"project_id": input.get("project_id")})
    args.update({"objective": template["objective"], "tasks": template["tasks"], "max_agents": max(1, len(template["tasks"]))})
    if input.get("max_budget_usd") is not None:
        args["max_budget_usd"] = input["max_budget_usd"]
    ok, run = await guarded_call(start_kernel_run, ctx, args)
    if not ok:
        return run
    ctx.metadata["result"] = {"template": template, "run": run}
    return ActionOutcome(status="completed", message="Workflow run started.",
                         placements=[placement(new_surface_id("agents.kernel_run", "open"), "panel", "Workflow run", "agents.kernel_run")])


F("workflow.design", "save", _workflow_save)
F("workflow.design", "run", _workflow_run)


# --------------------------------------------------------------------------- data


async def _load_dataset(ctx: ActionContext, input: Dict[str, Any]) -> Tuple[Any, Optional[str], Optional[str]]:
    if input.get("content"):
        return input["content"], input.get("format"), input.get("filename")
    attachment_id = input.get("attachment_id")
    loader = ctx.metadata.get("attachment_loader")
    if attachment_id and loader is not None:
        # A caller-supplied ``attachment_loader(attachment_id) -> (bytes, mime_type, filename)``.
        content, mime, filename = await loader(attachment_id)
        fmt = "json" if "json" in (mime or "") else "csv" if mime else input.get("format")
        return content, fmt, filename
    if attachment_id:
        # WS-C's attachment store, always scoped to the caller's user id (foreign ids read as missing).
        from core.database import get_db
        from core.os.attachments import AttachmentRepository

        repo = AttachmentRepository(await get_db())
        doc = await repo.get(ctx.user.id, attachment_id)
        raw = await repo.read_bytes(ctx.user.id, attachment_id) if doc else None
        if raw is not None:
            return raw, doc.get("ext") or input.get("format"), doc.get("name")
    raise data_analyze.DatasetError("Attach a CSV or JSON file (or paste the data) to analyze it.")


async def _analyze(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    try:
        content, fmt, filename = await _load_dataset(ctx, input)
        messages, places, meta = data_analyze.analyze_dataset(
            content, fmt=fmt, filename=filename, x=input.get("x"), y=input.get("y"), chart_kind=input.get("chart_kind"),
            title=input.get("title"), presentation=_presentation("data.analyze"),
        )
    except data_analyze.DatasetError as exc:
        ctx.metadata["os_error"] = {"code": "validation_failed", "message": str(exc), "retryable": False}
        return ActionOutcome(status="rejected", message=str(exc))
    ctx.metadata["result"] = meta
    return ActionOutcome(status="completed", message=meta["summary"], a2ui_messages=messages, placements=places)


async def _change_chart(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    data_model = ctx.metadata.get("surface_data_model")
    surface_id = input.get("surface_id") or ctx.metadata.get("surface_id")
    if not isinstance(data_model, dict) or not surface_id:
        return ActionOutcome(status="rejected", message="This chart's data is no longer available; analyze the file again.")
    try:
        messages = data_analyze.change_chart(surface_id, data_model, chart_kind=input.get("chart_kind"), x=input.get("x"), y=input.get("y"))
    except data_analyze.DatasetError as exc:
        return ActionOutcome(status="rejected", message=str(exc))
    return ActionOutcome(status="completed", message="Chart updated.", a2ui_messages=messages)


F("data.analyze", "analyze", _analyze)
F("data.analyze", "change_chart", _change_chart)
E("data.retrieval", "index", "api.retrieval:index_source", message="Source indexed.")
E("data.retrieval", "search", "api.retrieval:search", render=True)
E("data.retrieval", "delete_source", "api.retrieval:delete_source", message="Source deleted.")


# --------------------------------------------------------------------------- models


async def _compare(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    messages, places, subjects = models_compare.compare_surface(
        models=input.get("models") or [], providers=input.get("providers") or [], query=input.get("query"),
        presentation=_presentation("models.compare"),
    )
    ctx.metadata["result"] = {"models": subjects}
    return ActionOutcome(status="completed", a2ui_messages=messages, placements=places)


F("models.compare", "compare", _compare)
E("models.admin", "view", "api.llm:list_models", render=True, list_key="models")
E("models.admin", "test_provider", "api.llm:test_provider", render=True, args=wrap("request", ("agent", "provider_names", "model", "messages", "max_tokens")))
E("models.admin", "reload", "api.llm:reload_config", message="LLM configuration reloaded.")
E("models.admin", "set_agent_override", "api.llm:set_agent_override", message="Agent override saved.",
  args=wrap("payload", ("provider", "model", "max_tokens_per_request", "max_cost_per_request_usd")))

# --------------------------------------------------------------------------- protocols
E("protocols.hub", "list_tools", "api.protocols:list_mcp_tools", render=True, list_key="tools")
E("protocols.hub", "register_server", "api.protocols:register_external_mcp_server", message="MCP server registered.")
E("protocols.hub", "invoke_tool", "api.protocols:invoke_mcp_tool", render=True)
E("protocols.hub", "a2a_send", "api.protocols:send_a2a_task", render=True)
E("protocols.hub", "a2a_discover", "api.protocols:discover_remote_a2a_agent", render=True)
E("protocols.hub", "view_audit", "api.protocols:get_a2a_audit_log", render=True)

# --------------------------------------------------------------------------- plan
E("plan.initiatives", "list", "api.initiatives:list_initiatives", render=True, list_key="initiatives")
E("plan.initiatives", "credit_preview", "api.initiatives:preview_initiative_credit_cost", render=True)
E("plan.initiatives", "create", "api.initiatives:create_initiative", message="Initiative created; planning has started.")
E("plan.initiative.overview", "view", "api.initiatives:get_initiative", render=True)
E("plan.initiative.overview", "edit_prd", "api.initiatives:update_prd", message="PRD updated.",
  args=wrap("req", ("vision", "product_scope", "business_goals", "functional_requirements", "success_metrics")))
E("plan.initiative.overview", "approve", "api.initiatives:approve_initiative", message="Initiative approved.")
E("plan.initiative.overview", "comment", "api.initiatives:create_prd_comment", message="Comment added.")
# The descriptor marks regenerate requires_confirmation; the endpoint also insists on confirm=true.
E("plan.initiative.overview", "regenerate", "api.initiatives:regenerate_initiative", message="Regeneration started.", args=fixed(confirm=True))
E("plan.initiative.overview", "cancel", "api.initiatives:cancel_initiative", message="Initiative cancelled.")
E("plan.initiative.board", "list_tasks", "api.tasks:list_tasks", render=True, list_key="tasks")
E("plan.initiative.board", "create_task", "api.tasks:create_task", message="Task created.")
E("plan.initiative.board", "update_task", "api.tasks:update_task", message="Task updated.")
E("plan.initiative.board", "change_status", "api.tasks:update_task_status", message="Task moved.")
E("plan.initiative.board", "execute_task", "api.tasks:execute_task_endpoint", message="Task execution started.")
E("plan.initiative.sprints", "list", "api.sprints:list_sprints", render=True, list_key="sprints")
E("plan.initiative.sprints", "update_sprint", "api.sprints:update_sprint", message="Sprint updated.")
E("plan.initiative.sprints", "standup", "api.sprints:generate_standup", render=True)
E("plan.initiative.sprints", "report", "api.sprints:get_sprint_reports", render=True)
E("plan.initiative.agent_runs", "view", "api.agent_executions:list_agent_executions", render=True, list_key="executions")
E("plan.initiative.agent_runs", "standup", "api.sprints:generate_standup", render=True)
E("plan.initiative.roadmap", "view", "api.epics:list_epics", render=True, list_key="epics", only=("initiative_id",))
E("plan.initiative.roadmap", "edit_epic", "api.epics:update_epic", message="Epic updated.")
E("plan.initiative.graph", "diagnostics", "api.initiatives:get_dependency_graph", render=True, list_key="nodes")
E("plan.initiative.releases", "list", "api.releases:list_releases", render=True, list_key="releases")
E("plan.initiative.releases", "generate", "api.releases:generate_release", message="Release generated.")
E("plan.initiative.releases", "edit", "api.releases:update_release", message="Release updated.")
E("plan.initiative.releases", "delete", "api.releases:delete_release", message="Release deleted.")
E("plan.initiative.activity", "open_execution", "api.agent_executions:get_agent_execution", render=True)
E("plan.initiative.integrations", "list", "api.initiatives:list_initiative_integrations", render=True)
E("plan.initiative.integrations", "connect", "api.initiatives:link_initiative_integration", message="Integration connected.")
E("plan.initiative.integrations", "disconnect", "api.initiatives:unlink_initiative_integration", message="Integration disconnected.")
E("plan.initiative.integrations", "sync", "api.initiatives:sync_initiative_integration", message="Sync started.")
E("plan.initiative.analytics", "view", "api.analytics:get_initiative_analytics", render=True)
E("plan.decisions", "list", "api.decision_log:list_project_decisions", render=True, list_key="decisions")
E("plan.decisions", "pending", "api.decision_log:list_pending_decisions", render=True)
E("plan.decisions", "record", "api.decision_log:create_decision", message="Decision recorded.")
E("plan.plans", "list", "api.planning:list_plans", render=True, list_key="plans")
E("plan.plans", "create", "api.planning:create_plan", message="Plan created.")
E("plan.plans", "approve", "api.planning:approve_plan", message="Plan approved.")
E("plan.plans", "reject", "api.planning:reject_plan", message="Plan rejected.")


# --------------------------------------------------------------------------- governance


async def _approvals_list(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    """Pending kernel gates as ``ApprovalCard``s, via the existing (access-checked) endpoints.

    With a ``project_id`` only that project is read (``list_kernel_runs`` asserts
    access and 404s otherwise). Without one, the caller's own projects are listed
    (``list_projects`` is scoped to ``user_id``) and each is read the same way.
    """
    from api.kernel import list_kernel_runs
    from api.projects import list_projects

    project_id = input.get("project_id") or ctx.project_id
    if project_id:
        projects = [{"id": project_id, "name": project_id}]
    else:
        ok, listing = await guarded_call(list_projects, ctx, {"per_page": 100})
        if not ok:
            return listing
        projects = listing.get("projects") or []
    from core.database import get_db
    from core.permissions import can_decide_project_gates

    db = await get_db()
    gates: List[Dict[str, Any]] = []
    for project in projects:
        ok, runs = await guarded_call(list_kernel_runs, ctx, {"project_id": project["id"], "limit": 50})
        if not ok:
            if project_id:
                return runs
            continue
        # Only offer cards the caller may decide (owner, or org owner/admin): members see none.
        doc = await db.projects.find_one({"id": project["id"], "deleted_at": None}, {"_id": 0})
        if not doc or not await can_decide_project_gates(db, ctx.user.id, doc):
            continue
        gates += approvals.pending_gates(runs.get("runs") or [], project["id"], doc.get("name") or project.get("name"))
    ctx.metadata["result"] = {"gates": gates}
    messages, places = approvals.approvals_surface(gates, presentation=_presentation(ctx.capability_id))
    return ActionOutcome(status="completed", a2ui_messages=messages, placements=places)


F("governance.approvals", "list", _approvals_list)
E("governance.approvals", "approve", "api.kernel:approve_kernel_gate", message="Gate approved.")
E("governance.approvals", "reject", "api.kernel:reject_kernel_gate", message="Gate rejected.")
E("governance.approvals", "build_gate", "api.builds:respond_to_gate", message="Gate answered.")
E("governance.policy", "view", "api.enterprise:get_project_governance_policy", render=True)
E("governance.policy", "update", "api.enterprise:update_project_governance_policy", message="Policy updated.")

# --------------------------------------------------------------------------- account
E("marketplace.browse", "browse", "api.marketplace:list_items", render=True, list_key="items")
E("marketplace.browse", "download", "api.marketplace:download_item", message="Downloaded.")
E("marketplace.browse", "rate", "api.marketplace:rate_item", message="Thanks for rating.")
E("marketplace.browse", "publish", "api.marketplace:create_item", message="Published to the marketplace.")
E("account.billing", "view", "api.billing:get_usage", render=True)
E("account.billing", "cancel", "api.billing:cancel_subscription", message="Subscription cancelled.")
E("account.billing", "reactivate", "api.billing:reactivate_subscription", message="Subscription reactivated.")
E("account.billing", "downgrade", "api.billing:downgrade_plan", message="Plan downgraded.")
E("account.profile", "update_profile", "api.auth:update_profile", message="Profile updated.", only=("name", "avatar_url"))
E("account.appearance", "set_theme", "api.auth:update_profile", message="Theme saved.", only=("theme",),
  args=lambda ctx, a: {"preferences": {"theme": a["theme"]}} if "theme" in a else {})
E("account.agent_fleet", "update", "api.auth:update_profile", message="Preferences saved.", only=("preferences",),
  args=lambda ctx, a: {"preferences": {k: v for k, v in (a.get("preferences") or {}).items() if not str(k).startswith("llm_")}})
E("account.api_keys", "list", "api.api_keys:list_api_keys", render=True, list_key="api_keys")
E("account.api_keys", "revoke", "api.api_keys:delete_api_key", message="API key revoked.")
E("account.integrations", "list_webhooks", "api.webhooks:list_webhooks", render=True, list_key="webhooks")
E("account.integrations", "create_webhook", "api.webhooks:create_webhook", message="Webhook created.")
E("account.integrations", "delete_webhook", "api.webhooks:delete_webhook", message="Webhook deleted.")
E("account.notifications", "view", "api.email_prefs:get_preferences", render=True)
E("account.notifications", "update", "api.email_prefs:update_preferences", message="Email preferences saved.")
E("account.security", "list_sessions", "api.auth:list_sessions", render=True)
E("account.security", "revoke_session", "api.auth:revoke_session", message="Session signed out.")
E("account.support", "create", "api.support:create_support_ticket", message="Ticket opened. We'll reply by email.")
E("account.support", "list", "api.support:list_my_support_tickets", render=True, list_key="tickets")
E("account.organization", "list", "api.auth:list_organizations", render=True, list_key="organizations")
E("account.organization", "members", "api.auth:list_members", render=True, list_key="members")
E("account.organization", "create_org", "api.auth:create_organization", message="Organization created.")
E("account.organization", "invite", "api.auth:invite_member", message="Invitation sent.")
E("account.organization", "accept", "api.auth:accept_invitation", message="Invitation accepted.")
E("account.organization", "change_role", "api.auth:update_member_role", message="Role updated.")
E("account.organization", "remove_member", "api.auth:remove_member", message="Member removed.")
E("account.referrals", "create", "api.growth:create_referral", message="Referral sent.")
E("account.referrals", "list", "api.growth:list_referrals", render=True, list_key="referrals")

# --------------------------------------------------------------------------- admin (admin_required: admin flag + MFA)
E("admin.ops", "overview", "api.admin:get_analytics_overview", render=True)
E("admin.ops", "users", "api.admin:list_users", render=True, list_key="users")
E("admin.ops", "credits", "api.admin:adjust_credits", message="Credits adjusted.")
E("admin.ops", "dead_letter_retry", "api.admin:retry_dead_letter_build", message="Build re-queued.")
E("admin.ops", "flags", "api.admin:list_feature_flags", render=True)
E("admin.ops", "set_flag", "api.admin:create_or_update_feature_flag", message="Feature flag saved.")
E("admin.ops", "audit", "api.admin:list_audit_logs", render=True)
E("admin.prompts", "list", "api.prompts:list_templates", render=True)
E("admin.prompts", "create", "api.prompts:create_template", message="Template created.", args=rename(payload="template"))
E("admin.prompts", "update", "api.prompts:update_template", message="Template updated.", args=rename(payload="template"))
E("admin.prompts", "delete", "api.prompts:delete_template", message="Template deleted.")
E("admin.prompts", "preview", "api.prompts:preview_prompt", render=True)
E("admin.prompts", "validate", "api.prompts:validate_prompt", render=True)
E("admin.optimization", "view_breakdown", "api.optimizer:cost_breakdown", render=True)
E("admin.optimization", "list_budgets", "api.budget:list_budget_limits", render=True)
E("admin.optimization", "set_budget", "api.budget:set_budget_limit", message="Budget saved.", args=rename(payload="limit"))
E("admin.optimization", "remove_budget", "api.budget:delete_budget_limit", message="Budget removed.")
E("admin.health", "view_metrics", "api.admin:get_engineering_health", render=True)
E("admin.health", "rollback_prompt_version", "api.engineering:rollback_version", message="Prompt version rolled back.")
E("admin.health", "evaluate", "api.engineering:evaluate_output", render=True, args=rename(req="request"))

_ANALYTICS = {
    "funnel": "api.analytics:get_funnel_metrics",
    "retention": "api.analytics:get_retention_metrics",
    "conversion": "api.analytics:get_conversion_metrics",
    "churn": "api.analytics:get_churn_metrics",
    "ai-cost": "api.analytics:get_ai_cost_data",
    "revenue": "api.analytics:get_revenue",
    "onboarding": "api.analytics:get_onboarding_metrics",
}


async def _admin_analytics(ctx: ActionContext, input: Dict[str, Any]) -> ActionOutcome:
    denied = await require_admin(ctx)
    if denied is not None:
        return denied
    target = _ANALYTICS.get(str(input.get("metric")))
    if target is None:
        return ActionOutcome(status="rejected", message="Unknown metric")
    return await EndpointHandler(ctx.capability_id, ctx.action, target, render=True)(ctx, {k: v for k, v in input.items() if k != "metric"})


F("admin.analytics", "view", _admin_analytics)


# --------------------------------------------------------------------------- actions handled elsewhere

#: Performed by the existing UI (renderers/composites) with the feature's own API
#: client. Kept off the server action path because they are purely local
#: (tabs, orbit, copy), stream or download a file, hand out a secret once
#: (API key creation, MFA setup), take credentials (BYOK keys, passwords,
#: GitHub tokens), redirect to a payment provider, or talk to the external
#: review orchestrator, which has no backend route in this repository.
CLIENT_SIDE_ACTIONS: FrozenSet[HandlerKey] = frozenset({
    ("system.capability_library", "open"), ("system.capability_library", "pin"),
    ("build.new", "describe"),
    ("build.preview", "refresh"), ("build.preview", "open_in_tab"),
    ("build.code", "open_file"), ("build.code", "copy"),
    ("build.deploy", "push_github"),
    ("build.files", "browse"), ("build.files", "open"), ("build.files", "download"),
    ("build.history", "compare"),
    ("studio.spatial", "orbit"), ("studio.spatial", "change_finish"),
    ("fleet.overview", "open_run"),
    ("fleet.agent_graph", "focus_agent"),
    ("agents.traces", "export"),
    ("workflow.design", "add_node"), ("workflow.design", "connect_nodes"),
    ("data.analyze", "filter"), ("data.analyze", "sort"), ("data.analyze", "export"),
    ("models.compare", "pin_model"),
    ("protocols.mcp_app", "open"), ("protocols.mcp_app", "resize"),
    ("plan.initiative.overview", "export"),
    ("plan.initiative.graph", "filter"), ("plan.initiative.graph", "inspect_node"),
    ("plan.initiative.activity", "filter_feed"),
    ("reviews.board", "list"), ("reviews.board", "start_review"), ("reviews.detail", "view"),
    ("account.billing", "checkout"), ("account.billing", "portal"), ("account.billing", "buy_credits"),
    ("account.settings", "switch_tab"),
    ("account.byok_models", "set_provider"),
    ("account.api_keys", "create"),
    ("account.integrations", "connect"),
    ("account.security", "mfa_setup"), ("account.security", "mfa_verify"), ("account.security", "mfa_disable"),
    ("account.security", "revoke_all_sessions"), ("account.security", "change_password"),
    ("account.privacy", "export"), ("account.privacy", "delete"),
    ("admin.ops", "export_users"),
})

#: Implemented by WS-C's kernel itself (turn executor and sessions API).
KERNEL_ACTIONS: FrozenSet[HandlerKey] = frozenset({
    ("chat.answer", "answer"),
    ("system.sessions", "list"), ("system.sessions", "open"), ("system.sessions", "rename"),
    ("system.sessions", "pin"), ("system.sessions", "archive"), ("system.sessions", "delete"),
})


def get_handler(capability_id: str, action_id: str) -> Optional[CapabilityActionHandler]:
    return HANDLERS.get((capability_id, action_id))


def register_all(register: Callable[[str, str, CapabilityActionHandler], Any]) -> int:
    """Register every handler with WS-C's registry: ``register(capability_id, action_id, handler)``.

    Swap point: WS-C's ``core/os/capability_registry.py`` calls this at startup
    (or imports :data:`HANDLERS` directly). Returns the number registered.
    """
    for (cap, action), handler in HANDLERS.items():
        register(cap, action, handler)
    return len(HANDLERS)


# Deterministic surface builders exposed for WS-C's no-LLM templates.
SURFACE_BUILDERS = {
    "data.analyze": data_analyze.analyze_dataset,
    "models.compare": models_compare.compare_surface,
    "governance.approvals": approvals.approvals_surface,
    "message": message_surface,
}
