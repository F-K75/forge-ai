"""Server-side capability registry for the Forge OS.

Loads full ``CapabilityDescriptor``s from ``core/os_schemas/capabilities.json``
(WS-D content, synced from ``shared/os-schemas/``) when it exists, and fills
every capability-index row that has no descriptor with a conservative
synthesized one, so all 71 capabilities are always reachable. Invalid
descriptors are dropped (and logged), never served.

The registry is also the single authorisation path for capability actions:
palette / library invocations (``POST /v1/os/capabilities/{id}/invoke``) and
clicks on generated surfaces (``POST /v1/os/sessions/{id}/actions``) both end
in :meth:`CapabilityRegistry.invoke`, which re-checks visibility, the
capability's and the action's permissions, project access and the action's
``input_schema`` before calling a handler registered by WS-D.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Iterable, List, Optional, Tuple

from pydantic import ValidationError

from core.os.common import OsHTTPError, not_found
from core.os_contracts import (
    SCHEMA_DIR,
    ActionContext,
    ActionOutcome,
    CapabilityActionHandler,
    CapabilityDescriptor,
    load_capability_index,
)

logger = logging.getLogger(__name__)

CAPABILITIES_FILE = SCHEMA_DIR / "capabilities.json"
CATALOG_VERSION = 1
MAX_ACTION_INPUT_BYTES = 64 * 1024
# Reserved input key: the client's explicit confirmation of a
# ``requires_confirmation`` action (set only after its confirm dialog).
CONFIRM_KEY = "_confirmed"

PLAN_ORDER = {"free": 0, "standard": 1, "pro": 2, "enterprise": 3}
PROJECT_PERMISSIONS = {"project:read", "project:write", "kernel:run", "kernel:approve", "deploy", "mcp:invoke"}
_WRITE_ROLES = ("owner", "admin", "member")

# Keywords per capability: used for synthesized descriptors (palette search)
# and by the deterministic intent classifier when a descriptor has none.
FALLBACK_KEYWORDS: Dict[str, List[str]] = {
    "chat.answer": ["chat", "question", "explain", "joke", "tell me", "what is", "how do"],
    "system.capability_library": ["what can you do", "capabilities", "show me everything", "library", "features"],
    "system.sessions": ["past conversations", "history", "previous sessions", "conversations", "chat history"],
    "system.notifications": ["notifications", "notification", "alerts", "inbox"],
    "build.new": ["build me", "new build", "create a website", "make a site", "landing page", "web app", "launch"],
    "build.workspace": ["workspace", "continue building", "open the workspace", "build workspace"],
    "build.preview": ["preview", "live preview", "see the site"],
    "build.code": ["show me the code", "code", "diff", "generated files", "source"],
    "build.debug": ["why did the build fail", "build failed", "debug", "build logs", "console"],
    "build.deploy": ["deploy it", "deploy", "publish", "custom domain", "env vars", "what's the url", "go live"],
    "build.files": ["project files", "files", "file tree"],
    "build.history": ["build history", "roll back", "rollback", "previous version", "versions"],
    "projects.manage": ["my projects", "projects", "import my repo", "import repo", "delete project", "new project"],
    "projects.settings": ["project settings", "project integrations", "configure project"],
    "studio.spatial": ["3d studio", "3d", "spatial", "studio"],
    "fleet.overview": ["how are my agents doing", "what's running", "fleet", "command center", "dashboard"],
    "fleet.agent_graph": ["fleet graph", "agent graph", "agent fleet graph"],
    "agents.org": ["engineering org", "org chart", "project agents", "agent org", "flow"],
    "agents.create": ["create an agent", "new agent", "configure an agent", "agent that", "set up an agent"],
    "agents.kernel_run": ["run the agents", "kernel run", "run status", "progress of run", "execution timeline"],
    "agents.product_lead": ["why did we build", "what changed", "what's next", "product lead"],
    "agents.memory": ["agents remember", "episodic memory", "knowledge memory", "what do the agents know"],
    "agents.benchmarks": ["benchmark", "benchmarks", "regression gate", "benchmark suite"],
    "agents.traces": ["trace", "traces", "spans", "run trace"],
    "agents.workload": ["overloaded", "workload", "agent workload", "who is busy"],
    "agents.repo_memory": ["repo memory", "know about this repo", "repository memory"],
    "skills.catalog": ["skills", "skill", "which skill", "agent skills"],
    "workflow.design": ["workflow", "pipeline", "design a workflow", "onboarding workflow", "process flow"],
    "data.analyze": ["chart", "analyze", "analyse", "dataset", "csv", "plot", "graph", "visualize", "spreadsheet"],
    "data.retrieval": ["index these docs", "knowledge base", "retrieval", "search the docs", "semantic search"],
    "models.compare": ["compare models", "compare", "versus", "vs", "which model", "model comparison"],
    "models.admin": ["llm providers", "manage llm", "llm management", "provider keys", "model overrides"],
    "protocols.hub": ["mcp servers", "mcp", "a2a", "protocols", "agent card", "register an mcp server"],
    "protocols.mcp_app": ["mcp app", "open the app", "run an mcp app"],
    "plan.initiatives": ["initiative", "initiatives", "plan a new initiative", "new initiative"],
    "plan.initiative.overview": ["prd", "initiative overview", "product requirements"],
    "plan.initiative.board": ["kanban", "board", "move tasks", "task board"],
    "plan.initiative.sprints": ["sprint", "sprints", "standup", "sprint report", "next sprint"],
    "plan.initiative.agent_runs": ["pm agents", "agent runs", "what did the pm agents do"],
    "plan.initiative.roadmap": ["roadmap", "milestones", "epics", "timeline"],
    "plan.initiative.graph": ["dependencies", "dependency graph", "show dependencies"],
    "plan.initiative.releases": ["release notes", "releases", "generate release notes"],
    "plan.initiative.activity": ["activity", "what happened", "decision feed", "activity feed"],
    "plan.initiative.integrations": ["jira", "linear", "sync with", "github sync", "initiative integrations"],
    "plan.initiative.analytics": ["initiative analytics", "trending", "burndown", "velocity"],
    "plan.decisions": ["decision log", "decisions", "record a decision"],
    "plan.plans": ["execution plans", "pending plans", "approve plan"],
    "governance.approvals": ["approve", "approval", "approvals", "needs my approval", "gate", "reject"],
    "governance.policy": ["policy", "governance", "who may use", "tenant policy"],
    "reviews.board": ["review my pr", "reviews", "code review", "pull request", "review board"],
    "reviews.detail": ["review run", "show review", "review findings"],
    "marketplace.browse": ["marketplace", "template", "templates", "playbook", "publish a template"],
    "account.billing": ["billing", "plan am i on", "buy credits", "upgrade", "credits", "invoice", "subscription"],
    "account.settings": ["settings", "open settings", "preferences"],
    "account.profile": ["profile", "change my name", "avatar"],
    "account.appearance": ["light mode", "dark mode", "theme", "appearance", "density"],
    "account.byok_models": ["own key", "bring your own key", "byok", "my api key", "my anthropic key", "my openai key"],
    "account.agent_fleet": ["agent fleet preferences", "fleet preferences"],
    "account.api_keys": ["api key", "api keys", "developer key", "create an api key"],
    "account.integrations": ["webhook", "webhooks", "connect github", "integrations"],
    "account.notifications": ["stop emailing me", "email preferences", "email notifications", "unsubscribe"],
    "account.security": ["2fa", "mfa", "two factor", "password", "sign out other sessions", "security"],
    "account.privacy": ["export my data", "delete my account", "privacy", "gdpr"],
    "account.support": ["i need help", "support", "ticket", "help"],
    "account.organization": ["invite a teammate", "organization", "org members", "team members", "invite"],
    "account.referrals": ["refer a friend", "referral", "referrals"],
    "admin.ops": ["admin overview", "admin", "users", "fraud", "feature flags", "audit"],
    "admin.prompts": ["prompt studio", "prompt template", "planner prompt"],
    "admin.optimization": ["ai spend", "spend", "budgets", "optimization", "cost dashboard"],
    "admin.health": ["engineering health", "health metrics"],
    "admin.analytics": ["funnel", "retention", "churn", "product analytics", "conversion"],
}


def _plan_value(user: Any) -> str:
    plan = getattr(user, "plan", "free")
    return getattr(plan, "value", plan) or "free"


def is_admin(user: Any) -> bool:
    # Same bar as api/admin.py `admin_required`: admin flag AND MFA (SEC-007).
    return bool(getattr(user, "is_admin", False) and getattr(user, "mfa_enabled", False))


def _synthesize(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Conservative descriptor for an index row WS-D has not described yet."""
    if entry["admin_only"]:
        permissions = ["admin"]
    elif entry["requires_project"]:
        permissions = ["project:read"]
    else:
        permissions = ["authenticated"]
    routes = list(entry.get("legacy_routes") or [])
    if routes:
        plain = [r for r in routes if ":" not in r]
        renderer: Dict[str, Any] = {"kind": "legacy_route", "route": (plain or routes)[0]}
    else:
        renderer = {"kind": "component", "component_key": entry["id"]}
    entry_points = ["prompt", "palette", "library"] + (["deeplink"] if routes else [])
    keywords = [k[:40] for k in FALLBACK_KEYWORDS.get(entry["id"], [])][:30]
    return {
        "id": entry["id"],
        "version": 1,
        "title": entry["title"],
        "summary": entry["title"][:280],
        "category": entry["category"],
        "intents": list(entry["intents"]),
        "keywords": keywords,
        "permissions": permissions,
        "requires_project": entry["requires_project"],
        "admin_only": entry["admin_only"],
        "min_plan": None,
        "entry_points": entry_points,
        "surfaces": [entry["default_surface"]],
        "default_surface": entry["default_surface"],
        "renderer": renderer,
        "actions": [],
        "input_schema": {"type": "object"},
        "output_schema": {"type": "object"},
        "api_bindings": [],
        "persistence": "session" if entry.get("origin") == "new" else "server",
        "legacy_routes": routes,
        "status": "available",
    }


def _validate_descriptor(raw: Any) -> Optional[Dict[str, Any]]:
    try:
        return CapabilityDescriptor.model_validate(raw).model_dump(mode="json")
    except ValidationError as exc:
        logger.warning("Dropping invalid capability descriptor %r: %s", (raw or {}).get("id") if isinstance(raw, dict) else raw, exc.errors()[:3])
        return None


def load_descriptor_file(path=CAPABILITIES_FILE) -> List[Dict[str, Any]]:
    """Read WS-D's ``capabilities.json`` (``CapabilityCatalog`` or a bare list); missing file = none."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError):
        logger.exception("capabilities.json is unreadable; using the capability index only")
        return []
    items = raw.get("capabilities") if isinstance(raw, dict) else raw
    return list(items) if isinstance(items, list) else []


def _json_schema_errors(schema: Dict[str, Any], payload: Any) -> List[str]:
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import SchemaError

    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError:
        # A broken schema in the descriptor must fail closed, not open.
        return ["action input schema is invalid"]
    errors = []
    for err in Draft202012Validator(schema).iter_errors(payload):
        path = "/".join(str(p) for p in err.absolute_path)
        errors.append(f"/{path}: {err.message[:200]}")
        if len(errors) >= 10:
            break
    return errors


class CapabilityRegistry:
    def __init__(self, descriptors: Iterable[Dict[str, Any]], *, index_ids: Optional[Iterable[str]] = None):
        self._caps: Dict[str, Dict[str, Any]] = {}
        for d in descriptors:
            self._caps[d["id"]] = d
        self._index_ids = list(index_ids or self._caps)
        self._handlers: Dict[Tuple[str, str], CapabilityActionHandler] = {}
        self.synthesized: set = set()

    @classmethod
    def load(cls, descriptor_path=CAPABILITIES_FILE) -> "CapabilityRegistry":
        index = load_capability_index()
        described: Dict[str, Dict[str, Any]] = {}
        for raw in load_descriptor_file(descriptor_path):
            d = _validate_descriptor(raw)
            if d is not None:
                described[d["id"]] = d
        merged: List[Dict[str, Any]] = []
        synthesized = set()
        for entry in index.capabilities:
            row = entry.model_dump(mode="json")
            if row["id"] in described:
                merged.append(described.pop(row["id"]))
            else:
                synth = _validate_descriptor(_synthesize(row))
                if synth is not None:
                    merged.append(synth)
                    synthesized.add(row["id"])
        merged.extend(described.values())  # descriptors beyond the index (new capabilities)
        reg = cls(merged, index_ids=[e.id for e in index.capabilities])
        reg.synthesized = synthesized
        return reg

    # -- lookup ------------------------------------------------------------- #

    def get(self, capability_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not capability_id:
            return None
        return self._caps.get(capability_id)

    def all(self) -> List[Dict[str, Any]]:
        return list(self._caps.values())

    def ids(self) -> List[str]:
        return list(self._caps)

    def keywords(self, capability_id: str) -> List[str]:
        d = self._caps.get(capability_id) or {}
        return [k.lower() for k in (d.get("keywords") or [])] or FALLBACK_KEYWORDS.get(capability_id, [])

    def by_intent(self, intent: str) -> List[Dict[str, Any]]:
        return [d for d in self._caps.values() if intent in d.get("intents", [])]

    @staticmethod
    def find_action(desc: Dict[str, Any], action_id: str) -> Optional[Dict[str, Any]]:
        for a in desc.get("actions") or []:
            if a["id"] == action_id:
                return a
        return None

    def resolve_action_name(self, name: str) -> Optional[Tuple[str, str]]:
        """Map an A2UI ``action.name`` (``<capability_id>.<action_id>``) to a registered pair.

        Capability ids contain dots, so the longest registered capability
        prefix wins; the remainder must be one of its declared actions.
        """
        parts = name.split(".")
        for cut in range(len(parts) - 1, 1, -1):
            cap_id, action_id = ".".join(parts[:cut]), ".".join(parts[cut:])
            desc = self._caps.get(cap_id)
            if desc and self.find_action(desc, action_id):
                return cap_id, action_id
        return None

    # -- visibility & authorisation ---------------------------------------- #

    def is_visible(self, user: Any, desc: Dict[str, Any]) -> bool:
        if desc.get("status") == "hidden":
            return False
        if desc.get("admin_only") or "admin" in (desc.get("permissions") or []):
            if not is_admin(user):
                return False
        min_plan = desc.get("min_plan")
        if min_plan and not is_admin(user):
            if PLAN_ORDER.get(_plan_value(user), 0) < PLAN_ORDER.get(min_plan, 0):
                return False
        return True

    def catalog_for(self, user: Any) -> Dict[str, Any]:
        """``CapabilityCatalog`` filtered by admin flag, plan and status (project perms are checked on use)."""
        return {"version": CATALOG_VERSION, "capabilities": [d for d in self._caps.values() if self.is_visible(user, d)]}

    async def check_permissions(
        self, db, user: Any, permissions: Iterable[str], *, project: Optional[Dict[str, Any]] = None, org_id: Optional[str] = None
    ) -> Optional[str]:
        """Return ``None`` when allowed, else a short reason. Never raises."""
        from core.permissions import can_decide_project_gates, has_project_access

        perms = set(permissions or [])
        if "admin" in perms and not is_admin(user):
            return "admin access required"
        needs_project = perms & PROJECT_PERMISSIONS
        if needs_project:
            if project is None:
                return "project required"
            if not await has_project_access(db, user.id, project):
                return "project not found"
            if needs_project & {"project:write", "kernel:run", "deploy"} and project.get("user_id") != user.id:
                membership = await db.team_members.find_one(
                    {"org_id": project.get("org_id"), "user_id": user.id}, {"_id": 0}
                )
                role = (membership or {}).get("role")
                role = getattr(role, "value", role)
                if role not in _WRITE_ROLES:
                    return "write access required"
            if "kernel:approve" in perms and not await can_decide_project_gates(db, user.id, project):
                return "gate approval not permitted"
        if "org:manage" in perms:
            if not org_id:
                return "organization required"
            membership = await db.team_members.find_one({"org_id": org_id, "user_id": user.id}, {"_id": 0})
            role = getattr((membership or {}).get("role"), "value", (membership or {}).get("role"))
            if role not in ("owner", "admin"):
                return "organization admin required"
        return None

    # -- handlers ----------------------------------------------------------- #

    def register_action_handler(self, capability_id: str, action_id: str, handler: CapabilityActionHandler) -> None:
        """WS-D registers one handler per declared ``(capability, action)``."""
        desc = self._caps.get(capability_id)
        if desc is None or self.find_action(desc, action_id) is None:
            raise KeyError(f"{capability_id}.{action_id} is not a declared capability action")
        self._handlers[(capability_id, action_id)] = handler

    def get_handler(self, capability_id: str, action_id: str) -> Optional[CapabilityActionHandler]:
        return self._handlers.get((capability_id, action_id))

    async def invoke(
        self,
        db,
        *,
        user: Any,
        capability_id: str,
        action_id: str,
        input: Dict[str, Any],
        emit,
        session_id: Optional[str] = None,
        turn_id: Optional[str] = None,
        project: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ActionOutcome:
        """Authorise and run one capability action. Raises ``OsHTTPError`` on refusal."""
        desc = self.get(capability_id)
        if desc is None or not self.is_visible(user, desc):
            raise not_found("Capability not found")
        action = self.find_action(desc, action_id)
        if action is None:
            raise not_found("Action not found")
        if not isinstance(input, dict):
            raise OsHTTPError(422, "validation_failed", "Action input must be an object")
        if len(json.dumps(input, default=str)) > MAX_ACTION_INPUT_BYTES:
            raise OsHTTPError(413, "validation_failed", "Action input is too large")
        payload = dict(input)
        confirmed = payload.pop(CONFIRM_KEY, False) is True
        errors = _json_schema_errors(action.get("input_schema") or {"type": "object"}, payload)
        if errors:
            raise OsHTTPError(422, "validation_failed", "Action input failed validation", extra={"errors": errors})
        if action.get("requires_confirmation") and not confirmed:
            raise OsHTTPError(409, "conflict", "This action requires explicit confirmation")
        perms = list(desc.get("permissions") or []) + list(action.get("permissions") or [])
        if desc.get("requires_project") and project is None:
            raise OsHTTPError(422, "validation_failed", "This capability needs a project")
        reason = await self.check_permissions(db, user, perms, project=project, org_id=payload.get("org_id"))
        if reason == "project not found":
            raise not_found("Project not found")
        if reason:
            raise OsHTTPError(403, "forbidden", f"Not permitted: {reason}")
        handler = self.get_handler(capability_id, action_id)
        if handler is None:
            return ActionOutcome(status="rejected", message="This action is not available yet.")
        ctx = ActionContext(
            user=user,
            capability_id=capability_id,
            action=action_id,
            session_id=session_id,
            turn_id=turn_id,
            project_id=(project or {}).get("id"),
            emit=emit,
            metadata=dict(metadata or {}),
        )
        try:
            outcome = await handler(ctx, payload)
        except OsHTTPError:
            raise
        except Exception:
            logger.exception("Capability action %s.%s failed", capability_id, action_id)
            return ActionOutcome(status="failed", message="The action failed.")
        if not isinstance(outcome, ActionOutcome):
            return ActionOutcome(status="failed", message="The action returned an invalid result.")
        return outcome


_registry: Optional[CapabilityRegistry] = None


def get_capability_registry() -> CapabilityRegistry:
    global _registry
    if _registry is None:
        _registry = CapabilityRegistry.load()
    return _registry
