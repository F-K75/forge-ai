"""Unit & integration tests for Milestones #2 & #3:
- Milestone #2: Cross-Run Knowledge & Episodic Memory Fabric + Multi-Agent Benchmark Harness & Regression Gate
- Milestone #3: OpenTelemetry W3C Trace Collector + OTLP Export + Governance Policy Engine + Governed Skill Marketplace
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
)
from core.benchmark_harness import MultiAgentBenchmarkHarness
from core.kernel_observability import KernelTraceCollector, get_trace_collector
from core.knowledge_fabric import KnowledgeFabric, get_knowledge_fabric
from core.skill_engine import get_skill_registry
from core.skill_marketplace import (
    GovernancePolicyStore,
    SkillMarketplaceRegistry,
    get_governance_policy_store,
)


class Milestone2And3Tests(unittest.TestCase):
    def test_knowledge_fabric_cross_run_ingestion_retrieval_and_tenant_isolation(self) -> None:
        async def _run() -> None:
            fabric = KnowledgeFabric()
            await fabric.ingest_kernel_run(
                {
                    "id": "run_alpha_1",
                    "project_id": "proj_alpha",
                    "objective": "Implement Stripe billing webhook idempotency and audit logs",
                    "status": "completed",
                    "metrics": {"total_cost_usd": 0.042, "avg_quality_score": 0.96, "wave_count": 3},
                    "artifacts": [
                        {
                            "artifact_id": "art_1",
                            "producer_role": "backend_engineer",
                            "artifact_type": "code_patch",
                            "summary": "Added idempotency key deduplication to Stripe billing webhooks.",
                            "touched_files": ["backend/api/billing.py"],
                        }
                    ],
                    "repair_cycles": [
                        {
                            "reviewer_role": "security_engineer",
                            "target_role": "backend_engineer",
                            "outcome": "resolved",
                            "findings": [{"message": "Verify webhook HMAC signature before parsing JSON"}],
                        }
                    ],
                }
            )
            await fabric.ingest_kernel_run(
                {
                    "id": "run_beta_1",
                    "project_id": "proj_beta",
                    "objective": "Secret Beta project healthcare HIPAA vault encryption",
                    "status": "completed",
                    "metrics": {"total_cost_usd": 0.01, "avg_quality_score": 0.9, "wave_count": 1},
                    "artifacts": [],
                    "repair_cycles": [],
                }
            )

            alpha_hits = fabric.retrieve_context(
                project_id="proj_alpha", query="stripe webhook hmac signature", top_k=5
            )
            self.assertGreaterEqual(len(alpha_hits), 2)
            # Repair lesson should be retrieved with high relevance
            self.assertTrue(any(h.node_type == "lesson" for h in alpha_hits))

            # Strict tenant isolation: proj_alpha must NEVER see proj_beta data
            cross_hits = fabric.retrieve_context(
                project_id="proj_alpha", query="HIPAA vault encryption", top_k=5
            )
            self.assertEqual(cross_hits, [])

            snap = fabric.get_project_snapshot("proj_alpha")
            self.assertGreaterEqual(snap["node_count"], 4)
            self.assertGreaterEqual(snap["edge_count"], 3)

        asyncio.run(_run())

    def test_benchmark_harness_suite_and_regression_gate(self) -> None:
        async def _run() -> None:
            harness = MultiAgentBenchmarkHarness()
            report1 = await harness.run_suite(project_id="proj_bench_1")
            self.assertEqual(len(report1.cases), 3)
            self.assertEqual(report1.pass_rate, 1.0)
            self.assertTrue(report1.regression_gate.passed)
            self.assertFalse(report1.regression_gate.has_baseline)

            # Second run compares against baseline and passes cleanly
            report2 = await harness.run_suite(project_id="proj_bench_1")
            self.assertTrue(report2.regression_gate.has_baseline)
            self.assertTrue(report2.regression_gate.passed)

            # Regression gate detects quality drop and cost spike
            reg = harness._evaluate_regression_gate(
                baseline=report1,
                pass_rate=1.0,
                avg_quality=max(0.0, report1.avg_quality_score - 0.15),
                total_cost=max(0.01, report1.total_cost_usd * 2.0 + 0.05),
                quality_drop_tolerance=0.05,
                cost_spike_tolerance_pct=25.0,
            )
            self.assertFalse(reg.passed)
            self.assertGreaterEqual(len(reg.regressions), 2)

        asyncio.run(_run())

    def test_otel_trace_collector_hierarchy_otlp_export_and_isolation(self) -> None:
        collector = KernelTraceCollector()
        trace, root = collector.start_run_trace(project_id="proj_obs", run_id="run_obs_1")
        self.assertEqual(len(trace.trace_id), 32)
        self.assertEqual(len(root.span_id), 16)

        wave_span = collector.start_child_span(
            trace, parent_span_id=root.span_id, name="kernel.wave", attributes={"wave.index": 0}
        )
        task_span = collector.start_child_span(
            trace,
            parent_span_id=wave_span.span_id,
            name="kernel.task",
            attributes={"agent.role": "backend_engineer", "agent.department": "engineering", "llm.cost_usd": 0.012},
        )
        task_span.finish(status="OK")
        wave_span.finish(status="OK")
        root.finish(status="OK")

        # Tenant isolation on trace lookup
        self.assertIsNone(collector.get_trace("proj_other", "run_obs_1"))
        self.assertIsNotNone(collector.get_trace("proj_obs", "run_obs_1"))

        otlp = trace.to_otlp_json()
        spans = otlp["resourceSpans"][0]["scopeSpans"][0]["spans"]
        self.assertEqual(len(spans), 3)
        self.assertEqual(spans[1]["parentSpanId"], root.span_id)
        self.assertEqual(spans[2]["parentSpanId"], wave_span.span_id)

        summary = trace.summary()
        self.assertEqual(summary["span_count"], 3)
        self.assertAlmostEqual(summary["cost_by_department"]["engineering"], 0.012, places=6)

    def test_governance_policy_and_marketplace_skill_installation(self) -> None:
        policies = GovernancePolicyStore()
        market = SkillMarketplaceRegistry(policies)

        # Policy rejects forbidden permission publication
        with self.assertRaises(ValueError):
            market.publish_package(
                name="bad-shell-skill",
                title="Unsafe Shell",
                domain="security",
                version="1.0.0",
                author="test",
                description="Tries to request arbitrary shell exec",
                keywords=["shell"],
                required_permissions=["exec_arbitrary_shell"],
                allowed_departments=["security"],
                instructions="Never allowed",
            )

        # Update tenant policy to block run_tests for a locked-down project
        policies.update_policy(
            "proj_locked",
            max_run_budget_usd=0.75,
            require_approval_for_delivery=True,
            allow_local_llm_routing=False,
            blocked_skill_permissions=["run_tests"],
            updated_by="cto@forge.ai",
        )
        with self.assertRaises(PermissionError):
            market.install_package(project_id="proj_locked", package_id="pkg_playwright_visual")

        # Vetted package without blocked permissions installs directly into live SkillRegistry
        res = market.install_package(project_id="proj_locked", package_id="pkg_otel_observability")
        self.assertTrue(res["installed"])
        self.assertIsNotNone(get_skill_registry().get("otel-distributed-tracing"))

    def test_kernel_end_to_end_policy_knowledge_and_tracing(self) -> None:
        async def _run() -> None:
            proj = "proj_e2e_m23"
            policy_store = get_governance_policy_store()
            policy_store.update_policy(
                proj,
                max_run_budget_usd=0.50,
                allow_local_llm_routing=False,
                updated_by="sec-admin",
            )

            observed_knowledge: List[Any] = []

            async def _exec(task: KernelTask, ctx: Dict[str, Any], _del: Any) -> Dict[str, Any]:
                observed_knowledge.append(ctx.get("knowledge_context"))
                return {
                    "summary": "Implemented OAuth2 token rotation and audit logging for multi-tenant API.",
                    "touched_files": ["backend/api/auth.py"],
                    "usage": {"input_tokens": 2000, "output_tokens": 500},
                }

            kernel = AgentKernel(task_executor=_exec)

            # Run 1 seeds cross-run KnowledgeFabric and verifies policy clamping + tracing
            run1 = KernelRun(
                id="krun_m23_1",
                project_id=proj,
                objective="Implement OAuth2 token rotation and audit logging",
                tasks=[
                    KernelTask("t1", "Backend", "backend_engineer", "engineering", "Build OAuth2 rotation", wave_index=0),
                ],
                waves=[["t1"]],
                config=KernelExecutionConfig(
                    max_budget_usd=5.0,  # Should be clamped to policy ceiling 0.50
                    prefer_local_llm=True,  # Should be disabled per policy
                    max_repair_rounds=0,
                ),
            )
            await kernel.execute_run(run1)
            self.assertEqual(run1.status, KernelRunStatus.COMPLETED)
            self.assertEqual(run1.config.max_budget_usd, 0.50)
            self.assertFalse(run1.config.prefer_local_llm)
            self.assertGreaterEqual(len(run1.policy_enforcements), 2)
            self.assertGreaterEqual(run1.trace_summary.get("span_count", 0), 3)
            self.assertIsNotNone(get_trace_collector().get_trace(proj, "krun_m23_1"))

            # Run 2 automatically retrieves Run 1's episodic memory & artifacts from KnowledgeFabric
            run2 = KernelRun(
                id="krun_m23_2",
                project_id=proj,
                objective="Extend OAuth2 token rotation with revocation webhooks",
                tasks=[
                    KernelTask("t2", "Backend", "backend_engineer", "engineering", "Add revocation webhook", wave_index=0),
                ],
                waves=[["t2"]],
                config=KernelExecutionConfig(max_repair_rounds=0),
            )
            await kernel.execute_run(run2)
            self.assertEqual(run2.status, KernelRunStatus.COMPLETED)
            self.assertGreaterEqual(len(run2.knowledge_hits), 1)
            self.assertTrue(len(observed_knowledge[-1]) >= 1)
            snap = get_knowledge_fabric().get_project_snapshot(proj)
            self.assertGreaterEqual(snap["counts_by_type"].get("episode", 0), 2)

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
