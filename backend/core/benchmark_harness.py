"""Autonomous Multi-Agent Evaluation & Regression Benchmark Harness.

Executes canonical deterministic scenarios against Forge AI's live `AgentKernel`
to verify multi-wave DAG scheduling, worktree conflict reconciliation,
critique-repair self-healing, and local/cloud model cost routing — then compares
results against a stored project baseline to gate quality or cost regressions.
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)
ReportPersisterFn = Callable[[Dict[str, Any]], Awaitable[None]]

from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class BenchmarkCaseResult:
    case_id: str
    title: str
    passed: bool
    quality_score: float
    cost_usd: float
    duration_ms: int
    wave_count: int
    reconciliations: int
    repair_cycles: int
    details: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RegressionGateResult:
    passed: bool
    has_baseline: bool
    quality_delta: float
    cost_delta_pct: float
    regressions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BenchmarkSuiteReport:
    suite_id: str
    project_id: str
    cases: List[BenchmarkCaseResult]
    pass_rate: float
    avg_quality_score: float
    total_cost_usd: float
    total_duration_ms: int
    regression_gate: RegressionGateResult
    executed_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d


class MultiAgentBenchmarkHarness:
    """Runs deterministic multi-agent benchmarks and enforces quality/cost regression gates."""

    def __init__(self) -> None:
        self._history_by_project: Dict[str, List[BenchmarkSuiteReport]] = {}
        self._persister: Optional[ReportPersisterFn] = None

    def attach_persister(self, persister: ReportPersisterFn) -> None:
        """Attach an optional fail-open async storage sink (e.g., MongoDB)."""
        self._persister = persister

    def hydrate_report(self, doc: Dict[str, Any]) -> Optional[BenchmarkSuiteReport]:
        """Restore a persisted BenchmarkSuiteReport without re-persisting."""
        project_id = str(doc.get("project_id") or "").strip()
        suite_id = str(doc.get("suite_id") or "").strip()
        if not project_id or not suite_id:
            return None
        cases: List[BenchmarkCaseResult] = []
        for raw in doc.get("cases") or []:
            if not isinstance(raw, dict):
                continue
            cases.append(
                BenchmarkCaseResult(
                    case_id=str(raw.get("case_id") or ""),
                    title=str(raw.get("title") or ""),
                    passed=bool(raw.get("passed", False)),
                    quality_score=float(raw.get("quality_score", 0.0)),
                    cost_usd=float(raw.get("cost_usd", 0.0)),
                    duration_ms=int(raw.get("duration_ms", 0)),
                    wave_count=int(raw.get("wave_count", 0)),
                    reconciliations=int(raw.get("reconciliations", 0)),
                    repair_cycles=int(raw.get("repair_cycles", 0)),
                    details=str(raw.get("details") or ""),
                )
            )
        raw_gate = doc.get("regression_gate") or {}
        gate = RegressionGateResult(
            passed=bool(raw_gate.get("passed", True)),
            has_baseline=bool(raw_gate.get("has_baseline", False)),
            quality_delta=float(raw_gate.get("quality_delta", 0.0)),
            cost_delta_pct=float(raw_gate.get("cost_delta_pct", 0.0)),
            regressions=list(raw_gate.get("regressions") or []),
        )
        report = BenchmarkSuiteReport(
            suite_id=suite_id,
            project_id=project_id,
            cases=cases,
            pass_rate=float(doc.get("pass_rate", 0.0)),
            avg_quality_score=float(doc.get("avg_quality_score", 0.0)),
            total_cost_usd=float(doc.get("total_cost_usd", 0.0)),
            total_duration_ms=int(doc.get("total_duration_ms", 0)),
            regression_gate=gate,
            executed_at=str(doc.get("executed_at") or _utc_now()),
        )
        history = self._history_by_project.setdefault(project_id, [])
        if not any(existing.suite_id == suite_id for existing in history):
            history.append(report)
            if len(history) > 25:
                del history[: len(history) - 25]
        return report

    async def run_suite(
        self,
        *,
        project_id: str,
        quality_drop_tolerance: float = 0.05,
        cost_spike_tolerance_pct: float = 25.0,
    ) -> BenchmarkSuiteReport:
        t0 = time.monotonic()
        cases = [
            await self._case_parallel_conflict_reconciliation(project_id),
            await self._case_autonomous_critique_repair(project_id),
            await self._case_local_llm_cost_efficiency(project_id),
        ]
        total_ms = int((time.monotonic() - t0) * 1000)
        pass_rate = round(sum(1 for c in cases if c.passed) / max(1, len(cases)), 3)
        avg_quality = round(
            sum(c.quality_score for c in cases) / max(1, len(cases)), 3
        )
        total_cost = round(sum(c.cost_usd for c in cases), 6)

        history = self._history_by_project.setdefault(project_id, [])
        baseline = history[-1] if history else None
        gate = self._evaluate_regression_gate(
            baseline=baseline,
            pass_rate=pass_rate,
            avg_quality=avg_quality,
            total_cost=total_cost,
            quality_drop_tolerance=quality_drop_tolerance,
            cost_spike_tolerance_pct=cost_spike_tolerance_pct,
        )

        report = BenchmarkSuiteReport(
            suite_id=f"bench_{len(history) + 1}_{int(time.time())}",
            project_id=project_id,
            cases=cases,
            pass_rate=pass_rate,
            avg_quality_score=avg_quality,
            total_cost_usd=total_cost,
            total_duration_ms=total_ms,
            regression_gate=gate,
        )
        history.append(report)
        if len(history) > 25:
            del history[: len(history) - 25]
        if self._persister is not None:
            try:
                await self._persister(report.to_dict())
            except Exception:
                logger.debug("Benchmark report persister error for %s", report.suite_id, exc_info=True)
        return report

    def get_history(self, project_id: str, *, limit: int = 10) -> List[Dict[str, Any]]:
        history = self._history_by_project.get(project_id, [])
        return [r.to_dict() for r in history[-limit:][::-1]]

    @staticmethod
    def _evaluate_regression_gate(
        *,
        baseline: Optional[BenchmarkSuiteReport],
        pass_rate: float,
        avg_quality: float,
        total_cost: float,
        quality_drop_tolerance: float,
        cost_spike_tolerance_pct: float,
    ) -> RegressionGateResult:
        regressions: List[str] = []
        if pass_rate < 1.0:
            regressions.append(f"Benchmark pass rate dropped to {round(pass_rate * 100)}%")
        if baseline is None:
            return RegressionGateResult(
                passed=(len(regressions) == 0),
                has_baseline=False,
                quality_delta=0.0,
                cost_delta_pct=0.0,
                regressions=regressions,
            )

        q_delta = round(avg_quality - baseline.avg_quality_score, 3)
        if q_delta < -quality_drop_tolerance:
            regressions.append(
                f"Avg quality regressed by {q_delta:+.3f} (baseline {baseline.avg_quality_score:.3f})"
            )
        base_cost = max(0.0001, baseline.total_cost_usd)
        cost_delta_pct = round(((total_cost - base_cost) / base_cost) * 100.0, 1)
        if cost_delta_pct > cost_spike_tolerance_pct:
            regressions.append(
                f"Benchmark cost spiked by +{cost_delta_pct:.1f}% above baseline"
            )
        return RegressionGateResult(
            passed=(len(regressions) == 0),
            has_baseline=True,
            quality_delta=q_delta,
            cost_delta_pct=cost_delta_pct,
            regressions=regressions,
        )

    async def _case_parallel_conflict_reconciliation(
        self, project_id: str
    ) -> BenchmarkCaseResult:
        async def _exec(task: KernelTask, _ctx: Dict[str, Any], _del: Any) -> Dict[str, Any]:
            if task.role == "frontend_engineer":
                return {
                    "summary": "Delivered React dashboard view and shared TypeScript contract definitions.",
                    "touched_files": ["frontend/Dashboard.tsx", "shared/contract.ts"],
                    "usage": {"input_tokens": 3000, "output_tokens": 800},
                }
            return {
                "summary": "Delivered FastAPI route handlers and aligned shared API contract types.",
                "touched_files": ["backend/routes.py", "shared/contract.ts"],
                "usage": {"input_tokens": 3500, "output_tokens": 900},
            }

        run = KernelRun(
            id="bench_reconcile",
            project_id=project_id,
            objective="Benchmark parallel worktree conflict detection & reconciliation",
            tasks=[
                KernelTask("t_fe", "FE", "frontend_engineer", "engineering", "Build UI", wave_index=0),
                KernelTask("t_be", "BE", "backend_engineer", "engineering", "Build API", wave_index=0),
            ],
            waves=[["t_fe", "t_be"]],
            config=KernelExecutionConfig(isolate_worktrees=True, max_repair_rounds=0),
        )
        await AgentKernel(task_executor=_exec).execute_run(run)
        rec_ok = (
            len(run.reconciliations) == 1
            and run.reconciliations[0].get("status") == "conflicts_detected"
        )
        d = run.to_dict()
        return BenchmarkCaseResult(
            case_id="parallel_worktree_reconciliation",
            title="Parallel Worktree Conflict Reconciliation",
            passed=(run.status == KernelRunStatus.COMPLETED and rec_ok),
            quality_score=float(d["metrics"]["avg_quality_score"]),
            cost_usd=float(d["metrics"]["total_cost_usd"]),
            duration_ms=run.duration_ms,
            wave_count=len(run.waves),
            reconciliations=len(run.reconciliations),
            repair_cycles=len(run.repair_cycles),
            details="Detected overlapping shared/contract.ts write across isolated parallel worktrees.",
        )

    async def _case_autonomous_critique_repair(self, project_id: str) -> BenchmarkCaseResult:
        sec_calls = 0

        async def _exec(task: KernelTask, ctx: Dict[str, Any], _del: Any) -> Dict[str, Any]:
            nonlocal sec_calls
            if task.role == "backend_engineer":
                if ctx.get("repair_round"):
                    return {
                        "summary": "Remediated missing project ownership assertion and added regression check.",
                        "touched_files": ["backend/api/protected.py"],
                        "usage": {"input_tokens": 4000, "output_tokens": 1200},
                    }
                return {
                    "summary": "Initial endpoint draft ready for security review.",
                    "touched_files": ["backend/api/protected.py"],
                    "usage": {"input_tokens": 3000, "output_tokens": 900},
                }
            sec_calls += 1
            if sec_calls == 1:
                return {
                    "summary": "Blocking auth boundary finding detected on draft endpoint.",
                    "touched_files": ["SECURITY.md"],
                    "findings": [
                        {
                            "finding_id": "bench_auth_1",
                            "severity": "critical",
                            "blocking": True,
                            "target_role": "backend_engineer",
                            "message": "Missing project ownership verification",
                            "suggested_fix": "Verify project access before returning records",
                        }
                    ],
                    "usage": {"input_tokens": 5000, "output_tokens": 1000},
                }
            return {
                "summary": "Re-verified remediated endpoint with zero remaining security findings.",
                "touched_files": ["SECURITY.md"],
                "findings": [],
                "usage": {"input_tokens": 4000, "output_tokens": 800},
            }

        run = KernelRun(
            id="bench_repair",
            project_id=project_id,
            objective="Benchmark autonomous critique-remediation-reverification loop",
            tasks=[
                KernelTask("t_be", "BE", "backend_engineer", "engineering", "Implement route", wave_index=0),
                KernelTask(
                    "t_sec",
                    "Sec",
                    "security_engineer",
                    "security",
                    "Audit route",
                    depends_on=["t_be"],
                    wave_index=1,
                ),
            ],
            waves=[["t_be"], ["t_sec"]],
            config=KernelExecutionConfig(isolate_worktrees=True, max_repair_rounds=2),
        )
        await AgentKernel(task_executor=_exec).execute_run(run)
        repaired = (
            len(run.repair_cycles) == 1
            and run.repair_cycles[0].get("outcome") == "resolved"
        )
        d = run.to_dict()
        return BenchmarkCaseResult(
            case_id="autonomous_critique_repair",
            title="Autonomous Critique-Repair Loop",
            passed=(run.status == KernelRunStatus.COMPLETED and repaired),
            quality_score=float(d["metrics"]["avg_quality_score"]),
            cost_usd=float(d["metrics"]["total_cost_usd"]),
            duration_ms=run.duration_ms,
            wave_count=len(run.waves),
            reconciliations=len(run.reconciliations),
            repair_cycles=len(run.repair_cycles),
            details="Security finding automatically re-dispatched backend_engineer and resolved in round 1.",
        )

    async def _case_local_llm_cost_efficiency(self, project_id: str) -> BenchmarkCaseResult:
        local_routed = False

        async def _exec(task: KernelTask, ctx: Dict[str, Any], _del: Any) -> Dict[str, Any]:
            nonlocal local_routed
            route = ctx.get("model_route") or {}
            prefs = route.get("provider_preference") or []
            if prefs and prefs[0] == "ollama":
                local_routed = True
            return {
                "summary": "Generated release runbook and verified schema migration via local model route.",
                "touched_files": ["RELEASE_NOTES.md"],
                "usage": {"input_tokens": 6000, "output_tokens": 1500},
            }

        run = KernelRun(
            id="bench_local_cost",
            project_id=project_id,
            objective="Benchmark self-hosted local LLM preference and token budget tracking",
            tasks=[
                KernelTask("t_eng", "Eng", "backend_engineer", "engineering", "Build service", wave_index=0),
                KernelTask(
                    "t_doc",
                    "Docs",
                    "documentation_agent",
                    "delivery",
                    "Write docs",
                    depends_on=["t_eng"],
                    wave_index=1,
                ),
            ],
            waves=[["t_eng"], ["t_doc"]],
            config=KernelExecutionConfig(
                isolate_worktrees=True, prefer_local_llm=True, max_repair_rounds=0
            ),
        )
        await AgentKernel(task_executor=_exec).execute_run(run)
        d = run.to_dict()
        return BenchmarkCaseResult(
            case_id="local_llm_cost_efficiency",
            title="Local LLM Routing & Zero-Cloud-Cost Offload",
            passed=(
                run.status == KernelRunStatus.COMPLETED
                and local_routed
                and float(d["metrics"]["total_cost_usd"]) == 0.0
            ),
            quality_score=float(d["metrics"]["avg_quality_score"]),
            cost_usd=float(d["metrics"]["total_cost_usd"]),
            duration_ms=run.duration_ms,
            wave_count=len(run.waves),
            reconciliations=len(run.reconciliations),
            repair_cycles=len(run.repair_cycles),
            details="Routed balanced and fast tasks to Ollama/vLLM preference with $0.0000 cloud token spend.",
        )


_benchmark_harness_singleton: Optional[MultiAgentBenchmarkHarness] = None


def get_benchmark_harness() -> MultiAgentBenchmarkHarness:
    global _benchmark_harness_singleton
    if _benchmark_harness_singleton is None:
        _benchmark_harness_singleton = MultiAgentBenchmarkHarness()
    return _benchmark_harness_singleton
