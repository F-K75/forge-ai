"""Deterministic (no-LLM) surface builders: data.analyze, models.compare, governance.approvals, workflow.design."""

from __future__ import annotations

import json

import pytest

from core.os_capabilities import get_handler
from core.os_capabilities import approvals, data_analyze, models_compare, workflow
from core.os_capabilities.surfaces import result_surface
from core.os_contracts import validate_a2ui_message, validate_contract
from tests.test_os_capability_fakes import OWNER, make_ctx, make_user, patch_db, seeded_db


def _valid(messages, placements=()):
    for m in messages:
        assert validate_a2ui_message(m) == [], m
    for p in placements:
        assert validate_contract("SurfacePlacement", p) == [], p


SALES_CSV = "region,month,revenue,units\nEMEA,2026-01,1200.50,10\nAPAC,2026-01,900,7\nEMEA,2026-02,\"1,300\",11\nAMER,2026-02,$2000,15\n"


def _components(message):
    return {c["id"]: c for c in message["createSurface"]["components"]}


def test_csv_builds_table_chart_and_filters() -> None:
    messages, places, meta = data_analyze.analyze_dataset(SALES_CSV, filename="sales.csv")
    _valid(messages, places)
    comps = _components(messages[0])
    assert {"chart", "table", "filters"} <= set(comps)
    dm = messages[0]["createSurface"]["dataModel"]
    assert meta["row_count"] == 4 and len(dm["rows"]) == 4
    assert comps["chart"]["kind"] == "line" and comps["chart"]["x"] == "month"  # date column wins
    assert dm["rows"][2]["revenue"] == 1300.0 and dm["rows"][3]["revenue"] == 2000.0
    by_month = {r["month"]: r["revenue"] for r in dm["chart"]}
    assert by_month == {"2026-01": 2100.5, "2026-02": 3300.0}
    assert places[0]["presentation"] == "window" and places[0]["capability_id"] == "data.analyze"


def test_category_axis_aggregates_and_sorts() -> None:
    messages, _, _ = data_analyze.analyze_dataset(SALES_CSV, x="region", y=["revenue"])
    dm = messages[0]["createSurface"]["dataModel"]
    assert [r["region"] for r in dm["chart"]] == ["EMEA", "AMER", "APAC"]
    assert _components(messages[0])["chart"]["kind"] == "bar"


def test_json_dataset() -> None:
    doc = json.dumps({"data": [{"name": "a", "score": 3}, {"name": "b", "score": 5}]})
    messages, places, meta = data_analyze.analyze_dataset(doc.encode())
    _valid(messages, places)
    assert meta["format"] == "json" and meta["row_count"] == 2


@pytest.mark.parametrize("content,needle", [
    ("", "empty"),
    ("a,b\n", "no rows"),
    ("x" * (5 * 1024 * 1024 + 1), "5 MB"),
    ("n\n" + "1\n" * 50_001, "50,000"),
    ("[1, 2]", "object"),
    ("{not json", "parsed"),
])
def test_dataset_limits(content: str, needle: str) -> None:
    with pytest.raises(data_analyze.DatasetError, match=needle):
        data_analyze.analyze_dataset(content, fmt="json" if content[:1] in "[{" else None)


def test_large_dataset_embeds_bounded_rows_but_charts_all() -> None:
    rows = "\n".join(f"cat{i % 7},{i},{'x' * 200}" for i in range(20_000))
    messages, _, meta = data_analyze.analyze_dataset("k,v,pad\n" + rows)
    _valid(messages)
    assert meta["row_count"] == 20_000 and meta["embedded_rows"] < 20_000
    assert len(json.dumps(messages[0])) < 3_000_000
    total = sum(r["v"] for r in messages[0]["createSurface"]["dataModel"]["chart"])
    assert total == sum(range(20_000))


def test_change_chart_reaggregates_from_data_model() -> None:
    messages, _, _ = data_analyze.analyze_dataset(SALES_CSV)
    sid = messages[0]["createSurface"]["surfaceId"]
    updates = data_analyze.change_chart(sid, messages[0]["createSurface"]["dataModel"], chart_kind="pie", x="region", y=["units"])
    _valid(updates)
    assert updates[1]["updateComponents"]["components"][0]["kind"] == "pie"
    with pytest.raises(data_analyze.DatasetError):
        data_analyze.change_chart(sid, messages[0]["createSurface"]["dataModel"], x="nope")


async def test_analyze_handler_with_attachment_loader(monkeypatch) -> None:
    async def loader(attachment_id):
        assert attachment_id == "att_1"
        return SALES_CSV.encode(), "text/csv", "sales.csv"

    ctx = make_ctx(make_user(OWNER), "data.analyze", "analyze", attachment_loader=loader)
    outcome = await get_handler("data.analyze", "analyze")(ctx, {"attachment_id": "att_1"})
    assert outcome.status == "completed"
    _valid(outcome.a2ui_messages, outcome.placements)

    # Without a loader the handler reads WS-C's attachment store, scoped to the caller: unknown id -> rejected.
    patch_db(monkeypatch, seeded_db())
    ctx = make_ctx(make_user(OWNER), "data.analyze", "analyze")
    outcome = await get_handler("data.analyze", "analyze")(ctx, {"attachment_id": "att_1"})
    assert outcome.status == "rejected" and ctx.metadata["os_error"]["code"] == "validation_failed"


def test_models_compare_claude_vs_gpt_is_secret_free() -> None:
    messages, places, subjects = models_compare.compare_surface(query="Compare Claude and GPT for coding")
    _valid(messages, places)
    providers = {s["provider"] for s in subjects}
    assert {"anthropic", "openai"} <= providers
    table = _components(messages[0])["table"]
    assert len(table["subjects"]) == len(subjects) >= 2
    blob = json.dumps(messages).lower()
    for forbidden in ("api_key", "secret", "quota", "health", "base_url"):
        assert forbidden not in blob


def test_models_compare_defaults_to_one_per_provider() -> None:
    _, _, subjects = models_compare.compare_surface()
    assert len({s["provider"] for s in subjects}) == len(subjects) >= 2


async def test_models_compare_handler() -> None:
    ctx = make_ctx(make_user(OWNER), "models.compare", "compare")
    outcome = await get_handler("models.compare", "compare")(ctx, {"models": ["gpt-4o-mini", "claude-sonnet-4-6"]})
    assert [m["id"] for m in ctx.metadata["result"]["models"]][:2] == ["gpt-4o-mini", "claude-sonnet-4-6"]
    _valid(outcome.a2ui_messages, outcome.placements)


RUN = {
    "id": "run1", "project_id": "p1", "status": "running", "objective": "Ship the bakery site", "created_at": "2026-11-27T10:00:00",
    "approval_gates": [
        {"gate_id": "g1", "gate_name": "pre_delivery_approval", "reason": "Deliver to prod", "status": "pending"},
        {"gate_id": "g0", "gate_name": "escalation_review", "reason": "", "status": "approved"},
    ],
}


def test_gate_card_surface() -> None:
    gates = approvals.pending_gates([RUN], "p1", "Bakery")
    assert [g["gate_id"] for g in gates] == ["g1"]
    messages, places = approvals.approvals_surface(gates)
    _valid(messages, places)
    card = _components(messages[0])["gate_0"]
    assert card["riskLevel"] == "high"
    assert card["approve"]["event"] == {"name": "governance.approvals.approve", "context": {"project_id": "p1", "run_id": "run1", "gate_id": "g1"}}
    assert places[0]["presentation"] == "inline"
    empty, _ = approvals.approvals_surface([])
    _valid(empty)


async def test_approvals_list_handler_reads_owned_projects(monkeypatch) -> None:
    db = seeded_db(kernel_runs=[RUN])
    patch_db(monkeypatch, db)
    ctx = make_ctx(make_user(OWNER), "governance.approvals", "list")
    outcome = await get_handler("governance.approvals", "list")(ctx, {})
    assert outcome.status == "completed", ctx.metadata
    assert [g["gate_id"] for g in ctx.metadata["result"]["gates"]] == ["g1"]
    _valid(outcome.a2ui_messages, outcome.placements)


def test_workflow_template() -> None:
    nodes = [{"id": "b", "title": "Build"}, {"id": "a", "title": "Design", "role": "Designer"}, {"id": "c", "title": "Ship"}]
    edges = [{"source": "a", "target": "b"}, {"source": "b", "target": "c"}]
    tpl = workflow.plan_template("Onboarding flow", nodes, edges)
    assert [t["id"] for t in tpl["tasks"]] == ["a", "b", "c"]
    assert tpl["tasks"][1]["depends_on"] == ["a"] and tpl["tasks"][0]["role"] == "designer"
    from api.kernel import ExecuteKernelRunRequest

    ExecuteKernelRunRequest(objective=tpl["objective"], tasks=tpl["tasks"])  # the kernel accepts the template as-is
    with pytest.raises(workflow.WorkflowError, match="cycle"):
        workflow.plan_template("x", nodes, edges + [{"source": "c", "target": "a"}])
    with pytest.raises(workflow.WorkflowError):
        workflow.plan_template("x", nodes, [{"source": "a", "target": "zzz"}])


def test_generic_result_surface_scrubs_secrets() -> None:
    rows = [{"id": "k1", "name": "CI", "key_prefix": "fk_12", "hashed_key": "abc", "token": "t"}]
    messages, places = result_surface(capability_id="account.api_keys", action_id="list", title="Keys", result={"api_keys": rows}, presentation="panel")
    _valid(messages, places)
    blob = json.dumps(messages)
    assert "fk_12" in blob and "abc" not in blob and '"t"' not in blob
    messages, _ = result_surface(capability_id="x.y", action_id="v", title="One", result={"plan": "pro", "password_hash": "h"}, presentation="panel")
    _valid(messages)
    assert "password" not in json.dumps(messages).lower()
