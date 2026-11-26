"""Unit tests for the Multi-Agent Orchestration Kernel (`backend/core/agent_kernel.py`).

Runnable via both `pytest` and stdlib `python3 -m unittest` without external
services so scheduling, parallelism, failure propagation, and delegation
governance invariants can always be verified cleanly.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

# Allow running directly via `python3 -m unittest backend/tests/test_agent_kernel.py`
_BACKEND_DIR = str(Path(__file__).resolve().parents[1])
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from core.agent_kernel import (
    ORG_BLUEPRINT,
    AgentKernel,
    CycleDetectedError,
    DelegationPolicy,
    DelegationStatus,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
    KernelTaskStatus,
    UnknownDependencyError,
    compute_execution_waves,
    get_org_blueprint_summary,
    plan_objective_dag,
)


class TestAgentKernel(unittest.IsolatedAsyncioTestCase):
    def test_org_blueprint_covers_nine_departments(self) -> None:
        summary = get_org_blueprint_summary()
        self.assertEqual(summary["department_count"], 9)
        self.assertEqual(summary["role_count"], len(ORG_BLUEPRINT))
        dept_keys = {d["key"] for d in summary["departments"]}
        self.assertEqual(
            dept_keys,
            {
                "leadership",
                "business",
                "architecture",
                "design",
                "engineering",
                "infrastructure",
                "security",
                "quality",
                "delivery",
            },
        )

    def test_plan_objective_computes_multi_wave_dag(self) -> None:
        run = plan_objective_dag(
            "proj_1",
            "Design architecture, build React frontend and FastAPI backend with database schema, security audit, and release rollout",
            max_agents=10,
        )
        self.assertGreaterEqual(len(run.waves), 3)
        self.assertGreaterEqual(len(run.tasks), 4)
        # Wave 0 tasks must have no dependencies; later waves must depend on earlier wave tasks
        task_map = {t.id: t for t in run.tasks}
        for tid in run.waves[0]:
            self.assertEqual(task_map[tid].depends_on, [])
        for wave in run.waves[1:]:
            for tid in wave:
                self.assertTrue(len(task_map[tid].depends_on) > 0)

    def test_cycle_detection_and_unknown_dependency(self) -> None:
        cyclic = [
            KernelTask(id="a", title="A", role="backend_engineer", department="engineering", description="A", depends_on=["b"]),
            KernelTask(id="b", title="B", role="frontend_engineer", department="engineering", description="B", depends_on=["a"]),
        ]
        with self.assertRaises(CycleDetectedError):
            compute_execution_waves(cyclic)

        missing = [
            KernelTask(id="a", title="A", role="backend_engineer", department="engineering", description="A", depends_on=["nope"]),
        ]
        with self.assertRaises(UnknownDependencyError):
            compute_execution_waves(missing)

    async def test_parallel_wave_execution_and_concurrency_cap(self) -> None:
        active = 0
        peak_active = 0

        async def executor(task, ctx, delegation):
            nonlocal active, peak_active
            active += 1
            peak_active = max(peak_active, active)
            await asyncio.sleep(0.04)
            active -= 1
            return {"done_by": task.role, "upstream_keys": sorted((ctx.get("upstream_outputs") or {}).keys())}

        tasks = [
            KernelTask(id="arch", title="Arch", role="solution_architect", department="architecture", description="Design"),
            KernelTask(id="fe", title="FE", role="frontend_engineer", department="engineering", description="UI", depends_on=["arch"]),
            KernelTask(id="be", title="BE", role="backend_engineer", department="engineering", description="API", depends_on=["arch"]),
            KernelTask(id="db", title="DB", role="database_engineer", department="engineering", description="DB", depends_on=["arch"]),
            KernelTask(id="qa", title="QA", role="qa_engineer", department="quality", description="Test", depends_on=["fe", "be", "db"]),
        ]
        run = KernelRun(
            id="krun_parallel",
            project_id="proj_1",
            objective="Build feature",
            tasks=tasks,
            config=KernelExecutionConfig(max_concurrency=2, max_retries=0),
        )
        events = []

        async def sink(event_name, payload):
            events.append((event_name, payload))

        kernel = AgentKernel(task_executor=executor)
        result = await kernel.execute_run(run, event_sink=sink)

        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        self.assertEqual(len(result.waves), 3)
        self.assertEqual(peak_active, 2)  # Bounded by max_concurrency=2 across 3 parallel wave-1 tasks
        qa_task = next(t for t in result.tasks if t.id == "qa")
        self.assertEqual(qa_task.output["upstream_keys"], ["be", "db", "fe"])
        event_names = [e[0] for e in events]
        self.assertIn("kernel_run_started", event_names)
        self.assertIn("kernel_wave_started", event_names)
        self.assertIn("kernel_run_completed", event_names)

    async def test_upstream_failure_blocks_dependents_while_independent_branch_succeeds(self) -> None:
        async def executor(task, ctx, delegation):
            if task.id == "be":
                raise RuntimeError("database migration failed")
            return {"ok": True}

        tasks = [
            KernelTask(id="fe", title="FE", role="frontend_engineer", department="engineering", description="FE"),
            KernelTask(id="be", title="BE", role="backend_engineer", department="engineering", description="BE"),
            KernelTask(id="qa_be", title="QA BE", role="qa_engineer", department="quality", description="QA", depends_on=["be"]),
            KernelTask(id="qa_fe", title="QA FE", role="code_reviewer", department="quality", description="Review", depends_on=["fe"]),
        ]
        run = KernelRun(
            id="krun_partial",
            project_id="proj_1",
            objective="Partial failure test",
            tasks=tasks,
            config=KernelExecutionConfig(max_retries=0, fail_fast=False),
        )
        result = await AgentKernel(task_executor=executor).execute_run(run)
        by_id = {t.id: t for t in result.tasks}

        self.assertEqual(result.status, KernelRunStatus.PARTIAL_FAILURE)
        self.assertEqual(by_id["fe"].status, KernelTaskStatus.COMPLETED)
        self.assertEqual(by_id["be"].status, KernelTaskStatus.FAILED)
        self.assertEqual(by_id["qa_be"].status, KernelTaskStatus.BLOCKED)
        self.assertEqual(by_id["qa_fe"].status, KernelTaskStatus.COMPLETED)

    async def test_retries_recover_transient_failure(self) -> None:
        calls = 0

        async def flaky_executor(task, ctx, delegation):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("transient error")
            return {"recovered": True}

        run = KernelRun(
            id="krun_retry",
            project_id="proj_1",
            objective="Retry test",
            tasks=[
                KernelTask(id="t1", title="T1", role="backend_engineer", department="engineering", description="Flaky")
            ],
            config=KernelExecutionConfig(max_retries=1, retry_backoff_seconds=0.005),
        )
        result = await AgentKernel(task_executor=flaky_executor).execute_run(run)
        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        self.assertEqual(result.tasks[0].attempts, 2)
        self.assertEqual(result.tasks[0].output, {"recovered": True})

    async def test_governed_delegation_policy_enforces_routes_and_limits(self) -> None:
        async def responder(to_role, question, ctx):
            return f"[{to_role}] Approved: {question}"

        async def executor(task, ctx, delegation):
            # Allowed: engineering -> architecture
            ok_rec = await delegation.ask("solution_architect", "Confirm JWT claim schema")
            # Disallowed: engineering -> business (not in DEFAULT_ALLOWED_DEPARTMENT_ROUTES)
            denied_rec = await delegation.ask("business_strategist", "Change pricing tier")
            # Exceeds max_delegations_per_run=2 (already 2 records recorded above)
            capped_rec = await delegation.ask("security_engineer", "Review CSRF token")
            return {
                "ok": ok_rec.status.value,
                "denied": denied_rec.reason,
                "capped": capped_rec.reason,
            }

        run = KernelRun(
            id="krun_delegate",
            project_id="proj_1",
            objective="Delegation governance test",
            tasks=[
                KernelTask(id="t1", title="BE", role="backend_engineer", department="engineering", description="Implement API")
            ],
            config=KernelExecutionConfig(
                max_retries=0,
                delegation_policy=DelegationPolicy(max_delegations_per_run=2, max_depth=2),
            ),
        )
        result = await AgentKernel(task_executor=executor, delegation_responder=responder).execute_run(run)

        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        out = result.tasks[0].output
        self.assertEqual(out["ok"], DelegationStatus.ANSWERED.value)
        self.assertEqual(out["denied"], "route_not_allowed")
        self.assertEqual(out["capped"], "delegation_limit_reached")
        self.assertEqual(len(result.delegations), 3)

    async def test_cooperative_cancellation(self) -> None:
        kernel_holder = {}

        async def executor(task, ctx, delegation):
            if task.id == "w0":
                kernel_holder["kernel"].cancel_run("krun_cancel")
                return {"started": True}
            return {"should_not_run": True}

        run = KernelRun(
            id="krun_cancel",
            project_id="proj_1",
            objective="Cancel test",
            tasks=[
                KernelTask(id="w0", title="W0", role="solution_architect", department="architecture", description="W0"),
                KernelTask(id="w1", title="W1", role="backend_engineer", department="engineering", description="W1", depends_on=["w0"]),
            ],
        )
        kernel = AgentKernel(task_executor=executor)
        kernel_holder["kernel"] = kernel
        result = await kernel.execute_run(run)
        self.assertEqual(result.status, KernelRunStatus.CANCELLED)
        by_id = {t.id: t for t in result.tasks}
        self.assertEqual(by_id["w1"].status, KernelTaskStatus.CANCELLED)


if __name__ == "__main__":
    unittest.main()
