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
    build_a2ui_surfaces_for_run,
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


if __name__ == "__main__":
    unittest.main()
