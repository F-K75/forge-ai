"""WS-C: presentation planner -- capability choice, authorisation, presentation, approvals."""

from __future__ import annotations

import pytest

from core.os import intent_rules
from core.os.capability_registry import CapabilityRegistry
from core.os.planner import plan_turn
from core.os.runtime import OsRuntime
from core.os_contracts import validate_contract
from tests.os_fakes import indexed_db, make_user
from tests.test_os_intent_rules import CSV_ATTACHMENT, owner_examples


@pytest.fixture
async def rt():
    db = await indexed_db()
    db["projects"].docs.append({"id": "proj_a", "user_id": "alice", "org_id": None, "deleted_at": None})
    return OsRuntime(db, registry=CapabilityRegistry.load())


async def _plan(rt, prompt, user=None, project=None, attachments=None, context=None):
    intent = intent_rules.classify(prompt, rt.registry, attachments=attachments)
    return await plan_turn(rt, user=user or make_user(), intent=intent, project=project, prompt=prompt,
                           attachments=attachments, context=context)


@pytest.mark.parametrize("prompt,with_csv,kind,capability,presentation", owner_examples())
async def test_owner_examples_plan_to_their_presentation(rt, prompt, with_csv, kind, capability, presentation):
    plan = await _plan(rt, prompt, attachments=[CSV_ATTACHMENT] if with_csv else None)
    assert validate_contract("PresentationPlan", plan.wire) == []
    assert plan.wire["presentation"] == presentation
    assert plan.wire["fallback"] is True
    step = plan.steps[0]
    if capability == "chat.answer":
        assert step.kind == "respond_text" and step.capability_id is None
    else:
        assert step.capability_id == capability
    if capability == "data.analyze":
        assert step.kind == "render_surface" and step.params["attachment_id"] == "att_sales"
    if capability == "agents.kernel_run":
        assert step.kind == "run_agent" and step.params == {"run_id": "42", "mode": "monitor"}
    if capability == "governance.approvals":
        assert step.requires_approval is True  # the planner never approves by itself


async def test_admin_capability_is_denied_for_non_admin(rt):
    intent = {"kind": "open_capability", "confidence": 1.0, "capability_ids": ["admin.ops"], "entities": {},
              "source": "llm", "rationale": None}
    plan = await plan_turn(rt, user=make_user(), intent=intent, project=None)
    assert plan.wire["presentation"] == "text"
    assert plan.steps[0].canned_text and "don't have access" in plan.steps[0].canned_text
    admin = make_user("root", is_admin=True, mfa_enabled=True)
    plan = await plan_turn(rt, user=admin, intent=intent, project=None)
    assert plan.steps[0].capability_id == "admin.ops"


async def test_project_permissions_checked_when_project_given(rt):
    project = {"id": "proj_m", "user_id": "mallory", "org_id": None}
    plan = await _plan(rt, "Create an agent that triages bugs", project=project)
    assert plan.wire["presentation"] == "text"  # alice has no access to mallory's project
    own = await rt.db.projects.find_one({"id": "proj_a"})
    plan = await _plan(rt, "Create an agent that triages bugs", project=own)
    assert plan.steps[0].params["project_id"] == "proj_a"
    assert plan.steps[0].params["objective"] == "triages bugs"


async def test_starting_a_run_requires_approval(rt):
    plan = await _plan(rt, "Run the agents on adding OAuth login")
    step = plan.steps[0]
    assert step.kind == "run_agent" and step.requires_approval and step.params["mode"] == "start"


async def test_open_capability_reuses_window(rt):
    plan = await _plan(rt, "Show my projects", context={"open_capability_ids": ["projects.manage"]})
    step = plan.steps[0]
    assert step.kind == "open_capability" and step.window_id == "win_projects.manage" and step.focus
