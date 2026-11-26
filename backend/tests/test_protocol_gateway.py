"""Automated tests for Phase 4: Protocol Gateway (AG-UI, MCP, A2UI).

Verifies:
- AG-UI async SSE broker replay buffer, monotonic event IDs, idempotent resume, and SSE formatting
- MCP governed tool RBAC, audit trail, static scan tool, and SSRF URL validation
- A2UI declarative surface synthesis for pending gates, conflicts, and quality evals
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import List

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.protocol_gateway import (  # noqa: E402
    AGUIEvent,
    AGUIStreamBroker,
    MCPGateway,
    ALLOWED_A2UI_COMPONENTS,
    build_a2ui_surfaces_for_run,
    validate_a2ui_component,
    validate_a2ui_surface,
    validate_a2ui_url,
    validate_mcp_endpoint_url,
)


class TestProtocolGateway(unittest.IsolatedAsyncioTestCase):
    async def test_agui_broker_streams_replays_and_terminates_cleanly(self) -> None:
        broker = AGUIStreamBroker()
        await broker.publish(
            project_id="proj_1",
            run_id="run_agui",
            kernel_event="kernel_run_started",
            payload={"run_id": "run_agui"},
        )
        await broker.publish(
            project_id="proj_1",
            run_id="run_agui",
            kernel_event="kernel_wave_started",
            payload={"run_id": "run_agui", "wave_index": 0},
        )

        received: List[AGUIEvent] = []

        async def _consumer() -> None:
            # Resume after event 1 -> should receive event 2 from replay + event 3 live
            async for ev in broker.subscribe("run_agui", after_event_id=1, heartbeat_seconds=1.0):
                received.append(ev)

        task = asyncio.create_task(_consumer())
        await asyncio.sleep(0.05)
        await broker.publish(
            project_id="proj_1",
            run_id="run_agui",
            kernel_event="kernel_run_completed",
            payload={"run_id": "run_agui", "status": "completed"},
        )
        await asyncio.wait_for(task, timeout=2.0)

        self.assertEqual([e.event_id for e in received], [2, 3])
        self.assertEqual(received[0].agui_type, "STEP_STARTED")
        self.assertEqual(received[1].agui_type, "RUN_FINISHED")
        sse = received[0].to_sse()
        self.assertIn("id: 2\n", sse)
        self.assertIn("event: STEP_STARTED\n", sse)

    async def test_mcp_gateway_enforces_department_rbac_and_audit(self) -> None:
        gw = MCPGateway()

        # Allowed department: security invokes security.static_scan
        res_ok = await gw.invoke_tool(
            tool_name="security.static_scan",
            arguments={"code": "const html = el.innerHTML = userInput;"},
            role="security_engineer",
            department="security",
            project_id="proj_1",
        )
        self.assertTrue(res_ok["ok"])
        self.assertGreaterEqual(res_ok["result"]["finding_count"], 1)

        # Denied department: business cannot invoke security.static_scan
        res_denied = await gw.invoke_tool(
            tool_name="security.static_scan",
            arguments={"code": "print('hi')"},
            role="product_manager",
            department="business",
            project_id="proj_1",
        )
        self.assertFalse(res_denied["ok"])
        self.assertEqual(res_denied["audit"]["status"], "denied")

        audit = gw.get_audit_log(project_id="proj_1")
        self.assertEqual(len(audit), 2)

    def test_mcp_endpoint_ssrf_validation(self) -> None:
        for bad_url in (
            "http://example.com/mcp",
            "https://localhost/mcp",
            "https://127.0.0.1/mcp",
            "https://169.254.169.254/latest/meta-data",
            "https://10.0.0.5/internal",
            "https://192.168.1.10/mcp",
            "https://metadata.google.internal/computeMetadata",
        ):
            ok, reason = validate_mcp_endpoint_url(bad_url)
            self.assertFalse(ok, f"Expected URL to be rejected: {bad_url}")
            self.assertTrue(bool(reason))

    def test_a2ui_surface_builder_generates_gate_and_summary_surfaces(self) -> None:
        run_dict = {
            "id": "krun_ui",
            "risk_level": "high",
            "approval_gates": [
                {
                    "gate_id": "gate_1",
                    "gate_name": "pre_delivery_approval",
                    "reason": "Human sign-off required",
                    "wave_index": 3,
                    "status": "pending",
                }
            ],
            "conflicts": [
                {
                    "file_path": "shared/api.ts",
                    "wave_index": 1,
                    "roles": ["backend_engineer", "frontend_engineer"],
                    "status": "detected",
                }
            ],
            "evaluations": [
                {
                    "producer_role": "backend_engineer",
                    "artifact_type": "code_patch",
                    "overall_score": 0.9,
                    "passed": True,
                }
            ],
            "repair_cycles": [{"cycle_id": "rep_1", "outcome": "resolved"}],
            "metrics": {
                "completed_tasks": 4,
                "total_tasks": 5,
                "artifact_count": 4,
                "avg_quality_score": 0.9,
                "total_cost_usd": 0.084,
            },
        }
        surfaces = build_a2ui_surfaces_for_run(run_dict)
        self.assertEqual(len(surfaces), 2)
        self.assertEqual(surfaces[0]["components"][0]["type"], "approval_card")
        summary_types = [c["type"] for c in surfaces[1]["components"]]
        self.assertIn("metric_row", summary_types)
        self.assertIn("conflict_list", summary_types)
        self.assertIn("eval_table", summary_types)
        for surface in surfaces:
            ok, reason = validate_a2ui_surface(surface)
            self.assertTrue(ok, reason)


# One minimal valid instance per A2UI component type.
VALID_A2UI_COMPONENTS = {
    "heading": {"type": "heading", "text": "Run summary", "level": 2},
    "metric_row": {"type": "metric_row", "items": [{"label": "Tasks", "value": "3/4"}]},
    "checklist": {"type": "checklist", "items": [{"label": "Lint", "checked": True}]},
    "approval_card": {
        "type": "approval_card",
        "gate_id": "gate_1",
        "gate_name": "pre_delivery",
        "reason": "Sign-off",
        "wave_index": 2,
        "risk_level": "high",
        "actions": ["approve", "reject"],
    },
    "conflict_list": {
        "type": "conflict_list",
        "items": [{"file_path": "a.ts", "wave_index": 1, "roles": ["be", "fe"], "status": "detected"}],
    },
    "eval_table": {
        "type": "eval_table",
        "rows": [{"role": "be", "artifact_type": "code_patch", "score": 0.9, "passed": True}],
    },
    "text_block": {"type": "text_block", "format": "markdown", "text": "# Plan\n- step one\n- step two"},
    "key_value_list": {"type": "key_value_list", "items": [{"key": "Status", "value": "running"}]},
    "progress_bar": {"type": "progress_bar", "label": "Tasks", "value": 3, "max": 4, "tone": "info"},
    "timeline": {
        "type": "timeline",
        "events": [{"timestamp": "2026-01-01T00:00:00Z", "actor": "architect", "label": "Started", "status": "running"}],
    },
    "status_list": {
        "type": "status_list",
        "items": [{"id": "t1", "title": "Build API", "status": "completed", "owner": "be", "detail": "Wave 1"}],
    },
    "code_diff": {"type": "code_diff", "file_path": "app.py", "language": "python", "diff": "--- a\n+++ b\n-x\n+y"},
    "cost_breakdown": {
        "type": "cost_breakdown",
        "currency": "USD",
        "total": 0.42,
        "budget": 5.0,
        "items": [{"label": "backend_engineer", "amount": 0.42}],
    },
    "agent_roster": {
        "type": "agent_roster",
        "agents": [{"role": "architect", "department": "architecture", "status": "active", "task_count": 2, "model": "m"}],
    },
    "callout": {"type": "callout", "tone": "warning", "title": "Heads up", "text": "Budget at 85%"},
    "link_list": {"type": "link_list", "links": [{"label": "Docs", "url": "https://example.com/docs"}]},
}

# One invalid-prop mutation per component type.
INVALID_A2UI_MUTATIONS = {
    "heading": {"level": 9},
    "metric_row": {"items": [{"label": "x"}]},
    "checklist": {"items": [{"label": "x", "checked": "yes"}]},
    "approval_card": {"actions": ["approve", "delete_everything"]},
    "conflict_list": {"items": "not-a-list"},
    "eval_table": {"rows": [{"role": "be", "artifact_type": "x", "score": 7, "passed": True}]},
    "text_block": {"format": "html"},
    "key_value_list": {"items": [{"key": "k", "value": 5}]},
    "progress_bar": {"value": -1},
    "timeline": {"events": [{"label": "x", "status": "exploded"}]},
    "status_list": {"items": [{"title": "x", "status": "done-ish"}]},
    "code_diff": {"diff": None},
    "cost_breakdown": {"currency": "BTC"},
    "agent_roster": {"agents": [{"role": "a", "status": "active", "task_count": True}]},
    "callout": {"tone": "neon"},
    "link_list": {"links": [{"label": "x", "url": "ftp://example.com/file"}]},
}


class TestA2UIComponentValidation(unittest.TestCase):
    def test_allowlist_covers_expanded_component_set(self) -> None:
        self.assertEqual(set(VALID_A2UI_COMPONENTS), set(ALLOWED_A2UI_COMPONENTS))
        self.assertGreaterEqual(len(ALLOWED_A2UI_COMPONENTS), 15)
        self.assertEqual(set(INVALID_A2UI_MUTATIONS), set(ALLOWED_A2UI_COMPONENTS))

    def test_each_component_accepts_valid_props(self) -> None:
        for ctype, comp in VALID_A2UI_COMPONENTS.items():
            with self.subTest(component=ctype):
                ok, reason = validate_a2ui_component(comp)
                self.assertTrue(ok, reason)

    def test_each_component_rejects_invalid_prop_values(self) -> None:
        for ctype, mutation in INVALID_A2UI_MUTATIONS.items():
            with self.subTest(component=ctype):
                comp = {**VALID_A2UI_COMPONENTS[ctype], **mutation}
                ok, reason = validate_a2ui_component(comp)
                self.assertFalse(ok, f"{ctype} should reject {mutation}")
                self.assertTrue(reason)

    def test_each_component_rejects_unknown_props(self) -> None:
        for ctype, comp in VALID_A2UI_COMPONENTS.items():
            with self.subTest(component=ctype):
                ok, reason = validate_a2ui_component({**comp, "dangerouslySetInnerHTML": {"__html": "<b>x</b>"}})
                self.assertFalse(ok)
                self.assertIn("unknown prop", reason or "")

    def test_rejects_unknown_nested_props_and_missing_required(self) -> None:
        ok, reason = validate_a2ui_component(
            {"type": "link_list", "links": [{"label": "x", "url": "https://a.dev", "onclick": "alert(1)"}]}
        )
        self.assertFalse(ok)
        self.assertIn("onclick", reason or "")
        ok, reason = validate_a2ui_component({"type": "progress_bar", "label": "x", "value": 1})
        self.assertFalse(ok)
        self.assertIn("max", reason or "")

    def test_rejects_unknown_or_malformed_components(self) -> None:
        for bad in (
            {"type": "iframe", "src": "https://evil.example"},
            {"type": "raw_html", "html": "<script>alert(1)</script>"},
            {"type": None},
            {"text": "no type"},
            "heading",
            None,
        ):
            with self.subTest(component=bad):
                ok, _ = validate_a2ui_component(bad)
                self.assertFalse(ok)

    def test_link_list_rejects_dangerous_url_schemes(self) -> None:
        for url in (
            "javascript:alert(1)",
            "JavaScript:alert(document.cookie)",
            " javascript:alert(1)",
            "java\tscript:alert(1)",
            "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
            "vbscript:msgbox(1)",
            "file:///etc/passwd",
            "//evil.example/path",
            "/relative/path",
            "https://user:pass@example.com/",
            "https://",
            "http://[::1",
        ):
            with self.subTest(url=url):
                ok, _ = validate_a2ui_url(url)
                self.assertFalse(ok)
                comp = {"type": "link_list", "links": [{"label": "click", "url": url}]}
                self.assertFalse(validate_a2ui_component(comp)[0])
        for url in ("https://example.com", "http://localhost:3000/runs?id=1#x"):
            with self.subTest(url=url):
                self.assertTrue(validate_a2ui_url(url)[0])

    def test_script_markup_is_carried_as_inert_text(self) -> None:
        payload = '<script>alert("xss")</script><img src=x onerror=alert(1)>'
        for comp in (
            {"type": "text_block", "format": "markdown", "text": payload},
            {"type": "code_diff", "diff": f"+{payload}"},
            {"type": "callout", "tone": "error", "text": payload},
            {"type": "key_value_list", "items": [{"key": "k", "value": payload}]},
        ):
            with self.subTest(component=comp["type"]):
                ok, reason = validate_a2ui_component(comp)
                # Accepted only as plain data: the schema has no HTML-bearing props and
                # the client renders strings as escaped text nodes.
                self.assertTrue(ok, reason)
                self.assertNotIn("html", {k.lower() for k in comp})

    def test_rejects_control_characters_and_oversize_values(self) -> None:
        self.assertFalse(validate_a2ui_component({"type": "heading", "text": "a\x00b"})[0])
        self.assertFalse(validate_a2ui_component({"type": "heading", "text": "line\nbreak"})[0])
        self.assertTrue(validate_a2ui_component({"type": "text_block", "text": "multi\nline"})[0])
        self.assertFalse(validate_a2ui_component({"type": "heading", "text": "x" * 201})[0])
        too_many = [{"key": f"k{i}", "value": "v"} for i in range(31)]
        self.assertFalse(validate_a2ui_component({"type": "key_value_list", "items": too_many})[0])
        self.assertFalse(
            validate_a2ui_component({"type": "progress_bar", "label": "x", "value": float("nan"), "max": 1})[0]
        )

    def test_surface_validation(self) -> None:
        surface = {
            "surface_id": "s1",
            "protocol": "a2ui/v1",
            "title": "Surface",
            "components": list(VALID_A2UI_COMPONENTS.values()),
        }
        self.assertTrue(validate_a2ui_surface(surface)[0])
        self.assertFalse(validate_a2ui_surface({**surface, "protocol": "html"})[0])
        self.assertFalse(validate_a2ui_surface({**surface, "script": "x"})[0])
        self.assertFalse(
            validate_a2ui_surface({**surface, "components": [{"type": "iframe", "src": "https://x.dev"}]})[0]
        )


class TestA2UIActivitySurface(unittest.TestCase):
    def _run_dict(self) -> dict:
        return {
            "id": "krun_activity",
            "objective": "Build the <script>alert(1)</script> dashboard",
            "status": "running",
            "risk_level": "high",
            "risk_notes": "Touches billing code",
            "waves": [["t1"], ["t2", "t3"]],
            "duration_ms": 1234,
            "plan_id": "plan_1",
            "tasks": [
                {
                    "id": "t1",
                    "title": "Design architecture",
                    "role": "architect",
                    "department": "architecture",
                    "status": "completed",
                    "wave_index": 0,
                    "started_at": "2026-01-01T00:00:00Z",
                    "finished_at": "2026-01-01T00:01:00Z",
                    "model_id": "model-a",
                    "cost_usd": 0.02,
                },
                {
                    "id": "t2",
                    "title": "Build API",
                    "role": "backend_engineer",
                    "department": "engineering",
                    "status": "running",
                    "wave_index": 1,
                    "started_at": "2026-01-01T00:02:00Z",
                    "cost_usd": 0.05,
                },
                {
                    "id": "t3",
                    "title": "Build UI",
                    "role": "frontend_engineer",
                    "department": "engineering",
                    "status": "failed",
                    "wave_index": 1,
                    "error": "Type check failed",
                    "cost_usd": 0.0,
                },
            ],
            "delegations": [
                {
                    "from_role": "backend_engineer",
                    "to_role": "architect",
                    "question": "Which DB?",
                    "status": "answered",
                    "created_at": "2026-01-01T00:03:00Z",
                }
            ],
            "cost_summary": {"spent_usd": 0.07, "max_budget_usd": 5.0, "remaining_usd": 4.93},
            "metrics": {"completed_tasks": 1, "total_tasks": 3},
        }

    def test_activity_surface_emits_components_from_run_data(self) -> None:
        surfaces = build_a2ui_surfaces_for_run(self._run_dict())
        self.assertEqual(len(surfaces), 2)
        activity = surfaces[-1]
        self.assertEqual(activity["surface_id"], "a2ui_activity_krun_activity")
        ok, reason = validate_a2ui_surface(activity)
        self.assertTrue(ok, reason)
        by_type = {}
        for comp in activity["components"]:
            by_type.setdefault(comp["type"], []).append(comp)
        for expected in (
            "text_block",
            "key_value_list",
            "callout",
            "progress_bar",
            "agent_roster",
            "status_list",
            "timeline",
            "cost_breakdown",
        ):
            self.assertIn(expected, by_type)
        # No data in the snapshot for these, so they are not invented.
        self.assertNotIn("code_diff", by_type)
        self.assertNotIn("link_list", by_type)

        progress = by_type["progress_bar"][0]
        self.assertEqual((progress["value"], progress["max"], progress["tone"]), (1, 3, "error"))

        roster = {a["role"]: a for a in by_type["agent_roster"][0]["agents"]}
        self.assertEqual(roster["architect"]["status"], "completed")
        self.assertEqual(roster["architect"]["model"], "model-a")
        self.assertEqual(roster["backend_engineer"]["status"], "active")
        self.assertEqual(roster["frontend_engineer"]["status"], "failed")

        board = {i["id"]: i for i in by_type["status_list"][0]["items"]}
        self.assertEqual(board["t3"]["detail"], "Type check failed")
        self.assertEqual(board["t2"]["detail"], "Wave 1")

        timeline = by_type["timeline"][0]["events"]
        self.assertEqual([e["timestamp"] for e in timeline], sorted(e["timestamp"] for e in timeline))
        self.assertTrue(any(e["label"].startswith("Delegated to architect") for e in timeline))

        cost = by_type["cost_breakdown"][0]
        self.assertAlmostEqual(cost["total"], 0.07)
        self.assertEqual(cost["budget"], 5.0)
        self.assertEqual([i["label"] for i in cost["items"]], ["backend_engineer", "architect"])

        tones = {c["tone"] for c in by_type["callout"]}
        self.assertEqual(tones, {"error", "warning"})
        # Objective markup is passed through verbatim as inert text, never as HTML.
        self.assertIn("<script>", by_type["text_block"][0]["text"])

    def test_no_activity_surface_or_cost_without_data(self) -> None:
        surfaces = build_a2ui_surfaces_for_run({"id": "empty", "metrics": {}})
        self.assertEqual([s["surface_id"] for s in surfaces], ["a2ui_summary_empty"])

        run = self._run_dict()
        run.pop("cost_summary")
        for t in run["tasks"]:
            t["cost_usd"] = 0.0
        run["delegations"] = []
        for t in run["tasks"]:
            t.pop("started_at", None)
            t.pop("finished_at", None)
        types = [c["type"] for c in build_a2ui_surfaces_for_run(run)[-1]["components"]]
        self.assertNotIn("cost_breakdown", types)
        self.assertNotIn("timeline", types)

    def test_builder_sanitizes_hostile_run_data(self) -> None:
        run = self._run_dict()
        run["tasks"][0]["title"] = "evil\x00title\x1b[31m"
        run["tasks"][1]["status"] = "pwned"
        run["tasks"][1]["cost_usd"] = float("nan")
        run["approval_gates"] = [
            {"gate_id": "g", "gate_name": "n", "reason": "r\x07" * 600, "wave_index": 1, "status": "pending"}
        ]
        surfaces = build_a2ui_surfaces_for_run(run)
        for surface in surfaces:
            ok, reason = validate_a2ui_surface(surface)
            self.assertTrue(ok, reason)
        self.assertEqual(surfaces[0]["components"][0]["type"], "approval_card")
        board = next(c for c in surfaces[-1]["components"] if c["type"] == "status_list")
        self.assertEqual(board["items"][0]["title"], "eviltitle[31m")
        self.assertEqual(board["items"][1]["status"], "pending")


if __name__ == "__main__":
    unittest.main()
