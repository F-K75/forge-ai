"""REST API for prompt engineering, context engineering, harness
engineering, and loop engineering modules.

Extends the existing /prompts endpoints with the new capabilities from
all four engineering disciplines.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.admin import admin_required
from api.auth import get_current_user
from core.models import User
from prompt_builder import get_template_registry
from prompt_builder.models import PromptContext

from prompt_engineer import (
    VersionManager,
    PromptOptimizer,
    FewShotManager,
    PromptComposer,
    OptimizationConfig,
    CompositionPlan,
    FewShotExample,
)
from context_engineer import (
    ContextAssembler,
    AssemblyPlan,
    ContextSource,
    TokenBudget,
)
from harness import (
    PromptEvaluator,
    ABTestRunner,
    RegressionTester,
    MetricsCollector,
    PromptBenchmark,
    TestCase,
    TestSuite,
    EvaluationResult,
    ABTestConfig,
)
from harness.models import QualityMetrics
from loop_engineer import LoopController, LoopConfig
from engineering_repository import get_loop_repository

router = APIRouter(prefix="/engineering", tags=["engineering"])

# ---------------------------------------------------------------------------
# Shared instances (lazy-initialised singletons matching agents/base.py pattern)
# ---------------------------------------------------------------------------
_version_manager: Optional[VersionManager] = None
_few_shot_manager: Optional[FewShotManager] = None
_context_assembler: Optional[ContextAssembler] = None
_prompt_optimizer: Optional[PromptOptimizer] = None
_evaluator: Optional[PromptEvaluator] = None
_metrics_collector: Optional[MetricsCollector] = None
_loop_controller: Optional[LoopController] = None


def _get_vm() -> VersionManager:
    global _version_manager
    if _version_manager is None:
        _version_manager = VersionManager()
    return _version_manager


def _get_fsm() -> FewShotManager:
    global _few_shot_manager
    if _few_shot_manager is None:
        _few_shot_manager = FewShotManager()
    return _few_shot_manager


def _get_ca() -> ContextAssembler:
    global _context_assembler
    if _context_assembler is None:
        _context_assembler = ContextAssembler()
    return _context_assembler


def _get_po() -> PromptOptimizer:
    global _prompt_optimizer
    if _prompt_optimizer is None:
        _prompt_optimizer = PromptOptimizer()
    return _prompt_optimizer


def _get_eval() -> PromptEvaluator:
    global _evaluator
    if _evaluator is None:
        _evaluator = PromptEvaluator()
    return _evaluator


def _get_mc() -> MetricsCollector:
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector


def _get_lc() -> LoopController:
    global _loop_controller
    if _loop_controller is None:
        _loop_controller = LoopController()
    return _loop_controller


# ========================================
# Request / Response models
# ========================================

class VersionRecordRequest(BaseModel):
    role: str
    version: str
    change_type: str
    change_reason: str = ""
    author: str = "api"


class OptimizeRequest(BaseModel):
    role: str
    version: str = "v1"
    eval_results: List[Dict[str, Any]]
    max_iterations: int = 3
    target_metric: str = "format_compliance"


class FewShotAddRequest(BaseModel):
    example_id: str
    role: str
    input: str
    expected_output: str
    rationale: str = ""
    tags: List[str] = []


class FewShotSelectRequest(BaseModel):
    role: str
    task: str = ""
    strategy: str = "semantic"
    max_examples: int = 3


class ComposeRequest(BaseModel):
    plan_id: str
    roles: List[str]
    composition_strategy: str = "sequential"
    task: str = ""
    separator: str = "\n\n---\n\n"


class AssembleRequest(BaseModel):
    role: str
    task: str
    user_request: str = ""
    sources: Optional[List[str]] = None
    context_budget: int = 5000


class EvaluateRequest(BaseModel):
    suite_id: str
    role: str
    template_version: str = "v1"
    cases: List[Dict[str, Any]]
    output: str


class ABTestRequest(BaseModel):
    test_id: str
    role: str
    variant_a_version: str
    variant_b_version: str
    test_cases: List[Dict[str, Any]]
    output_a: str
    output_b: str


class RegressionCheckRequest(BaseModel):
    role: str
    current_output: str
    baseline_output: str
    suite_id: str = "regression-suite"
    template_version: str = "v1"
    cases: List[Dict[str, Any]]


class BenchmarkRequest(BaseModel):
    benchmark_id: str = ""
    role: str = ""
    variants: Dict[str, str]
    suite_id: str = "benchmark-suite"
    template_version: str = "v1"
    cases: List[Dict[str, Any]]


class LoopImproveRequest(BaseModel):
    role: str
    task: str
    suite_id: str = "loop-suite"
    template_version: str = "v1"
    cases: List[Dict[str, Any]]
    max_iterations: int = 5
    quality_threshold: float = 0.85


# ========================================
# Prompt Engineering endpoints
# ========================================

@router.get("/versions/{role}/{version}")
async def get_version_history(role: str, version: str, user: User = Depends(get_current_user)):
    """Get version history for a prompt template."""
    vm = _get_vm()
    history = vm.get_history(role, version)
    if history is None:
        return {"role": role, "version": version, "versions": []}
    return {
        "role": history.role,
        "version": history.version,
        "active_index": history.active_index,
        "versions": [
            {
                "index": i,
                "version": v.version,
                "change_type": v.change_type.value,
                "change_reason": v.change_reason,
                "author": v.author,
                "created_at": v.created_at,
            }
            for i, v in enumerate(history.versions)
        ],
    }


@router.post("/versions/rollback")
async def rollback_version(role: str, version: str, target_index: int, user: User = Depends(admin_required)):
    """Roll back a prompt template to a previous version."""
    vm = _get_vm()
    template = vm.rollback(role, version, target_index)
    if template is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"status": "ok", "role": role, "version": version, "restored_index": target_index}


@router.post("/versions/diff")
async def diff_versions(role: str, version: str, index_a: int, index_b: int, user: User = Depends(get_current_user)):
    """Show differences between two template versions."""
    vm = _get_vm()
    diffs = vm.diff(role, version, index_a, index_b)
    return {"role": role, "version": version, "index_a": index_a, "index_b": index_b, "diffs": diffs}


@router.post("/optimize")
async def optimize_prompt(req: OptimizeRequest, user: User = Depends(admin_required)):
    """Run prompt optimization on a template."""
    registry = get_template_registry()
    try:
        template = registry.get(req.role, req.version)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    optimizer = _get_po()
    config = OptimizationConfig(max_iterations=req.max_iterations, target_metric=req.target_metric)
    result = await optimizer.optimize(template, req.eval_results, config)

    return {
        "success": result.success,
        "iteration_count": result.iteration_count,
        "metrics_before": result.metrics_before,
        "metrics_after": result.metrics_after,
        "changes_made": result.changes_made,
        "original_template": json.loads(result.original_template_json),
        "optimized_template": json.loads(result.optimized_template_json),
    }


@router.get("/few-shot/{role}")
async def list_few_shot_examples(role: str, user: User = Depends(get_current_user)):
    """List few-shot examples for a role."""
    fsm = _get_fsm()
    examples = fsm.get_examples(role)
    return {
        "role": role,
        "examples": [
            {"example_id": e.example_id, "input": e.input[:100], "tags": e.tags, "score": e.score}
            for e in examples
        ],
    }


@router.post("/few-shot")
async def add_few_shot_example(req: FewShotAddRequest, user: User = Depends(admin_required)):
    """Add a few-shot example."""
    fsm = _get_fsm()
    example = FewShotExample(
        example_id=req.example_id,
        role=req.role,
        input=req.input,
        expected_output=req.expected_output,
        rationale=req.rationale,
        tags=req.tags,
        score=0.0,
        token_count=len(req.input) // 4 + len(req.expected_output) // 4,
    )
    fsm.add_example(example)
    return {"status": "ok", "example_id": req.example_id}


@router.post("/few-shot/select")
async def select_few_shot(req: FewShotSelectRequest, user: User = Depends(get_current_user)):
    """Select relevant few-shot examples for a task."""
    fsm = _get_fsm()
    selected = fsm.select(req.role, req.task, req.strategy, req.max_examples)
    formatted = fsm.format_examples(selected, include_rationale=True)
    return {
        "role": req.role,
        "count": len(selected),
        "examples": [
            {"example_id": e.example_id, "input": e.input[:100], "score": e.score}
            for e in selected
        ],
        "formatted": formatted,
    }


@router.post("/compose")
async def compose_prompts(req: ComposeRequest, user: User = Depends(admin_required)):
    """Compose multiple prompt templates into one."""
    registry = get_template_registry()
    templates = []
    for role in req.roles:
        try:
            templates.append(registry.get(role))
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"Template for role {role!r}: {exc}")

    composer = PromptComposer()
    plan = CompositionPlan(
        plan_id=req.plan_id,
        roles=req.roles,
        composition_strategy=req.composition_strategy,
        separator=req.separator,
    )
    from prompt_builder.models import ProjectStateSlice
    context = PromptContext(
        agent_role=req.roles[0],
        task=req.task,
        project_state=ProjectStateSlice(),
    )
    result = composer.compose(templates, plan, context)
    return {"plan_id": req.plan_id, "composition": result}


# ========================================
# Context Engineering endpoints
# ========================================

@router.post("/context/assemble")
async def assemble_context(req: AssembleRequest, user: User = Depends(get_current_user)):
    """Assemble context from multiple sources into a PromptContext."""
    ca = _get_ca()

    sources = None
    if req.sources:
        sources = [ContextSource(s) for s in req.sources]

    plan = AssemblyPlan(
        plan_id=f"api-{req.role}-assembly",
        role=req.role,
        sources=sources or [
            ContextSource.PROJECT_STATE,
            ContextSource.FILE_CONTENT,
            ContextSource.PREVIOUS_OUTPUTS,
            ContextSource.KNOWLEDGE_BASE,
        ],
        max_sources=len(sources) if sources else 4,
        token_budget=TokenBudget(context_max=req.context_budget),
    )

    context = await ca.assemble(
        role=req.role,
        task=req.task,
        plan=plan,
        user_request=req.user_request,
    )

    return {
        "role": context.agent_role,
        "task": context.task,
        "relevant_files": context.relevant_files,
        "previous_outputs": list(context.previous_outputs.keys()),
        "extra_keys": list(context.project_state.extra.keys()),
    }


@router.get("/context/sources")
async def list_context_sources(user: User = Depends(get_current_user)):
    """List available context sources."""
    return {
        "sources": [
            {"name": s.value, "description": s.name.replace("_", " ").title()}
            for s in ContextSource
        ]
    }


# ========================================
# Harness Engineering endpoints
# ========================================

@router.post("/evaluate")
async def evaluate_output(req: EvaluateRequest, user: User = Depends(get_current_user)):
    """Evaluate an agent output against a test suite."""
    evaluator = _get_eval()
    suite = TestSuite(
        suite_id=req.suite_id,
        role=req.role,
        template_version=req.template_version,
        cases=[TestCase(**c) for c in req.cases],
    )
    result = evaluator.evaluate_suite(req.output, suite)
    return _eval_result_to_dict(result)


@router.post("/ab-test")
async def ab_test(req: ABTestRequest, user: User = Depends(admin_required)):
    """Run A/B test between two prompt variants."""
    evaluator = _get_eval()
    runner = ABTestRunner(evaluator)

    config = ABTestConfig(
        test_id=req.test_id,
        role=req.role,
        variant_a_template_version=req.variant_a_version,
        variant_b_template_version=req.variant_b_version,
        test_cases=[TestCase(**c) for c in req.test_cases],
    )

    result = await runner.run(req.output_a, req.output_b, config)
    return {
        "test_id": result.test_id,
        "variant_a": {
            "version": result.variant_a.template_version,
            "pass_rate": result.variant_a.pass_rate,
            "avg_score": result.variant_a.avg_score,
        },
        "variant_b": {
            "version": result.variant_b.template_version,
            "pass_rate": result.variant_b.pass_rate,
            "avg_score": result.variant_b.avg_score,
        },
        "significance": result.significance,
        "winner": result.winner,
        "metric_deltas": result.metric_deltas,
    }


@router.post("/regression")
async def check_regression(req: RegressionCheckRequest, user: User = Depends(admin_required)):
    """Check for regressions between current and baseline outputs."""
    tester = RegressionTester()
    suite = TestSuite(
        suite_id=req.suite_id,
        role=req.role,
        template_version=req.template_version,
        cases=[TestCase(**c) for c in req.cases],
    )
    result = tester.check(req.current_output, req.baseline_output, suite)
    return {
        "role": result.role,
        "passed": result.passed,
        "regressions_found": result.regressions_found,
        "improvements_found": result.improvements_found,
        "deltas": result.deltas,
    }


@router.post("/metrics")
async def compute_metrics(output: str, task: str = "", expected_format: str = "json",
                           expected_keys: Optional[List[str]] = None,
                           constraints: Optional[List[str]] = None,
                           user: User = Depends(get_current_user)):
    """Compute quality metrics for an output."""
    mc = _get_mc()
    metrics = mc.compute(output, task, expected_format, expected_keys, constraints)
    return _metrics_to_dict(metrics)


@router.post("/benchmark")
async def benchmark_prompts(req: BenchmarkRequest, user: User = Depends(admin_required)):
    """Run a benchmark comparing multiple prompt variants."""
    benchmark = PromptBenchmark()
    suite = TestSuite(
        suite_id=req.suite_id,
        role=req.role or list(req.variants.keys())[0],
        template_version=req.template_version,
        cases=[TestCase(**c) for c in req.cases],
    )
    result = await benchmark.run(req.variants, suite, req.benchmark_id, req.role)
    return {
        "benchmark_id": result.benchmark_id,
        "winner": result.winner,
        "variants_tested": result.variants_tested,
        "metrics_comparison": result.metrics_comparison,
        "recommendations": result.recommendations,
    }


# ========================================
# Loop Engineering endpoints
# ========================================

@router.post("/loop/improve")
async def loop_improve(req: LoopImproveRequest, user: User = Depends(admin_required)):
    """Run a full improvement loop for a role and task."""
    lc = _get_lc()

    suite = TestSuite(
        suite_id=req.suite_id,
        role=req.role,
        template_version=req.template_version,
        cases=[TestCase(**c) for c in req.cases],
    )

    registry = get_template_registry()
    try:
        template = registry.get(req.role, req.template_version)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Build a simple agent output function that uses the template's identity
    async def simple_agent_fn(system_prompt: str, task: str) -> str:
        return system_prompt  # In production, this calls the actual LLM

    config = LoopConfig(
        max_iterations=req.max_iterations,
        quality_threshold=req.quality_threshold,
    )

    result = await lc.run(
        role=req.role,
        task=req.task,
        agent_output_fn=simple_agent_fn,
        test_suite=suite,
        config=config,
        template=template,
    )

    return {
        "role": result.role,
        "total_iterations": result.total_iterations,
        "initial_quality": result.initial_quality,
        "final_quality": result.final_quality,
        "quality_improvement": result.quality_improvement,
        "converged": result.converged,
        "actions_taken": [a.value for a in result.actions_taken],
        "summary": result.summary,
        "iterations": [
            {
                "number": it.iteration_number,
                "quality_score": it.quality_score,
                "signals": [s.value for s in it.signals],
                "action": it.action_taken.value if it.action_taken else None,
                "action_detail": it.action_detail,
            }
            for it in result.iterations
        ],
    }


@router.get("/loop/config")
async def get_loop_config(user: User = Depends(get_current_user)):
    """Get default loop configuration."""
    config = LoopConfig()
    return {
        "max_iterations": config.max_iterations,
        "quality_threshold": config.quality_threshold,
        "regression_threshold": config.regression_threshold,
        "min_improvement": config.min_improvement,
        "early_stop_on_convergence": config.early_stop_on_convergence,
    }


# ========================================
# Monitoring / Observability endpoints
# ========================================

@router.get("/metrics/prompt-quality")
async def get_prompt_quality_metrics(role: Optional[str] = None, user: User = Depends(get_current_user)):
    """Aggregate quality metrics for prompt templates, optionally filtered by role."""
    try:
        loop_repo = get_loop_repository()

        # Collect loop results
        loop_history = await loop_repo.get_history(role or "", limit=50) if role else await loop_repo.get_history("", limit=50)

        # Aggregate quality trajectory
        roles = {}
        for result in loop_history:
            r = result.get("role", "unknown")
            if r not in roles:
                roles[r] = {"runs": 0, "avg_initial": 0.0, "avg_final": 0.0, "convergence_rate": 0.0, "total_improvement": 0.0}
            roles[r]["runs"] += 1
            roles[r]["avg_initial"] += result.get("initial_quality", 0.0)
            roles[r]["avg_final"] += result.get("final_quality", 0.0)
            roles[r]["total_improvement"] += result.get("quality_improvement", 0.0)
            if result.get("converged"):
                roles[r]["convergence_rate"] += 1.0

        summary = []
        for r, stats in roles.items():
            if stats["runs"] > 0:
                stats["avg_initial"] /= stats["runs"]
                stats["avg_final"] /= stats["runs"]
                stats["avg_improvement"] = stats["total_improvement"] / stats["runs"]
                stats["convergence_rate"] /= stats["runs"]
                del stats["total_improvement"]
                summary.append({"role": r, **stats})

        return {
            "window": "last_50_runs",
            "roles_analyzed": len(summary),
            "summary": summary,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/metrics/loop-summary")
async def get_loop_summary(role: str, user: User = Depends(get_current_user)):
    """Get the latest loop improvement result for a role."""
    try:
        loop_repo = get_loop_repository()
        latest = await loop_repo.get_latest(role)
        if not latest:
            return {"role": role, "status": "no_data"}
        return {
            "role": latest.get("role"),
            "task": latest.get("task", "")[:100],
            "total_iterations": latest.get("total_iterations", 0),
            "initial_quality": latest.get("initial_quality", 0.0),
            "final_quality": latest.get("final_quality", 0.0),
            "quality_improvement": latest.get("quality_improvement", 0.0),
            "converged": latest.get("converged", False),
            "actions_taken": latest.get("actions_taken", []),
            "summary": latest.get("summary", ""),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/metrics/agent-stats")
async def get_agent_stats(user: User = Depends(get_current_user)):
    """Get per-agent quality statistics from orchestrator-level harness evaluations."""
    try:
        from core.database import get_db
        db = await get_db()
        # Aggregate from harness_evaluations collection
        pipeline = [
            {"$group": {
                "_id": "$role",
                "evaluations": {"$sum": 1},
                "avg_pass_rate": {"$avg": "$result.pass_rate"},
                "avg_score": {"$avg": "$result.avg_score"},
            }},
            {"$sort": {"evaluations": -1}},
        ]
        cursor = db["harness_evaluations"].aggregate(pipeline)
        stats = await cursor.to_list(length=50)
        return {"agents": stats}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ========================================
# Helpers
# ========================================

def _eval_result_to_dict(result: EvaluationResult) -> Dict[str, Any]:
    return {
        "suite_id": result.suite_id,
        "role": result.role,
        "total_cases": result.total_cases,
        "passed": result.passed,
        "failed": result.failed,
        "pass_rate": result.pass_rate,
        "avg_score": result.avg_score,
        "metrics": result.metrics,
        "results": [
            {
                "case_id": r.case_id,
                "passed": r.passed,
                "score": r.score,
                "format_valid": r.format_valid,
                "errors": r.errors,
            }
            for r in result.results
        ],
    }


def _metrics_to_dict(metrics: QualityMetrics) -> Dict[str, float]:
    return {
        "completeness": metrics.completeness,
        "format_compliance": metrics.format_compliance,
        "constraint_adherence": metrics.constraint_adherence,
        "relevance": metrics.relevance,
        "specificity": metrics.specificity,
        "consistency": metrics.consistency,
        "token_efficiency": metrics.token_efficiency,
    }