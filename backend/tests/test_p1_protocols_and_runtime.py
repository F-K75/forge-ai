"""Unit tests for Production Runtime Wiring (Streamable HTTP MCP client, Redis/Mongo hooks,
Skill Telemetry feedback) and P1 Protocols (MCP Apps & A2A Agent Card / tasks/send).
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

import httpx

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.a2a_adapter import (
    A2AGateway,
    A2ATaskRequest,
    build_forge_agent_card,
)
from core.agent_kernel import AgentKernel, KernelExecutionConfig, KernelRun, KernelTask
from core.protocol_gateway import (
    AGUIStreamBroker,
    MCPGateway,
    StreamableHTTPMCPClient,
)
from core.skill_engine import SkillRegistry, SkillRouter


def _public_resolver(host: str, port: int):
    return [(2, 1, 6, "", ("93.184.216.34", port))]


class TestP1ProtocolsAndRuntime(unittest.IsolatedAsyncioTestCase):
    async def test_streamable_http_mcp_discovery_proxy_and_redirect_block(self) -> None:
        calls: List[Dict[str, Any]] = []

        def fake_server(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            calls.append({"url": str(request.url), "method": payload.get("method"), "params": payload.get("params")})
            if payload.get("method") == "initialize":
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": payload["id"],
                        "result": {
                            "protocolVersion": payload["params"]["protocolVersion"],
                            "capabilities": {"tools": {}},
                            "serverInfo": {"name": "docs", "version": "1"},
                        },
                    },
                )
            if "id" not in payload:
                return httpx.Response(202)
            if payload.get("method") == "tools/list":
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": payload["id"],
                        "result": {
                            "tools": [
                                {
                                    "name": "repo.search",
                                    "description": "Search indexed documentation",
                                    "inputSchema": {"type": "object"},
                                    "readOnly": True,
                                }
                            ]
                        },
                    },
                )
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": payload["id"], "result": {"matches": ["docs/architecture.md"]}},
            )

        client = StreamableHTTPMCPClient(transport=httpx.MockTransport(fake_server), resolver=_public_resolver)
        gw = MCPGateway(http_client=client)

        # Register & discover tools from an external HTTPS server
        srv = gw.register_external_server("docs-mcp", "https://mcp.example.com/rpc")
        self.assertEqual(srv["transport"], "streamable-http")
        discovered = await gw.discover_external_tools("docs-mcp")
        self.assertEqual(len(discovered), 1)
        self.assertEqual(discovered[0]["name"], "docs-mcp.repo.search")

        # Allowed department succeeds through JSON-RPC proxy
        ok_res = await gw.invoke_tool(
            tool_name="docs-mcp.repo.search",
            arguments={"query": "dag"},
            role="backend_engineer",
            department="engineering",
            project_id="proj_1",
        )
        self.assertTrue(ok_res["ok"])
        self.assertEqual(ok_res["result"]["matches"], ["docs/architecture.md"])

        # Disallowed department blocked by RBAC before outbound HTTP call
        denied = await gw.invoke_tool(
            tool_name="docs-mcp.repo.search",
            arguments={"query": "dag"},
            role="product_manager",
            department="business",
            project_id="proj_1",
        )
        self.assertFalse(denied["ok"])
        self.assertEqual(denied["audit"]["status"], "denied")

        self.assertEqual([c["method"] for c in calls[:2]], ["initialize", "notifications/initialized"])

        # 3xx redirects are never followed (redirect SSRF defense)
        redirecting = StreamableHTTPMCPClient(
            transport=httpx.MockTransport(
                lambda _req: httpx.Response(302, headers={"Location": "https://169.254.169.254/"})
            ),
            resolver=_public_resolver,
        )
        with self.assertRaisesRegex(ValueError, "redirect"):
            await redirecting.list_tools("https://mcp.example.com/rpc")

    async def test_redis_and_mongo_hooks_succeed_and_fail_open(self) -> None:
        published: List[tuple[str, str]] = []
        broker = AGUIStreamBroker()

        async def ok_pub(channel: str, payload: str) -> None:
            published.append((channel, payload))

        broker.attach_redis_publisher(ok_pub)
        await broker.publish(
            project_id="proj_1",
            run_id="krun_redis",
            kernel_event="kernel_run_started",
            payload={"wave_count": 2},
        )
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0][0], "forge:agui:run:krun_redis")

        # Fail-open when Redis raises
        async def broken_pub(_channel: str, _payload: str) -> None:
            raise RuntimeError("redis offline")

        broker.attach_redis_publisher(broken_pub)
        ev = await broker.publish(
            project_id="proj_1",
            run_id="krun_redis",
            kernel_event="kernel_run_completed",
            payload={"status": "completed"},
        )
        self.assertEqual(ev.event_id, 2)

        # Mongo audit persister hook on MCPGateway
        persisted: List[Dict[str, Any]] = []
        gw = MCPGateway()

        async def persist(rec: Dict[str, Any]) -> None:
            persisted.append(rec)

        gw.attach_audit_persister(persist)
        await gw.invoke_tool(
            tool_name="security.static_scan",
            arguments={"code": "const x = 1;"},
            role="security_engineer",
            department="security",
            project_id="proj_1",
        )
        self.assertEqual(len(persisted), 1)
        self.assertEqual(persisted[0]["status"], "succeeded")

    async def test_mcp_apps_and_a2a_agent_card_and_task_send(self) -> None:
        gw = MCPGateway()
        apps = gw.list_apps()
        self.assertGreaterEqual(len(apps), 3)
        self.assertTrue(all(a["protocol"] == "mcp-apps/v1" for a in apps))

        card = build_forge_agent_card(project_id="proj_42", base_url="https://forge.example.com")
        card_dict = card.to_dict()
        self.assertEqual(card_dict["protocol"], "a2a/0.2")
        self.assertEqual(len(card_dict["departments"]), 9)
        self.assertIn("mcp-apps/v1", card_dict["protocols_supported"])
        self.assertEqual(
            card_dict["url"],
            "https://forge.example.com/v1/projects/proj_42/protocols/a2a/tasks/send",
        )

        # Governed A2A task execution through custom kernel executor
        async def stub_exec(task: KernelTask, _ctx, _dctx):
            return {
                "summary": f"{task.role} completed A2A delegated deliverable.",
                "touched_files": [f"src/{task.id}.py"],
            }

        a2a = A2AGateway(kernel=AgentKernel(task_executor=stub_exec))
        resp = await a2a.send_task(
            A2ATaskRequest(
                objective="Build authenticated API endpoint and security review",
                project_id="proj_42",
                caller_agent="partner-agent",
                max_agents=4,
                max_budget_usd=1.0,
                execute_now=True,
            )
        )
        self.assertEqual(resp.state, "completed")
        self.assertGreaterEqual(resp.task_count, 2)
        self.assertGreaterEqual(len(resp.artifacts), 2)
        # Project isolation on task lookup
        self.assertIsNotNone(await a2a.get_task(project_id="proj_42", task_id=resp.task_id))
        self.assertIsNone(await a2a.get_task(project_id="other_proj", task_id=resp.task_id))

    async def test_skill_telemetry_feedback_loop_boosts_routing(self) -> None:
        reg = SkillRegistry(load_builtins=True)
        router = SkillRouter(reg)

        before = router.route_for_task(
            role="backend_engineer",
            department="engineering",
            objective="Build FastAPI REST API endpoint",
            top_k=3,
        )
        self.assertTrue(before)
        top_skill = before[0].skill_name
        initial_score = before[0].score

        for _ in range(5):
            reg.record_outcome(top_skill, quality_score=1.0, latency_ms=120, cost_usd=0.01, passed=True)

        self.assertGreater(reg.routing_boost(top_skill), 0.5)
        after = router.route_for_task(
            role="backend_engineer",
            department="engineering",
            objective="Build FastAPI REST API endpoint",
            top_k=3,
        )
        boosted = next(a for a in after if a.skill_name == top_skill)
        self.assertGreater(boosted.score, initial_score)


if __name__ == "__main__":
    unittest.main()
