"""Unit & integration tests for Milestone #1:
1. Git Worktree confined writes, diff capture & wave patch reconciliation.
2. Containerized VerificationSandbox (hardened Docker args + python_unittest + fallback).
3. ModelRouter local LLM preference, task complexity & real token-cost feedback in AgentKernel.
4. AI SDK UI Stream Protocol v1 SSE wire adapter & A2A card capability advertisement.
"""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.a2a_adapter import build_forge_agent_card
from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
)
from core.evaluation_engine import ModelRouter
from core.execution_sandbox import VerificationSandbox, WorktreeManager
from core.protocol_gateway import AGUIEvent, AGUIStreamBroker, agui_event_to_ai_sdk_chunks


class Milestone1ExecutionStreamRoutingTests(unittest.TestCase):
    def test_worktree_confined_writes_diff_and_reconciliation(self) -> None:
        async def _run() -> None:
            with tempfile.TemporaryDirectory(prefix="forge-m1-wt-") as tmp:
                mgr = WorktreeManager(base_dir=Path(tmp), enable_git_worktrees=False)
                l1 = await mgr.acquire(
                    run_id="run_m1",
                    task_id="t_fe",
                    role="frontend_engineer",
                    department="engineering",
                )
                l2 = await mgr.acquire(
                    run_id="run_m1",
                    task_id="t_be",
                    role="backend_engineer",
                    department="engineering",
                )

                # Path traversal must be rejected
                with self.assertRaises(ValueError):
                    mgr.record_workspace_write(l1.lease_id, "../escape.py", "print('bad')")

                # Confined writes inside each isolated worktree
                mgr.record_workspace_write(l1.lease_id, "src/App.tsx", "export const A = 1;\n")
                mgr.record_workspace_write(l1.lease_id, "shared/contract.ts", "export type X = 1;\n")
                mgr.record_workspace_write(l2.lease_id, "api/routes.py", "def ok(): return True\n")
                mgr.record_workspace_write(l2.lease_id, "shared/contract.ts", "export type X = 2;\n")

                diff1 = await mgr.capture_diff(l1.lease_id, declared_files=["src/extra.ts"])
                self.assertEqual(diff1.status, "modified")
                self.assertIn("src/App.tsx", diff1.modified_files)
                self.assertIn("src/extra.ts", diff1.modified_files)

                # Conflicting wave reconciliation
                conflict_report = await mgr.reconcile_wave_patches(
                    wave_index=1, leases=[l1, l2]
                )
                self.assertEqual(conflict_report.status, "conflicts_detected")
                self.assertEqual(conflict_report.leases_checked, 2)
                self.assertEqual(len(conflict_report.conflicting_files), 1)
                self.assertEqual(conflict_report.conflicting_files[0]["file_path"], "shared/contract.ts")
                self.assertIn("src/App.tsx", conflict_report.clean_files)
                self.assertIn("api/routes.py", conflict_report.clean_files)

                # Clean reconciliation on single lease
                clean_report = await mgr.reconcile_wave_patches(wave_index=0, leases=[l1])
                self.assertEqual(clean_report.status, "clean")
                self.assertEqual(clean_report.conflicting_files, [])

                # Release cleans up isolated workspace directories
                await mgr.release(l1.lease_id)
                await mgr.release(l2.lease_id)
                self.assertFalse(Path(l1.worktree_path).exists())
                self.assertFalse(Path(l2.worktree_path).exists())

        asyncio.run(_run())

    def test_verification_sandbox_unittest_and_hardened_docker_args(self) -> None:
        async def _run() -> None:
            sandbox = VerificationSandbox()
            with tempfile.TemporaryDirectory(prefix="forge-m1-sbx-") as tmp:
                root = Path(tmp)
                docker_args = sandbox.build_hardened_docker_args(
                    workspace_dir=root,
                    inner_command=["python3", "-m", "py_compile", "ok.py"],
                )
                self.assertIn("--network=none", docker_args)
                self.assertIn("--read-only", docker_args)
                self.assertIn("--cap-drop=ALL", docker_args)
                self.assertIn("--security-opt=no-new-privileges", docker_args)
                self.assertIn("--pids-limit=64", docker_args)
                self.assertIn("--memory=512m", docker_args)

                ok_test = root / "test_ok.py"
                ok_test.write_text(
                    "import unittest\n"
                    "class T(unittest.TestCase):\n"
                    "    def test_math(self): self.assertEqual(2 + 2, 4)\n",
                    encoding="utf-8",
                )
                pass_res = await sandbox.run_profile(
                    profile="python_unittest",
                    target_files=["test_ok.py"],
                    cwd=root,
                )
                self.assertTrue(pass_res.passed)
                self.assertEqual(pass_res.findings, [])

                fail_test = root / "test_fail.py"
                fail_test.write_text(
                    "import unittest\n"
                    "class T(unittest.TestCase):\n"
                    "    def test_broken(self): self.assertEqual(1, 2)\n",
                    encoding="utf-8",
                )
                fail_res = await sandbox.run_profile(
                    profile="python_unittest",
                    target_files=["test_fail.py"],
                    cwd=root,
                )
                self.assertFalse(fail_res.passed)
                self.assertEqual(len(fail_res.findings), 1)
                self.assertTrue(fail_res.findings[0]["blocking"])
                self.assertEqual(fail_res.findings[0]["finding_id"], "qa_unittest_failure")

                # Containerized syntax check falls back cleanly to local_allowlisted when Docker disabled
                syntax_res = await sandbox.run_profile(
                    profile="containerized_python_syntax",
                    target_files=["test_ok.py"],
                    cwd=root,
                )
                self.assertTrue(syntax_res.passed)
                self.assertEqual(syntax_res.sandbox_mode, "local_allowlisted")

        asyncio.run(_run())

    def test_model_router_local_preference_and_kernel_reconciliation_cost_feedback(self) -> None:
        router = ModelRouter()
        local_eng = router.select_model(
            department="engineering",
            role="backend_engineer",
            prefer_local=True,
        )
        self.assertEqual(local_eng.provider_preference[:2], ("ollama", "vllm"))
        self.assertEqual(local_eng.task_complexity, "medium")
        self.assertEqual(local_eng.estimated_cost_per_call_usd, 0.001)

        cloud_sec = router.select_model(
            department="security",
            role="security_engineer",
            prefer_local=True,
        )
        self.assertEqual(cloud_sec.tier, "reasoning")
        self.assertEqual(cloud_sec.task_complexity, "high")

        # Real token-cost calculation
        exact_cost = ModelRouter.compute_actual_cost(
            {"input_tokens": 10_000, "output_tokens": 2_000},
            cloud_sec,
        )
        expected = round(
            (10_000 / 1_000_000.0) * cloud_sec.input_cost_per_1m_usd
            + (2_000 / 1_000_000.0) * cloud_sec.output_cost_per_1m_usd,
            6,
        )
        self.assertEqual(exact_cost, expected)

        # Full AgentKernel integration verifying wave reconciliation + token-cost feedback
        async def _run_kernel() -> None:
            observed_routes: Dict[str, Dict[str, Any]] = {}
            emitted: List[str] = []

            async def _executor(task: KernelTask, ctx: Dict[str, Any], _del: Any) -> Dict[str, Any]:
                observed_routes[task.id] = dict(ctx.get("model_route") or {})
                if task.role == "frontend_engineer":
                    return {
                        "summary": "Implemented React view and shared API contract types cleanly.",
                        "touched_files": ["frontend/App.tsx", "shared/api.ts"],
                        "usage": {"input_tokens": 4_000, "output_tokens": 1_000},
                    }
                if task.role == "backend_engineer":
                    return {
                        "summary": "Implemented FastAPI endpoint and updated shared contract schema.",
                        "touched_files": ["backend/api.py", "shared/api.ts"],
                        "usage": {"input_tokens": 5_000, "output_tokens": 1_500},
                    }
                return {
                    "summary": "Completed security verification audit with zero blocking defects.",
                    "touched_files": ["SECURITY.md"],
                    "usage": {"input_tokens": 10_000, "output_tokens": 2_000},
                }

            async def _sink(event_name: str, _payload: Dict[str, Any]) -> None:
                emitted.append(event_name)

            tasks = [
                KernelTask(
                    id="t_fe",
                    title="Frontend",
                    role="frontend_engineer",
                    department="engineering",
                    description="Build UI",
                    wave_index=0,
                ),
                KernelTask(
                    id="t_be",
                    title="Backend",
                    role="backend_engineer",
                    department="engineering",
                    description="Build API",
                    wave_index=0,
                ),
                KernelTask(
                    id="t_sec",
                    title="Security Audit",
                    role="security_engineer",
                    department="security",
                    description="Verify auth and boundaries",
                    depends_on=["t_fe", "t_be"],
                    wave_index=1,
                ),
            ]
            run = KernelRun(
                id="krun_m1_test",
                project_id="proj_m1",
                objective="Implement full-stack feature with local LLM preference",
                tasks=tasks,
                waves=[["t_fe", "t_be"], ["t_sec"]],
                config=KernelExecutionConfig(
                    isolate_worktrees=True,
                    prefer_local_llm=True,
                    max_repair_rounds=0,
                    max_budget_usd=1.0,
                ),
            )
            kernel = AgentKernel(task_executor=_executor)
            await kernel.execute_run(run, event_sink=_sink)

            self.assertEqual(run.status, KernelRunStatus.COMPLETED)
            self.assertEqual(observed_routes["t_fe"]["provider_preference"][0], "ollama")
            self.assertEqual(observed_routes["t_sec"]["task_complexity"], "high")
            self.assertEqual(len(run.reconciliations), 1)
            self.assertEqual(run.reconciliations[0]["status"], "conflicts_detected")
            self.assertEqual(
                run.reconciliations[0]["conflicting_files"][0]["file_path"],
                "shared/api.ts",
            )
            self.assertEqual(run.to_dict()["metrics"]["reconciliation_count"], 1)
            self.assertIn("kernel_wave_reconciled", emitted)
            # Local LLM engineering tasks cost $0.000000 from 0.0 token rate; cloud sec task costs exact `expected`
            self.assertAlmostEqual(run.cost_summary["spent_usd"], expected, places=6)

        asyncio.run(_run_kernel())

    def test_ai_sdk_ui_stream_protocol_wire_adapter(self) -> None:
        events = [
            AGUIEvent(1, "RUN_STARTED", "kernel_run_started", "proj_1", "run_9", {"waves": 2}),
            AGUIEvent(2, "STEP_STARTED", "kernel_wave_started", "proj_1", "run_9", {"wave_index": 0}),
            AGUIEvent(
                3,
                "TOOL_CALL_RESULT",
                "kernel_delegation",
                "proj_1",
                "run_9",
                {"delegation_id": "del_1", "answer": "Approved"},
            ),
            AGUIEvent(4, "HEARTBEAT", "heartbeat", "", "run_9", {"status": "alive"}),
            AGUIEvent(
                5,
                "RUN_FINISHED",
                "kernel_run_completed",
                "proj_1",
                "run_9",
                {"status": "completed"},
            ),
        ]
        all_frames: List[str] = []
        for ev in events:
            all_frames.extend(agui_event_to_ai_sdk_chunks(ev))

        self.assertEqual(all_frames[-1], "data: [DONE]\n\n")
        parsed_types = [
            json.loads(frame[len("data: ") :].strip())["type"]
            for frame in all_frames
            if frame != "data: [DONE]\n\n"
        ]
        self.assertIn("start", parsed_types)
        self.assertIn("start-step", parsed_types)
        self.assertIn("tool-output-available", parsed_types)
        self.assertIn("data-kernel-state", parsed_types)
        self.assertIn("finish-step", parsed_types)
        self.assertIn("finish", parsed_types)

        card = build_forge_agent_card(project_id="proj_1", base_url="https://forge.example.com")
        self.assertIn("ai-sdk-ui-stream/v1", card.protocols_supported)


if __name__ == "__main__":
    unittest.main()
