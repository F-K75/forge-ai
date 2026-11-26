"""Automated tests for Multi-Agent Phase 2 Collaboration Primitives:
- Shared Blackboard artifact versioning, scoped query, and same-wave file conflicts
- Autonomous Critique -> Remediation -> Re-Verification loops (recovery + escalation)
- Human-in-the-loop Pre-Delivery Approval Gates (approve resume + reject halt)

Runnable via both `pytest` and `python3 -m unittest`.
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.agent_collaboration import (  # noqa: E402
    AgentBlackboard,
    ApprovalStatus,
    ArtifactType,
    extract_blocking_findings,
)
from core.agent_kernel import (  # noqa: E402
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
    KernelTaskStatus,
)


class TestAgentBlackboard(unittest.IsolatedAsyncioTestCase):
    async def test_versioning_query_and_same_wave_file_conflict(self) -> None:
        bb = AgentBlackboard()

        a1, c1 = await bb.publish(
            key="backend_engineer",
            artifact_type=ArtifactType.CODE_PATCH,
            producer_task_id="t_be",
            producer_role="backend_engineer",
            department="engineering",
            wave_index=1,
            summary="Initial API route patch",
            touched_files=["backend/api/v1.py", "backend/core/agent_kernel.py"],
        )
        self.assertEqual(a1.version, 1)
        self.assertEqual(c1, [])

        # Same wave, different task touching overlapping file -> conflict detected
        a2, c2 = await bb.publish(
            key="frontend_engineer",
            artifact_type=ArtifactType.CODE_PATCH,
            producer_task_id="t_fe",
            producer_role="frontend_engineer",
            department="engineering",
            wave_index=1,
            summary="Wiring shared route schema",
            touched_files=["backend/api/v1.py", "frontend/src/App.tsx"],
        )
        self.assertEqual(a2.version, 1)
        self.assertEqual(len(c2), 1)
        self.assertEqual(c2[0].file_path, "backend/api/v1.py")
        self.assertEqual(set(c2[0].task_ids), {"t_be", "t_fe"})

        # Different wave touching same file -> NOT a same-wave parallel conflict
        _, c3 = await bb.publish(
            key="security_engineer",
            artifact_type=ArtifactType.SECURITY_AUDIT,
            producer_task_id="t_sec",
            producer_role="security_engineer",
            department="security",
            wave_index=2,
            summary="Audited v1.py",
            touched_files=["backend/api/v1.py"],
        )
        self.assertEqual(c3, [])

        # Re-publishing same key bumps version to v2
        a1_v2, _ = await bb.publish(
            key="backend_engineer",
            artifact_type=ArtifactType.CODE_PATCH,
            producer_task_id="t_be",
            producer_role="backend_engineer",
            department="engineering",
            wave_index=1,
            summary="Patched API route after security finding",
            touched_files=["backend/api/v1.py"],
        )
        self.assertEqual(a1_v2.version, 2)

        latest_patches = bb.query(artifact_types=[ArtifactType.CODE_PATCH], latest_only=True)
        self.assertEqual(len(latest_patches), 2)
        be_latest = [a for a in latest_patches if a.key == "backend_engineer"][0]
        self.assertEqual(be_latest.version, 2)

        all_patches = bb.query(artifact_types=[ArtifactType.CODE_PATCH], latest_only=False)
        self.assertEqual(len(all_patches), 3)

    def test_extract_blocking_findings_filters_non_blocking(self) -> None:
        findings = extract_blocking_findings(
            {
                "findings": [
                    {"severity": "low", "message": "Minor style nit"},
                    {"severity": "critical", "message": "Missing auth check", "target_role": "backend_engineer"},
                    {"severity": "medium", "blocking": True, "message": "Missing input limit"},
                ]
            }
        )
        self.assertEqual(len(findings), 2)
        self.assertEqual(findings[0].target_role, "backend_engineer")


class TestCritiqueRepairAndApprovalGates(unittest.IsolatedAsyncioTestCase):
    async def test_autonomous_critique_repair_loop_resolves_on_round_one(self) -> None:
        events: List[tuple[str, Dict[str, Any]]] = []
        be_calls: List[Dict[str, Any]] = []
        sec_call_count = 0

        async def executor(task: KernelTask, ctx: Dict[str, Any], _dctx: Any) -> Dict[str, Any]:
            nonlocal sec_call_count
            if task.role == "backend_engineer":
                be_calls.append(dict(ctx))
                repaired = bool(ctx.get("repair_findings"))
                return {
                    "summary": "Added auth guard and rate limit" if repaired else "Initial route patch",
                    "touched_files": ["backend/api/kernel.py"],
                    "repaired": repaired,
                }
            if task.role == "security_engineer":
                sec_call_count += 1
                if sec_call_count == 1:
                    return {
                        "summary": "Found missing project ownership check",
                        "findings": [
                            {
                                "severity": "critical",
                                "blocking": True,
                                "target_role": "backend_engineer",
                                "message": "Verify project ownership before returning run artifacts",
                                "suggested_fix": "Call _assert_project_access(db, project_id, current_user.id)",
                            }
                        ],
                    }
                return {
                    "summary": "Re-verification passed with 0 blocking issues",
                    "findings": [],
                }
            return {"summary": f"Completed {task.role}"}

        async def sink(event_name: str, payload: Dict[str, Any]) -> None:
            events.append((event_name, payload))

        run = KernelRun(
            id="krun_repair_ok",
            project_id="proj_1",
            objective="Build secure kernel artifacts endpoint",
            tasks=[
                KernelTask("t_be", "Implement endpoint", "backend_engineer", "engineering", "Build route"),
                KernelTask(
                    "t_sec",
                    "Security audit",
                    "security_engineer",
                    "security",
                    "Audit route",
                    depends_on=["t_be"],
                ),
            ],
            config=KernelExecutionConfig(max_repair_rounds=2),
        )

        kernel = AgentKernel(task_executor=executor, event_sink=sink)
        result = await kernel.execute_run(run)

        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        self.assertEqual(len(be_calls), 2)
        self.assertTrue(be_calls[1].get("repair_findings"))
        self.assertEqual(be_calls[1].get("repair_round"), 1)
        self.assertEqual(sec_call_count, 2)
        self.assertEqual(len(result.repair_cycles), 1)
        self.assertEqual(result.repair_cycles[0]["outcome"], "resolved")
        self.assertEqual(result.repair_cycles[0]["target_role"], "backend_engineer")

        # Verify backend_engineer artifact bumped from v1 -> v2 on Blackboard
        be_artifacts = [a for a in result.artifacts if a["producer_role"] == "backend_engineer"]
        self.assertEqual([a["version"] for a in be_artifacts], [1, 2])
        self.assertTrue(any(name == "kernel_repair_cycle" for name, _ in events))

    async def test_repair_exhaustion_escalates_and_opens_gate(self) -> None:
        async def always_blocking_executor(task: KernelTask, _ctx: Dict[str, Any], _dctx: Any) -> Dict[str, Any]:
            if task.role == "security_engineer":
                return {
                    "summary": "Persistent vulnerability detected",
                    "findings": [
                        {
                            "severity": "critical",
                            "blocking": True,
                            "target_role": "backend_engineer",
                            "message": "Unresolved token validation bypass",
                        }
                    ],
                }
            return {"summary": f"Attempted {task.role}", "touched_files": ["backend/api/auth.py"]}

        run = KernelRun(
            id="krun_escalate",
            project_id="proj_1",
            objective="Harden auth flow",
            tasks=[
                KernelTask("t_be", "Patch auth", "backend_engineer", "engineering", "Patch auth"),
                KernelTask(
                    "t_sec",
                    "Audit auth",
                    "security_engineer",
                    "security",
                    "Audit auth",
                    depends_on=["t_be"],
                ),
                KernelTask(
                    "t_rel",
                    "Release",
                    "release_manager",
                    "delivery",
                    "Ship release",
                    depends_on=["t_sec"],
                ),
            ],
            config=KernelExecutionConfig(
                max_repair_rounds=1,
                require_delivery_approval=True,
                approval_timeout_seconds=5.0,
            ),
        )

        kernel = AgentKernel(task_executor=always_blocking_executor)
        gate_seen = asyncio.Event()
        captured_gate_id: List[str] = []

        async def sink(event_name: str, payload: Dict[str, Any]) -> None:
            if event_name == "kernel_approval_required":
                captured_gate_id.append(payload["gate"]["gate_id"])
                gate_seen.set()

        exec_task = asyncio.create_task(kernel.execute_run(run, event_sink=sink))
        await asyncio.wait_for(gate_seen.wait(), timeout=2.0)

        self.assertEqual(run.status, KernelRunStatus.WAITING_APPROVAL)
        resolved = kernel.resolve_approval_gate(
            run.id,
            captured_gate_id[0],
            approved=False,
            actor="cto@forge.ai",
            note="Hold release until critical finding is fixed",
        )
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.status, ApprovalStatus.REJECTED)

        result = await exec_task
        self.assertEqual(result.repair_cycles[-1]["outcome"], "escalated")
        release_task = [t for t in result.tasks if t.id == "t_rel"][0]
        self.assertEqual(release_task.status, KernelTaskStatus.BLOCKED)
        self.assertEqual(result.status, KernelRunStatus.PARTIAL_FAILURE)

    async def test_pre_delivery_approval_gate_approve_resumes_execution(self) -> None:
        async def ok_executor(task: KernelTask, _ctx: Dict[str, Any], _dctx: Any) -> Dict[str, Any]:
            return {"summary": f"Done {task.role}", "touched_files": [f"src/{task.id}.ts"]}

        run = KernelRun(
            id="krun_gate_ok",
            project_id="proj_1",
            objective="Ship billing feature",
            tasks=[
                KernelTask("t_be", "Build API", "backend_engineer", "engineering", "API"),
                KernelTask(
                    "t_rel",
                    "Deploy release",
                    "release_manager",
                    "delivery",
                    "Deploy",
                    depends_on=["t_be"],
                ),
            ],
            config=KernelExecutionConfig(
                require_delivery_approval=True,
                approval_timeout_seconds=5.0,
            ),
        )

        kernel = AgentKernel(task_executor=ok_executor)
        gate_seen = asyncio.Event()
        gate_ids: List[str] = []

        async def sink(event_name: str, payload: Dict[str, Any]) -> None:
            if event_name == "kernel_approval_required":
                gate_ids.append(payload["gate"]["gate_id"])
                gate_seen.set()

        exec_task = asyncio.create_task(kernel.execute_run(run, event_sink=sink))
        await asyncio.wait_for(gate_seen.wait(), timeout=2.0)

        self.assertEqual(run.status, KernelRunStatus.WAITING_APPROVAL)
        self.assertIsNotNone(kernel.get_active_run(run.id))

        gate = kernel.resolve_approval_gate(
            run.id,
            gate_ids[0],
            approved=True,
            actor="cto@forge.ai",
            note="Verified staging checks",
        )
        self.assertIsNotNone(gate)
        self.assertEqual(gate.status, ApprovalStatus.APPROVED)

        result = await exec_task
        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        self.assertEqual(len(result.approval_gates), 1)
        self.assertEqual(result.approval_gates[0]["status"], "approved")
        self.assertEqual(result.approval_gates[0]["decided_by"], "cto@forge.ai")

    async def test_parallel_wave_file_conflict_emitted_in_run(self) -> None:
        events: List[tuple[str, Dict[str, Any]]] = []

        async def conflicting_executor(task: KernelTask, _ctx: Dict[str, Any], _dctx: Any) -> Dict[str, Any]:
            return {
                "summary": f"{task.role} updated shared schema",
                "touched_files": ["shared/contracts.ts"],
            }

        async def sink(event_name: str, payload: Dict[str, Any]) -> None:
            events.append((event_name, payload))

        run = KernelRun(
            id="krun_conflict",
            project_id="proj_1",
            objective="Parallel FE/BE schema update",
            tasks=[
                KernelTask("t_be", "Backend contract", "backend_engineer", "engineering", "BE"),
                KernelTask("t_fe", "Frontend contract", "frontend_engineer", "engineering", "FE"),
            ],
        )

        kernel = AgentKernel(task_executor=conflicting_executor, event_sink=sink)
        result = await kernel.execute_run(run)

        self.assertEqual(result.status, KernelRunStatus.COMPLETED)
        self.assertEqual(len(result.conflicts), 1)
        self.assertEqual(result.conflicts[0]["file_path"], "shared/contracts.ts")
        self.assertTrue(any(name == "kernel_conflict_detected" for name, _ in events))


if __name__ == "__main__":
    unittest.main()
