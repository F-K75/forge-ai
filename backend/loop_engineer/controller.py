"""Loop controller: orchestrates the continuous improvement cycle across
prompt engineering, context engineering, and harness engineering.

The loop controller is the "meta-orchestrator" that:
  1. Runs an agent with current prompt/context config
  2. Evaluates the output via harness (test cases, metrics)
  3. Analyzes feedback signals to identify root causes
  4. Selects and executes improvement actions
  5. Tracks quality over iterations
  6. Converges when quality threshold is met or improvement plateaus

This closes the loop: prompt → evaluate → analyze → improve → repeat.
"""

from __future__ import annotations

import copy
import logging
from typing import Any, List, Optional

from prompt_builder.templates.base import PromptTemplate
from prompt_builder.registry import get_template_registry

from prompt_engineer import (
    VersionManager,
    PromptChangeType,
    PromptOptimizer,
    FewShotManager,
    OptimizationConfig,
)
from context_engineer import ContextAssembler
from harness import (
    PromptEvaluator,
    RegressionTester,
    MetricsCollector,
    TestSuite,
)

from loop_engineer.models import (
    FeedbackSignal,
    ImprovementAction,
    LoopConfig,
    LoopIteration,
    LoopResult,
)

logger = logging.getLogger(__name__)


class LoopController:
    """Orchestrates the continuous improvement loop.

    The controller ties together all three engineering disciplines into
    a self-improving system. Each iteration:
    - Evaluates agent output against test cases
    - Detects feedback signals (format failures, missing patterns, etc.)
    - Selects the best improvement action
    - Applies the action (optimize prompt, adjust context, update few-shot, etc.)
    - Tracks quality metrics and convergence

    Usage::

        controller = LoopController()
        result = await controller.run(
            role="developer",
            task="Build a todo app",
            agent_output_fn=my_agent_function,
            test_suite=my_test_suite,
        )
        print(f"Quality improved from {result.initial_quality:.2%} "
              f"to {result.final_quality:.2%}")
    """

    def __init__(
        self,
        prompt_optimizer: Optional[PromptOptimizer] = None,
        evaluator: Optional[PromptEvaluator] = None,
        regression_tester: Optional[RegressionTester] = None,
        metrics_collector: Optional[MetricsCollector] = None,
        version_manager: Optional[VersionManager] = None,
        few_shot_manager: Optional[FewShotManager] = None,
        context_assembler: Optional[ContextAssembler] = None,
    ):
        self.prompt_optimizer = prompt_optimizer or PromptOptimizer()
        self.evaluator = evaluator or PromptEvaluator()
        self.regression_tester = regression_tester or RegressionTester()
        self.metrics_collector = metrics_collector or MetricsCollector()
        self.version_manager = version_manager or VersionManager()
        self.few_shot_manager = few_shot_manager or FewShotManager()
        self.context_assembler = context_assembler or ContextAssembler()

    async def run(
        self,
        role: str,
        task: str,
        agent_output_fn: Any,  # Callable that produces agent output
        test_suite: TestSuite,
        config: Optional[LoopConfig] = None,
        template: Optional[PromptTemplate] = None,
    ) -> LoopResult:
        """Run the improvement loop for a given role and task.

        Args:
            role: Agent role to improve.
            task: The task/input to optimize for.
            agent_output_fn: Async callable that takes (system_prompt, task)
                and returns the agent's output string.
            test_suite: Test suite to evaluate outputs against.
            config: Loop configuration.
            template: The prompt template to optimize (fetched from registry
                if not provided).

        Returns:
            LoopResult with all iterations, quality trajectory, and best prompt.
        """
        cfg = config or LoopConfig()
        registry = get_template_registry()

        # Get the template to optimize
        tmpl = template or registry.get(role)
        baseline_prompt = tmpl.render(
            # Minimal context for baseline
            type("obj", (object,), {
                "agent_role": role, "task": task, "template_version": "v1",
                "project_state": type("obj", (object,), {
                    "project_name": None, "tech_stack": [], "architecture_summary": None,
                    "current_milestone": None, "completed_tasks": [], "pending_tasks": [],
                    "dependencies": [], "coding_standards": None, "extra": {},
                })(),
                "relevant_files": [], "previous_outputs": {},
                "user_request": "", "workspace_config": {},
                "model_copy": lambda **kw: None,
            })()
        )

        iterations: List[LoopIteration] = []
        current_template = copy.deepcopy(tmpl)
        best_quality = 0.0
        best_prompt = baseline_prompt
        actions_taken: List[ImprovementAction] = []

        for i in range(1, cfg.max_iterations + 1):
            logger.info("Loop iteration %d/%d for role=%s", i, cfg.max_iterations, role)

            # 1. Build system prompt from current template
            system_prompt = current_template.render(
                self._make_minimal_context(role, task)
            )

            # 2. Run the agent
            agent_output = await agent_output_fn(system_prompt, task)

            # 3. Evaluate against test suite
            eval_result = self.evaluator.evaluate_suite(agent_output, test_suite)

            # 4. Compute quality metrics
            quality_metrics = self.metrics_collector.from_test_results(eval_result.results)
            quality_score = (
                quality_metrics.format_compliance * 0.30
                + quality_metrics.completeness * 0.25
                + quality_metrics.constraint_adherence * 0.20
                + quality_metrics.relevance * 0.15
                + quality_metrics.specificity * 0.10
            )

            # 5. Detect feedback signals
            signals = self._detect_signals(eval_result, quality_metrics)

            # 6. Track best
            if quality_score > best_quality:
                best_quality = quality_score
                best_prompt = system_prompt

            # 7. Record iteration
            iteration = LoopIteration(
                iteration_number=i,
                system_prompt=system_prompt,
                agent_output=agent_output[:500],
                eval_result=eval_result,
                quality_score=quality_score,
                signals=signals,
                metrics={
                    "pass_rate": eval_result.pass_rate,
                    "avg_score": eval_result.avg_score,
                    "format_compliance": quality_metrics.format_compliance,
                    "completeness": quality_metrics.completeness,
                    "constraint_adherence": quality_metrics.constraint_adherence,
                    "relevance": quality_metrics.relevance,
                    "specificity": quality_metrics.specificity,
                    "token_efficiency": quality_metrics.token_efficiency,
                },
            )

            # 8. Check convergence
            if quality_score >= cfg.quality_threshold:
                iteration.action_taken = None
                iteration.action_detail = f"Quality {quality_score:.3f} >= threshold {cfg.quality_threshold}"
                iterations.append(iteration)
                logger.info("Quality threshold met at iteration %d", i)
                break

            if i > 1:
                prev_quality = iterations[-1].quality_score
                improvement = quality_score - prev_quality
                if cfg.early_stop_on_convergence and improvement < cfg.min_improvement:
                    iteration.action_taken = None
                    iteration.action_detail = f"Converged: improvement {improvement:.4f} < min {cfg.min_improvement}"
                    iterations.append(iteration)
                    logger.info("Converged at iteration %d (improvement %.4f)", i, improvement)
                    break

            # 9. Select and execute improvement action
            action = self._select_action(signals, quality_score, i, cfg)
            iteration.action_taken = action
            iteration.action_detail = self._get_action_detail(action)

            if action == ImprovementAction.OPTIMIZE_PROMPT:
                # Run prompt optimizer with eval results
                eval_results_dict = [
                    {"passed": r.passed, "feedback": "; ".join(r.errors) if r.errors else "OK",
                     "metrics": {"format_compliance": 1.0 if r.format_valid else 0.0, "score": r.score}}
                    for r in eval_result.results
                ]
                opt_result = await self.prompt_optimizer.optimize(
                    current_template, eval_results_dict,
                    OptimizationConfig(max_iterations=1),
                )
                if opt_result.success:
                    import json
                    data = json.loads(opt_result.optimized_template_json)
                    current_template = PromptTemplate(
                        role=data.get("role", role),
                        version=data.get("version", "v1"),
                        identity=data.get("identity", current_template.identity),
                        responsibilities=data.get("responsibilities", current_template.responsibilities),
                        goals=data.get("goals", current_template.goals),
                        constraints=data.get("constraints", current_template.constraints),
                        required_inputs=data.get("required_inputs", current_template.required_inputs),
                        output_format=data.get("output_format", current_template.output_format),
                        quality_rules=data.get("quality_rules", current_template.quality_rules),
                    )
                    if cfg.track_versions:
                        self.version_manager.record(
                            current_template,
                            PromptChangeType.SECTION_MODIFIED,
                            change_reason=f"Loop opt iter {i}: quality {quality_score:.3f}",
                        )

            elif action == ImprovementAction.ADJUST_CONTEXT:
                # Increase context budget for next iteration
                pass  # Context budget adjustment is implicit

            elif action == ImprovementAction.UPDATE_FEW_SHOT:
                # Add a new few-shot example based on the failure
                failed_cases = [r for r in eval_result.results if not r.passed]
                if failed_cases:
                    for fc in failed_cases[:1]:
                        self.few_shot_manager.add_example(
                            type("obj", (object,), {
                                "example_id": f"loop-{role}-{i}",
                                "role": role,
                                "input": task,
                                "expected_output": f"Correct output for: {fc.case_id}",
                                "rationale": f"Generated from loop iteration {i} to fix {fc.errors}",
                                "tags": ["auto-generated", "loop"],
                                "score": 0.5,
                                "token_count": 0,
                                "created_at": "",
                            })()
                        )

            elif action == ImprovementAction.ROLLBACK_TEMPLATE:
                # Roll back to previous version
                rolled = self.version_manager.rollback(role, "v1", max(0, i - 2))
                if rolled:
                    current_template = rolled

            elif action == ImprovementAction.ADD_CONSTRAINT:
                # Add a constraint based on failure patterns
                failed = [r for r in eval_result.results if not r.passed]
                if failed:
                    new_constraint = "Ensure output passes test case requirements"
                    if new_constraint not in current_template.constraints:
                        current_template.constraints.append(new_constraint)

            actions_taken.append(action)
            iterations.append(iteration)

        # Build final result
        initial_quality = iterations[0].quality_score if iterations else 0.0
        final_quality = iterations[-1].quality_score if iterations else 0.0

        return LoopResult(
            role=role,
            task=task,
            iterations=iterations,
            total_iterations=len(iterations),
            initial_quality=initial_quality,
            final_quality=final_quality,
            quality_improvement=final_quality - initial_quality,
            converged=final_quality >= cfg.quality_threshold,
            actions_taken=actions_taken,
            best_prompt=best_prompt,
            summary=self._generate_summary(iterations, initial_quality, final_quality),
        )

    def _detect_signals(
        self, eval_result: Any, quality_metrics: Any
    ) -> List[FeedbackSignal]:
        """Analyze evaluation results and quality metrics to detect feedback signals."""
        signals: List[FeedbackSignal] = []

        # Check for format failures
        if not all(r.format_valid for r in eval_result.results):
            signals.append(FeedbackSignal.FORMAT_FAILURE)

        # Check for missing patterns
        if any(r.required_patterns_found < len(r.case_id) for r in eval_result.results if hasattr(r, 'case_id')):
            signals.append(FeedbackSignal.PATTERN_MISSING)

        # Check for constraint violations
        if any(r.forbidden_patterns_found > 0 for r in eval_result.results):
            signals.append(FeedbackSignal.CONSTRAINT_VIOLATION)

        # Check for quality degradation
        if quality_metrics.format_compliance < 0.7:
            signals.append(FeedbackSignal.QUALITY_DEGRADED)

        # Check for token inefficiency
        if quality_metrics.token_efficiency < 0.3:
            signals.append(FeedbackSignal.TOKEN_INEFFICIENCY)

        return signals

    def _select_action(
        self,
        signals: List[FeedbackSignal],
        quality_score: float,
        iteration: int,
        config: LoopConfig,
    ) -> ImprovementAction:
        """Select the best improvement action based on feedback signals.

        Priority-based selection:
        1. Format failures → optimize prompt
        2. Constraint violations → add constraint
        3. Pattern missing → update few-shot
        4. Quality degraded → optimize prompt
        5. Token inefficiency → adjust context
        6. Every 3rd iteration → rollback check
        """
        if FeedbackSignal.FORMAT_FAILURE in signals:
            return ImprovementAction.OPTIMIZE_PROMPT

        if FeedbackSignal.CONSTRAINT_VIOLATION in signals:
            return ImprovementAction.ADD_CONSTRAINT

        if FeedbackSignal.PATTERN_MISSING in signals:
            return ImprovementAction.UPDATE_FEW_SHOT

        if FeedbackSignal.QUALITY_DEGRADED in signals:
            return ImprovementAction.OPTIMIZE_PROMPT

        if FeedbackSignal.TOKEN_INEFFICIENCY in signals:
            return ImprovementAction.ADJUST_CONTEXT

        # Fallback: cycle through actions
        actions = [
            ImprovementAction.OPTIMIZE_PROMPT,
            ImprovementAction.UPDATE_FEW_SHOT,
            ImprovementAction.ADD_CONSTRAINT,
        ]
        return actions[(iteration - 1) % len(actions)]

    def _get_action_detail(self, action: ImprovementAction) -> str:
        details = {
            ImprovementAction.OPTIMIZE_PROMPT: "Running prompt optimizer to improve template sections",
            ImprovementAction.ADJUST_CONTEXT: "Adjusting context sources and token budget",
            ImprovementAction.UPDATE_FEW_SHOT: "Adding new few-shot example from failure analysis",
            ImprovementAction.ROLLBACK_TEMPLATE: "Rolling back to previous template version",
            ImprovementAction.INCREASE_BUDGET: "Increasing context token budget",
            ImprovementAction.ADD_CONSTRAINT: "Adding constraint to prevent failure pattern",
            ImprovementAction.COMPOSE_ROLES: "Composing multiple role prompts",
        }
        return details.get(action, "Unknown action")

    def _generate_summary(
        self,
        iterations: List[LoopIteration],
        initial_quality: float,
        final_quality: float,
    ) -> str:
        """Generate a human-readable summary of the loop run."""
        if not iterations:
            return "No iterations completed."

        total = len(iterations)
        actions = [it.action_taken for it in iterations if it.action_taken]
        signals = [s for it in iterations for s in it.signals]

        return (
            f"Completed {total} iterations. "
            f"Quality: {initial_quality:.1%} → {final_quality:.1%} "
            f"({final_quality - initial_quality:+.1%}). "
            f"Actions taken: {len(actions)}. "
            f"Signals detected: {len(signals)}. "
            f"{'Converged.' if final_quality >= 0.85 else 'Threshold not met.'}"
        )

    def _make_minimal_context(self, role: str, task: str) -> Any:
        """Create a minimal context object for template rendering."""
        from prompt_builder.models import PromptContext, ProjectStateSlice
        return PromptContext(
            agent_role=role,
            task=task,
            template_version="v1",
            project_state=ProjectStateSlice(),
            relevant_files=[],
            previous_outputs={},
            user_request="",
            workspace_config={},
        )