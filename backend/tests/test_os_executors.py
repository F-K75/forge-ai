"""WS-C: executors -- surface builders (no-key templates), validation fallback, kernel bridge,
plan approval, legacy a2ui adapter, MCP Apps."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from core.os import executors
from core.os.capability_registry import CapabilityRegistry
from core.os.common import OsHTTPError
from core.os.executors import StepFailed, TurnCtx, execute_step
from core.os.legacy_a2ui import legacy_surface_to_messages
from core.os.models_catalog import resolve_selection
from core.os.planner import StepSpec
from core.os.runtime import OsRuntime
from core.os.surface_validation import sanitize_a2ui_message
from core.os_contracts import validate_os_event
from tests.os_fakes import indexed_db, make_user

CSV = b"Region,Revenue\nNorth,100\nSouth,50\nNorth,25\n"


async def _bytes(data):
    yield data


class FakeBroker:
    def __init__(self, events):
        self.events = events
        self.subscribed = []

    async def subscribe(self, run_id, after_event_id=0, heartbeat_seconds=15.0):
        self.subscribed.append(run_id)
        for ev in self.events:
            yield ev


class FakeRunner:
    def __init__(self):
        self.calls = []

    async def start(self, *, user, project, objective):
        self.calls.append((user.id, project["id"], objective))
        return "krun_new1"


@pytest.fixture
async def env():
    db = await indexed_db()
    db["projects"].docs.append({"id": "proj_a", "user_id": "alice", "org_id": None, "deleted_at": None})
    db["projects"].docs.append({"id": "proj_m", "user_id": "mallory", "org_id": None, "deleted_at": None})
    ev = SimpleNamespace
    broker = FakeBroker([
        ev(agui_type="STEP_STARTED", kernel_event="kernel_wave_started", project_id="proj_a", payload={"wave_index": 1}),
        ev(agui_type="HEARTBEAT", kernel_event="heartbeat", project_id="", payload={}),
        ev(agui_type="RUN_FINISHED", kernel_event="kernel_run_completed", project_id="proj_a", payload={"big": "x" * 40000}),
    ])
    runner = FakeRunner()
    rt = OsRuntime(db, registry=CapabilityRegistry.load(), agui_broker_getter=lambda: broker, kernel_runner=runner,
                   gateway_getter=lambda: SimpleNamespace(list_providers=lambda: []))
    session = await rt.sessions.create(user_id="alice", title="t")
    await rt.turns.create({"id": "turn_1", "session_id": session["id"], "user_id": "alice", "client_turn_id": "c1",
                           "status": "running", "steps": []})
    return SimpleNamespace(rt=rt, db=db, session=session, broker=broker, runner=runner)


def _ctx(env, project=None, attachments=None, user=None):
    return TurnCtx(rt=env.rt, user=user or make_user("alice"), session=env.session, turn_id="turn_1", prompt="p",
                   project=project, attachments=attachments or [], model=resolve_selection(make_user(), None))


def _step(kind, cap, presentation="window", **params):
    return StepSpec(id="s1", kind=kind, title=f"Show {cap}", capability_id=cap, requires_approval=False,
                    presentation=presentation, size_hint="large", window_id=f"win_{cap}", params=params)


async def _events(env):
    evs = await env.rt.events.log.read_after(env.session["id"], "alice", 0)
    for e in evs:
        assert validate_os_event(e) == []
    return evs


async def test_data_analyze_builds_chart_table_filter_from_owned_dataset(env):
    doc = await env.rt.attachments.store(user_id="alice", filename="sales.csv", declared_mime="text/csv", stream=_bytes(CSV))
    await execute_step(_ctx(env), _step("render_surface", "data.analyze", attachment_id=doc["id"]))
    evs = await _events(env)
    assert [e["type"] for e in evs] == ["a2ui.message", "surface.placed"]
    comps = {c["id"]: c for c in evs[0]["data"]["message"]["createSurface"]["components"]}
    assert {"chart", "table", "filters"} <= set(comps)
    dm = evs[0]["data"]["message"]["createSurface"]["dataModel"]
    assert dm["chart"] == [{"region": "North", "revenue": 125}, {"region": "South", "revenue": 50}]
    placement = evs[1]["data"]["placement"]
    assert placement["capability_id"] == "data.analyze" and placement["presentation"] == "window"
    snap = await env.rt.surfaces.list("alice", env.session["id"])
    assert snap and snap[0]["data_model"]["rows"][0]["region"] == "North"


async def test_data_analyze_ignores_someone_elses_attachment(env):
    doc = await env.rt.attachments.store(user_id="mallory", filename="secret.csv", declared_mime="text/csv", stream=_bytes(CSV))
    await execute_step(_ctx(env), _step("render_surface", "data.analyze", attachment_id=doc["id"]))
    evs = await _events(env)
    text = str(evs[0]["data"]["message"])
    assert "North" not in text and "Attach a CSV" in text


async def test_invalid_builder_output_falls_back_to_text_surface(env, monkeypatch):
    async def evil(ctx, step):
        return [{"version": "1.0", "createSurface": {"surfaceId": "srf_evil", "catalogId": "urn:forge:a2ui:catalog:ember:1",
                 "components": [{"id": "root", "component": "Html", "html": "<script>x</script>"}]}}], "Evil"

    monkeypatch.setitem(executors.SURFACE_BUILDERS, "models.compare", evil)
    await execute_step(_ctx(env), _step("render_surface", "models.compare"))
    evs = await _events(env)
    msg = evs[0]["data"]["message"]["createSurface"]
    assert msg["surfaceId"] != "srf_evil" and "script" not in str(msg)
    assert "couldn't display" in str(msg)
    assert evs[1]["data"]["placement"]["surface_id"] == msg["surfaceId"]


@pytest.mark.parametrize("cap", ["models.compare", "agents.create", "workflow.design", "governance.approvals"])
async def test_no_key_builders_emit_valid_surfaces(env, cap):
    await execute_step(_ctx(env, project={"id": "proj_a", "user_id": "alice"}), _step("render_surface", cap, models=["claude", "gpt"]))
    evs = await _events(env)
    assert [e["type"] for e in evs] == ["a2ui.message", "surface.placed"]
    names = {c["component"] for c in evs[0]["data"]["message"]["createSurface"]["components"]}
    expected = {"models.compare": "ComparisonTable", "agents.create": "AgentConfigForm",
                "workflow.design": "WorkflowCanvas", "governance.approvals": "Callout"}[cap]
    assert expected in names


async def test_approvals_lists_pending_gates_only_for_decidable_projects(env):
    env.db["kernel_runs"].docs.extend([
        {"id": "krun_a", "project_id": "proj_a", "status": "waiting_approval",
         "approval_gates": [{"gate_id": "gate_1", "gate_name": "pre_delivery_approval", "status": "pending", "reason": "ship?"}]},
        {"id": "krun_m", "project_id": "proj_m", "status": "waiting_approval",
         "approval_gates": [{"gate_id": "gate_m", "gate_name": "secret", "status": "pending"}]},
    ])
    await execute_step(_ctx(env), _step("render_surface", "governance.approvals", presentation="inline"))
    msg = (await _events(env))[0]["data"]["message"]
    cards = [c for c in msg["createSurface"]["components"] if c["component"] == "ApprovalCard"]
    assert [c["gateId"] for c in cards] == ["gate_1"]
    assert cards[0]["approve"]["event"]["context"] == {"project_id": "proj_a", "run_id": "krun_a", "gate_id": "gate_1"}


async def test_respond_text_without_provider_fails_llm_unavailable(env):
    with pytest.raises(StepFailed) as exc:
        await execute_step(_ctx(env), StepSpec(id="s1", kind="respond_text", title="Answer", capability_id=None, requires_approval=False))
    assert exc.value.code == "llm_unavailable" and exc.value.retryable is False


async def test_monitor_run_bridges_kernel_events_into_the_log(env):
    env.db["kernel_runs"].docs.append({"id": "krun_42", "project_id": "proj_a", "status": "running", "objective": "x",
                                       "tasks": [], "approval_gates": []})
    await execute_step(_ctx(env), _step("run_agent", "agents.kernel_run", presentation="panel", run_id="42", mode="monitor"))
    await asyncio.wait_for(asyncio.gather(*env.rt.bridges.values()), 2)
    evs = await _events(env)
    progress = [e for e in evs if e["type"] == "agent.progress"]
    assert [p["data"]["progress"]["agui_type"] for p in progress] == ["STATE_SNAPSHOT", "STEP_STARTED", "RUN_FINISHED"]
    assert progress[-1]["data"]["progress"]["payload"]["truncated"] is True  # bounded payloads
    timeline = [c for e in evs if e["type"] == "a2ui.message" for c in e["data"]["message"]["createSurface"]["components"]
                if c["component"] == "ExecutionTimeline"]
    assert timeline and timeline[0]["runId"] == "krun_42"
    # the stored run's legacy a2ui/v1 surfaces were adapted to v1.0 and placed too
    assert len([e for e in evs if e["type"] == "surface.placed"]) >= 2


async def test_monitor_foreign_run_is_not_found(env):
    env.db["kernel_runs"].docs.append({"id": "krun_7", "project_id": "proj_m", "status": "running"})
    await execute_step(_ctx(env), _step("run_agent", "agents.kernel_run", run_id="7", mode="monitor"))
    evs = await _events(env)
    assert [e["type"] for e in evs] == ["text.delta", "text.completed"]
    assert "couldn't find run 7" in evs[1]["data"]["text"]
    assert env.broker.subscribed == []


async def test_start_run_needs_approval_then_starts_once(env):
    project = {"id": "proj_a", "user_id": "alice", "org_id": None}
    step = StepSpec(id="s1", kind="run_agent", title="Run", capability_id="agents.kernel_run", requires_approval=True,
                    presentation="panel", params={"mode": "start", "objective": "add OAuth", "project_id": "proj_a"})
    await env.db["os_turns"].update_one({"id": "turn_1"}, {"$set": {"steps": [step.to_doc()]}})
    await execute_step(_ctx(env, project=project), step)
    assert env.runner.calls == []  # nothing runs before a human clicks approve
    evs = await _events(env)
    card = [c for c in evs[0]["data"]["message"]["createSurface"]["components"] if c["component"] == "ApprovalCard"][0]
    assert card["approve"]["event"] == {"name": "os.plan.approve", "context": {"turn_id": "turn_1", "step_id": "s1"}}

    from core.os.actions import BUILTIN_ACTIONS

    approve = BUILTIN_ACTIONS["os.plan.approve"]
    with pytest.raises(OsHTTPError):  # another user cannot approve alice's plan
        await approve(env.rt, make_user("mallory"), {**env.session, "user_id": "mallory"}, None, {"turn_id": "turn_1", "step_id": "s1"})
    outcome = await approve(env.rt, make_user("alice"), env.session, None, {"turn_id": "turn_1", "step_id": "s1"})
    assert outcome.status == "completed" and env.runner.calls == [("alice", "proj_a", "add OAuth")]
    again = await approve(env.rt, make_user("alice"), env.session, None, {"turn_id": "turn_1", "step_id": "s1"})
    assert again.status == "rejected" and len(env.runner.calls) == 1
    await asyncio.wait_for(asyncio.gather(*env.rt.bridges.values()), 2)


async def test_start_run_without_project_asks_for_one(env):
    await execute_step(_ctx(env), _step("run_agent", "agents.kernel_run", mode="start", objective="x"))
    evs = await _events(env)
    assert evs[-1]["type"] == "text.completed" and "project" in evs[-1]["data"]["text"]


async def test_open_capability_places_capability(env):
    await execute_step(_ctx(env), _step("open_capability", "projects.manage"))
    evs = await _events(env)
    assert [e["type"] for e in evs] == ["surface.placed"]
    assert evs[0]["data"]["placement"]["capability_id"] == "projects.manage"


async def test_open_mcp_app(env):
    await execute_step(_ctx(env, project={"id": "proj_a", "user_id": "alice"}),
                       _step("open_mcp_app", "protocols.mcp_app", app_id="app_skill_router"))
    evs = await _events(env)
    assert evs[0]["type"] == "mcp_app.placed" and evs[0]["data"]["placement"]["app_id"] == "app_skill_router"


def test_legacy_a2ui_adapter_produces_valid_v1_messages():
    from core.agent_kernel import plan_objective_dag
    from core.protocol_gateway import build_a2ui_surfaces_for_run

    run = plan_objective_dag("proj_1", "Build an OAuth login with tests and deploy").to_dict()
    run["approval_gates"] = [{"gate_id": "gate_1", "gate_name": "pre_delivery", "reason": "r", "wave_index": 1,
                              "status": "pending", "risk_level": "high"}]
    legacy = build_a2ui_surfaces_for_run(run)
    assert legacy
    for surface in legacy:
        for msg in legacy_surface_to_messages(surface, context={"project_id": "proj_1", "run_id": run["id"]}):
            safe, problems = sanitize_a2ui_message(msg)
            assert safe is not None and problems == [], problems
    gate = legacy_surface_to_messages(legacy[0], context={"project_id": "proj_1"})[0]["createSurface"]["components"][1]
    assert gate["component"] == "ApprovalCard" and gate["approve"]["event"]["context"]["project_id"] == "proj_1"
