"""Automated tests for Phase 5 (Isolated Execution & Verification Sandbox)
and Phase 6 (Evaluation Engine, Role-Based Model Router & Cost Budget Guard).
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.agent_kernel import (  # noqa: E402
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
    KernelTaskStatus,
)
from core.evaluation_engine import (  # noqa: E402
    ArtifactEvaluator,
    BudgetExceededError,
    CostBudgetGuard,
    ModelRouter,
)
from core.execution_sandbox import (  # noqa: E402
    VerificationSandbox,
    WorktreeManager,
)


class TestExecutionSandboxAndEvaluation(unittest.IsolatedAsyncioTestCase):
    async def test_worktree_manager_acquires_confines_and_releases_leases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mgr = WorktreeManager(base_dir=Path(tmp), enable_git_worktrees=False)
            lease = await mgr.acquire(
                run_id="krun_../../escape",
                task_id="task_1",
                role="backend_engineer",
                department="engineering",
            )
            self.assertEqual(lease.status, "active")
            self.assertTrue(Path(lease.worktree_path).resolve().is_relative_to(Path(tmp).resolve()))
            self.assertTrue(Path(lease.worktree_path).exists())

            released = await mgr.release(lease.lease_id)
            self.assertIsNotNone(released)
            self.assertEqual(released.status, "released")
            self.assertIsNotNone(released.released_at)

    async def test_verification_sandbox_profiles(self) -> None:
        sandbox = VerificationSandbox()

        # Security hygiene scan catches unsafe shell=True
        res_sec = await sandbox.run_profile(
            profile="security_hygiene",
            code_snippet="subprocess.run(cmd, shell=True)",
        )
        self.assertFalse(res_sec.passed)
        self.assertEqual(len(res_sec.findings), 1)
        self.assertTrue(res_sec.findings[0]["blocking"])

        # Python syntax profile rejects path traversal and checks valid file
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good_py = root / "ok.py"
            good_py.write_text("x = 1 + 2\n", encoding="utf-8")
            res_py = await sandbox.run_profile(
                profile="python_syntax",
                target_files=["ok.py"],
                cwd=root,
            )
            self.assertTrue(res_py.passed)

            with self.assertRaises(ValueError):
                await sandbox.run_profile(
                    profile="python_syntax",
                    target_files=["../outside.py"],
                    cwd=root,
                )

    def test_model_router_tiers_repair_escalation_and_budget_downgrade(self) -> None:
        router = ModelRouter()

        sec = router.select_model(department="security", role="security_engineer")
        self.assertEqual(sec.tier, "reasoning")

        be = router.select_model(department="engineering", role="backend_engineer")
        self.assertEqual(be.tier, "balanced")

        docs = router.select_model(department="delivery", role="documentation_agent")
        self.assertEqual(docs.tier, "fast")

        # Escalates engineering to reasoning during repair round 1
        be_repair = router.select_model(
            department="engineering", role="backend_engineer", repair_round=1
        )
        self.assertEqual(be_repair.tier, "reasoning")

        # Downgrades when remaining budget is tight
        tight = router.select_model(
            department="security", role="security_engineer", budget_remaining_usd=0.006
        )
        self.assertEqual(tight.tier, "fast")

    def test_cost_budget_guard_and_artifact_evaluator(self) -> None:
        guard = CostBudgetGuard(max_budget_usd=0.05)
        guard.check_can_spend(0.03)
        guard.record_cost("t1", 0.03)
        self.assertAlmostEqual(guard.remaining_usd, 0.02, places=4)
        with self.assertRaises(BudgetExceededError):
            guard.check_can_spend(0.03)

        evaluator = ArtifactEvaluator()
        good_ev = evaluator.evaluate(
            {
                "artifact_id": "art_1",
                "producer_task_id": "t1",
                "producer_role": "backend_engineer",
                "artifact_type": "code_patch",
                "version": 1,
                "summary": "Implemented authenticated endpoint with bounded pagination and tests.",
                "touched_files": ["backend/api/kernel.py"],
            }
        )
        self.assertTrue(good_ev.passed)
        self.assertEqual(good_ev.overall_score, 1.0)

        bad_ev = evaluator.evaluate(
            {
                "artifact_id": "art_2",
                "producer_task_id": "t2",
                "producer_role": "security_engineer",
                "artifact_type": "security_audit",
                "version": 1,
                "summary": "Flagged issue",
                "touched_files": [],
            },
            has_blocking_findings=True,
        )
        self.assertFalse(bad_ev.passed)
        self.assertLess(bad_ev.overall_score, 0.75)

    async def test_kernel_enforces_budget_cap_worktrees_and_evaluations(self) -> None:
        async def executor(task: KernelTask, ctx, _dctx):
            return {
                "summary": f"{task.role} completed scoped deliverable cleanly with verification.",
                "touched_files": [f"src/{task.id}.py"],
                "cost_usd": 0.03,
                "had_worktree": bool(ctx.get("worktree_lease")),
            }

        # Tight budget ($0.032) allows Wave 0 engineering task ($0.03) then leaves $0.002 (< $0.004 fast tier) to block Wave 1
        run = KernelRun(
            id="krun_budget",
            project_id="proj_1",
            objective="Build API and security audit",
            tasks=[
                KernelTask("t_be", "API", "backend_engineer", "engineering", "Build API"),
                KernelTask(
                    "t_sec",
                    "Audit",
                    "security_engineer",
                    "security",
                    "Audit API",
                    depends_on=["t_be"],
                ),
            ],
            config=KernelExecutionConfig(max_budget_usd=0.032, isolate_worktrees=True),
        )
        res = await AgentKernel(task_executor=executor).execute_run(run)

        self.assertEqual(res.status, KernelRunStatus.PARTIAL_FAILURE)
        be_task = [t for t in res.tasks if t.id == "t_be"][0]
        sec_task = [t for t in res.tasks if t.id == "t_sec"][0]
        self.assertEqual(be_task.status, KernelTaskStatus.COMPLETED)
        self.assertTrue(be_task.output["had_worktree"])
        self.assertEqual(sec_task.status, KernelTaskStatus.BLOCKED)
        self.assertIn("budget cap", (sec_task.error or "").lower())
        self.assertEqual(len(res.worktrees), 1)
        self.assertEqual(res.worktrees[0]["status"], "released")
        self.assertEqual(len(res.evaluations), 1)
        self.assertTrue(res.evaluations[0]["passed"])
        self.assertGreater(res.to_dict()["metrics"]["avg_quality_score"], 0.9)


if __name__ == "__main__":
    unittest.main()
